"""Platform health, engine control and the live websocket feed."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.config import settings
from app.database.base import get_db
from app.routers.deps import build_meta, get_engine
from app.services.engine import InteloraEngine
from app.services.persistence import database_latency_ms
from app.services.scheduler import get_scheduler, manager

router = APIRouter(tags=["System"])


@router.get("/system/status", summary="Platform and background task state")
def read_status(
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    database_ok, latency = database_latency_ms(session)
    scheduler = get_scheduler()

    return {
        "application": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "started_at": engine.started_at,
        "now": datetime.now(timezone.utc),
        "database_connected": database_ok,
        "history_backfilled": engine.history_backfilled,
        "platform": engine.platform_health(database_ok, latency),
        "scheduler": scheduler.status() if scheduler else {"running": False},
        "anomaly_models": engine.scorer.status(),
        "degradation_models": engine.degradation.status(),
        "configuration": {
            "tick_interval_seconds": settings.tick_interval_seconds,
            "persist_every_n_ticks": settings.persist_every_n_ticks,
            "analytics_interval_seconds": settings.analytics_interval_seconds,
            "raw_retention_hours": settings.raw_retention_hours,
            "history_days": settings.history_days,
            "wear_time_scale": settings.wear_time_scale,
            "ml_enabled": settings.ml_enabled,
        },
        "meta": build_meta(engine),
    }


@router.post("/system/refresh", summary="Force an analytics pass")
def force_refresh(engine: InteloraEngine = Depends(get_engine)) -> dict:
    """Recompute derived state immediately.

    The background pass runs on its own cadence; this exists so a caller that
    has just acknowledged a queue of alerts can see the effect without waiting
    for the next one.
    """
    engine.fit_models()
    analytics = engine.refresh_analytics()
    return {
        "computed_at": analytics.computed_at,
        "assets": len(analytics.performance),
        "meta": build_meta(engine),
    }


@router.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    """Push every tick to connected clients.

    Polling once a second works and is what the REST endpoints are for; this is
    the same data without the request overhead, for views that want the stream
    rather than a snapshot.
    """
    await manager.connect(websocket)
    try:
        while True:
            # The connection is server-driven. Reading keeps the socket honest:
            # a client that has gone away raises here rather than accumulating
            # in the broadcast set.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)
