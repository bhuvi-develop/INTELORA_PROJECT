/* ───────────────────────────────────────────────────────────────────────────
 * INTELORA live telemetry engine — domain model.
 *
 * The engine is the single source of truth. Every module reads derived values
 * from the same runtime record, so two modules cannot disagree about an asset.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Commissioned device classes.
 *
 * The estate is Laptops and Mobile Chargers. Adding a class is a matter of
 * extending this union and adding its profile and seeds in `catalog.ts` — no
 * module enumerates categories by name, so nothing downstream needs changing.
 */
export type DeviceCategory = 'Laptop' | 'Mobile Charger';

/** Connectivity state. Distinct from condition — an Online asset can be Critical. */
export type DeviceStatus = 'Online' | 'Offline' | 'Standby';

/** Condition band. Thresholds live in `derive.ts` and nowhere else. */
export type HealthBand = 'healthy' | 'good' | 'warning' | 'critical';

export type Severity = 'Info' | 'Warning' | 'Major' | 'Critical';

export type AnomalyType =
  | 'voltage-high'
  | 'voltage-low'
  | 'current-spike'
  | 'power-surge'
  | 'power-factor-low'
  | 'temperature-high'
  | 'frequency-deviation'
  | 'energy-spike'
  | 'communication-lost';

export type AnomalyStatus = 'Active' | 'Acknowledged' | 'Resolved';

export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type TaskStatus = 'Scheduled' | 'Due' | 'Overdue' | 'Completed';

export type ActionUrgency = 'Immediate' | 'Scheduled' | 'Monitor' | 'None';

/* ─── Device identity ────────────────────────────────────────────────────── */

/**
 * The complete displayed asset record. These six fields are the only asset
 * attributes the product exposes — no location, warranty, assignee,
 * department or owner exists anywhere in the model.
 */
export interface Device {
  assetId: string;
  assetName: string;
  category: DeviceCategory;
  brand: string;
  model: string;
  status: DeviceStatus;
}

/* ─── Telemetry ──────────────────────────────────────────────────────────── */

/** One 5-second sample. Power is always V·I·PF — never an independent walk. */
export interface TelemetrySample {
  t: number;
  /** Formatted clock label, precomputed for chart axes. */
  label: string;
  voltage: number;
  current: number;
  /** Active power, W. */
  power: number;
  /** Apparent power, VA — published by the meter, not derived here. */
  apparentPower: number;
  /** Reactive power, VAR — published by the meter, not derived here. */
  reactivePower: number;
  /** Cumulative energy in kWh — monotonically increasing. */
  energy: number;
  frequency: number;
  powerFactor: number;
  temperature: number;
  health: number;
  /** Cumulative powered hours. */
  runtimeHours: number;
  relayStatus: string;
  relayOperations: number;
  status: DeviceStatus;
  /** Operating mode the device was in when the sample was taken. */
  loadState: string;
  source?: string;
  present_parameters?: string[];
}

export const TELEMETRY_CHANNELS = [
  'voltage',
  'current',
  'power',
  'energy',
  'frequency',
  'powerFactor',
  'temperature',
  'health',
] as const;

export type TelemetryChannel = (typeof TELEMETRY_CHANNELS)[number];

export interface ChannelMeta {
  key: TelemetryChannel;
  label: string;
  unit: string;
  decimals: number;
}

/* ─── Anomalies ──────────────────────────────────────────────────────────── */

export interface AnomalyRecord {
  id: string;
  /** Operator-facing error code, e.g. ANO-1006. */
  code: string;
  type: AnomalyType;
  title: string;
  severity: Severity;
  status: AnomalyStatus;
  assetId: string;
  assetName: string;
  category: DeviceCategory;
  timestamp: number;
  /** Set when the condition cleared. */
  resolvedAt: number | null;
  /** Measured value that breached the threshold. */
  observed: number;
  threshold: number;
  unit: string;
  detail: string;
  /** Serviceable part the detector attributed the event to, when it named one. */
  component: string | null;
  /** Isolation-forest score, 0-1. Corroborates the rule; never raises alone. */
  anomalyScore: number;
  detectionMethod: string;
  confidence: number;
  /** Minutes from raise to acknowledgement allowed for this severity. */
  responseTargetMinutes: number;
}

