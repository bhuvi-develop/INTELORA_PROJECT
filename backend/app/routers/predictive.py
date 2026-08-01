"""Predictive maintenance."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.routers.deps import build_meta, get_engine
from app.schemas.analysis import PredictiveResponse
from app.services.derive import PREDICTION_HORIZON_DAYS
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/predictive", tags=["Predictive Maintenance"])


@router.get("", response_model=PredictiveResponse, summary="Failure probability and remaining life")
def read_predictive(
    asset_id: str | None = Query(default=None),
    category: str | None = Query(default=None),
    within_days: float | None = Query(
        default=None, ge=0, description="Only components whose remaining life is at or below this"
    ),
    engine: InteloraEngine = Depends(get_engine),
) -> PredictiveResponse:
    analytics = engine.analytics
    predictions = list(analytics.predictions.values())

    if asset_id:
        predictions = [entry for entry in predictions if entry.asset_id == asset_id]
        if not predictions:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No asset {asset_id}")
    if category:
        predictions = [entry for entry in predictions if entry.category == category]

    queue = engine.predictive.component_queue(predictions)
    if within_days is not None:
        queue = [entry for entry in queue if entry.rul_days <= within_days]

    rul_values = [entry.primary.rul_days for entry in predictions]

    return PredictiveResponse(
        assets=predictions,
        component_queue=queue,
        rul_distribution=engine.predictive.rul_distribution(predictions),
        horizon_days=PREDICTION_HORIZON_DAYS,
        average_rul_days=round(sum(rul_values) / len(rul_values), 1) if rul_values else 0.0,
        components_within_horizon=sum(
            1
            for entry in engine.predictive.component_queue(predictions)
            if entry.rul_days <= PREDICTION_HORIZON_DAYS
        ),
        model_status=engine.degradation.status(),
        meta=build_meta(engine),
    )


@router.get("/queue", summary="Component intervention queue")
def read_queue(
    limit: int = Query(default=25, ge=1, le=200),
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    """Every component across the estate, soonest end of life first.

    The planning view: what to order and when, without having to open each asset
    in turn.
    """
    predictions = list(engine.analytics.predictions.values())
    queue = engine.predictive.component_queue(predictions)[:limit]

    names = {entry.asset_id: entry.asset_name for entry in predictions}
    return {
        "queue": [
            {
                "asset_id": entry.asset_id,
                "asset_name": names.get(entry.asset_id, entry.asset_id),
                "component": entry.component,
                "wear": entry.wear,
                "rul_days": entry.rul_days,
                "failure_probability": entry.failure_probability,
                "confidence": entry.confidence,
                "maintenance_priority": entry.maintenance_priority,
                "recommendation": entry.recommendation,
                "predicted_failure_at": entry.predicted_failure_at,
                "model_version": entry.model_version,
            }
            for entry in queue
        ],
        "returned": len(queue),
        "meta": build_meta(engine),
    }
