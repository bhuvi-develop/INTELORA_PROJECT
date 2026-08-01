import type {
  ActivityEvent,
  ActivityKind,
  AnomalyRecord,
  AnomalyType,
  AssetPerformance,
  AssetPrediction,
  AssetRuntime,
  CategoryRollup,
  ComponentPrediction,
  DailyTelemetryRecord,
  Device,
  DeviceCategory,
  EnergyIntelligence,
  FleetKpis,
  FleetOee,
  HealthBand,
  PlatformHealthState,
  PredictionHistoryRecord,
  PrescriptiveAction,
  PreventiveTask,
  Severity,
  TaskPriority,
  TaskStatus,
  TelemetrySample,
  YesterdayBaseline,
} from '@/engine/types';
import type {
  ActivityEntryDto,
  AnomalyDto,
  AssetDetailDto,
  AssetSummaryDto,
  CategoryRollupDto,
  ComponentPredictionDto,
  DailyRecordDto,
  DashboardDto,
  EnergyIntelligenceDto,
  HistoryPointDto,
  KpisDto,
  OeeBreakdownDto,
  PerformanceDto,
  PlatformHealthDto,
  PredictionRecordDto,
  PrescriptiveActionDto,
  PreventiveTaskDto,
  TelemetryReadingDto,
  YesterdayBaselineDto,
} from '@/types/api';

/* ───────────────────────────────────────────────────────────────────────────
 * Wire format to render format.
 *
 * The backend publishes snake_case with ISO timestamps; the interface renders
 * camelCase with epoch milliseconds. That translation happens exactly here, so
 * a field rename on the server is a change to one file rather than to every
 * component that reads the field.
 *
 * These functions rename, reshape and parse. They do not calculate: every
 * number that carries meaning — condition, probability, remaining life,
 * effectiveness, risk — arrives already computed and is passed through
 * unchanged. Where a value looks derived (a clock label, a millisecond
 * timestamp) it is a formatting of something the backend sent, never a new
 * figure.
 * ─────────────────────────────────────────────────────────────────────────── */

const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const ms = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : 0);

/* ─── Telemetry ──────────────────────────────────────────────────────────── */

export const toSample = (dto: TelemetryReadingDto): TelemetrySample => {
  const t = ms(dto.ts);
  return {
    t,
    label: clock.format(t),
    voltage: dto.voltage,
    current: dto.current,
    power: dto.active_power,
    apparentPower: dto.apparent_power,
    reactivePower: dto.reactive_power,
    energy: dto.energy_kwh,
    frequency: dto.frequency,
    powerFactor: dto.power_factor,
    temperature: dto.temperature,
    health: dto.health_score,
    runtimeHours: dto.runtime_hours,
    relayStatus: dto.relay_status,
    relayOperations: dto.relay_operations,
    status: dto.device_status,
    loadState: dto.load_state,
  };
};

export const toHistorySample = (dto: HistoryPointDto): TelemetrySample => {
  const t = ms(dto.ts);
  return {
    t,
    label: clock.format(t),
    voltage: dto.voltage,
    current: dto.current,
    power: dto.active_power,
    apparentPower: dto.apparent_power,
    reactivePower: dto.reactive_power,
    energy: dto.energy_kwh,
    frequency: dto.frequency,
    powerFactor: dto.power_factor,
    temperature: dto.temperature,
    health: dto.health_score,
    runtimeHours: dto.runtime_hours,
    relayStatus: dto.relay_status,
    relayOperations: dto.relay_operations,
    status: dto.device_status,
    loadState: '',
  };
};

/* ─── Predictions ────────────────────────────────────────────────────────── */

export const toComponentPrediction = (dto: ComponentPredictionDto): ComponentPrediction => ({
  component: dto.component,
  failureProbability: dto.failure_probability,
  rulDays: dto.rul_days,
  confidence: dto.confidence,
  recommendation: dto.recommendation,
  wear: dto.wear,
  maintenancePriority: dto.maintenance_priority as TaskPriority,
  predictedFailureAt: dto.predicted_failure_at ? ms(dto.predicted_failure_at) : null,
  modelVersion: dto.model_version,
});

const emptyPrediction = (component = 'Unassessed'): ComponentPrediction => ({
  component,
  failureProbability: 0,
  rulDays: 0,
  confidence: 0,
  recommendation: 'Awaiting the first prediction pass',
  wear: 0,
  maintenancePriority: 'Low',
  predictedFailureAt: null,
  modelVersion: 'pending',
});

/* ─── Performance ────────────────────────────────────────────────────────── */

