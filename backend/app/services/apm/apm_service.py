"""The APM orchestrator.

Assembles one complete APM record per asset from the outputs of every upstream
module, rolls those records up to the estate, and publishes the two contracts APM
owes downstream — the inputs OEE needs and the summary the executive dashboard
needs.

The pass is deliberately structured as: read every input once, group it once, then
compute. The obvious implementation walks the anomaly journal per asset, which is
O(assets × journal) on every analytics cycle for a journal that holds five
thousand events; grouping first makes it O(journal + assets). The platform's own
performance pass has that quadratic in it, and this module does not repeat it.

APM computes no OEE. It publishes availability, health index, utilisation,
downtime and maintenance status, and OEE decides what effectiveness those imply.
Crossing that line would put two modules in charge of the same number.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.config import settings
from app.logging_config import get_logger
from app.services.anomaly_service import AnomalyEvent
from app.services.apm import cost as cost_model
from app.services.apm import health_index as ahi
from app.services.apm import hierarchy as hierarchy_model
from app.services.apm import reliability as reliability_model
from app.services.apm import risk as risk_model
from app.services.apm import upstream
from app.services.apm import work_orders as wo
from app.services.apm.config import CRITICALITY_CLASSES, ApmConfig, get_apm_config
from app.services.apm.criticality import CriticalityResult, FleetContext, score_asset
from app.services.derive import band_of
from app.services.engine import InteloraEngine

logger = get_logger(__name__)


# ── Per-asset record ─────────────────────────────────────────────────────


@dataclass
class AssetApmRecord:
    """Everything APM knows about one asset.

    The `inputs` block is published rather than consumed silently. APM's whole
    claim is that it is a consumer of AD, PdM and Platform Core, and a record that
    shows which numbers it consumed is a record that claim can be checked against.
    """

    asset_id: str
    asset_name: str
    category: str
    brand: str
    model: str
    status: str
    device_uid: str

    #: What APM read, and from where.
    inputs: dict

    criticality: CriticalityResult
    health_index: ahi.HealthIndexResult
    reliability: reliability_model.ReliabilityResult
    repair: cost_model.RepairEstimate
    exposure: cost_model.CostExposure
    risk: risk_model.RiskResult
    priority: risk_model.PriorityResult
    lifecycle: risk_model.LifecycleDecision
    action: risk_model.RecommendedAction

    utilisation_pct: float
    downtime_cost: float
    effective_age_days: float
    ageing_factor: float
    calendar_age_days: float

    open_work_orders: int
    #: Work order ids currently open against this asset.
    work_order_ids: list[str] = field(default_factory=list)

    #: Positions within the estate, filled by the roll-up.
    health_index_rank: int = 0
    risk_rank: int = 0
    priority_rank: int = 0

    def as_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "asset_name": self.asset_name,
            "category": self.category,
            "brand": self.brand,
            "model": self.model,
            "status": self.status,
            "device_uid": self.device_uid,
            "inputs": self.inputs,
            "health_index": self.health_index.index,
            "health_index_band": self.health_index.band,
            "health_index_confidence": self.health_index.confidence,
            "condition_gap": self.health_index.condition_gap,
            "health_index_terms": [term.__dict__ for term in self.health_index.terms],
            "criticality_score": self.criticality.score,
            "criticality_code": self.criticality.code,
            "criticality_label": self.criticality.label,
            "assigned_criticality": self.criticality.assigned,
            "criticality_factors": [factor.__dict__ for factor in self.criticality.factors],
            "availability_pct": self.reliability.availability_pct,
            "inherent_availability_pct": self.reliability.inherent_availability_pct,
            "mtbf_hours": self.reliability.mtbf_hours,
            "mtbf_censored": self.reliability.mtbf_censored,
            "mttr_minutes": self.reliability.mttr_minutes,
            "mttr_censored": self.reliability.mttr_censored,
            "failure_rate_per_1000h": self.reliability.failure_rate_per_1000h,
            "failures": self.reliability.failures,
            "open_failures": self.reliability.open_failures,
            "downtime_hours": self.reliability.downtime_hours,
            "downtime_events": self.reliability.downtime_events,
            "downtime_cost": self.downtime_cost,
            "utilisation_pct": self.utilisation_pct,
            "effective_age_days": self.effective_age_days,
            "ageing_factor": self.ageing_factor,
            "calendar_age_days": self.calendar_age_days,
            "risk_score": self.risk.score,
            "risk_tier": self.risk.tier,
            "risk_label": self.risk.label,
            "risk_driver": self.risk.driver,
            "risk_signals": dict(self.risk.signals),
            "priority_score": self.priority.score,
            "priority_code": self.priority.code,
            "priority": self.priority.label,
            "response_target_hours": self.priority.response_target_hours,
            "cost_exposure": self.exposure.exposure,
            "exposure_breakdown": self.exposure.as_dict(),
            "repair_estimate": self.repair.as_dict(),
            "lifecycle_decision": self.lifecycle.decision,
            "lifecycle": self.lifecycle.as_dict(),
            "recommended_action": self.action.as_dict(),
            "open_work_orders": self.open_work_orders,
            "work_order_ids": list(self.work_order_ids),
            "health_index_rank": self.health_index_rank,
            "risk_rank": self.risk_rank,
            "priority_rank": self.priority_rank,
        }

    def snapshot_row(self, computed_at: datetime) -> dict:
        """Mapping for the `apm_asset_snapshots` table."""
        return {
            "asset_id": self.asset_id,
            "health_index": self.health_index.index,
            "health_index_band": self.health_index.band,
            "condition_gap": self.health_index.condition_gap,
            "criticality_score": self.criticality.score,
            "criticality_code": self.criticality.code,
            "risk_score": self.risk.score,
            "risk_tier": self.risk.tier,
            "priority_score": self.priority.score,
            "priority_code": self.priority.code,
            "availability_pct": self.reliability.availability_pct,
            "inherent_availability_pct": self.reliability.inherent_availability_pct,
            "mtbf_hours": self.reliability.mtbf_hours,
            "mttr_minutes": self.reliability.mttr_minutes,
            "failure_rate_per_1000h": self.reliability.failure_rate_per_1000h,
            "downtime_hours": self.reliability.downtime_hours,
            "failures": self.reliability.failures,
            "effective_age_days": self.effective_age_days,
            "ageing_factor": self.ageing_factor,
            "cost_exposure": self.exposure.exposure,
            "downtime_cost": self.downtime_cost,
            "repair_cost": self.repair.planned_total,
            "replacement_cost": self.criticality.replacement_cost,
            "lifecycle_decision": self.lifecycle.decision,
            "utilisation_pct": self.utilisation_pct,
            "open_work_orders": self.open_work_orders,
            "computed_at": computed_at,
        }


# ── Estate snapshot ──────────────────────────────────────────────────────


@dataclass
class ApmSnapshot:
    computed_at: datetime
    #: Engine tick this was computed from, so a consumer can tell how fresh it is.
    tick: int
    analytics_tick: int

    records: dict[str, AssetApmRecord]
    fleet_health: ahi.FleetHealthIndex
    fleet_reliability: reliability_model.FleetReliability
    economics: cost_model.MaintenanceEconomics
    backlog: wo.BacklogSummary
    effectiveness: wo.Effectiveness
    hierarchy: hierarchy_model.HierarchyNode

    #: Counts by risk tier and by criticality class.
    risk_distribution: list[dict] = field(default_factory=list)
    criticality_distribution: list[dict] = field(default_factory=list)
    lifecycle_distribution: dict[str, int] = field(default_factory=dict)

    @property
    def ordered(self) -> list[AssetApmRecord]:
        return list(self.records.values())


def scope_aggregate(records: list[AssetApmRecord]) -> dict:
    """Aggregates over an arbitrary subset of the estate.

    Exists so a filtered view needs no arithmetic in the browser. The platform's
    stated design is that the interface renders figures rather than deriving them,
    and a category filter is the one case where that is easy to lose: the estate
    roll-up no longer applies, so whoever holds the filtered list starts averaging.
    This computes the same figures over whatever subset was asked for, on the
    server, from the same records the estate roll-up used.

    Means only, no sums that would double-count: this is called with a subset, and
    a caller adding two scopes together is a caller doing something wrong.
    """
    count = len(records)
    if count == 0:
        return {
            "assets": 0,
            "mean_health": 0.0,
            "mean_health_index": 0.0,
            "weighted_health_index": 0.0,
            "health_spread": 0.0,
            "availability_pct": 0.0,
            "inherent_availability_pct": 0.0,
            "mtbf_hours": 0.0,
            "mttr_minutes": 0.0,
            "failure_rate_per_1000h": 0.0,
            "downtime_hours": 0.0,
            "downtime_cost": 0.0,
            "failures": 0,
            "utilisation_pct": 0.0,
            "mean_criticality": 0.0,
            "mean_risk": 0.0,
            "cost_exposure": 0.0,
            "repair_cost": 0.0,
            "replacement_cost": 0.0,
            "open_work_orders": 0,
            "assets_at_risk": 0,
            "band_counts": {"healthy": 0, "good": 0, "warning": 0, "critical": 0},
            "condition_band_counts": {"healthy": 0, "good": 0, "warning": 0, "critical": 0},
            "risk_counts": {},
            "criticality_counts": {},
            "lifecycle_counts": {},
        }

    healths = [record.inputs["predictive"]["health_score"] for record in records]

    def mean(pick) -> float:
        return round(sum(pick(record) for record in records) / count, 1)

    measured_mtbf = [
        record.reliability.mtbf_hours for record in records if not record.reliability.mtbf_censored
    ]
    measured_mttr = [
        record.reliability.mttr_minutes for record in records if not record.reliability.mttr_censored
    ]

    bands = {"healthy": 0, "good": 0, "warning": 0, "critical": 0}
    # Counted separately from the index bands. Both use the platform's four
    # condition boundaries, but they are bands over two different figures: one
    # over APM's composite, one over PdM's raw health score. A consumer that
    # displays "devices per health band" needs the latter, and quietly serving it
    # the former would move every bar without changing the label above it.
    condition_bands = {"healthy": 0, "good": 0, "warning": 0, "critical": 0}
    risks: dict[str, int] = {}
    criticalities: dict[str, int] = {}
    lifecycles: dict[str, int] = {}
    for record in records:
        bands[record.health_index.band] = bands.get(record.health_index.band, 0) + 1
        condition_band = band_of(record.inputs["predictive"]["health_score"])
        condition_bands[condition_band] = condition_bands.get(condition_band, 0) + 1
        risks[record.risk.tier] = risks.get(record.risk.tier, 0) + 1
        criticalities[record.criticality.code] = criticalities.get(record.criticality.code, 0) + 1
        lifecycles[record.lifecycle.decision] = lifecycles.get(record.lifecycle.decision, 0) + 1

    weights = [max(10.0, record.criticality.score) for record in records]
    total_weight = sum(weights)

    return {
        "assets": count,
        "mean_health": round(sum(healths) / count, 1),
        "mean_health_index": mean(lambda record: record.health_index.index),
        "weighted_health_index": round(
            sum(record.health_index.index * weight for record, weight in zip(records, weights))
            / total_weight,
            1,
        )
        if total_weight > 0
        else 0.0,
        # Condition spread across the subset. The mean hides a failing tail; this
        # is the figure that shows one.
        "health_spread": round(max(healths) - min(healths), 1),
        "availability_pct": mean(lambda record: record.reliability.availability_pct),
        "inherent_availability_pct": mean(
            lambda record: record.reliability.inherent_availability_pct
        ),
        # Censored assets are excluded rather than entered as zero.
        "mtbf_hours": round(sum(measured_mtbf) / len(measured_mtbf), 2) if measured_mtbf else 0.0,
        "mttr_minutes": round(sum(measured_mttr) / len(measured_mttr), 2) if measured_mttr else 0.0,
        "failure_rate_per_1000h": mean(lambda record: record.reliability.failure_rate_per_1000h),
        "downtime_hours": round(sum(record.reliability.downtime_hours for record in records), 3),
        "downtime_cost": round(sum(record.downtime_cost for record in records), 2),
        "failures": sum(record.reliability.failures for record in records),
        "utilisation_pct": mean(lambda record: record.utilisation_pct),
        "mean_criticality": mean(lambda record: record.criticality.score),
        "mean_risk": mean(lambda record: record.risk.score),
        "cost_exposure": round(sum(record.exposure.exposure for record in records), 2),
        "repair_cost": round(sum(record.repair.planned_total for record in records), 2),
        "replacement_cost": round(
            sum(record.criticality.replacement_cost for record in records), 2
        ),
        "open_work_orders": sum(record.open_work_orders for record in records),
        "assets_at_risk": sum(1 for record in records if record.risk.tier in ("critical", "high")),
        "band_counts": bands,
        "condition_band_counts": condition_bands,
        "risk_counts": risks,
        "criticality_counts": criticalities,
        "lifecycle_counts": lifecycles,
    }


class ApmService:
    """One pass over the estate, cached against the tick it was computed from."""

    def __init__(self) -> None:
        self._snapshot: ApmSnapshot | None = None
        self._lock = threading.RLock()

    # ── Entry points ────────────────────────────────────────────────────

    def snapshot(self, engine: InteloraEngine, now: datetime | None = None) -> ApmSnapshot:
        """The cached APM snapshot, recomputed when the estate has moved on.

        Keyed on the analytics tick rather than the live tick: every input APM
        reads other than connectivity is itself recomputed on the analytics
        cadence, so recomputing per second would burn CPU to produce the same
        answer.
        """
        with self._lock:
            current = engine.analytics.tick
            if self._snapshot is not None and self._snapshot.analytics_tick == current:
                return self._snapshot
            return self.refresh(engine, now)

    def refresh(self, engine: InteloraEngine, now: datetime | None = None) -> ApmSnapshot:
        stamp = now or datetime.now(timezone.utc)

        with self._lock:
            config = get_apm_config()
            analytics = engine.analytics
            active_ids = engine.get_active_asset_ids()
            states = [engine.simulator.states[aid] for aid in active_ids if aid in engine.simulator.states]
            orders = wo.get_work_order_engine().all()

            # ── Group every input once ──────────────────────────────────
            events_by_asset: dict[str, list[AnomalyEvent]] = {}
            for event in engine.detector.journal:
                events_by_asset.setdefault(event.asset_id, []).append(event)

            open_by_asset: dict[str, dict[str, int]] = {}
            for event in engine.detector.open_events():
                bucket = open_by_asset.setdefault(event.asset_id, {})
                bucket[event.severity] = bucket.get(event.severity, 0) + 1

            open_orders_by_asset: dict[str, list[str]] = {}
            for order in orders:
                if order.is_open:
                    open_orders_by_asset.setdefault(order.asset_id, []).append(order.work_order_id)

            context = FleetContext.build(states, config)
            calendar_age = self._calendar_age_days(engine, stamp)

            # ── One record per asset ────────────────────────────────────
            records: dict[str, AssetApmRecord] = {}
            for state in states:
                records[state.asset_id] = self._build_record(
                    state=state,
                    prediction=analytics.predictions.get(state.asset_id),
                    performance=analytics.performance.get(state.asset_id),
                    events=events_by_asset.get(state.asset_id, []),
                    open_by_severity=open_by_asset.get(state.asset_id, {}),
                    open_order_ids=open_orders_by_asset.get(state.asset_id, []),
                    anomalies_24h=engine.detector.count_last_24h(state.asset_id, stamp),
                    context=context,
                    calendar_age_days=calendar_age,
                    config=config,
                    now=stamp,
                )

            self._rank(records)
            snapshot = self._roll_up(records, states, orders, stamp, engine, config)
            self._snapshot = snapshot
            return snapshot

    # ── Record assembly ─────────────────────────────────────────────────

    @staticmethod
    def _calendar_age_days(engine: InteloraEngine, now: datetime) -> float:
        """How old the estate's assets are on the platform's own degradation clock.

        The stored history covers `history_days` before the engine started, and the
        live stream ages components at `wear_time_scale`. Calendar age has to be
        measured on the same clock the wear accrued on, or the ageing factor —
        effective age over calendar age — compares two different definitions of a
        day and reads as though every asset in the estate were ageing sixty times
        too fast.
        """
        elapsed = (now - engine.simulator.started_at).total_seconds() / 86_400.0
        return round(settings.history_days + elapsed * settings.wear_time_scale, 3)

    def _build_record(
        self,
        *,
        state,
        prediction,
        performance,
        events: list[AnomalyEvent],
        open_by_severity: dict[str, int],
        open_order_ids: list[str],
        anomalies_24h: int,
        context: FleetContext,
        calendar_age_days: float,
        config: ApmConfig,
        now: datetime,
    ) -> AssetApmRecord:
        seed = state.seed

        # ── Inputs, read through the one upstream seam ───────────────────
        #
        # Nothing in this method touches the detector or the prediction object
        # directly. `upstream` is the only place APM reads another module's
        # output, which is what makes the boundary checkable rather than
        # aspirational — and it is where the two fields the specification requires
        # but upstream does not publish yet are derived and labelled as derived.
        bundle = upstream.UpstreamBundle(
            platform=upstream.read_platform_core(state),
            anomaly=upstream.read_anomaly_detection(
                state.asset_id,
                events,
                open_by_severity,
                anomalies_24h,
                state.device_status,
            ),
            predictive=upstream.read_predictive(state.asset_id, prediction, state),
        )

        health_score = bundle.predictive.health_score
        rul_days = bundle.predictive.remaining_useful_life_days
        failure_probability = bundle.predictive.failure_probability
        prediction_confidence = bundle.predictive.prediction_confidence or 0.6
        failure_mode = bundle.predictive.failure_mode

        criticality = score_asset(state, context, config)

        reliability = reliability_model.compute(state, events, now)

        health = ahi.compute(
            state.asset_id,
            health_score=health_score,
            availability_pct=reliability.availability_pct,
            rul_days=rul_days,
            failure_probability=failure_probability,
            prediction_confidence=prediction_confidence,
            open_by_severity=open_by_severity,
            anomalies_24h=anomalies_24h,
            observed_hours=reliability.observed_hours,
            is_offline=state.device_status == "Offline",
            config=config,
        )

        component_wear = bundle.predictive.component_wear
        component_life = bundle.predictive.component_life_days

        repair = cost_model.repair_estimate(state.asset_id, seed.category, component_wear, config)

        exposure = cost_model.cost_exposure(
            state.asset_id,
            failure_probability=failure_probability,
            estimate=repair,
            replacement_cost=criticality.replacement_cost,
            lead_time_days=criticality.lead_time_days,
            downtime_rate_per_hour=criticality.downtime_rate_per_hour,
            measured_mttr_minutes=reliability.mttr_minutes,
            mttr_censored=reliability.mttr_censored,
            config=config,
        )

        effective_age, ageing_factor = cost_model.effective_age_days(component_life, calendar_age_days)

        pressure = ahi.alarm_pressure(open_by_severity, anomalies_24h)

        risk = risk_model.compute_risk(
            state.asset_id,
            failure_probability=failure_probability,
            alarm_pressure=pressure,
            failure_rate_per_1000h=reliability.failure_rate_per_1000h,
            health_index=health.index,
            criticality_score=criticality.score,
            failure_rate_credible=reliability.rate_credible,
        )

        # Age of the oldest open order against this asset, so a job that has been
        # waiting pushes its own asset up the queue.
        oldest_days = 0.0
        if open_order_ids:
            engine_orders = wo.get_work_order_engine()
            ages = [
                order.age_days(now)
                for order in (engine_orders.get(identifier) for identifier in open_order_ids)
                if order is not None
            ]
            oldest_days = max(ages, default=0.0)

        priority = risk_model.compute_priority(
            state.asset_id,
            risk_score=risk.score,
            health_index=health.index,
            rul_days=rul_days,
            criticality_score=criticality.score,
            days_outstanding=oldest_days,
        )

        lifecycle = risk_model.repair_or_replace(
            state.asset_id,
            estimate=repair,
            component_wear=component_wear,
            replacement_cost=criticality.replacement_cost,
            criticality_score=criticality.score,
            failure_probability=failure_probability,
            effective_age=effective_age,
            ageing_factor=ageing_factor,
            config=config,
        )

        action = risk_model.recommend(
            state.asset_id,
            decision=lifecycle,
            priority=priority,
            risk=risk,
            rul_days=rul_days,
            exposure=exposure.exposure,
            is_offline=state.device_status == "Offline",
            open_failures=reliability.open_failures,
        )

        return AssetApmRecord(
            asset_id=state.asset_id,
            asset_name=seed.asset_name,
            category=seed.category,
            brand=seed.brand,
            model=seed.model,
            status=state.device_status,
            device_uid=state.device_uid,
            inputs={
                "predictive": {
                    "health_score": health_score,
                    "health_band": band_of(health_score),
                    "rul_days": rul_days,
                    "failure_probability": failure_probability,
                    "failure_mode": failure_mode,
                    "prediction_confidence": prediction_confidence,
                },
                "anomaly_detection": {
                    "anomalies_24h": anomalies_24h,
                    "open_by_severity": dict(open_by_severity),
                    "open_total": sum(open_by_severity.values()),
                    "alarm_pressure": round(pressure, 4),
                    "anomaly_score": round(
                        max((event.anomaly_score for event in events if event.resolved_at is None), default=0.0),
                        4,
                    ),
                    "device_status": state.device_status,
                },
                "platform_core": {
                    "runtime_hours": round(state.runtime_hours, 3),
                    "energy_kwh": round(state.energy_kwh, 5),
                    "relay_status": state.relay_status,
                    "relay_operations": state.relay_operations,
                    "temperature": round(state.temperature, 2),
                    "duty_factor": seed.duty_factor,
                    "power_factor": round(state.power_factor, 4),
                    "active_power": round(state.active_power, 2),
                    "uptime_ratio": round(state.uptime_ratio, 5),
                    "observed_hours": reliability.observed_hours,
                },
                # Published so a caller can confirm APM read OEE's availability
                # rather than deriving a second one of its own.
                "effectiveness": {
                    "availability": performance.availability if performance else 0.0,
                    "oee": performance.oee if performance else 0.0,
                }
                if performance
                else {},
            },
            criticality=criticality,
            health_index=health,
            reliability=reliability,
            repair=repair,
            exposure=exposure,
            risk=risk,
            priority=priority,
            lifecycle=lifecycle,
            action=action,
            utilisation_pct=reliability_model.utilisation(state, reliability.availability_pct),
            downtime_cost=reliability_model.downtime_cost(
                reliability.downtime_hours, criticality.downtime_rate_per_hour
            ),
            effective_age_days=effective_age,
            ageing_factor=ageing_factor,
            calendar_age_days=calendar_age_days,
            open_work_orders=len(open_order_ids),
            work_order_ids=list(open_order_ids),
        )

    # ── Ranking ─────────────────────────────────────────────────────────

    @staticmethod
    def _rank(records: dict[str, AssetApmRecord]) -> None:
        """Three orderings, because they answer three different questions.

        Health index ranks condition — who is in the worst shape. Risk ranks
        exposure — who is most likely to hurt us. Priority ranks the *queue* — who
        gets attention first. They are not the same list, and collapsing them into
        one is how a maintenance team ends up working on the wrong asset.
        """
        entries = list(records.values())

        for index, record in enumerate(sorted(entries, key=lambda item: item.health_index.index)):
            record.health_index_rank = index + 1
        for index, record in enumerate(sorted(entries, key=lambda item: -item.risk.score)):
            record.risk_rank = index + 1
        for index, record in enumerate(sorted(entries, key=lambda item: -item.priority.score)):
            record.priority_rank = index + 1

    # ── Roll-up ─────────────────────────────────────────────────────────

    def _roll_up(
        self,
        records: dict[str, AssetApmRecord],
        states: list,
        orders: list[wo.WorkOrderRecord],
        now: datetime,
        engine: InteloraEngine,
        config: ApmConfig,
    ) -> ApmSnapshot:
        entries = list(records.values())

        criticality_scores = {record.asset_id: record.criticality.score for record in entries}
        fleet_health = ahi.rollup(
            [record.health_index for record in entries],
            criticality_scores,
            config.targets.health_index_floor,
        )
        fleet_reliability = reliability_model.rollup(
            [record.reliability for record in entries], config.targets.availability_pct
        )

        committed, planned, reactive = wo.spend(orders)
        backlog = wo.backlog(orders, now, config)
        effectiveness = wo.effectiveness(orders, config)

        economics = cost_model.economics(
            exposures=[record.exposure for record in entries],
            addressed_asset_ids={record.asset_id for record in entries if record.open_work_orders > 0},
            committed_spend=committed,
            planned_spend=planned,
            reactive_spend=reactive,
            backlog_cost=backlog.cost,
            downtime_cost_total=sum(record.downtime_cost for record in entries),
            config=config,
        )

        # Hierarchy, with the APM figures folded through every level.
        tree = hierarchy_model.build(
            states, {record.asset_id: record.criticality.label for record in entries}
        )
        hierarchy_model.roll_up(
            tree,
            {
                record.asset_id: {
                    "health_index": record.health_index.index,
                    "criticality_score": record.criticality.score,
                    "risk_score": record.risk.score,
                    "risk_tier": record.risk.tier,
                    "availability_pct": record.reliability.availability_pct,
                    "downtime_hours": record.reliability.downtime_hours,
                    "cost_exposure": record.exposure.exposure,
                    "open_work_orders": record.open_work_orders,
                }
                for record in entries
            },
        )

        total = max(1, len(entries))

        risk_counts = {tier: 0 for _minimum, tier, _label in risk_model.RISK_BANDS}
        for record in entries:
            risk_counts[record.risk.tier] = risk_counts.get(record.risk.tier, 0) + 1

        criticality_counts: dict[str, int] = {}
        for record in entries:
            criticality_counts[record.criticality.code] = (
                criticality_counts.get(record.criticality.code, 0) + 1
            )

        lifecycle_counts: dict[str, int] = {}
        for record in entries:
            lifecycle_counts[record.lifecycle.decision] = (
                lifecycle_counts.get(record.lifecycle.decision, 0) + 1
            )

        return ApmSnapshot(
            computed_at=now,
            tick=engine.tick,
            analytics_tick=engine.analytics.tick,
            records=records,
            fleet_health=fleet_health,
            fleet_reliability=fleet_reliability,
            economics=economics,
            backlog=backlog,
            effectiveness=effectiveness,
            hierarchy=tree,
            risk_distribution=[
                {
                    "tier": tier,
                    "label": label,
                    "count": risk_counts.get(tier, 0),
                    "share_pct": round(risk_counts.get(tier, 0) / total * 100, 1),
                }
                for _minimum, tier, label in risk_model.RISK_BANDS
            ],
            criticality_distribution=[
                {
                    "code": code,
                    "label": label,
                    "count": criticality_counts.get(code, 0),
                    "share_pct": round(criticality_counts.get(code, 0) / total * 100, 1),
                }
                for _minimum, code, label in CRITICALITY_CLASSES
            ],
            lifecycle_distribution=lifecycle_counts,
        )

    # ── Downstream contracts ────────────────────────────────────────────

    @staticmethod
    def outputs_for_oee(snapshot: ApmSnapshot) -> dict:
        """The inputs OEE needs from APM, and nothing more.

        Availability, condition, maintenance state, downtime and utilisation.
        Deliberately no performance, quality or effectiveness figure: those are
        OEE's to compute, and publishing a version of them here would create a
        second source for a number that must have one.
        """
        entries = snapshot.ordered

        return {
            "assets": [
                {
                    "asset_id": record.asset_id,
                    "availability": record.reliability.availability_pct,
                    "inherent_availability": record.reliability.inherent_availability_pct,
                    "asset_health_index": record.health_index.index,
                    "asset_health_band": record.health_index.band,
                    # Whether maintenance is currently constraining this asset.
                    "maintenance_status": (
                        "in-maintenance"
                        if record.open_work_orders > 0 and record.reliability.open_failures > 0
                        else "work-outstanding"
                        if record.open_work_orders > 0
                        else "clear"
                    ),
                    "downtime_hours": record.reliability.downtime_hours,
                    "asset_utilisation": record.utilisation_pct,
                    # Share of nominal capability lost to condition and alarms,
                    # expressed as a multiplier OEE can apply to whatever
                    # performance model it owns.
                    "efficiency_impact": round(
                        max(0.0, 1.0 - record.health_index.index / 100.0) * 100.0, 1
                    ),
                    "open_work_orders": record.open_work_orders,
                    "risk_tier": record.risk.tier,
                }
                for record in entries
            ],
            "fleet": {
                "availability": snapshot.fleet_reliability.availability_pct,
                "inherent_availability": snapshot.fleet_reliability.inherent_availability_pct,
                "asset_health_index": snapshot.fleet_health.mean_index,
                "weighted_health_index": snapshot.fleet_health.weighted_index,
                "total_downtime_hours": snapshot.fleet_reliability.total_downtime_hours,
                "mean_utilisation": round(
                    sum(record.utilisation_pct for record in entries) / max(1, len(entries)), 1
                ),
                "assets_in_maintenance": sum(1 for record in entries if record.open_work_orders > 0),
                "efficiency_impact": round(
                    max(0.0, 1.0 - snapshot.fleet_health.mean_index / 100.0) * 100.0, 1
                ),
            },
            "computed_at": snapshot.computed_at,
            "analytics_tick": snapshot.analytics_tick,
        }

    @staticmethod
    def outputs_for_executive(snapshot: ApmSnapshot) -> dict:
        """The executive summary APM owes the cockpit."""
        entries = snapshot.ordered
        criticals = [record for record in entries if record.risk.tier in ("critical", "high")]

        return {
            "asset_health": {
                "index": snapshot.fleet_health.mean_index,
                "weighted_index": snapshot.fleet_health.weighted_index,
                "band_counts": dict(snapshot.fleet_health.band_counts),
                "below_floor": snapshot.fleet_health.below_floor,
                "operationally_impaired": snapshot.fleet_health.operationally_impaired,
            },
            "critical_assets": [
                {
                    "asset_id": record.asset_id,
                    "asset_name": record.asset_name,
                    "health_index": record.health_index.index,
                    "risk_score": record.risk.score,
                    "risk_tier": record.risk.tier,
                    "criticality_code": record.criticality.code,
                    "cost_exposure": record.exposure.exposure,
                    "action": record.action.action,
                    "priority": record.priority.label,
                }
                for record in sorted(criticals, key=lambda item: -item.risk.score)
            ],
            "maintenance_cost": snapshot.economics.as_dict(),
            "backlog": snapshot.backlog.as_dict(),
            "risk": {
                "distribution": snapshot.risk_distribution,
                "mean_score": round(
                    sum(record.risk.score for record in entries) / max(1, len(entries)), 1
                ),
                "assets_at_risk": len(criticals),
            },
            "roi": {
                "maintenance_roi": snapshot.economics.roi,
                "return_per_unit_spend": snapshot.economics.return_per_unit_spend,
                "avoidable_exposure": snapshot.economics.avoidable_exposure,
                "planned_spend_ratio": snapshot.economics.planned_spend_ratio,
            },
            "cost_exposure": {
                "total": snapshot.economics.total_exposure,
                "unaddressed": snapshot.economics.unaddressed_exposure,
                "downtime_cost": snapshot.economics.downtime_cost,
                "top_assets": [
                    {
                        "asset_id": record.asset_id,
                        "asset_name": record.asset_name,
                        "exposure": record.exposure.exposure,
                        "driver": record.risk.driver,
                    }
                    for record in sorted(entries, key=lambda item: -item.exposure.exposure)[:5]
                ],
            },
            "maintenance_kpis": {
                "effectiveness": snapshot.effectiveness.as_dict(),
                "planned_ratio": snapshot.effectiveness.planned_ratio,
                "schedule_compliance": snapshot.effectiveness.schedule_compliance,
                "rework_rate": snapshot.effectiveness.rework_rate,
                "backlog_weeks": snapshot.backlog.weeks_of_work,
            },
            "reliability_kpis": snapshot.fleet_reliability.as_dict(),
            "work_order_status": {
                "open": snapshot.backlog.total,
                "overdue": snapshot.backlog.overdue,
                "by_status": dict(snapshot.backlog.by_status),
                "by_priority": dict(snapshot.backlog.by_priority),
                "awaiting_approval": snapshot.backlog.awaiting_approval,
                "unassigned": snapshot.backlog.unassigned,
            },
            "lifecycle_distribution": dict(snapshot.lifecycle_distribution),
            "computed_at": snapshot.computed_at,
            "analytics_tick": snapshot.analytics_tick,
        }


#: Module singleton, so the cached pass is shared across requests.
apm_service = ApmService()


def get_apm_service() -> ApmService:
    return apm_service
