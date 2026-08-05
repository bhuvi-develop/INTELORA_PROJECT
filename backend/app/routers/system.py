"""Platform health, engine control, MQTT connection management and the live websocket feed."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database.base import get_db
from app.routers.deps import build_meta, get_engine
from app.services.engine import InteloraEngine
from app.services.persistence import database_latency_ms
from app.services.scheduler import get_scheduler, manager
from app.services.mqtt_listener import mqtt_listener
from app.services.mqtt_config import mqtt_profile_manager, MqttProfile

router = APIRouter(tags=["System"])


@router.get("/system/status", summary="Platform and background task state")
def read_status(
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    database_ok, latency = database_latency_ms(session)
    scheduler = get_scheduler()
    active_profile = mqtt_profile_manager.get_active_profile()

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
        "mqtt": {
            "connected": mqtt_listener.connected,
            "active_profile": active_profile.name,
            "protocol": active_profile.protocol,
            "broker": active_profile.host,
            "port": active_profile.port,
            "topic": active_profile.topic,
            "qos": active_profile.qos,
            "use_tls": active_profile.use_tls,
            "validate_cert": active_profile.validate_cert,
            "messages_sec": mqtt_listener.messages_sec,
            "last_msg_at": mqtt_listener.last_msg_at.isoformat() if mqtt_listener.last_msg_at else None,
            "last_error": mqtt_listener.last_error,
        },
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
    engine.fit_models()
    analytics = engine.refresh_analytics()
    return {
        "computed_at": analytics.computed_at,
        "assets": len(analytics.performance),
        "meta": build_meta(engine),
    }


class SourceSwitchRequest(BaseModel):
    source: str


@router.post("/system/source", summary="Switch telemetry source")
def switch_source(req: SourceSwitchRequest, engine: InteloraEngine = Depends(get_engine)) -> dict:
    scheduler = get_scheduler()
    if scheduler:
        scheduler.telemetry_source = req.source
        if req.source == "Live MQTT":
            mqtt_listener.start()

    engine.set_telemetry_source(req.source)
    return {"status": "ok", "source": req.source}


# ── MQTT Connection Profile Management Endpoints ─────────────────────────

@router.get("/mqtt/profiles", summary="List all configured MQTT connection profiles")
def list_mqtt_profiles() -> dict:
    active = mqtt_profile_manager.get_active_profile()
    profiles = [p.model_dump() for p in mqtt_profile_manager.get_all_profiles()]
    return {
        "active_profile": active.name,
        "connected": mqtt_listener.connected,
        "profiles": profiles
    }


@router.post("/mqtt/profiles", summary="Save or update an MQTT connection profile")
def save_mqtt_profile(profile: MqttProfile) -> dict:
    saved = mqtt_profile_manager.save_profile(profile)
    return {"status": "saved", "profile": saved.model_dump()}


@router.delete("/mqtt/profiles/{name}", summary="Delete an MQTT connection profile")
def delete_mqtt_profile(name: str) -> dict:
    deleted = mqtt_profile_manager.delete_profile(name)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"MQTT profile '{name}' not found")
    return {"status": "deleted", "name": name}


class ConnectRequest(BaseModel):
    name: str


@router.post("/mqtt/connect", summary="Connect to a specific MQTT profile by name")
def connect_mqtt_profile(req: ConnectRequest) -> dict:
    ok = mqtt_listener.reconnect_to_profile(req.name)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Failed to connect to MQTT profile '{req.name}'")
    
    scheduler = get_scheduler()
    if scheduler:
        scheduler.telemetry_source = "Live MQTT"

    return {
        "status": "connected",
        "active_profile": req.name,
        "connected": mqtt_listener.connected
    }


class TestConnectionRequest(BaseModel):
    host: str
    port: int = 1883


@router.post("/mqtt/test", summary="Test reachability to an MQTT host/port")
def test_mqtt_connection(req: TestConnectionRequest) -> dict:
    return mqtt_listener.test_connection(req.host, req.port)


@router.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)
