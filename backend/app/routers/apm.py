"""Asset performance management.

Fleet comparison only. No telemetry appears in this projection: the question a
ranking answers is which asset is performing, not what any one of them is
reading at this instant.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.routers.deps import build_meta, get_engine
from app.schemas.analysis import ApmResponse
from app.services.derive import OEE_TARGET
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/apm", tags=["Asset Performance"])


@router.get("", response_model=ApmResponse, summary="Fleet performance comparison")
def read_apm(
    category: str | None = Query(default=None),
    engine: InteloraEngine = Depends(get_engine),
) -> ApmResponse:
    analytics = engine.analytics
    ranking = analytics.ranking

    if category:
        ranking = [entry for entry in ranking if entry["category"] == category]
        # Re-rank inside the filtered set so the positions mean something.
        ranking = [{**entry, "rank": index + 1} for index, entry in enumerate(ranking)]

    below = [entry for entry in ranking if entry["oee"] < OEE_TARGET]

    return ApmResponse(
        ranking=ranking,
        categories=analytics.categories,
        leader=ranking[0] if ranking else None,
        laggard=ranking[-1] if ranking else None,
        fleet_average_oee=round(sum(entry["oee"] for entry in ranking) / len(ranking), 1)
        if ranking
        else 0.0,
        fleet_average_availability=round(
            sum(entry["availability"] for entry in ranking) / len(ranking), 1
        )
        if ranking
        else 0.0,
        assets_below_target=len(below),
        target=OEE_TARGET,
        meta=build_meta(engine),
    )


@router.get("/comparison", summary="Head-to-head comparison of selected assets")
def read_comparison(
    asset_ids: str = Query(description="Comma-separated asset ids"),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    """Compare named assets on the factors that decide effectiveness."""
    wanted = [identifier.strip() for identifier in asset_ids.split(",") if identifier.strip()]
    ranking = {entry["asset_id"]: entry for entry in engine.analytics.ranking}

    return {
        "assets": [ranking[identifier] for identifier in wanted if identifier in ranking],
        "missing": [identifier for identifier in wanted if identifier not in ranking],
        "target": OEE_TARGET,
        "meta": build_meta(engine),
    }
