"""Asset register and asset detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.base import SessionLocal
from app.mock_data.catalog import AssetSeed
from app.models.asset import Asset
from app.routers.deps import build_meta, get_engine
from app.schemas.asset import AssetCreateRequest, AssetDetailResponse, AssetListResponse
from app.services.engine import InteloraEngine

router = APIRouter(prefix="/assets", tags=["Assets"])


@router.post("", status_code=status.HTTP_201_CREATED, summary="Commission a new asset")
def create_asset(
    payload: AssetCreateRequest,
    engine: InteloraEngine = Depends(get_engine),
) -> dict:
    cat_prefix = "CHR" if payload.category == "Mobile Charger" else ("AIR" if payload.category == "Air Conditioner" else "LAP")
    if not payload.asset_id:
        existing_ids = [aid for aid in engine.simulator.states.keys() if aid.startswith(cat_prefix)]
        seq = len(existing_ids) + 1
        asset_id = f"{cat_prefix}-{seq:03d}"
    else:
        asset_id = payload.asset_id

    if asset_id in engine.simulator.states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Asset ID {asset_id} is already commissioned",
        )

    duty = payload.duty_factor if payload.duty_factor > 0 else 1.0
    initial_wear = (0.05, 0.03, 0.04, 0.02, 0.03, 0.04)

    overrides: dict[str, float] = {}
    if payload.rated_power_w is not None:
        overrides["rated_power_w"] = float(payload.rated_power_w)
    if payload.nominal_voltage_v is not None:
        overrides["nominal_voltage"] = float(payload.nominal_voltage_v)

    seed = AssetSeed(
        asset_id=asset_id,
        asset_name=payload.asset_name,
        category=payload.category,
        brand=payload.brand,
        model=payload.model,
        criticality=payload.criticality,
        duty_factor=duty,
        initial_wear=initial_wear,
        overrides=overrides,
    )

    state = engine.register_asset(seed)

    try:
        with SessionLocal() as db:
            existing = db.query(Asset).filter(Asset.asset_id == asset_id).first()
            if not existing:
                db_asset = Asset(
                    asset_id=asset_id,
                    asset_name=payload.asset_name,
                    category=payload.category,
                    brand=payload.brand,
                    model=payload.model,
                    status="Online",
                    criticality=payload.criticality,
                    rated_power_w=state.profile.rated_power_w,
                    nominal_voltage_v=state.profile.nominal_voltage,
                    max_temperature_c=state.profile.max_temperature_c,
                    max_current_a=state.profile.max_current_a,
                )
                db.add(db_asset)
                db.commit()
    except Exception:
        pass

    return {
        "status": "success",
        "message": f"Asset {asset_id} commissioned successfully",
        "asset_id": asset_id,
        "asset_name": payload.asset_name,
        "category": payload.category,
        "brand": payload.brand,
        "model": payload.model,
        "criticality": payload.criticality,
        "device_uid": state.device_uid,
    }


@router.get("", response_model=AssetListResponse, summary="Commissioned assets with condition")
def list_assets(
    category: str | None = Query(default=None, description="Filter by device class"),
    status_filter: str | None = Query(default=None, alias="status", description="Online, Standby or Offline"),
    band: str | None = Query(default=None, description="healthy, good, warning or critical"),
    engine: InteloraEngine = Depends(get_engine),
) -> AssetListResponse:
    analytics = engine.analytics
    rows = []

    for asset_id, state in engine.simulator.states.items():
        if category and state.seed.category != category:
            continue
        if status_filter and state.device_status != status_filter:
            continue
        if band and state.band != band:
            continue

        reading = state.history[-1] if state.history else None
        prediction = analytics.predictions.get(asset_id)
        performance = analytics.performance.get(asset_id)

        rows.append(
            {
                "asset_id": state.asset_id,
                "asset_name": state.seed.asset_name,
                "category": state.seed.category,
                "brand": state.seed.brand,
                "model": state.seed.model,
                "status": state.device_status,
                "device_uid": state.device_uid,
                "criticality": state.seed.criticality,
                "health_score": state.health,
                "health_band": state.band,
                "risk_tier": performance.risk_tier if performance else "healthy",
                "active_power": reading.active_power if reading else 0.0,
                "temperature": reading.temperature if reading else 0.0,
                "energy_kwh": round(state.energy_kwh, 5),
                "runtime_hours": round(state.runtime_hours, 3),
                "load_state": state.load_state,
                "open_anomalies": len(engine.detector.active_by_asset(asset_id)),
                "oee": performance.oee if performance else 0.0,
                "availability": performance.availability if performance else 0.0,
                "rul_days": prediction.primary.rul_days if prediction else 0.0,
                "failure_probability": prediction.primary.failure_probability if prediction else 0.0,
                "weakest_component": prediction.primary.component if prediction else "",
            }
        )

    rows.sort(key=lambda row: row["health_score"])
    return AssetListResponse(assets=rows, total=len(rows), meta=build_meta(engine))


@router.get("/{asset_id}", response_model=AssetDetailResponse, summary="One asset in full")
def read_asset(asset_id: str, engine: InteloraEngine = Depends(get_engine)) -> AssetDetailResponse:
    view = engine.asset_view(asset_id)
    if view is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"No commissioned asset with id {asset_id}"
        )

    prediction = view["prediction"]

    return AssetDetailResponse(
        asset=view["asset"],
        device_uid=view["device_uid"],
        criticality=view["criticality"],
        health_score=view["health_score"],
        health_band=view["health_band"],
        wear=view["wear"],
        load_state=view["load_state"],
        runtime_hours=view["runtime_hours"],
        energy_kwh=view["energy_kwh"],
        relay_operations=view["relay_operations"],
        latest=view["latest"],
        components=view["components"],
        predictions=prediction.components if prediction else [],
        primary_prediction=prediction.primary if prediction else None,
        performance=view["performance"],
        prescriptive=view["prescriptive"],
        open_anomalies=[
            {
                "uid": event.uid,
                "error_code": event.error_code,
                "title": event.title,
                "severity": event.severity,
                "status": event.status,
                "detected_at": event.detected_at,
                "observed_value": event.observed_value,
                "threshold_value": event.threshold_value,
                "unit": event.unit,
            }
            for event in view["open_anomalies"]
        ],
        meta=build_meta(engine),
    )


@router.get("/{asset_id}/components", summary="Component condition for one asset")
def read_components(asset_id: str, engine: InteloraEngine = Depends(get_engine)) -> dict:
    """Wear and prediction per serviceable part.

    Exposed separately because component-level questions — which part, how worn,
    how long left — are asked by the maintenance modules without needing the
    telemetry that comes with the full asset view.
    """
    state = engine.simulator.states.get(asset_id)
    if state is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No asset {asset_id}")

    prediction = engine.analytics.predictions.get(asset_id)
    by_component = {entry.component: entry for entry in prediction.components} if prediction else {}

    return {
        "asset_id": asset_id,
        "asset_name": state.seed.asset_name,
        "category": state.seed.category,
        "components": [
            {
                "name": spec.name,
                "wear": round(state.wear[index], 5) if index < len(state.wear) else 0.0,
                "wear_rate_per_day": round(state.wear_rate[index], 8)
                if index < len(state.wear_rate)
                else 0.0,
                "expected_life_days": spec.expected_life_days,
                "prediction": by_component.get(spec.name),
            }
            for index, spec in enumerate(state.profile.components)
        ],
        "meta": build_meta(engine),
    }
