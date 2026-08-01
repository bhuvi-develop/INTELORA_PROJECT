"""Anomaly, predictive, performance and dashboard payloads."""

from __future__ import annotations

from datetime import datetime

from app.schemas.common import (
    ApiModel,
    BandCount,
    Criticality,
    HealthBand,
    LossStep,
    Meta,
    RiskTier,
    Severity,
    TierCount,
)

# ── Anomalies ────────────────────────────────────────────────────────────


class AnomalyOut(ApiModel):
    uid: str
    asset_id: str
    asset_name: str
    category: str
    component: str | None

    error_code: str
    anomaly_type: str
    title: str
    severity: Severity
    status: str

    channel: str
    observed_value: float
    threshold_value: float
    unit: str
    deviation_pct: float

    anomaly_score: float
    detection_method: str
    confidence: float
    detail: str

    detected_at: datetime
    resolved_at: datetime | None
    acknowledged_at: datetime | None
    response_target_minutes: int
    minutes_open: float


class AnomalyTypeTally(ApiModel):
    anomaly_type: str
    error_code: str
    title: str
    count: int
    open: int
    share_pct: float


class AnomalyResponse(ApiModel):
    anomalies: list[AnomalyOut]
    total: int
    returned: int
    open_count: int
    severity_breakdown: dict[str, int]
    by_type: list[AnomalyTypeTally]
    mean_time_to_resolve_minutes: float
    meta: Meta


# ── Predictive ───────────────────────────────────────────────────────────


class PredictionComponent(ApiModel):
    asset_id: str
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


class PredictionAsset(ApiModel):
    asset_id: str
    asset_name: str
    category: str
    criticality: Criticality
    horizon_days: int
    primary: PredictionComponent
    components: list[PredictionComponent]


class RulBucket(ApiModel):
    label: str
    max_days: float | None
    count: int


class PredictiveResponse(ApiModel):
    assets: list[PredictionAsset]
    component_queue: list[PredictionComponent]
    rul_distribution: list[RulBucket]
    horizon_days: int
    average_rul_days: float
    components_within_horizon: int
    model_status: dict[str, dict]
    meta: Meta


# ── Performance and effectiveness ────────────────────────────────────────


class RankedAsset(ApiModel):
    rank: int
    asset_id: str
    asset_name: str
    category: str
    criticality: Criticality
    availability: float
    performance: float
    quality: float
    oee: float
    health_score: float
    health_band: HealthBand
    risk_tier: RiskTier
    anomalies_24h: int
    mtbf_hours: float
    mttr_minutes: float


class CategoryRollup(ApiModel):
    category: str
    assets: int
    average_health: float
    availability: float
    oee: float
    energy_kwh: float
    anomalies: int


class ApmResponse(ApiModel):
    ranking: list[RankedAsset]
    categories: list[CategoryRollup]
    leader: RankedAsset | None
    laggard: RankedAsset | None
    fleet_average_oee: float
    fleet_average_availability: float
    assets_below_target: int
    target: float
    meta: Meta


class OeeBreakdown(ApiModel):
    availability: float
    performance: float
    quality: float
    oee: float
    target: float
    world_class: float
    losses: list[LossStep]


class OeeAsset(ApiModel):
    asset_id: str
    asset_name: str
    category: str
    availability: float
    performance: float
    quality: float
    oee: float
    health_score: float
    gap_to_target: float


class OeeResponse(ApiModel):
    fleet: OeeBreakdown
    assets: list[OeeAsset]
    above_target: int
    below_target: int
    world_class_count: int
    meta: Meta


# ── Dashboard ────────────────────────────────────────────────────────────


class Kpis(ApiModel):
    total_assets: int
    online_assets: int
    standby_assets: int
    offline_assets: int
    average_health: float
    healthy_assets: int
    good_assets: int
    warning_assets: int
    critical_assets: int
    total_power_w: float
    average_power_w: float
    total_energy_kwh: float
    active_anomalies: int
    critical_anomalies: int
    unacknowledged_alerts: int
    average_availability: float
    average_oee: float
    average_rul_days: float
    assets_at_risk: int
    operational_health: float
    computed_at: datetime


class EnergyConsumer(ApiModel):
    asset_id: str
    asset_name: str
    kwh: float


class EnergyTrendPoint(ApiModel):
    date: datetime
    label: str
    kwh: float


class EnergyIntelligence(ApiModel):
    today_kwh: float
    yesterday_kwh: float
    change_pct: float
    weekly_kwh: float
    monthly_kwh: float
    peak_hour: int | None
    peak_kw: float
    highest_consumer: EnergyConsumer | None
    lowest_consumer: EnergyConsumer | None
    tariff_per_kwh: float
    currency: str
    estimated_monthly_cost: float
    carbon_kg_per_month: float
    daily_trend: list[EnergyTrendPoint]


class ServiceState(ApiModel):
    key: str
    name: str
    role: str
    state: str
    latency_ms: float | None
    uptime_pct: float


class PlatformHealth(ApiModel):
    services: list[ServiceState]
    database_latency_ms: float
    uptime_seconds: float
    sensors_connected: int
    sensors_total: int
    ingest_per_minute: float
    ticks_processed: int
    ml_backend: str
    simulator_running: bool


class ActivityEntry(ApiModel):
    id: str
    kind: str
    title: str
    detail: str
    at: datetime
    asset_id: str | None
    severity: str


class InsightOut(ApiModel):
    scope: str
    asset_id: str | None
    module: str
    headline: str
    summary: str
    recommendation: str
    business_impact: str
    severity: str
    confidence: float
    generated_at: datetime


class YesterdayBaseline(ApiModel):
    average_health: float
    healthy_assets: int
    good_assets: int
    warning_assets: int
    critical_assets: int
    offline_samples: int
    energy_kwh: float
    average_power_w: float
    oee: float
    operational_health: float
    observed: bool


class LiveAssetTile(ApiModel):
    asset_id: str
    asset_name: str
    category: str
    status: str
    health_score: float
    health_band: HealthBand
    risk_tier: RiskTier
    active_power: float
    temperature: float
    load_state: str
    open_anomalies: int


class FleetTrailPoint(ApiModel):
    t: datetime
    label: str
    health: float
    power: float
    oee: float


class DashboardResponse(ApiModel):
    kpis: Kpis
    yesterday: YesterdayBaseline
    bands: list[BandCount]
    risk_distribution: list[TierCount]
    severity_breakdown: dict[str, int]
    categories: list[CategoryRollup]
    oee: OeeBreakdown
    energy: EnergyIntelligence
    platform: PlatformHealth
    activity: list[ActivityEntry]
    insights: list[InsightOut]
    assets: list[LiveAssetTile]
    fleet_trail: list[FleetTrailPoint]
    worst_assets: list[dict]
    meta: Meta