/* ─── Predictive maintenance ─────────────────────────────────────────────── */

export interface ComponentPrediction {
  component: string;
  /** 0–1 probability of failure inside the prediction horizon. */
  failureProbability: number;
  /** Remaining useful life in days — decreases monotonically. */
  rulDays: number;
  /** 0–1 model confidence. */
  confidence: number;
  recommendation: string;
  wear: number;
  maintenancePriority: TaskPriority;
  /** Projected failure date, absent when it lies beyond the model's range. */
  predictedFailureAt: number | null;
  /** Which estimator produced the published figures. */
  modelVersion: string;
}

export interface AssetPrediction {
  assetId: string;
  assetName: string;
  category: DeviceCategory;
  /** Weakest component — drives the asset-level headline. */
  primary: ComponentPrediction;
  components: ComponentPrediction[];
  horizonDays: number;
}

/* ─── Preventive maintenance ─────────────────────────────────────────────── */

export interface PreventiveTask {
  id: string;
  assetId: string;
  assetName: string;
  category: DeviceCategory;
  taskName: string;
  dueDate: number;
  priority: TaskPriority;
  status: TaskStatus;
  completed: boolean;
  completedAt: number | null;
  intervalDays: number;
}

/* ─── Prescriptive maintenance ───────────────────────────────────────────── */

export interface PrescriptiveAction {
  id: string;
  assetId: string;
  assetName: string;
  category: DeviceCategory;
  band: HealthBand;
  urgency: ActionUrgency;
  action: string;
  rationale: string;
}

/* ─── Performance ────────────────────────────────────────────────────────── */

export interface AssetPerformance {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  /** Ticks observed online over total ticks observed. */
  uptimeRatio: number;
  anomalies24h: number;
  mtbfHours: number;
  mttrMinutes: number;
}

/* ─── Runtime record ─────────────────────────────────────────────────────── */

/** Everything known about one asset at the current tick. */
export interface AssetRuntime {
  device: Device;
  category: DeviceCategory;
  /** Latest sample. */
  live: TelemetrySample;
  health: number;
  band: HealthBand;
  /** Operational risk tier, decided by the backend from condition and alarms. */
  riskTier: string;
  /** Business criticality of the asset. */
  criticality: string;
  /** Rolling window of samples received from the platform. */
  history: TelemetrySample[];
  prediction: AssetPrediction;
  performance: AssetPerformance;
  prescriptive: PrescriptiveAction;
  /** Wear per component, aligned to `profile.components`. */
  wear: number[];
  components: string[];
}

/* ─── Fleet aggregates ───────────────────────────────────────────────────── */

export interface FleetKpis {
  totalAssets: number;
  onlineAssets: number;
  offlineAssets: number;
  standbyAssets: number;
  averageHealth: number;
  averagePower: number;
  totalPower: number;
  totalEnergy: number;
  criticalAssets: number;
  warningAssets: number;
  goodAssets: number;
  healthyAssets: number;
  activeAnomalies: number;
  criticalAnomalies: number;
  averageAvailability: number;
  averageOee: number;
  averageRulDays: number;
  assetsAtRisk: number;
  tasksOverdue: number;
  tasksDue: number;
}

export interface FleetOee {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  target: number;
  worldClass: number;
}

export interface CategoryRollup {
  category: DeviceCategory;
  assets: number;
  averageHealth: number;
  averagePower: number;
  online: number;
  anomalies: number;
  availability: number;
  oee: number;
}

/* ─── Historical records ─────────────────────────────────────────────────── */

export interface DailyTelemetryRecord {
  assetId: string;
  assetName: string;
  category: DeviceCategory;
  date: number;
  avgVoltage: number;
  avgCurrent: number;
  avgPower: number;
  peakPower: number;
  energyKwh: number;
  avgTemperature: number;
  peakTemperature: number;
  avgHealth: number;
  minHealth: number;
  uptimePct: number;
  anomalies: number;
}

