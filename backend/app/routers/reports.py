"""Historical reporting.

Daily aggregates over the stored archive rather than over live state, so a report
is reproducible: running it twice for the same range returns the same figures,
which is the difference between a report and a screenshot.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Float, case, cast, func, select
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.models.anomaly import AnomalyDetection
from app.models.asset import Asset
from app.models.maintenance import PredictiveMaintenance
from app.models.telemetry import Telemetry
from app.routers.deps import build_meta, get_engine
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/reports", tags=["Reports"])

MAX_DAYS = 90


@router.get("/daily", summary="Daily telemetry aggregates per device")
def read_daily(
    days: int = Query(default=30, ge=1, le=MAX_DAYS),
    asset_id: str | None = Query(default=None),
    category: str | None = Query(default=None),
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

    identity = {
        row.asset_id: (row.asset_name, row.category)
        for row in session.execute(select(Asset.asset_id, Asset.asset_name, Asset.category)).all()
    }

    day = func.date_trunc("day", Telemetry.ts).label("day")
    online = func.sum(case((Telemetry.device_status == "Online", 1), else_=0))

    query = (
        select(
            Telemetry.asset_id,
            day,
            func.avg(Telemetry.voltage).label("avg_voltage"),
            func.avg(Telemetry.current).label("avg_current"),
            func.avg(Telemetry.active_power).label("avg_power"),
            func.max(Telemetry.active_power).label("peak_power"),
            (func.max(Telemetry.energy_kwh) - func.min(Telemetry.energy_kwh)).label("energy_kwh"),
            func.avg(Telemetry.temperature).label("avg_temperature"),
            func.max(Telemetry.temperature).label("peak_temperature"),
            func.avg(Telemetry.health_score).label("avg_health"),
            func.min(Telemetry.health_score).label("min_health"),
            (cast(online, Float) / func.count() * 100.0).label("uptime_pct"),
            func.count().label("samples"),
        )
        .where(Telemetry.ts >= start)
        .group_by(Telemetry.asset_id, day)
        .order_by(day.desc(), Telemetry.asset_id)
    )

    if asset_id:
        query = query.where(Telemetry.asset_id == asset_id)

    rows = session.execute(query).all()

    # Anomaly counts for the same buckets, so the report's exception column comes
    # from the detection record rather than being re-derived from telemetry.
    anomaly_day = func.date_trunc("day", AnomalyDetection.detected_at).label("day")
    anomaly_rows = session.execute(
        select(AnomalyDetection.asset_id, anomaly_day, func.count().label("anomalies"))
        .where(AnomalyDetection.detected_at >= start)
        .group_by(AnomalyDetection.asset_id, anomaly_day)
    ).all()
    anomalies = {(row.asset_id, row.day.date()): int(row.anomalies) for row in anomaly_rows}

    records = []
    for row in rows:
        name, asset_category = identity.get(row.asset_id, (row.asset_id, "Unknown"))
        if category and asset_category != category:
            continue

        records.append(
            {
                "asset_id": row.asset_id,
                "asset_name": name,
                "category": asset_category,
                "date": row.day,
                "avg_voltage": round(float(row.avg_voltage or 0.0), 3),
                "avg_current": round(float(row.avg_current or 0.0), 4),
                "avg_power": round(float(row.avg_power or 0.0), 2),
                "peak_power": round(float(row.peak_power or 0.0), 2),
                "energy_kwh": round(float(row.energy_kwh or 0.0), 5),
                "avg_temperature": round(float(row.avg_temperature or 0.0), 2),
                "peak_temperature": round(float(row.peak_temperature or 0.0), 2),
                "avg_health": round(float(row.avg_health or 0.0), 1),
                "min_health": round(float(row.min_health or 0.0), 1),
                "uptime_pct": round(float(row.uptime_pct or 0.0), 2),
                "samples": int(row.samples),
                "anomalies": anomalies.get((row.asset_id, row.day.date()), 0),
            }
        )

    return {
        "records": records,
        "count": len(records),
        "days": days,
        "start": start,
        "end": now,
        "meta": build_meta(engine),
    }


@router.get("/predictions", summary="Prediction history per component")
def read_prediction_history(
    days: int = Query(default=30, ge=1, le=MAX_DAYS),
    asset_id: str | None = Query(default=None),
    component: str | None = Query(default=None),
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    """One prediction per component per day.

    The snapshot table holds a row every analytics pass; a report wants the day's
    published position, so the latest row of each day is taken rather than an
    average of figures that were themselves ratcheted through the day.
    """
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

    names = {
        row.asset_id: row.asset_name
        for row in session.execute(select(Asset.asset_id, Asset.asset_name)).all()
    }

    day = func.date_trunc("day", PredictiveMaintenance.computed_at).label("day")
    query = (
        select(
            PredictiveMaintenance.asset_id,
            PredictiveMaintenance.component,
            day,
            func.min(PredictiveMaintenance.rul_days).label("rul_days"),
            func.max(PredictiveMaintenance.failure_probability).label("failure_probability"),
            func.avg(PredictiveMaintenance.confidence).label("confidence"),
            func.max(PredictiveMaintenance.wear).label("wear"),
        )
        .where(PredictiveMaintenance.computed_at >= start)
        .group_by(PredictiveMaintenance.asset_id, PredictiveMaintenance.component, day)
        .order_by(day.desc(), PredictiveMaintenance.asset_id)
    )

    if asset_id:
        query = query.where(PredictiveMaintenance.asset_id == asset_id)
    if component:
        query = query.where(PredictiveMaintenance.component == component)

    rows = session.execute(query).all()

    return {
        "records": [
            {
                "asset_id": row.asset_id,
                "asset_name": names.get(row.asset_id, row.asset_id),
                "component": row.component,
                "date": row.day,
                "rul_days": round(float(row.rul_days or 0.0), 1),
                "failure_probability": round(float(row.failure_probability or 0.0), 4),
                "confidence": round(float(row.confidence or 0.0), 3),
                "wear": round(float(row.wear or 0.0), 5),
            }
            for row in rows
        ],
        "count": len(rows),
        "days": days,
        "start": start,
        "end": now,
        "meta": build_meta(engine),
    }


@router.get("/summary", summary="What the archive can report on")
def read_summary(
    session: Session = Depends(get_db), engine: InteloraEngine = Depends(get_engine)
) -> dict:
    telemetry_rows = session.execute(select(func.count()).select_from(Telemetry)).scalar_one()
    oldest = session.execute(select(func.min(Telemetry.ts))).scalar()
    newest = session.execute(select(func.max(Telemetry.ts))).scalar()
    anomaly_rows = session.execute(select(func.count()).select_from(AnomalyDetection)).scalar_one()
    prediction_rows = session.execute(select(func.count()).select_from(PredictiveMaintenance)).scalar_one()

    return {
        "telemetry_rows": int(telemetry_rows),
        "anomaly_rows": int(anomaly_rows),
        "prediction_rows": int(prediction_rows),
        "oldest": oldest,
        "newest": newest,
        "coverage_days": round(((newest - oldest).total_seconds() / 86_400.0), 2)
        if oldest and newest
        else 0.0,
        "assets": len(engine.simulator.states),
        "meta": build_meta(engine),
    }
