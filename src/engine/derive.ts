import type { ActionUrgency, AnomalyType, DeviceCategory, HealthBand, Severity, TaskPriority } from './types';

/* ───────────────────────────────────────────────────────────────────────────
 * Presentation vocabulary.
 *
 * This module once computed the platform's figures. It no longer does: health,
 * remaining life, failure probability, risk, availability, effectiveness and
 * every other domain number are produced by the Python backend and arrive on
 * the wire already decided.
 *
 * What is left is the interface's own vocabulary — the colours, labels, icons
 * and orderings used to render those figures. Two things are deliberately not
 * hardcoded here:
 *
 *   · band thresholds, which the backend publishes and `applyBandThresholds`
 *     writes in, so a value is coloured against the same boundary the platform
 *     judged it by rather than against a second copy of the rule
 *   · effectiveness targets, which arrive with the OEE response
 *
 * If a calculation ever needs to happen, it belongs in FastAPI, not here.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── Condition bands ────────────────────────────────────────────────────── */

export interface BandDef {
  band: HealthBand;
  label: string;
  /** Inclusive lower bound. Supplied by the backend, not chosen here. */
  min: number;
  color: string;
  text: string;
  bg: string;
  ring: string;
}

/**
 * Band vocabulary. The minimums are seeded with the platform's published
 * boundaries and refreshed from every dashboard response, so this array is a
 * cache of the backend's rule rather than a restatement of it.
 */
export const BANDS: BandDef[] = [
  {
    band: 'healthy',
    label: 'Healthy',
    min: 95,
    color: '#0CA30C',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-400/25',
  },
  {
    band: 'good',
    label: 'Good',
    min: 80,
    color: '#3D8EF0',
    text: 'text-brand-300',
    bg: 'bg-brand-500/10',
    ring: 'ring-brand-400/25',
  },
  {
    band: 'warning',
    label: 'Warning',
    min: 65,
    color: '#FAB219',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-400/25',
  },
  {
    band: 'critical',
    label: 'Critical',
    min: 0,
    color: '#D03B3B',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    ring: 'ring-rose-400/30',
  },
];

/**
 * Adopt the boundaries the backend published.
 *
 * Called by the platform store on every dashboard response. Mutating in place
 * keeps the exported array reference stable for anything that captured it.
 */
export const applyBandThresholds = (bands: ReadonlyArray<{ band: string; min: number }>): void => {
  for (const incoming of bands) {
    const target = BANDS.find((entry) => entry.band === incoming.band);
    if (target) target.min = incoming.min;
  }
};

/**
 * Band for a score, resolved against the backend's own thresholds.
 *
 * Used only where a component is handed a bare number — everywhere an asset is
 * in scope, its `band` field is the backend's answer and should be preferred.
 */
export const bandOf = (health: number): HealthBand => {
  const ordered = [...BANDS].sort((a, b) => b.min - a.min);
  return (ordered.find((entry) => health >= entry.min) ?? BANDS[BANDS.length - 1]).band;
};

export const bandDef = (band: HealthBand): BandDef =>
  BANDS.find((entry) => entry.band === band) ?? BANDS[BANDS.length - 1];

export const bandColor = (health: number): string => bandDef(bandOf(health)).color;

/* ─── Risk tiers ─────────────────────────────────────────────────────────── */

export type RiskTier = 'critical' | 'high' | 'medium' | 'low' | 'healthy';

export interface RiskTierDef {
  tier: RiskTier;
  label: string;
  color: string;
  text: string;
}

export const RISK_TIERS: RiskTierDef[] = [
  { tier: 'critical', label: 'Critical risk', color: '#D03B3B', text: 'text-rose-300' },
  { tier: 'high', label: 'High risk', color: '#EC835A', text: 'text-orange-300' },
  { tier: 'medium', label: 'Medium risk', color: '#FAB219', text: 'text-amber-300' },
  { tier: 'low', label: 'Low risk', color: '#3D8EF0', text: 'text-brand-300' },
  { tier: 'healthy', label: 'Healthy', color: '#0CA30C', text: 'text-emerald-300' },
];

export const riskTierDef = (tier: RiskTier): RiskTierDef =>
  RISK_TIERS.find((entry) => entry.tier === tier) ?? RISK_TIERS[0];

/** Narrow the backend's tier string onto the rendering union. */
export const asRiskTier = (tier: string): RiskTier =>
  (RISK_TIERS.find((entry) => entry.tier === tier)?.tier ?? 'healthy') as RiskTier;

/* ─── Effectiveness targets ──────────────────────────────────────────────── */

/**
 * Chart reference lines. Seeded with the platform's published targets and
 * overwritten by `applyEffectivenessTargets` from the OEE response.
 */
