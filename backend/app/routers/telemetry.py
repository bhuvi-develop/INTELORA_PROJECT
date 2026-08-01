"""Live telemetry and stored history.

Live readings are served from the engine's in-memory window, so a dashboard
polling once a second never touches PostgreSQL. History is served from the
database, at the coarsest resolution that still answers the question asked —
a month-long chart drawn from per-second rows would move sixty times more data
to draw the same line.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database.base import get_db
from app.models.telemetry import Telemetry
from app.routers.deps import build_meta, get_engine
from app.schemas.telemetry import HistoryResponse, LiveTelemetry
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

#: Rows a single history request may return, so one call cannot pull a month of
#: per-second data into memory.
MAX_POINTS = 5000

RESOLUTION_STEPS: dict[str, int] = {
    "second": 1,
    "minute": settings.backfill_minute_step_seconds,
    "quarter": settings.backfill_quarter_step_seconds,
    "hour": settings.backfill_hour_step_seconds,
}


@router.get("/live", response_model=LiveTelemetry, summary="Latest reading per device")
def read_live(
    asset_id: str | None = Query(default=None, description="Restrict to one device"),
    category: str | None = Query(default=None, description="Restrict to one device class"),
    engine: InteloraEngine = Depends(get_engine),
) -> LiveTelemetry:
    if asset_id:
        state = engine.simulator.states.get(asset_id)
        if state is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No asset {asset_id}")
        readings = [state.history[-1]] if state.history else []
    else:
        readings = [
            state.history[-1]
            for state in engine.simulator.states.values()
            if state.history and (category is None or state.seed.category == category)
        ]

    return LiveTelemetry(readings=readings, meta=build_meta(engine))


@router.get("/live/{asset_id}/window", summary="Recent in-memory window for one device")
def read_window(
    asset_id: str,
    samples: int = Query(default=300, ge=1, le=settings.live_window_samples),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    """The rolling window the detector and the models are reading.

    Served from memory, so a chart of the last few minutes costs nothing and
    shows exactly the samples the platform judged.
    """
    if asset_id not in engine.simulator.states:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No asset {asset_id}")

    window = engine.simulator.window(asset_id, samples)
    return {
        "asset_id": asset_id,
        "count": len(window),
        "readings": window,
        "meta": build_meta(engine),
    }


def _pick_resolution(start: datetime, end: datetime, requested: str | None) -> str:
    """Coarsest stored density that still gives a usable number of points."""
    if requested:
        return requested

    span_hours = (end - start).total_seconds() / 3600.0
    if span_hours <= 6:
        return "second"
    if span_hours <= 48:
        return "minute"
    if span_hours <= 24 * 8:
        return "quarter"
    return "hour"


@router.get("/history", response_model=HistoryResponse, summary="Stored telemetry history")
def read_history(
    asset_id: str | None = Query(default=None),
    component: str | None = Query(
        default=None,
        description=(
            "Restrict to a serviceable component. Telemetry is measured at the device input, "
            "so this filters to assets carrying that component rather than isolating its own signal."
        ),
    ),
    start: datetime | None = Query(default=None, description="Inclusive lower bound, UTC"),
    end: datetime | None = Query(default=None, description="Exclusive upper bound, UTC"),
    hours: int | None = Query(default=None, ge=1, le=24 * 90, description="Shorthand for the last N hours"),
    resolution: str | None = Query(default=None, description="second, minute, quarter or hour"),
    limit: int = Query(default=1500, ge=1, le=MAX_POINTS),
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> HistoryResponse:
    now = datetime.now(timezone.utc)

    if hours is not None:
        window_end = end or now
        window_start = window_end - timedelta(hours=hours)
    else:
        window_end = end or now
        window_start = start or (window_end - timedelta(hours=24))

    if window_start >= window_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="start must be earlier than end"
        )

    chosen = _pick_resolution(window_start, window_end, resolution)
    if chosen not in RESOLUTION_STEPS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"resolution must be one of {', '.join(RESOLUTION_STEPS)}",
        )

    if asset_id and asset_id not in engine.simulator.states:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No asset {asset_id}")

    if component:
        carriers = {
            identifier
            for identifier, state in engine.simulator.states.items()
            if any(spec.name == component for spec in state.profile.components)
        }
        if not carriers:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"No commissioned asset carries {component}"
            )
        if asset_id and asset_id not in carriers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{asset_id} does not carry a {component}",
            )
    else:
        carriers = None

    query = (
        select(Telemetry)
        .where(
            Telemetry.ts >= window_start,
            Telemetry.ts < window_end,
            Telemetry.resolution == chosen,
        )
        .order_by(Telemetry.ts)
        .limit(limit)
    )

    if asset_id:
        query = query.where(Telemetry.asset_id == asset_id)
    elif carriers is not None:
        query = query.where(Telemetry.asset_id.in_(carriers))

    rows = session.execute(query).scalars().all()

    return HistoryResponse(
        asset_id=asset_id,
        component=component,
        resolution=chosen,
        start=window_start,
        end=window_end,
        count=len(rows),
        points=rows,
        step_seconds=RESOLUTION_STEPS[chosen],
        meta=build_meta(engine),
    )


@router.get("/history/summary", summary="What history is stored")
def history_summary(session: Session = Depends(get_db), engine: InteloraEngine = Depends(get_engine)) -> dict:
    """Row counts and coverage per resolution.

    Reports the shape of the archive rather than assuming it: a caller can see
    exactly how far back each density reaches before asking for a range.
    """
    from sqlalchemy import func

    rows = session.execute(
        select(
            Telemetry.resolution,
            func.count().label("rows"),
            func.min(Telemetry.ts).label("oldest"),
            func.max(Telemetry.ts).label("newest"),
        ).group_by(Telemetry.resolution)
    ).all()

    return {
        "resolutions": [
            {
                "resolution": row.resolution,
                "rows": int(row.rows),
                "oldest": row.oldest,
                "newest": row.newest,
                "step_seconds": RESOLUTION_STEPS.get(row.resolution),
            }
            for row in rows
        ],
        "retention_hours_raw": settings.raw_retention_hours,
        "history_days": settings.history_days,
        "meta": build_meta(engine),
    }
