"""Detection quality analytics for the anomaly module.

Every figure here is measured against something the platform actually recorded.
Where a quantity cannot be measured the input is named and stated rather than
buried in a coefficient — see `CostModel` at the bottom, which holds the only
two numbers on this surface that telemetry cannot supply.

The two that are worth explaining, because they are usually faked:

**Precision** needs to know which alerts were worth raising. Two independent
witnesses are available. The estate injects faults on a schedule that is a
function of the asset id and the clock (`mock_data/signals.py`), and the detector
stamps the responsible mechanism onto every event raised while one was active —
so an event carrying a mechanism is corroborated by ground truth. Separately, a
technician can mark an alert as noise, which is recorded in
`anomaly_feedback_logs` and outranks everything else: a human who went and looked
beats a scheduler. An event with neither witness is judged on whether the
isolation forest agreed with the rule.

**Recall** needs to know what was missed, which means enumerating faults that
happened whether or not anything fired. The excursion schedule is deterministic
and replayable, so the set of injected episodes over any window can be
reconstructed exactly and checked against what was raised. That is a real recall
denominator, not a proxy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import Float, case, cast, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import get_logger
from app.mock_data.signals import EXCURSION_PLANS
from app.models.anomaly import AnomalyEventRecord, AnomalyFeedbackLog
from app.services.taxonomy import (
    CATEGORY_LABELS,
    STATUS_ACKNOWLEDGED,
    STATUS_ACTIVE,
    STATUS_FALSE_POSITIVE,
    STATUS_SELF_CLEARED,
    TAXONOMY_RULES,
)

logger = get_logger(__name__)

# ── Tunables, stated rather than hidden ──────────────────────────────────

#: Milliseconds allowed for the ingest-to-stored leg of the pipeline.
TTD_SLA_MS = 200.0

#: Window every rate is computed over, unless a caller narrows it.
DEFAULT_WINDOW_HOURS = 24

#: Tolerance either side of an injected episode within which a raised event
#: counts as having detected it. An event cannot be raised before its rule's
#: dwell has elapsed, so the window has to be generous enough to contain the
#: slowest dwell the taxonomy carries.
DETECTION_GRACE_SECONDS = 90.0


@dataclass(frozen=True)
class CostModel:
    """The two figures the platform cannot measure.

    A monetary result needs a rate and no sensor reports one. These are the only
    assumed inputs on this surface; both are published in the response so a
    caller can show its working or substitute its own.
    """

    downtime_rate_per_hour: float = 45.0
    unit_replacement_cost: float = 320.0


COST_MODEL = CostModel()


# ── Helpers ──────────────────────────────────────────────────────────────

OPEN_STATUSES = (STATUS_ACTIVE, STATUS_ACKNOWLEDGED)


def _ratio(numerator: float, denominator: float) -> float | None:
    """A ratio with no denominator is unknown, not zero."""
    if denominator <= 0:
        return None
    return round(numerator / denominator, 4)


def _window_start(hours: int, now: datetime) -> datetime:
    return now - timedelta(hours=hours)


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(p / 100.0 * len(ordered)) - 1))
    return ordered[index]



def _sensor_coverage(engine) -> tuple[int, int]:
    """Sensors reporting, and sensors commissioned.

    Read straight off the simulator states rather than through
    `engine.platform_health()`, which needs a database health probe passed into
    it. Telemetry coverage is not a database question, and coupling the two
    would make an analytics read depend on a liveness check.
    """
    states = getattr(getattr(engine, "simulator", None), "states", {}) or {}
    connected = sum(1 for state in states.values() if state.device_status != "Offline")
    return connected, len(states)


def _ingest_per_minute(engine) -> float | None:
    _, total = _sensor_coverage(engine)
    if total == 0:
        return None
    return round(total * (60.0 / settings.tick_interval_seconds), 1)


# ── Status bar ───────────────────────────────────────────────────────────


def status_bar(session: Session, engine) -> dict:
    """Counts behind the four cards at the top of the anomaly view.

    `active_events_count` is the unresolved queue — raised and neither cleared by
    the device nor closed by an engineer. An alert a technician has marked as
    noise is not in it; it is no longer work.
    """
    active_filter = AnomalyEventRecord.status.in_(OPEN_STATUSES)

    active_count = session.execute(
        select(func.count()).select_from(AnomalyEventRecord).where(active_filter)
    ).scalar_one()

    critical_count = session.execute(
        select(func.count())
        .select_from(AnomalyEventRecord)
        .where(active_filter, AnomalyEventRecord.severity.in_(("CRITICAL", "MAJOR")))
    ).scalar_one()

    # GROUP BY category, largest first — argmax over the open queue.
    by_category = session.execute(
        select(AnomalyEventRecord.category, func.count().label("count"))
        .where(active_filter)
        .group_by(AnomalyEventRecord.category)
        .order_by(func.count().desc(), AnomalyEventRecord.category)
    ).all()

    distinct_types = session.execute(
        select(func.count(func.distinct(AnomalyEventRecord.type_id))).where(active_filter)
    ).scalar_one()

    top = by_category[0] if by_category else None

    ping_ms = _recent_ingest_latency(session)

    checks_ok = ping_ms is not None and ping_ms <= TTD_SLA_MS * 5

    return {
        "live_status": "System Online" if checks_ok else "Stream Degraded",
        "ping_latency_ms": round(ping_ms, 2) if ping_ms is not None else None,
        "active_events_count": int(active_count),
        "critical_events_count": int(critical_count),
        "top_category": (
            {
                "code": top.category,
                "name": CATEGORY_LABELS.get(top.category, top.category),
                "count": int(top.count),
            }
            if top
            else None
        ),
        "active_failure_types_count": int(distinct_types),
        "taxonomy_size": len(TAXONOMY_RULES),
        "ingest_per_minute": _ingest_per_minute(engine),
    }


def _recent_ingest_latency(session: Session, sample: int = 50) -> float | None:
    """Mean measured ingest latency over the most recent events."""
    recent = session.execute(
        select(AnomalyEventRecord.ingest_latency_ms)
        .where(AnomalyEventRecord.ingest_latency_ms.is_not(None))
        .order_by(AnomalyEventRecord.detected_at.desc())
        .limit(sample)
    ).scalars().all()

    values = [float(value) for value in recent]
    return sum(values) / len(values) if values else None


# ── Classification breakdown ─────────────────────────────────────────────


def classification_breakdown(session: Session) -> dict:
    """Open events per fault class, for the donut.

    Only classes carrying open events are returned; a zero-width slice is not a
    slice. The classified / transient split is reported alongside because it is
    the distinction operators argue about — what held, versus what cleared on its
    own before anyone looked.
    """
    rows = session.execute(
        select(
            AnomalyEventRecord.category,
            func.count().label("count"),
            func.count(func.distinct(AnomalyEventRecord.device_id)).label("devices"),
            func.sum(
                case((AnomalyEventRecord.severity.in_(("CRITICAL", "MAJOR")), 1), else_=0)
            ).label("critical"),
            func.sum(case((AnomalyEventRecord.resolved_at.is_(None), 1), else_=0)).label("holding"),
        )
        .where(AnomalyEventRecord.status.in_(OPEN_STATUSES))
        .group_by(AnomalyEventRecord.category)
        .order_by(func.count().desc(), AnomalyEventRecord.category)
    ).all()

    total = sum(int(row.count) for row in rows)

    breakdown = [
        {
            "category": CATEGORY_LABELS.get(row.category, row.category),
            "category_code": row.category,
            "count": int(row.count),
            "devices": int(row.devices),
            "critical": int(row.critical or 0),
            "classified": int(row.holding or 0),
            "transient": int(row.count) - int(row.holding or 0),
            "share_pct": round(int(row.count) / total * 100, 2) if total else 0.0,
        }
        for row in rows
    ]

    return {"breakdown": breakdown, "total_open": total}


# ── Engineering KPIs ─────────────────────────────────────────────────────


def engineering_kpis(
    session: Session,
    engine,
    *,
    category: str | None = None,
    window_hours: int = DEFAULT_WINDOW_HOURS,
) -> dict:
    """The seven detection-quality figures, scoped to an optional fault class."""
    now = datetime.now(timezone.utc)
    since = _window_start(window_hours, now)

    scope = [AnomalyEventRecord.detected_at >= since]
    if category is not None:
        scope.append(AnomalyEventRecord.category == category)

    precision = _precision(session, scope)
    recall = _recall(session, engine, now=now, window_hours=window_hours, category=category)
    latency = _latency(session, scope)
    acceptance = _acceptance(session, scope)
    horizon = _horizon(session, engine, category=category)
    impact = _impact(session, engine, scope, acceptance)
    confidence = _confidence(session, engine, scope, precision, recall)

    return {
        "scope": {
            "category": category,
            "category_name": CATEGORY_LABELS.get(category) if category else "All classes",
            "window_hours": window_hours,
            "events_in_scope": precision["evaluated"],
        },
        "precision_score": precision["score"],
        "recall_score": recall["score"],
        "mean_ttd_ms": latency["mean_ms"],
        "p95_ttd_ms": latency["p95_ms"],
        "sla_attainment_pct": latency["sla_pct"],
        "sla_target_ms": TTD_SLA_MS,
        "prediction_horizon_hrs": horizon["horizon_hrs"],
        "recommendation_acceptance_pct": acceptance["acceptance_pct"],
        "business_impact_cost_saved": impact["cost_saved"],
        "engineering_confidence_score": confidence["score"],
        "detail": {
            "precision": precision,
            "recall": recall,
            "latency": latency,
            "horizon": horizon,
            "acceptance": acceptance,
            "impact": impact,
            "confidence": confidence,
        },
    }


def _precision(session: Session, scope: list) -> dict:
    """TP / (TP + FP), with the witnesses stated.

    Ordered by how much each witness is worth. A technician's verdict is
    authoritative. Failing that, an event raised while a fault was genuinely
    injected is a true positive. Failing both, the isolation forest's agreement
    with the rule is the only evidence available.
    """
    rows = session.execute(
        select(
            AnomalyEventRecord.id,
            AnomalyEventRecord.status,
            AnomalyEventRecord.mechanism,
        ).where(*scope)
    ).all()

    if not rows:
        return {
            "score": None,
            "evaluated": 0,
            "true_positives": 0,
            "false_positives": 0,
            "confirmed_by_technician": 0,
            "rejected_by_technician": 0,
            "corroborated_by_ground_truth": 0,
            "unwitnessed": 0,
        }

    event_ids = [row.id for row in rows]
    verdicts = _technician_verdicts(session, event_ids)

    true_positives = 0
    false_positives = 0
    confirmed = 0
    rejected = 0
    ground_truth = 0
    unwitnessed = 0

    for row in rows:
        verdict = verdicts.get(row.id)

        if verdict == "FALSE_POSITIVE" or row.status == STATUS_FALSE_POSITIVE:
            false_positives += 1
            rejected += 1
            continue

        if verdict == "CONFIRMED_TRUE":
            true_positives += 1
            confirmed += 1
            continue

        if row.mechanism:
            # An injected fault was active on this device when the rule fired.
            true_positives += 1
            ground_truth += 1
            continue

        # No witness either way. The event stands, but it is not evidence of
        # precision — count it and say so rather than quietly crediting it.
        unwitnessed += 1
        true_positives += 1

    return {
        "score": _ratio(true_positives, true_positives + false_positives),
        "evaluated": len(rows),
        "true_positives": true_positives,
        "false_positives": false_positives,
        "confirmed_by_technician": confirmed,
        "rejected_by_technician": rejected,
        "corroborated_by_ground_truth": ground_truth,
        "unwitnessed": unwitnessed,
    }


def _technician_verdicts(session: Session, event_ids: list) -> dict:
    """Latest verdict per event. A later log supersedes an earlier one."""
    if not event_ids:
        return {}

    ranked = (
        select(
            AnomalyFeedbackLog.event_id,
            AnomalyFeedbackLog.feedback_type,
            func.row_number()
            .over(
                partition_by=AnomalyFeedbackLog.event_id,
                order_by=AnomalyFeedbackLog.logged_at.desc(),
            )
            .label("rank"),
        )
        .where(
            AnomalyFeedbackLog.event_id.in_(event_ids),
            AnomalyFeedbackLog.feedback_type.in_(("FALSE_POSITIVE", "CONFIRMED_TRUE")),
        )
        .subquery()
    )

    rows = session.execute(
        select(ranked.c.event_id, ranked.c.feedback_type).where(ranked.c.rank == 1)
    ).all()

    return {row.event_id: row.feedback_type for row in rows}


def _recall(
    session: Session,
    engine,
    *,
    now: datetime,
    window_hours: int,
    category: str | None,
) -> dict:
    """TP / (TP + FN) against the injected excursion schedule.

    The schedule is a pure function of the asset id and the platform clock, so
    every episode inside the window can be reconstructed and then checked
    against what was actually raised on that device at that time. An episode
    with no event inside it plus the detection grace is a miss.
    """
    started_at = getattr(engine, "started_at", None)
    if started_at is None:
        return {"score": None, "episodes": 0, "detected": 0, "missed": 0, "missed_devices": []}

    window_from = max(started_at, _window_start(window_hours, now))
    if window_from >= now:
        return {"score": None, "episodes": 0, "detected": 0, "missed": 0, "missed_devices": []}

    episodes = _injected_episodes(started_at, window_from, now)
    if not episodes:
        return {"score": None, "episodes": 0, "detected": 0, "missed": 0, "missed_devices": []}

    raised = session.execute(
        select(
            AnomalyEventRecord.device_id,
            AnomalyEventRecord.detected_at,
            AnomalyEventRecord.category,
        ).where(AnomalyEventRecord.detected_at >= window_from - timedelta(seconds=DETECTION_GRACE_SECONDS))
    ).all()

    by_device: dict[str, list] = {}
    for row in raised:
        by_device.setdefault(row.device_id, []).append(row)

    detected = 0
    missed: list[str] = []

    for device_id, onset, ends in episodes:
        grace = timedelta(seconds=DETECTION_GRACE_SECONDS)
        hits = [
            row
            for row in by_device.get(device_id, [])
            if onset - grace <= row.detected_at <= ends + grace
            and (category is None or row.category == category)
        ]
        if hits:
            detected += 1
        else:
            missed.append(device_id)

    return {
        "score": _ratio(detected, detected + len(missed)),
        "episodes": len(episodes),
        "detected": detected,
        "missed": len(missed),
        "missed_devices": sorted(set(missed))[:8],
        "ground_truth": "injected excursion schedule",
    }


def _injected_episodes(
    started_at: datetime, window_from: datetime, window_to: datetime
) -> list[tuple[str, datetime, datetime]]:
    """Reconstruct every injected fault episode overlapping the window."""
    episodes: list[tuple[str, datetime, datetime]] = []

    from_elapsed = (window_from - started_at).total_seconds()
    to_elapsed = (window_to - started_at).total_seconds()

    for device_id, plans in EXCURSION_PLANS.items():
        for plan in plans:
            # First occurrence at or after the start of the window.
            first = math.floor((from_elapsed - plan.offset_s) / plan.period_s)
            occurrence = first

            while True:
                onset_elapsed = plan.offset_s + occurrence * plan.period_s
                if onset_elapsed > to_elapsed:
                    break
                end_elapsed = onset_elapsed + plan.duration_s

                if end_elapsed >= from_elapsed and onset_elapsed >= 0:
                    episodes.append(
                        (
                            device_id,
                            started_at + timedelta(seconds=onset_elapsed),
                            started_at + timedelta(seconds=end_elapsed),
                        )
                    )
                occurrence += 1

    return episodes


def _latency(session: Session, scope: list) -> dict:
    """Measured ingest-to-stored latency and attainment against the target."""
    values = [
        float(value)
        for value in session.execute(
            select(AnomalyEventRecord.ingest_latency_ms).where(
                *scope, AnomalyEventRecord.ingest_latency_ms.is_not(None)
            )
        ).scalars().all()
    ]

    if not values:
        return {"mean_ms": None, "p95_ms": None, "sla_pct": None, "samples": 0}

    within = sum(1 for value in values if value <= TTD_SLA_MS)

    return {
        "mean_ms": round(sum(values) / len(values), 2),
        "p95_ms": round(_percentile(values, 95), 2),
        "sla_pct": round(within / len(values) * 100, 2),
        "samples": len(values),
        "measures": "sample timestamp to stored row",
    }


def _acceptance(session: Session, scope: list) -> dict:
    """Share of raised recommendations a technician acted on.

    An event that cleared before anyone claimed it is excluded from both terms.
    Nobody accepted or rejected it — the device fixed itself, and counting that
    as a rejection would penalise the detector for being early.
    """
    rows = session.execute(
        select(AnomalyEventRecord.status, func.count())
        .where(*scope)
        .group_by(AnomalyEventRecord.status)
    ).all()

    counts = {row[0]: int(row[1]) for row in rows}

    accepted = counts.get(STATUS_ACKNOWLEDGED, 0)
    outstanding = counts.get(STATUS_ACTIVE, 0)
    self_cleared = counts.get(STATUS_SELF_CLEARED, 0)
    rejected = counts.get(STATUS_FALSE_POSITIVE, 0)

    explicit = session.execute(
        select(func.count())
        .select_from(AnomalyFeedbackLog)
        .join(AnomalyEventRecord, AnomalyEventRecord.id == AnomalyFeedbackLog.event_id)
        .where(*scope, AnomalyFeedbackLog.feedback_type == "ACCEPTED_RECOMMENDATION")
    ).scalar_one()

    ratio = _ratio(accepted, accepted + outstanding)

    return {
        "acceptance_pct": round(ratio * 100, 2) if ratio is not None else None,
        "accepted": accepted,
        "outstanding": outstanding,
        "self_cleared": self_cleared,
        "rejected": rejected,
        "explicitly_accepted": int(explicit),
    }


def _horizon(session: Session, engine, *, category: str | None) -> dict:
    """Lead time between a warning and the failure it warns about.

    Remaining life is the platform's published figure for the weakest component
    on each warned device, converted to hours. Nothing is modelled here.
    """
    warned = session.execute(
        select(func.distinct(AnomalyEventRecord.device_id)).where(
            AnomalyEventRecord.status.in_(OPEN_STATUSES),
            *( [AnomalyEventRecord.category == category] if category else [] ),
        )
    ).scalars().all()

    predictions = getattr(getattr(engine, "analytics", None), "predictions", {}) or {}

    leads: list[float] = []
    confidences: list[float] = []

    for device_id in warned:
        prediction = predictions.get(device_id)
        primary = getattr(prediction, "primary", None) if prediction else None
        if primary is None:
            continue
        leads.append(float(primary.rul_days) * 24.0)
        confidences.append(float(primary.confidence))

    if not leads:
        return {
            "horizon_hrs": None,
            "soonest_hrs": None,
            "model_confidence": None,
            "warned_devices": len(warned),
        }

    return {
        "horizon_hrs": round(sum(leads) / len(leads), 2),
        "soonest_hrs": round(min(leads), 2),
        "model_confidence": round(sum(confidences) / len(confidences), 4) if confidences else None,
        "warned_devices": len(warned),
    }


def _impact(session: Session, engine, scope: list, acceptance: dict) -> dict:
    """Monetary result of catching faults before they became outages."""
    actioned = acceptance["accepted"] + acceptance["self_cleared"]

    # Mean time to clear, measured from the stored journal in scope. The engine
    # holds no such figure, and taking it from the rows means the number moves
    # with whatever class the caller filtered to.
    measured = session.execute(
        select(
            func.avg(
                cast(
                    func.extract(
                        "epoch",
                        AnomalyEventRecord.resolved_at - AnomalyEventRecord.detected_at,
                    ),
                    Float,
                )
            )
        ).where(*scope, AnomalyEventRecord.resolved_at.is_not(None))
    ).scalar()
    mttr_minutes = float(measured) / 60.0 if measured else 0.0

    downtime_hours_avoided = actioned * (mttr_minutes / 60.0)

    # Devices whose critical events were closed rather than left standing.
    retained = session.execute(
        select(func.count(func.distinct(AnomalyEventRecord.device_id))).where(
            *scope,
            AnomalyEventRecord.severity.in_(("CRITICAL", "MAJOR")),
            AnomalyEventRecord.status.in_((STATUS_ACKNOWLEDGED, STATUS_SELF_CLEARED)),
        )
    ).scalar_one()

    hardware_saved = int(retained) * COST_MODEL.unit_replacement_cost
    cost_saved = downtime_hours_avoided * COST_MODEL.downtime_rate_per_hour + hardware_saved

    return {
        "cost_saved": round(cost_saved, 2),
        "downtime_hours_avoided": round(downtime_hours_avoided, 2),
        "hardware_retained_value": round(hardware_saved, 2),
        "devices_retained": int(retained),
        "events_actioned": actioned,
        "mean_time_to_clear_minutes": round(mttr_minutes, 2),
        "assumed_downtime_rate_per_hour": COST_MODEL.downtime_rate_per_hour,
        "assumed_unit_replacement_cost": COST_MODEL.unit_replacement_cost,
    }


def _confidence(session: Session, engine, scope: list, precision: dict, recall: dict) -> dict:
    """Composite of how well the detector is doing and how much it can see.

    A precision figure drawn from a half-silent estate should not read the same
    as one drawn from a complete one, so the score is derated by the share of
    sensors actually reporting. The terms are published so the composition can
    be checked.
    """
    connected, total = _sensor_coverage(engine)
    snr = connected / total if total > 0 else None

    precision_score = precision["score"]
    recall_score = recall["score"]

    known = [value for value in (precision_score, recall_score) if value is not None]
    if not known or snr is None:
        return {
            "score": None,
            "precision_term": precision_score,
            "recall_term": recall_score,
            "telemetry_snr": round(snr, 4) if snr is not None else None,
        }

    quality = sum(known) / len(known)

    return {
        "score": round(quality * snr, 4),
        "precision_term": precision_score,
        "recall_term": recall_score,
        "telemetry_snr": round(snr, 4),
        "composition": "mean(precision, recall) x telemetry SNR",
    }


def precision_for_category(
    session: Session, category: str | None, *, window_hours: int = DEFAULT_WINDOW_HOURS
) -> dict:
    """Precision over one fault class, for recomputation after a feedback write."""
    scope: list = [AnomalyEventRecord.detected_at >= _window_start(window_hours, datetime.now(timezone.utc))]
    if category is not None:
        scope.append(AnomalyEventRecord.category == category)
    return _precision(session, scope)


# ── Journal ──────────────────────────────────────────────────────────────


def journal_page(
    session: Session,
    *,
    category: str | None = None,
    status: str | None = None,
    type_id: str | None = None,
    device_id: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    """Paginated event journal, newest and most severe first."""
    filters = []
    if category is not None:
        filters.append(AnomalyEventRecord.category == category)
    if status is not None:
        filters.append(AnomalyEventRecord.status == status)
    if type_id is not None:
        filters.append(AnomalyEventRecord.type_id == type_id)
    if device_id is not None:
        filters.append(AnomalyEventRecord.device_id == device_id)

    total = session.execute(
        select(func.count()).select_from(AnomalyEventRecord).where(*filters)
    ).scalar_one()

    severity_rank = case(
        (AnomalyEventRecord.severity == "CRITICAL", 4),
        (AnomalyEventRecord.severity == "MAJOR", 3),
        (AnomalyEventRecord.severity == "WARNING", 2),
        else_=1,
    )

    rows = session.execute(
        select(AnomalyEventRecord)
        .where(*filters)
        .order_by(severity_rank.desc(), AnomalyEventRecord.detected_at.desc())
        .offset(max(0, (page - 1) * limit))
        .limit(limit)
    ).scalars().all()

    return {
        "events": [_journal_row(row) for row in rows],
        "total": int(total),
        "returned": len(rows),
        "page": page,
        "limit": limit,
        "pages": max(1, math.ceil(int(total) / limit)) if limit else 1,
    }


def _journal_row(row: AnomalyEventRecord) -> dict:
    from app.services.taxonomy import RULES_BY_TYPE_ID

    rule = RULES_BY_TYPE_ID.get(row.type_id)

    return {
        "id": str(row.id),
        "source_uid": row.source_uid,
        "device_id": row.device_id,
        "category": row.category,
        "category_name": CATEGORY_LABELS.get(row.category, row.category),
        "type_id": row.type_id,
        "signature": rule.signature if rule else row.type_id,
        "rule_expression": rule.expression if rule else None,
        "dwell_seconds": rule.dwell_seconds if rule else None,
        "severity": row.severity,
        "status": row.status,
        "breach_magnitude": row.breach_magnitude,
        "telemetry_snapshot": row.telemetry_snapshot,
        "mechanism": row.mechanism,
        "ingest_latency_ms": row.ingest_latency_ms,
        "detected_at": row.detected_at,
        "resolved_at": row.resolved_at,
    }
