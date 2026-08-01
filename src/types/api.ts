/* ───────────────────────────────────────────────────────────────────────────
 * FastAPI response contracts.
 *
 * These mirror the backend payloads exactly, in the shape and casing the wire
 * carries. They are deliberately not the shapes the interface renders — that
 * translation happens once, in `services/adapters.ts`, so a field rename on the
 * server touches one file rather than sixty components.
 *
 * Every figure here was computed in Python. Nothing in this application derives
 * a health score, a probability, a remaining life or an effectiveness number;
 * it renders what the platform published.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ApiMeta {
  generated_at: string;
  tick: number;
  analytics_tick: number;
  source: string;
}

/* ─── Telemetry ──────────────────────────────────────────────────────────── */

/** The fourteen MIKOS parameters plus the platform's derived condition. */
export interface TelemetryReadingDto {
  asset_id: string;
  device_uid: string;
  ts: string;
  voltage: number;
  current: number;
  active_power: number;
  apparent_power: number;
  reactive_power: number;
  power_factor: number;
  frequency: number;
  energy_kwh: number;
  runtime_hours: number;
  temperature: number;
  relay_status: string;
  relay_operations: number;
  device_status: 'Online' | 'Standby' | 'Offline';
  health_score: number;
  load_state: string;
  resolution?: string;
}

export interface LiveTelemetryDto {
  readings: TelemetryReadingDto[];
  meta: ApiMeta;
}

export interface TelemetryWindowDto {
  asset_id: string;
  count: number;
  readings: TelemetryReadingDto[];
  meta: ApiMeta;
}

export interface HistoryPointDto extends Omit<TelemetryReadingDto, 'asset_id' | 'device_uid' | 'load_state'> {
  resolution: string;
}

export interface HistoryResponseDto {
  asset_id: string | null;
  component: string | null;
  resolution: string;
  start: string;
  end: string;
  count: number;
  points: HistoryPointDto[];
  step_seconds: number;
  meta: ApiMeta;
}

/* ─── Assets ─────────────────────────────────────────────────────────────── */

export interface AssetIdentityDto {
  asset_id: string;
  asset_name: string;
  category: string;
  brand: string;
  model: string;
  status: 'Online' | 'Standby' | 'Offline';
}

export interface AssetSummaryDto extends AssetIdentityDto {
  device_uid: string;
  criticality: string;
  health_score: number;
  health_band: string;
  risk_tier: string;
  active_power: number;
  temperature: number;
  energy_kwh: number;
  runtime_hours: number;
  load_state: string;
  open_anomalies: number;
  oee: number;
  availability: number;
  rul_days: number;
  failure_probability: number;
  weakest_component: string;
}

export interface AssetListDto {
  assets: AssetSummaryDto[];
  total: number;
  meta: ApiMeta;
}

export interface ComponentStateDto {
  name: string;
  wear: number;
  wear_rate_per_day: number;
  expected_life_days: number;
}

export interface ComponentPredictionDto {
  asset_id?: string;
  component: string;
  wear: number;
  failure_probability: number;
  rul_days: number;
  confidence: number;
  recommendation: string;
  maintenance_priority: string;
  predicted_failure_at: string | null;
  model_version: string;
  regression_weight: number;
}

export interface PerformanceDto {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  uptime_ratio: number;
  mtbf_hours: number;
  mttr_minutes: number;
  energy_kwh: number;
  energy_per_hour: number;
  anomalies_24h: number;
  health_score: number;
  health_band: string;
  risk_tier: string;
}

export interface PrescriptiveDto {
  urgency: string;
  action: string;
  rationale: string;
}

export interface AssetDetailDto {
  asset: AssetIdentityDto;
  device_uid: string;
  criticality: string;
  health_score: number;
  health_band: string;
  wear: number;
  load_state: string;
  runtime_hours: number;
  energy_kwh: number;
  relay_operations: number;
  latest: TelemetryReadingDto | null;
  components: ComponentStateDto[];
  predictions: ComponentPredictionDto[];
  primary_prediction: ComponentPredictionDto | null;
  performance: PerformanceDto | null;
  prescriptive: PrescriptiveDto;
  open_anomalies: Array<{
    uid: string;
    error_code: string;
    title: string;
    severity: string;
    status: string;
    detected_at: string;
    observed_value: number;
    threshold_value: number;
    unit: string;
  }>;
  meta: ApiMeta;
}

