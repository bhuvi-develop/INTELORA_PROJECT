"""Overall equipment effectiveness.

Effectiveness is kept consistent with condition by construction: performance and
quality are functions of the same health score the rest of the platform reports,
so a device whose health falls must show a lower OEE here. There is no separate
effectiveness model that could drift away from it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.routers.deps import build_meta, get_engine
from app.schemas.analysis import OeeResponse
from app.services.derive import OEE_TARGET, OEE_WORLD_CLASS
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/oee", tags=["OEE"])


@router.get("", response_model=OeeResponse, summary="Fleet and per-asset effectiveness")
def read_oee(
    category: str | None = Query(default=None),
    engine: InteloraEngine = Depends(get_engine),
) -> OeeResponse:
    analytics = engine.analytics
    results = [
        entry
        for entry in analytics.performance.values()
        if category is None or entry.category == category
    ]

    assets = [
        {
            "asset_id": entry.asset_id,
            "asset_name": entry.asset_name,
            "category": entry.category,
            "availability": entry.availability,
            "performance": entry.performance,
            "quality": entry.quality,
            "oee": entry.oee,
            "health_score": entry.health_score,
            "gap_to_target": round(entry.oee - OEE_TARGET, 1),
        }
        for entry in sorted(results, key=lambda item: item.oee, reverse=True)
    ]

    fleet = engine.performance.fleet_oee(results) if category else analytics.fleet_oee

    return OeeResponse(
        fleet=fleet,
        assets=assets,
        above_target=sum(1 for entry in assets if entry["oee"] >= OEE_TARGET),
        below_target=sum(1 for entry in assets if entry["oee"] < OEE_TARGET),
        world_class_count=sum(1 for entry in assets if entry["oee"] >= OEE_WORLD_CLASS),
        meta=build_meta(engine),
    )


@router.get("/losses", summary="Where effectiveness is being lost")
def read_losses(engine: InteloraEngine = Depends(get_engine)) -> dict:
    """The cascade from a theoretical 100% down to measured effectiveness.

    Each arm is the measured shortfall of its own factor scaled by the factors
    before it, so the steps sum to the real gap rather than to an assumed split.
    """
    fleet = engine.analytics.fleet_oee
    return {
        "fleet": fleet,
        "cascade": [
            {"key": "theoretical", "label": "Theoretical maximum", "value": 100.0},
            *[
                {"key": step["key"], "label": step["label"], "value": -step["loss"], "detail": step["detail"]}
                for step in fleet["losses"]
            ],
            {"key": "actual", "label": "Actual effectiveness", "value": fleet["oee"]},
        ],
        "target": OEE_TARGET,
        "world_class": OEE_WORLD_CLASS,
        "meta": build_meta(engine),
    }