export const toPerformance = (dto: PerformanceDto | null): AssetPerformance => ({
  availability: dto?.availability ?? 0,
  performance: dto?.performance ?? 0,
  quality: dto?.quality ?? 0,
  oee: dto?.oee ?? 0,
  uptimeRatio: dto?.uptime_ratio ?? 0,
  anomalies24h: dto?.anomalies_24h ?? 0,
  mtbfHours: dto?.mtbf_hours ?? 0,
  mttrMinutes: dto?.mttr_minutes ?? 0,
});

/* ─── Assets ─────────────────────────────────────────────────────────────── */

const toDevice = (dto: AssetSummaryDto): Device => ({
  assetId: dto.asset_id,
  assetName: dto.asset_name,
  category: dto.category as DeviceCategory,
  brand: dto.brand,
  model: dto.model,
  status: dto.status,
});

/**
 * One asset, assembled from the list response.
 *
 * `history` is filled by the store from the samples the backend has streamed;
 * it is retained here, never generated. `prediction.components` is only
 * populated by the detail endpoint, so the list carries the headline component
 * the backend named as weakest.
 */
export const toAssetRuntime = (
  dto: AssetSummaryDto,
  live: TelemetrySample | undefined,
  history: TelemetrySample[],
): AssetRuntime => {
  const primary: ComponentPrediction = {
    component: dto.weakest_component || 'Unassessed',
    failureProbability: dto.failure_probability,
    rulDays: dto.rul_days,
    confidence: 0,
    recommendation: '',
    wear: 0,
    maintenancePriority: 'Low',
    predictedFailureAt: null,
    modelVersion: '',
  };

  const prediction: AssetPrediction = {
    assetId: dto.asset_id,
    assetName: dto.asset_name,
    category: dto.category as DeviceCategory,
    primary,
    components: [primary],
    horizonDays: 30,
  };

  const sample: TelemetrySample = live ?? {
    t: 0,
    label: '--:--:--',
    voltage: 0,
    current: 0,
    power: dto.active_power,
    apparentPower: 0,
    reactivePower: 0,
    energy: dto.energy_kwh,
    frequency: 0,
    powerFactor: 0,
    temperature: dto.temperature,
    health: dto.health_score,
    runtimeHours: dto.runtime_hours,
    relayStatus: dto.status === 'Offline' ? 'Open' : 'Closed',
    relayOperations: 0,
    status: dto.status,
    loadState: dto.load_state,
  };

  return {
    device: toDevice(dto),
    category: dto.category as DeviceCategory,
    live: sample,
    health: dto.health_score,
    band: dto.health_band as HealthBand,
    riskTier: dto.risk_tier,
    criticality: dto.criticality,
    history,
    prediction,
    performance: {
      availability: dto.availability,
      performance: 0,
      quality: 0,
      oee: dto.oee,
      uptimeRatio: dto.availability / 100,
      anomalies24h: dto.open_anomalies,
      mtbfHours: 0,
      mttrMinutes: 0,
    },
    prescriptive: {
      id: `PRE-${dto.asset_id}`,
      assetId: dto.asset_id,
      assetName: dto.asset_name,
      category: dto.category as DeviceCategory,
      band: dto.health_band as HealthBand,
      urgency: 'Monitor',
      action: '',
      rationale: '',
    },
    wear: [],
    components: [],
  };
};

/** Fold the detail response into an asset already built from the list. */
export const mergeAssetDetail = (base: AssetRuntime, dto: AssetDetailDto): AssetRuntime => {
  const components = dto.predictions.map(toComponentPrediction);
  const primary = dto.primary_prediction
    ? toComponentPrediction(dto.primary_prediction)
    : (components[0] ?? emptyPrediction());

  return {
    ...base,
    device: {
      assetId: dto.asset.asset_id,
      assetName: dto.asset.asset_name,
      category: dto.asset.category as DeviceCategory,
      brand: dto.asset.brand,
      model: dto.asset.model,
      status: dto.asset.status,
    },
    health: dto.health_score,
    band: dto.health_band as HealthBand,
    criticality: dto.criticality,
    riskTier: dto.performance?.risk_tier ?? base.riskTier,
    live: dto.latest ? toSample(dto.latest) : base.live,
    prediction: {
      assetId: dto.asset.asset_id,
      assetName: dto.asset.asset_name,
      category: dto.asset.category as DeviceCategory,
      primary,
      components: components.length > 0 ? components : [primary],
      horizonDays: 30,
    },
    performance: toPerformance(dto.performance),
    prescriptive: {
      id: `PRE-${dto.asset.asset_id}`,
      assetId: dto.asset.asset_id,
      assetName: dto.asset.asset_name,
      category: dto.asset.category as DeviceCategory,
      band: dto.health_band as HealthBand,
      urgency: dto.prescriptive.urgency as PrescriptiveAction['urgency'],
      action: dto.prescriptive.action,
      rationale: dto.prescriptive.rationale,
    },
    wear: dto.components.map((component) => component.wear),
    components: dto.components.map((component) => component.name),
  };
};