/* ─── Anomalies ──────────────────────────────────────────────────────────── */

export interface AnomalyDto {
  uid: string;
  asset_id: string;
  asset_name: string;
  category: string;
  component: string | null;
  error_code: string;
  anomaly_type: string;
  title: string;
  severity: 'Critical' | 'Major' | 'Warning' | 'Info';
  status: 'Active' | 'Acknowledged' | 'Resolved';
  channel: string;
  observed_value: number;
  threshold_value: number;
  unit: string;
  deviation_pct: number;
  anomaly_score: number;
  detection_method: string;
  confidence: number;
  detail: string;
  detected_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  response_target_minutes: number;
  minutes_open: number;
}

export interface AnomalyTypeTallyDto {
  anomaly_type: string;
  error_code: string;
  title: string;
  count: number;
  open: number;
  share_pct: number;
}

export interface AnomalyResponseDto {
  anomalies: AnomalyDto[];
  total: number;
  returned: number;
  open_count: number;
  severity_breakdown: Record<string, number>;
  by_type: AnomalyTypeTallyDto[];
  mean_time_to_resolve_minutes: number;
  meta: ApiMeta;
}

/* ─── Maintenance ────────────────────────────────────────────────────────── */

export interface PredictionAssetDto {
  asset_id: string;
  asset_name: string;
  category: string;
  criticality: string;
  horizon_days: number;
  primary: ComponentPredictionDto;
  components: ComponentPredictionDto[];
}

export interface PredictiveResponseDto {
  assets: PredictionAssetDto[];
  component_queue: ComponentPredictionDto[];
  rul_distribution: Array<{ label: string; max_days: number | null; count: number }>;
  horizon_days: number;
  average_rul_days: number;
  components_within_horizon: number;
  model_status: Record<string, Record<string, unknown>>;
  meta: ApiMeta;
}

export interface PreventiveTaskDto {
  task_id: string;
  asset_id: string;
  asset_name: string;
  category: string;
  task_name: string;
  interval_days: number;
  due_date: string;
  priority: string;
  status: string;
  completed: boolean;
  completed_at: string | null;
  days_until_due: number;
  health_band: string;
  criticality: string;
}

export interface PreventiveResponseDto {
  tasks: PreventiveTaskDto[];
  total: number;
  returned: number;
  overdue: number;
  due: number;
  scheduled: number;
  completed: number;
  by_priority: Record<string, number>;
  meta: ApiMeta;
}

export interface PrescriptiveActionDto {
  asset_id: string;
  asset_name: string;
  category: string;
  criticality: string;
  health_band: string;
  health_score: number;
  weakest_component: string;
  urgency: string;
  action: string;
  rationale: string;
  failure_probability: number;
  rul_days: number;
  open_anomalies: number;
}

export interface PrescriptiveResponseDto {
  actions: PrescriptiveActionDto[];
  total: number;
  returned: number;
  by_urgency: Record<string, number>;
  meta: ApiMeta;
}

/* ─── Performance ────────────────────────────────────────────────────────── */

export interface RankedAssetDto {
  rank: number;
  asset_id: string;
  asset_name: string;
  category: string;
  criticality: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  health_score: number;
  health_band: string;
  risk_tier: string;
  anomalies_24h: number;
  mtbf_hours: number;
  mttr_minutes: number;
}

export interface CategoryRollupDto {
  category: string;
  assets: number;
  average_health: number;
  availability: number;
  oee: number;
  energy_kwh: number;
  anomalies: number;
}

export interface ApmResponseDto {
  ranking: RankedAssetDto[];
  categories: CategoryRollupDto[];
  leader: RankedAssetDto | null;
  laggard: RankedAssetDto | null;
  fleet_average_oee: number;
  fleet_average_availability: number;
  assets_below_target: number;
  target: number;
  meta: ApiMeta;
}

export interface LossStepDto {
  key: string;
  label: string;
  loss: number;
  detail: string;
}

export interface OeeBreakdownDto {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  target: number;
  world_class: number;
  losses: LossStepDto[];
}