export interface PredictionHistoryRecord {
  assetId: string;
  assetName: string;
  date: number;
  component: string;
  failureProbability: number;
  rulDays: number;
  confidence: number;
}

/* ─── Platform activity ─────────────────────────────────────────────────── */

export type ActivityKind =
  | 'asset-connected'
  | 'asset-offline'
  | 'gateway-connected'
  | 'gateway-disconnected'
  | 'telemetry-received'
  | 'alert-generated'
  | 'maintenance-completed'
  | 'firmware-updated'
  | 'configuration-changed';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  at: number;
  /** Present when the event concerns a specific device. */
  assetId: string | null;
  severity: Severity;
}

/* ─── Yesterday comparison ──────────────────────────────────────────────── */

/**
 * Prior-day aggregates, used by the cockpit KPI cards for their comparison
 * figure. Sourced from the archived daily records so the comparison is against
 * stored history rather than a value invented at render time.
 */
export interface YesterdayBaseline {
  operationalHealth: number;
  averageHealth: number;
  healthyAssets: number;
  warningAssets: number;
  criticalAssets: number;
  offlineAssets: number;
  averageRulDays: number;
  energyKwh: number;
  activeAlerts: number;
  oee: number;
  averagePower: number;
}

/* ─── Energy intelligence ───────────────────────────────────────────────── */

export interface EnergyIntelligence {
  todayKwh: number;
  yesterdayKwh: number;
  changePct: number;
  weeklyKwh: number;
  monthlyKwh: number;
  /** Hour of day with the highest observed draw, 0–23. */
  peakHour: number;
  peakKw: number;
  highestConsumer: { assetId: string; assetName: string; kwh: number } | null;
  lowestConsumer: { assetId: string; assetName: string; kwh: number } | null;
  estimatedMonthlyCost: number;
  carbonKgPerMonth: number;
  tariffPerKwh: number;
  /** Daily totals for the trend, oldest first. */
  dailyTrend: Array<{ t: number; label: string; kwh: number }>;
}

/* ─── Engine snapshot ────────────────────────────────────────────────────── */

/**
 * Immutable view of the whole estate at one instant, assembled from the
 * platform's responses. Replaced wholesale on every update so subscribers can
 * compare by reference.
 */
export interface EngineSnapshot {
  /** Backend tick this snapshot was computed from. */
  tick: number;
  /** Wall-clock time of this tick. */
  at: number;
  /** Platform uptime, in days. */
  elapsedDays: number;
  running: boolean;
  assets: AssetRuntime[];
  byId: Record<string, AssetRuntime>;
  anomalies: AnomalyRecord[];
  tasks: PreventiveTask[];
  kpis: FleetKpis;
  oee: FleetOee;
  categories: CategoryRollup[];
  /** Fleet-level health trail, one point per tick. */
  fleetTrail: Array<{ t: number; label: string; health: number; power: number; oee: number }>;
  /** Executive composite for the cockpit headline. */
  operationalHealth: number;
  /** Mean minutes from raise to clear, measured by the backend. */
  mttrMinutes: number;
  /** Prior-day figures backing every KPI comparison. */
  yesterday: YesterdayBaseline;
  /** Newest-first platform activity journal. */
  activity: ActivityEvent[];
  energy: EnergyIntelligence;
  /** Live state of the services the platform depends on. */
  platform: PlatformHealthState;
}

/** Re-exported shape of `platform.ts` so consumers need only this module. */
export interface PlatformHealthState {
  services: Array<{
    key: string;
    name: string;
    role: string;
    state: 'Operational' | 'Degraded' | 'Down';
    latencyMs: number | null;
    uptimePct: number;
  }>;
  apiResponseMs: number;
  databaseLatencyMs: number;
  uptimePct: number;
  gatewayConnected: boolean;
  mqttConnected: boolean;
  sensorsConnected: number;
  sensorsTotal: number;
  ingestPerMinute: number;
}