/* ─── Anomalies ──────────────────────────────────────────────────────────── */

export const toAnomaly = (dto: AnomalyDto): AnomalyRecord => ({
  id: dto.uid,
  code: dto.error_code,
  type: dto.anomaly_type as AnomalyType,
  title: dto.title,
  severity: dto.severity as Severity,
  status: dto.status,
  assetId: dto.asset_id,
  assetName: dto.asset_name,
  category: dto.category as DeviceCategory,
  timestamp: ms(dto.detected_at),
  resolvedAt: dto.resolved_at ? ms(dto.resolved_at) : null,
  observed: dto.observed_value,
  threshold: dto.threshold_value,
  unit: dto.unit,
  detail: dto.detail,
  component: dto.component,
  anomalyScore: dto.anomaly_score,
  detectionMethod: dto.detection_method,
  confidence: dto.confidence,
  responseTargetMinutes: dto.response_target_minutes,
});

/* ─── Maintenance ────────────────────────────────────────────────────────── */

export const toPreventiveTask = (dto: PreventiveTaskDto): PreventiveTask => ({
  id: dto.task_id,
  assetId: dto.asset_id,
  assetName: dto.asset_name,
  category: dto.category as DeviceCategory,
  taskName: dto.task_name,
  dueDate: ms(dto.due_date),
  priority: dto.priority as TaskPriority,
  status: dto.status as TaskStatus,
  completed: dto.completed,
  completedAt: dto.completed_at ? ms(dto.completed_at) : null,
  intervalDays: dto.interval_days,
});

export const toPrescriptiveAction = (dto: PrescriptiveActionDto): PrescriptiveAction => ({
  id: `PRE-${dto.asset_id}`,
  assetId: dto.asset_id,
  assetName: dto.asset_name,
  category: dto.category as DeviceCategory,
  band: dto.health_band as HealthBand,
  urgency: dto.urgency as PrescriptiveAction['urgency'],
  action: dto.action,
  rationale: dto.rationale,
});

/* ─── Fleet aggregates ───────────────────────────────────────────────────── */

export const toFleetKpis = (dto: KpisDto, tasksOverdue: number, tasksDue: number): FleetKpis => ({
  totalAssets: dto.total_assets,
  onlineAssets: dto.online_assets,
  offlineAssets: dto.offline_assets,
  standbyAssets: dto.standby_assets,
  averageHealth: dto.average_health,
  averagePower: dto.average_power_w,
  totalPower: dto.total_power_w,
  totalEnergy: dto.total_energy_kwh,
  criticalAssets: dto.critical_assets,
  warningAssets: dto.warning_assets,
  goodAssets: dto.good_assets,
  healthyAssets: dto.healthy_assets,
  activeAnomalies: dto.active_anomalies,
  criticalAnomalies: dto.critical_anomalies,
  averageAvailability: dto.average_availability,
  averageOee: dto.average_oee,
  averageRulDays: dto.average_rul_days,
  assetsAtRisk: dto.assets_at_risk,
  tasksOverdue,
  tasksDue,
});

export const toFleetOee = (dto: OeeBreakdownDto): FleetOee => ({
  availability: dto.availability,
  performance: dto.performance,
  quality: dto.quality,
  oee: dto.oee,
  target: dto.target,
  worldClass: dto.world_class,
});

export const toCategoryRollup = (dto: CategoryRollupDto, onlineByCategory: number): CategoryRollup => ({
  category: dto.category as DeviceCategory,
  assets: dto.assets,
  averageHealth: dto.average_health,
  averagePower: dto.assets > 0 ? dto.energy_kwh : 0,
  online: onlineByCategory,
  anomalies: dto.anomalies,
  availability: dto.availability,
  oee: dto.oee,
});

export const toYesterday = (dto: YesterdayBaselineDto, averageRulDays: number): YesterdayBaseline => ({
  operationalHealth: dto.operational_health,
  averageHealth: dto.average_health,
  healthyAssets: dto.healthy_assets,
  warningAssets: dto.warning_assets,
  criticalAssets: dto.critical_assets,
  offlineAssets: dto.offline_samples > 0 ? 1 : 0,
  averageRulDays,
  energyKwh: dto.energy_kwh,
  activeAlerts: 0,
  oee: dto.oee,
  averagePower: dto.average_power_w,
});

