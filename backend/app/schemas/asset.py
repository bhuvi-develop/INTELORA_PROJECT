"""Asset payloads.

The asset object carries exactly the six fields the product exposes. Everything
else a caller might need — condition, prediction, effectiveness — hangs off the
detail response beside it rather than being folded into the asset record, so no
consumer can accidentally treat a derived figure as an asset attribute.
"""

from __future__ import annotations

from datetime import datetime

from app.schemas.common import ApiModel, Criticality, DeviceStatus, HealthBand, Meta, RiskTier
from app.schemas.telemetry import TelemetryReading


class AssetIdentity(ApiModel):
    asset_id: str
    asset_name: str
    category: str
    brand: str
    model: str
    status: DeviceStatus


class ComponentState(ApiModel):
    name: str
    wear: float
    wear_rate_per_day: float
    expected_life_days: float


class AssetSummary(ApiModel):
    """One row of the asset list: identity plus its headline condition."""

    asset_id: str
    asset_name: str
    category: str
    brand: str
    model: str
    status: DeviceStatus

    device_uid: str
    criticality: Criticality
    health_score: float
    health_band: HealthBand
    risk_tier: RiskTier

    active_power: float
    temperature: float
    energy_kwh: float
    runtime_hours: float
    load_state: str

    open_anomalies: int
    oee: float
    availability: float
    rul_days: float
    failure_probability: float
    weakest_component: str


class AssetListResponse(ApiModel):
    assets: list[AssetSummary]
    total: int
    meta: Meta


class ComponentPredictionOut(ApiModel):
    component: str
    wear: float
    failure_probability: float
    rul_days: float
    confidence: float
    recommendation: str
    maintenance_priority: str
    predicted_failure_at: datetime | None
    model_version: str
    regression_weight: float


class PerformanceOut(ApiModel):
    availability: float
    performance: float
    quality: float
    oee: float
    uptime_ratio: float
    mtbf_hours: float
    mttr_minutes: float
    energy_kwh: float
    energy_per_hour: float
    anomalies_24h: int
    health_score: float
    health_band: HealthBand
    risk_tier: RiskTier


class PrescriptiveOut(ApiModel):
    urgency: str
    action: str
    rationale: str


class AnomalySummary(ApiModel):
    uid: str
    error_code: str
    title: str
    severity: str
    status: str
    detected_at: datetime
    observed_value: float
    threshold_value: float
    unit: str


class AssetDetailResponse(ApiModel):
    asset: AssetIdentity
    device_uid: str
    criticality: Criticality
    health_score: float
    health_band: HealthBand
    wear: float
    load_state: str
    runtime_hours: float
    energy_kwh: float
    relay_operations: int

    latest: TelemetryReading | None
    components: list[ComponentState]
    predictions: list[ComponentPredictionOut]
    primary_prediction: ComponentPredictionOut | None
    performance: PerformanceOut | None
    prescriptive: PrescriptiveOut
    open_anomalies: list[AnomalySummary]
    meta: Meta
