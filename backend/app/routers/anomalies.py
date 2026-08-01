"""Anomaly journal and alert lifecycle."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.routers.deps import build_meta, get_engine
from app.schemas.analysis import AnomalyResponse
from app.services.derive import ANOMALY_DEFS, SEVERITY_RANK
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/anomalies", tags=["Anomalies"])


def _serialise(event, now: datetime) -> dict:
    return {
        "uid": event.uid,
        "asset_id": event.asset_id,
        "asset_name": event.asset_name,
        "category": event.category,
        "component": event.component,
        "error_code": event.error_code,
        "anomaly_type": event.anomaly_type,
        "title": event.title,
        "severity": event.severity,
        "status": event.status,
        "channel": event.channel,
        "observed_value": event.observed_value,
        "threshold_value": event.threshold_value,
        "unit": event.unit,
        "deviation_pct": event.deviation_pct,
        "anomaly_score": event.anomaly_score,
        "detection_method": event.detection_method,
        "confidence": event.confidence,
        "detail": event.detail,
        "detected_at": event.detected_at,
        "resolved_at": event.resolved_at,
        "acknowledged_at": event.acknowledged_at,
        "response_target_minutes": event.response_target_minutes,
        "minutes_open": round(event.minutes_open(now), 2),
    }


@router.get("", response_model=AnomalyResponse, summary="Anomaly journal")
def list_anomalies(
    asset_id: str | None = Query(default=None),
    severity: str | None = Query(default=None, description="Critical, Major, Warning or Info"),
    anomaly_status: str | None = Query(
        default=None, alias="status", description="Active, Acknowledged or Resolved"
    ),
    anomaly_type: str | None = Query(default=None, alias="type"),
    category: str | None = Query(default=None),
    open_only: bool = Query(default=False, description="Exclude anything already cleared"),
    limit: int = Query(default=200, ge=1, le=2000),
    engine: InteloraEngine = Depends(get_engine),
) -> AnomalyResponse:
    now = datetime.now(timezone.utc)
    journal = engine.detector.journal

    selected = []
    for event in journal:
        if asset_id and event.asset_id != asset_id:
            continue
        if severity and event.severity != severity:
            continue
        if anomaly_status and event.status != anomaly_status:
            continue
        if anomaly_type and event.anomaly_type != anomaly_type:
            continue
        if category and event.category != category:
            continue
        if open_only and not event.is_open:
            continue
        selected.append(event)

    selected.sort(
        key=lambda event: (SEVERITY_RANK.get(event.severity, 0), event.detected_at), reverse=True
    )

    total = len(journal)
    by_type = []
    for anomaly_key, definition in ANOMALY_DEFS.items():
        matching = [event for event in journal if event.anomaly_type == anomaly_key]
        by_type.append(
            {
                "anomaly_type": anomaly_key,
                "error_code": definition.code,
                "title": definition.title,
                "count": len(matching),
                "open": sum(1 for event in matching if event.is_open),
                "share_pct": round(len(matching) / total * 100, 1) if total else 0.0,
            }
        )
    by_type.sort(key=lambda entry: entry["count"], reverse=True)

    resolved = [event for event in journal if event.resolved_at is not None]
    mttr = (
        round(sum(event.minutes_open(now) for event in resolved) / len(resolved), 2) if resolved else 0.0
    )

    return AnomalyResponse(
        anomalies=[_serialise(event, now) for event in selected[:limit]],
        total=total,
        returned=min(len(selected), limit),
        open_count=len(engine.detector.open_events()),
        severity_breakdown=engine.severity_breakdown(),
        by_type=by_type,
        mean_time_to_resolve_minutes=mttr,
        meta=build_meta(engine),
    )


@router.get("/definitions", summary="Detector rules and error codes")
def read_definitions(engine: InteloraEngine = Depends(get_engine)) -> dict:
    """Every rule the detector applies, with the codes operators memorise.

    Published so the meaning of an error code lives in the platform rather than
    in someone's notes.
    """
    return {
        "definitions": [
            {
                "anomaly_type": definition.anomaly_type,
                "error_code": definition.code,
                "title": definition.title,
                "unit": definition.unit,
                "channel": definition.channel,
                "confirm_seconds": definition.confirm_seconds,
                "clear_seconds": definition.clear_seconds,
            }
            for definition in ANOMALY_DEFS.values()
        ],
        "clear_margin_pct": 3.0,
        "meta": build_meta(engine),
    }


@router.get("/{uid}", summary="One anomaly in full")
def read_anomaly(uid: str, engine: InteloraEngine = Depends(get_engine)) -> dict:
    event = engine.detector.get(uid)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No anomaly {uid}")

    now = datetime.now(timezone.utc)
    payload = _serialise(event, now)
    # The injected mechanism is the ground truth behind a simulated fault. It is
    # published so a root-cause result can be evaluated against what actually
    # happened rather than judged on plausibility.
    payload["mechanism"] = event.mechanism
    payload["meta"] = build_meta(engine).model_dump()
    return payload


@router.post("/{uid}/acknowledge", summary="Claim an alert")
def acknowledge(uid: str, by: str = Query(default="operator"), engine: InteloraEngine = Depends(get_engine)) -> dict:
    event = engine.detector.acknowledge(uid, datetime.now(timezone.utc), by)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No unacknowledged anomaly {uid}",
        )
    return {"acknowledged": 1, "anomaly": _serialise(event, datetime.now(timezone.utc))}


@router.post("/acknowledge-all", summary="Claim every unassigned alert")
def acknowledge_all(by: str = Query(default="operator"), engine: InteloraEngine = Depends(get_engine)) -> dict:
    claimed = engine.detector.acknowledge_all(datetime.now(timezone.utc), by)
    return {"acknowledged": len(claimed), "uids": [event.uid for event in claimed]}