export interface OeeResponseDto {
  fleet: OeeBreakdownDto;
  assets: Array<{
    asset_id: string;
    asset_name: string;
    category: string;
    availability: number;
    performance: number;
    quality: number;
    oee: number;
    health_score: number;
    gap_to_target: number;
  }>;
  above_target: number;
  below_target: number;
  world_class_count: number;
  meta: ApiMeta;
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */

export interface KpisDto {
  total_assets: number;
  online_assets: number;
  standby_assets: number;
  offline_assets: number;
  average_health: number;
  healthy_assets: number;
  good_assets: number;
  warning_assets: number;
  critical_assets: number;
  total_power_w: number;
  average_power_w: number;
  total_energy_kwh: number;
  active_anomalies: number;
  critical_anomalies: number;
  unacknowledged_alerts: number;
  average_availability: number;
  average_oee: number;
  average_rul_days: number;
  assets_at_risk: number;
  operational_health: number;
  computed_at: string;
}

export interface BandCountDto {
  band: string;
  label: string;
  min: number;
  count: number;
  share_pct: number;
}

export interface EnergyIntelligenceDto {
  today_kwh: number;
  yesterday_kwh: number;
  change_pct: number;
  weekly_kwh: number;
  monthly_kwh: number;
  peak_hour: number | null;
  peak_kw: number;
  highest_consumer: { asset_id: string; asset_name: string; kwh: number } | null;
  lowest_consumer: { asset_id: string; asset_name: string; kwh: number } | null;
  tariff_per_kwh: number;
  currency: string;
  estimated_monthly_cost: number;
  carbon_kg_per_month: number;
  daily_trend: Array<{ date: string; label: string; kwh: number }>;
}

export interface PlatformHealthDto {
  services: Array<{
    key: string;
    name: string;
    role: string;
    state: string;
    latency_ms: number | null;
    uptime_pct: number;
  }>;
  database_latency_ms: number;
  uptime_seconds: number;
  sensors_connected: number;
  sensors_total: number;
  ingest_per_minute: number;
  ticks_processed: number;
  ml_backend: string;
  simulator_running: boolean;
}

export interface ActivityEntryDto {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
  asset_id: string | null;
  severity: string;
}

export interface InsightDto {
  scope: string;
  asset_id: string | null;
  module: string;
  headline: string;
  summary: string;
  recommendation: string;
  business_impact: string;
  severity: string;
  confidence: number;
  generated_at: string;
}

export interface YesterdayBaselineDto {
  average_health: number;
  healthy_assets: number;
  good_assets: number;
  warning_assets: number;
  critical_assets: number;
  offline_samples: number;
  energy_kwh: number;
  average_power_w: number;
  oee: number;
  operational_health: number;
  observed: boolean;
}

export interface DashboardDto {
  kpis: KpisDto;
  yesterday: YesterdayBaselineDto;
  bands: BandCountDto[];
  fleet_trail: Array<{ t: string; label: string; health: number; power: number; oee: number }>;
  risk_distribution: Array<{ tier: string; count: number; share_pct: number }>;
  severity_breakdown: Record<string, number>;
  categories: CategoryRollupDto[];
  oee: OeeBreakdownDto;
  energy: EnergyIntelligenceDto;
  platform: PlatformHealthDto;
  activity: ActivityEntryDto[];
  insights: InsightDto[];
  assets: Array<{
    asset_id: string;
    asset_name: string;
    category: string;
    status: string;
    health_score: number;
    health_band: string;
    risk_tier: string;
    active_power: number;
    temperature: number;
    load_state: string;
    open_anomalies: number;
  }>;
  worst_assets: Array<Record<string, unknown>>;
  meta: ApiMeta;
}

/* ─── Reports ────────────────────────────────────────────────────────────── */

export interface DailyRecordDto {
  asset_id: string;
  asset_name: string;
  category: string;
  date: string;
  avg_voltage: number;
  avg_current: number;
  avg_power: number;
  peak_power: number;
  energy_kwh: number;
  avg_temperature: number;
  peak_temperature: number;
  avg_health: number;
  min_health: number;
  uptime_pct: number;
  samples: number;
  anomalies: number;
}

export interface PredictionRecordDto {
  asset_id: string;
  asset_name: string;
  component: string;
  date: string;
  rul_days: number;
  failure_probability: number;
  confidence: number;
  wear: number;
}

/* ─── System ─────────────────────────────────────────────────────────────── */

export interface SystemStatusDto {
  application: string;
  version: string;
  environment: string;
  started_at: string;
  now: string;
  database_connected: boolean;
  history_backfilled: boolean;
  platform: PlatformHealthDto;
  scheduler: Record<string, unknown>;
  anomaly_models: Record<string, unknown>;
  degradation_models: Record<string, unknown>;
  configuration: Record<string, unknown>;
  meta: ApiMeta;
}
