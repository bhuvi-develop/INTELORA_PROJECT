"""Taxonomy-aware anomaly surface for the anomaly detection module.

Mounted at `/api/v1/anomalies`, alongside — not replacing — the existing
`/api/anomalies`. The older surface serves the journal straight off the detector
in memory and the reporting endpoints depend on it; this one reads the persisted
taxonomy store, which is what makes precision, recall and technician feedback
survive a restart.

These handlers are declared `def`, not `async def`, and that is deliberate. The
platform's session factory is synchronous SQLAlchemy. An `async def` handler that
performs blocking I/O holds the event loop for the duration of the query, and
this process is also running the 1 Hz tick loop and broadcasting telemetry over a
websocket from that same loop — so a slow query would stall the stream for every
connected client. FastAPI runs a `def` handler in a worker thread, which is the
correct pairing for a blocking driver. Converting this surface to genuine async
means moving the whole engine to asyncpg, which is a separate piece of work.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.logging_config import get_logger
from app.models.anomaly import AnomalyEventRecord, AnomalyFeedbackLog
from app.routers.deps import build_meta, get_engine
from app.schemas.anomaly_taxonomy import (
    ClassificationBreakdownResponse,
    EngineeringKpiResponse,
    FeedbackRequest,
    FeedbackResponse,
    JournalResponse,
    StatusBarResponse,
    TaxonomyResponse,
)
from app.services.anomaly_analytics import (
    DEFAULT_WINDOW_HOURS,
    classification_breakdown,
    engineering_kpis,
    journal_page,
    precision_for_category,
    status_bar,
)
from app.services.engine import InteloraEngine
from app.services.taxonomy import (
    CATEGORIES,
    CATEGORY_LABELS,
    STATUS_ACKNOWLEDGED,
    STATUS_ACTIVE,
    STATUS_FALSE_POSITIVE,
    TAXONOMY_RULES,
    normalise_category,
    resolve_type_id,
)

logger = get_logger(__name__)

# Starlette renamed HTTP_422_UNPROCESSABLE_ENTITY to ..._CONTENT and deprecated the
# old spelling. The integer is stable across both, so the router does not have to
# care which version it is running against.
HTTP_422 = 422

router = APIRouter(prefix="/v1/anomalies", tags=["Anomalies · Taxonomy"])


# ── Query parsing ────────────────────────────────────────────────────────


def _category(value: str | None) -> str | None:
    """Resolve a category, rejecting an unrecognised one rather than ignoring it.

    Silently dropping an unknown filter would answer a narrower question than the
    caller asked and look like a correct empty result.
    """
    if value is None:
        return None
    resolved = normalise_category(value)
    if resolved is None:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"Unknown category {value!r}. Expected one of: {', '.join(CATEGORIES)} (GRID accepted for GRID_TRANSIENT).",
        )
    return resolved


def _type_id(value: str | None) -> str | None:
    if value is None:
        return None
    resolved = resolve_type_id(value)
    if resolved is None:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"Unknown failure mode {value!r}. Expected an M01–M15 code or full type id.",
        )
    return resolved


_ALLOWED_STATUS = ("ACTIVE", "ACKNOWLEDGED", "SELF_CLEARED", "FALSE_POSITIVE")


def _status(value: str | None) -> str | None:
    if value is None:
        return None
    candidate = value.strip().upper()
    if candidate not in _ALLOWED_STATUS:
        raise HTTPException(
            status_code=HTTP_422,
            detail=f"Unknown status {value!r}. Expected one of: {', '.join(_ALLOWED_STATUS)}.",
        )
    return candidate


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get("/status-bar", response_model=StatusBarResponse, summary="Real-time taxonomy status bar")
def read_status_bar(
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> StatusBarResponse:
    """Counts behind the four cards at the top of the anomaly view.

    The open queue is `ACTIVE` plus `ACKNOWLEDGED`: an alert someone has claimed
    is still open work. An alert marked as noise is excluded — it is no longer
    work, and leaving it in the count would mean the queue could never be
    cleared.
    """
    payload = status_bar(session, engine)
    return StatusBarResponse(**payload, meta=build_meta(engine))


@router.get(
    "/classification-breakdown",
    response_model=ClassificationBreakdownResponse,
    summary="Open events per fault class",
)
def read_classification_breakdown(
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> ClassificationBreakdownResponse:
    """Distribution across the six fault classes, for the donut.

    Classes with nothing open are omitted rather than returned as zero, so the
    caller does not have to filter empty slices out of a chart.
    """
    payload = classification_breakdown(session)
    return ClassificationBreakdownResponse(**payload, meta=build_meta(engine))


@router.get(
    "/engineering-kpis",
    response_model=EngineeringKpiResponse,
    summary="Detection quality and engineering KPIs",
)
def read_engineering_kpis(
    category: str | None = Query(
        default=None,
        description="Restrict every figure to one fault class, e.g. ELECTRICAL. GRID is accepted for GRID_TRANSIENT.",
    ),
    window_hours: int = Query(
        default=DEFAULT_WINDOW_HOURS,
        ge=1,
        le=720,
        description="Window every rate is computed over",
    ),
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> EngineeringKpiResponse:
    """The seven detection-quality figures.

    Each headline is accompanied by the terms it was composed from under
    `detail`, so a figure can be checked rather than trusted. A ratio with no
    denominator is returned as null, never as zero.
    """
    payload = engineering_kpis(
        session, engine, category=_category(category), window_hours=window_hours
    )
    return EngineeringKpiResponse(**payload, meta=build_meta(engine))


@router.post(
    "/{event_id}/feedback",
    response_model=FeedbackResponse,
    status_code=http_status.HTTP_201_CREATED,
    summary="Log technician judgement on a raised event",
)
def log_feedback(
    event_id: uuid.UUID,
    body: FeedbackRequest,
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> FeedbackResponse:
    """Record what the engineer who looked at this alert concluded.

    The log is append-only — a technician changing their mind adds a row rather
    than editing one, so the audit trail survives. The event's status follows the
    latest verdict.

    A `FALSE_POSITIVE` verdict takes the event out of the open queue and out of
    the numerator of precision. The detector is prevented from overwriting that
    status on a later flush: whether a limit is being broken is the detector's
    call, but whether the alert was worth raising is not.
    """
    event = session.get(AnomalyEventRecord, event_id)
    if event is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"No anomaly event {event_id}",
        )

    session.add(
        AnomalyFeedbackLog(
            event_id=event.id,
            feedback_type=body.feedback_type,
            technician_id=body.technician_id,
            notes=body.notes,
            logged_at=datetime.now(timezone.utc),
        )
    )

    if body.feedback_type == "FALSE_POSITIVE":
        event.status = STATUS_FALSE_POSITIVE
    elif body.feedback_type == "ACCEPTED_RECOMMENDATION" and event.status == STATUS_ACTIVE:
        # Accepting the recommendation is claiming the work.
        event.status = STATUS_ACKNOWLEDGED
    elif body.feedback_type == "CONFIRMED_TRUE" and event.status == STATUS_FALSE_POSITIVE:
        # A reversal: the alert was real after all. Hand it back to the detector's
        # lifecycle rather than guessing where it should sit.
        event.status = STATUS_ACKNOWLEDGED

    session.commit()

    logger.info(
        "anomaly feedback %s on %s (%s/%s) by %s",
        body.feedback_type,
        event.source_uid,
        event.category,
        event.type_id,
        body.technician_id,
    )

    # Recompute precision over the same class, so the caller can update the tile
    # without a second round trip.
    precision = precision_for_category(session, event.category)

    return FeedbackResponse(
        logged=True,
        event_id=str(event.id),
        feedback_type=body.feedback_type,
        event_status=event.status,
        precision_score=precision["score"],
        precision_detail=precision,
        meta=build_meta(engine),
    )


@router.get("/journal", response_model=JournalResponse, summary="Paginated event journal")
def read_journal(
    category: str | None = Query(default=None, description="Fault class code"),
    status: str | None = Query(default=None, description="ACTIVE, ACKNOWLEDGED, SELF_CLEARED or FALSE_POSITIVE"),
    type_id: str | None = Query(default=None, description="M01–M15 code or full type id"),
    device_id: str | None = Query(default=None, description="Restrict to one device"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> JournalResponse:
    """The journal, ordered most severe first and newest within a severity.

    Each row carries the ground-truth `mechanism` where the estate injected one
    and the 1 Hz `telemetry_snapshot` the event was raised from, so the table can
    show component attribution and the evidence behind it without a per-row
    request.
    """
    payload = journal_page(
        session,
        category=_category(category),
        status=_status(status),
        type_id=_type_id(type_id),
        device_id=device_id,
        page=page,
        limit=limit,
    )
    return JournalResponse(**payload, meta=build_meta(engine))


@router.get("/taxonomy", response_model=TaxonomyResponse, summary="The M01–M15 rule catalogue")
def read_taxonomy(
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> TaxonomyResponse:
    """Every failure mode the classifier recognises, with live open counts.

    Published so the meaning of a taxonomy id lives in the platform rather than
    in a copy of it held by each client. Dwell and clear windows are read from
    the detector's own configuration, so this cannot drift from the rules that
    actually run.
    """
    counts = dict(
        session.execute(
            select(AnomalyEventRecord.type_id, func.count())
            .where(AnomalyEventRecord.status.in_((STATUS_ACTIVE, STATUS_ACKNOWLEDGED)))
            .group_by(AnomalyEventRecord.type_id)
        ).all()
    )

    return TaxonomyResponse(
        rules=[
            {
                "type_id": rule.type_id,
                "code": rule.code,
                "name": rule.name,
                "category": rule.category,
                "category_name": CATEGORY_LABELS.get(rule.category, rule.category),
                "signature": rule.signature,
                "expression": rule.expression,
                "channel": rule.channel,
                "dwell_seconds": rule.dwell_seconds,
                "clear_seconds": rule.clear_seconds,
                "detail": rule.detail,
                "open_count": int(counts.get(rule.type_id, 0)),
            }
            for rule in TAXONOMY_RULES
        ],
        clear_margin_pct=3.0,
        meta=build_meta(engine),
    )