export let OEE_TARGET = 85;
export let OEE_WORLD_CLASS = 92;

export const applyEffectivenessTargets = (target: number, worldClass: number): void => {
  OEE_TARGET = target;
  OEE_WORLD_CLASS = worldClass;
};

export const PREDICTION_HORIZON_DAYS = 30;

/* ─── Anomaly vocabulary ─────────────────────────────────────────────────── */

export interface AnomalyDef {
  type: AnomalyType;
  code: string;
  title: string;
  unit: string;
}

/**
 * Error codes and titles, as the operator knows them. The detector that raises
 * them lives in the backend; this map exists so a filter dropdown can be
 * rendered without waiting for a request.
 */
export const ANOMALY_DEFS: Record<AnomalyType, AnomalyDef> = {
  'voltage-high': { type: 'voltage-high', code: 'ANO-1001', title: 'Voltage High', unit: 'V' },
  'voltage-low': { type: 'voltage-low', code: 'ANO-1002', title: 'Voltage Low', unit: 'V' },
  'current-spike': { type: 'current-spike', code: 'ANO-1003', title: 'Current Spike', unit: 'A' },
  'power-surge': { type: 'power-surge', code: 'ANO-1004', title: 'Power Surge', unit: 'W' },
  'power-factor-low': {
    type: 'power-factor-low',
    code: 'ANO-1005',
    title: 'Power Factor Low',
    unit: '',
  },
  'temperature-high': {
    type: 'temperature-high',
    code: 'ANO-1006',
    title: 'Temperature Exceeded',
    unit: '°C',
  },
  'frequency-deviation': {
    type: 'frequency-deviation',
    code: 'ANO-1007',
    title: 'Frequency Deviation',
    unit: 'Hz',
  },
  'energy-spike': {
    type: 'energy-spike',
    code: 'ANO-1008',
    title: 'Energy Consumption Spike',
    unit: 'kWh',
  },
  'communication-lost': {
    type: 'communication-lost',
    code: 'ANO-1009',
    title: 'Communication Lost',
    unit: '',
  },
};

export const ANOMALY_TYPES: AnomalyType[] = Object.keys(ANOMALY_DEFS) as AnomalyType[];

export const SEVERITY_RANK: Record<Severity, number> = { Critical: 4, Major: 3, Warning: 2, Info: 1 };

/* ─── Tone maps ──────────────────────────────────────────────────────────── */

export const SEVERITY_TONE: Record<Severity, { color: string; text: string; bg: string; ring: string }> = {
  Critical: { color: '#D03B3B', text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'ring-rose-400/30' },
  Major: { color: '#EC835A', text: 'text-orange-300', bg: 'bg-orange-500/10', ring: 'ring-orange-400/25' },
  Warning: { color: '#FAB219', text: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'ring-amber-400/25' },
  Info: { color: '#3D8EF0', text: 'text-brand-300', bg: 'bg-brand-500/10', ring: 'ring-brand-400/25' },
};

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export const TASK_PRIORITY_TONE: Record<TaskPriority, { color: string; text: string; bg: string; ring: string }> = {
  Critical: { color: '#D03B3B', text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'ring-rose-400/30' },
  High: { color: '#EC835A', text: 'text-orange-300', bg: 'bg-orange-500/10', ring: 'ring-orange-400/25' },
  Medium: { color: '#FAB219', text: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'ring-amber-400/25' },
  Low: { color: '#7A8699', text: 'text-fg-dim', bg: 'bg-overlay/[0.05]', ring: 'ring-overlay/10' },
};

export const URGENCY_TONE: Record<ActionUrgency, { color: string; text: string; bg: string; ring: string }> = {
  Immediate: { color: '#D03B3B', text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'ring-rose-400/30' },
  Scheduled: { color: '#EC835A', text: 'text-orange-300', bg: 'bg-orange-500/10', ring: 'ring-orange-400/25' },
  Monitor: { color: '#FAB219', text: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'ring-amber-400/25' },
  None: { color: '#0CA30C', text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'ring-emerald-400/25' },
};

export const STATUS_TONE: Record<'Online' | 'Offline' | 'Standby', { color: string; text: string; bg: string; ring: string }> =
  {
    Online: { color: '#0CA30C', text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'ring-emerald-400/25' },
    Standby: { color: '#3D8EF0', text: 'text-brand-300', bg: 'bg-brand-500/10', ring: 'ring-brand-400/25' },
    Offline: { color: '#7A8699', text: 'text-fg-dim', bg: 'bg-overlay/[0.05]', ring: 'ring-overlay/10' },
  };

/** Category label used for grouping in charts and rollups. */
export const categoryLabel = (category: DeviceCategory): string => category;
