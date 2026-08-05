"""Cockpit dashboard.

One request returns everything the executive view needs, because a cockpit that
issues nine parallel requests can render nine different instants of the estate.
Here the KPIs, the risk split, the effectiveness and the asset tiles are all
projections of a single snapshot and carry the same tick.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.base import get_db
from app.routers.deps import build_meta, get_engine
from app.schemas.analysis import DashboardResponse
from app.services.dashboard_service import (
    activity_feed,
    energy_intelligence,
    fleet_trail,
    yesterday_baseline,
)
from app.services.derive import BANDS, OEE_TARGET
from app.services.engine import InteloraEngine
from app.services.insight_service import build_all
from app.services.persistence import database_latency_ms

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse, summary="Executive cockpit snapshot")
def read_dashboard(
    session: Session = Depends(get_db),
    engine: InteloraEngine = Depends(get_engine),
) -> DashboardResponse:
    analytics = engine.analytics
    # Volatile figures brought up to the current tick, so this response cannot
    # disagree with /api/anomalies about how many events are open right now.
    kpis = engine.live_kpis()
    total = max(1, int(kpis.get("total_assets", 0)))

    band_counts = {
        "healthy": kpis.get("healthy_assets", 0),
        "good": kpis.get("good_assets", 0),
        "warning": kpis.get("warning_assets", 0),
        "critical": kpis.get("critical_assets", 0),
    }

    database_ok, latency = database_latency_ms(session)

    tiles = []
    for asset_id in engine.get_active_asset_ids():
        state = engine.simulator.states[asset_id]
        performance = analytics.performance.get(asset_id)
        reading = engine.get_live_reading(asset_id)
        tiles.append(
            {
                "asset_id": asset_id,
                "asset_name": state.seed.asset_name,
                "category": state.seed.category,
                "status": reading.device_status if reading else state.device_status,
                "health_score": reading.health_score if reading else state.health,
                "health_band": state.band,
                "risk_tier": performance.risk_tier if performance else "healthy",
                "active_power": reading.active_power if reading else 0.0,
                "temperature": reading.temperature if reading else 0.0,
                "load_state": reading.load_state if reading else state.load_state,
                "open_anomalies": len(engine.detector.active_by_asset(asset_id)),
            }
        )

    return DashboardResponse(
        kpis=kpis,
        yesterday=yesterday_baseline(session, engine),
        bands=[
            {
                "band": definition.band,
                "label": definition.label,
                # The threshold is published so the interface can colour a value
                # against the same boundary the platform judged it by, rather
                # than carrying its own copy of the rule.
                "min": definition.minimum,
                "count": band_counts[definition.band],
                "share_pct": round(band_counts[definition.band] / total * 100, 1),
            }
            for definition in BANDS
        ],
        fleet_trail=fleet_trail(session, engine),
        risk_distribution=engine.risk_distribution(),
        severity_breakdown=engine.severity_breakdown(),
        categories=analytics.categories,
        oee=analytics.fleet_oee,
        energy=energy_intelligence(session, engine),
        platform=engine.platform_health(database_ok, latency),
        activity=activity_feed(engine, limit=25),
        insights=build_all(engine),
        assets=sorted(tiles, key=lambda tile: tile["health_score"]),
        worst_assets=engine.worst_assets(5),
        meta=build_meta(engine),
    )


@router.get("/kpis", summary="KPI block only")
def read_kpis(engine: InteloraEngine = Depends(get_engine)) -> dict:
    """The KPI block on its own, for callers polling faster than the full view."""
    return {"kpis": engine.live_kpis(), "target_oee": OEE_TARGET, "meta": build_meta(engine)}