export const toEnergy = (dto: EnergyIntelligenceDto): EnergyIntelligence => ({
  todayKwh: dto.today_kwh,
  yesterdayKwh: dto.yesterday_kwh,
  changePct: dto.change_pct,
  weeklyKwh: dto.weekly_kwh,
  monthlyKwh: dto.monthly_kwh,
  peakHour: dto.peak_hour ?? 0,
  peakKw: dto.peak_kw,
  highestConsumer: dto.highest_consumer
    ? {
        assetId: dto.highest_consumer.asset_id,
        assetName: dto.highest_consumer.asset_name,
        kwh: dto.highest_consumer.kwh,
      }
    : null,
  lowestConsumer: dto.lowest_consumer
    ? {
        assetId: dto.lowest_consumer.asset_id,
        assetName: dto.lowest_consumer.asset_name,
        kwh: dto.lowest_consumer.kwh,
      }
    : null,
  estimatedMonthlyCost: dto.estimated_monthly_cost,
  carbonKgPerMonth: dto.carbon_kg_per_month,
  tariffPerKwh: dto.tariff_per_kwh,
  dailyTrend: dto.daily_trend.map((point) => ({
    t: ms(point.date),
    label: point.label,
    kwh: point.kwh,
  })),
});

export const toPlatformHealth = (dto: PlatformHealthDto, apiResponseMs: number): PlatformHealthState => {
  const stateOf = (key: string) => dto.services.find((service) => service.key === key)?.state;

  return {
    services: dto.services.map((service) => ({
      key: service.key,
      name: service.name,
      role: service.role,
      state: service.state as 'Operational' | 'Degraded' | 'Down',
      latencyMs: service.latency_ms,
      uptimePct: service.uptime_pct,
    })),
    apiResponseMs,
    databaseLatencyMs: dto.database_latency_ms,
    uptimePct: dto.services.length > 0 ? dto.services[0].uptime_pct : 0,
    gatewayConnected: stateOf('ingest') === 'Operational',
    mqttConnected: stateOf('ingest') === 'Operational',
    sensorsConnected: dto.sensors_connected,
    sensorsTotal: dto.sensors_total,
    ingestPerMinute: dto.ingest_per_minute,
  };
};

/**
 * Activity kinds the backend publishes, mapped onto the kinds the timeline
 * already renders. A cleared alert is the closing half of a maintenance event,
 * which is the icon and tone the interface already uses for it.
 */
const ACTIVITY_KIND: Record<string, ActivityKind> = {
  'alert-generated': 'alert-generated',
  'alert-cleared': 'maintenance-completed',
  'asset-offline': 'asset-offline',
  'asset-connected': 'asset-connected',
  'gateway-connected': 'gateway-connected',
  'gateway-disconnected': 'gateway-disconnected',
  'telemetry-received': 'telemetry-received',
  'firmware-updated': 'firmware-updated',
  'configuration-changed': 'configuration-changed',
};

export const toActivity = (dto: ActivityEntryDto): ActivityEvent => ({
  id: dto.id,
  kind: ACTIVITY_KIND[dto.kind] ?? 'telemetry-received',
  title: dto.title,
  detail: dto.detail,
  at: ms(dto.at),
  assetId: dto.asset_id,
  severity: dto.severity as Severity,
});

export const toFleetTrail = (dto: DashboardDto['fleet_trail']) =>
  dto.map((point) => ({
    t: ms(point.t),
    label: point.label,
    health: point.health,
    power: point.power,
    oee: point.oee,
  }));

/* ─── Reports ────────────────────────────────────────────────────────────── */

export const toDailyRecord = (dto: DailyRecordDto): DailyTelemetryRecord => ({
  assetId: dto.asset_id,
  assetName: dto.asset_name,
  category: dto.category as DeviceCategory,
  date: ms(dto.date),
  avgVoltage: dto.avg_voltage,
  avgCurrent: dto.avg_current,
  avgPower: dto.avg_power,
  peakPower: dto.peak_power,
  energyKwh: dto.energy_kwh,
  avgTemperature: dto.avg_temperature,
  peakTemperature: dto.peak_temperature,
  avgHealth: dto.avg_health,
  minHealth: dto.min_health,
  uptimePct: dto.uptime_pct,
  anomalies: dto.anomalies,
});

export const toPredictionRecord = (dto: PredictionRecordDto): PredictionHistoryRecord => ({
  assetId: dto.asset_id,
  assetName: dto.asset_name,
  date: ms(dto.date),
  component: dto.component,
  failureProbability: dto.failure_probability,
  rulDays: dto.rul_days,
  confidence: dto.confidence,
});
