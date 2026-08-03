import type { AnomalyRecord, AssetRuntime, ComponentPrediction, PreventiveTask } from '@/engine/types';

/* ───────────────────────────────────────────────────────────────────────────
 * View models for the Predictive Maintenance workspace.
 *
 * Every function here groups, sorts, filters or counts records the backend has
 * already produced. None of them computes a domain figure: remaining useful
 * life, failure probability, confidence, wear and maintenance priority all
 * arrive decided from FastAPI and are passed through untouched.
 *
 * The test applied to anything added here: if removing it would change a
 * number rather than an arrangement, it belongs in the backend instead.
 * ─────────────────────────────────────────────────────────────────────────── */

/** The horizon the backend publishes predictions against. */
export const HORIZON_DAYS = 30;

/* ─── Ranking ────────────────────────────────────────────────────────────── */

export interface AssetPredictionRow {
  assetId: string;
  assetName: string;
  category: string;
  brand: string;
  model: string;
  status: string;
  criticality: string;
  component: string;
  rulDays: number;
  failureProbability: number;
  confidence: number;
  wear: number;
  priority: string;
  recommendation: string;
  predictedFailureAt: number | null;
  modelVersion: string;
  componentCount: number;
}

/** One row per device, carrying the weakest component the backend named. */
export const assetRows = (assets: readonly AssetRuntime[]): AssetPredictionRow[] =>
  assets.map((asset) => {
    const primary = asset.prediction.primary;
    return {
      assetId: asset.device.assetId,
      assetName: asset.device.assetName,
      category: asset.category,
      brand: asset.device.brand,
      model: asset.device.model,
      status: asset.device.status,
      criticality: asset.criticality,
      component: primary.component,
      rulDays: primary.rulDays,
      failureProbability: primary.failureProbability,
      confidence: primary.confidence,
      wear: primary.wear,
      priority: primary.maintenancePriority,
      recommendation: primary.recommendation,
      predictedFailureAt: primary.predictedFailureAt,
      modelVersion: primary.modelVersion,
      componentCount: asset.prediction.components.length,
    };
  });

export const bySoonestFailure = (rows: AssetPredictionRow[]): AssetPredictionRow[] =>
  [...rows].sort((a, b) => a.rulDays - b.rulDays || b.failureProbability - a.failureProbability);

export const byHighestProbability = (rows: AssetPredictionRow[]): AssetPredictionRow[] =>
  [...rows].sort((a, b) => b.failureProbability - a.failureProbability || a.rulDays - b.rulDays);

/* ─── Distribution ───────────────────────────────────────────────────────── */

export interface Band {
  label: string;
  from: number;
  to: number;
  tone: 'critical' | 'serious' | 'warning' | 'brand' | 'neutral';
}

/**
 * Planning horizons, not arbitrary buckets.
 *
 * Each edge is a decision point: inside a week there is no time to procure,
 * inside a month the part must be ordered now, inside a quarter it belongs in
 * the next budget cycle.
 */
export const RUL_BANDS: Band[] = [
  { label: 'Under 7 days', from: 0, to: 7, tone: 'critical' },
  { label: '7 to 30 days', from: 7, to: 30, tone: 'serious' },
  { label: '30 to 90 days', from: 30, to: 90, tone: 'warning' },
  { label: '90 to 180 days', from: 90, to: 180, tone: 'brand' },
  { label: 'Beyond 180 days', from: 180, to: Number.POSITIVE_INFINITY, tone: 'neutral' },
];

export const bandOfDays = (days: number): Band =>
  RUL_BANDS.find((band) => days > band.from && days <= band.to) ?? RUL_BANDS[RUL_BANDS.length - 1];

export interface DistributionSlice extends Band {
  count: number;
  assetIds: string[];
}

export const distributeByRul = (rows: AssetPredictionRow[]): DistributionSlice[] =>
  RUL_BANDS.map((band) => {
    const matching = rows.filter((row) => row.rulDays > band.from && row.rulDays <= band.to);
    return { ...band, count: matching.length, assetIds: matching.map((row) => row.assetId) };
  });

/* ─── Probability grouping ───────────────────────────────────────────────── */

export const PROBABILITY_BANDS: Band[] = [
  { label: 'Very likely', from: 0.7, to: 1.01, tone: 'critical' },
  { label: 'Likely', from: 0.45, to: 0.7, tone: 'serious' },
  { label: 'Possible', from: 0.2, to: 0.45, tone: 'warning' },
  { label: 'Unlikely', from: 0, to: 0.2, tone: 'neutral' },
];

export const probabilityBandOf = (probability: number): Band =>
  PROBABILITY_BANDS.find((band) => probability >= band.from && probability < band.to) ??
  PROBABILITY_BANDS[PROBABILITY_BANDS.length - 1];

/* ─── Components ─────────────────────────────────────────────────────────── */

export interface ComponentRow extends ComponentPrediction {
  assetId: string;
  assetName: string;
  category: string;
  criticality: string;
  isPrimary: boolean;
}

/** Every serviceable part across the estate, soonest end of life first. */
export const componentRows = (assets: readonly AssetRuntime[]): ComponentRow[] =>
  assets
    .flatMap((asset) =>
      asset.prediction.components.map((component) => ({
        ...component,
        assetId: asset.device.assetId,
        assetName: asset.device.assetName,
        category: asset.category,
        criticality: asset.criticality,
        isPrimary: component.component === asset.prediction.primary.component,
      })),
    )
    .sort((a, b) => a.rulDays - b.rulDays);

export interface ComponentClassRow {
  component: string;
  category: string;
  instances: number;
  meanWear: number;
  worstWear: number;
  soonestRulDays: number;
  worstAssetId: string;
}

/**
 * Wear per part type within a device class.
 *
 * Answers a procurement question the per-asset view cannot: which part is
 * wearing across the whole class, and therefore which spare to stock.
 */
export const componentClassRows = (rows: ComponentRow[]): ComponentClassRow[] => {
  const buckets = new Map<string, ComponentRow[]>();
  for (const row of rows) {
    const key = `${row.category}|${row.component}`;
    const held = buckets.get(key);
    if (held) held.push(row);
    else buckets.set(key, [row]);
  }

  return Array.from(buckets.entries())
    .map(([key, entries]) => {
      const [category, component] = key.split('|');
      const worst = entries.reduce((peak, entry) => (entry.wear > peak.wear ? entry : peak), entries[0]);
      return {
        component,
        category,
        instances: entries.length,
        meanWear: entries.reduce((sum, entry) => sum + entry.wear, 0) / entries.length,
        worstWear: worst.wear,
        soonestRulDays: Math.min(...entries.map((entry) => entry.rulDays)),
        worstAssetId: worst.assetId,
      };
    })
    .sort((a, b) => b.worstWear - a.worstWear);
};

/* ─── Signals feeding prediction ─────────────────────────────────────────── */

/**
 * Anomalies that bear on prediction.
 *
 * The detector attributes each event to a serviceable part; those are the
 * events that change what a component's wear will do next, and therefore the
 * only ones this module has any business showing. Everything else belongs to
 * AI Anomaly Detection.
 */
export const predictiveSignals = (
  journal: readonly AnomalyRecord[],
  assets: readonly AssetRuntime[],
): AnomalyRecord[] => {
  const known = new Set(assets.map((asset) => asset.device.assetId));

  return journal
    .filter((record) => record.component !== null && known.has(record.assetId))
    .sort((a, b) => b.timestamp - a.timestamp);
};

/* ─── Preventive work tied to prediction ─────────────────────────────────── */

/**
 * Scheduled work on devices prediction has flagged.
 *
 * Deliberately not the whole maintenance calendar — that is the Preventive
 * Maintenance module. This is the subset that could absorb a predicted repair
 * without booking a separate visit.
 */
export const preparationTasks = (
  tasks: readonly PreventiveTask[],
  rows: AssetPredictionRow[],
  withinDays = 90,
): PreventiveTask[] => {
  const flagged = new Set(rows.filter((row) => row.rulDays <= withinDays).map((row) => row.assetId));
  return tasks
    .filter((task) => flagged.has(task.assetId) && !task.completed)
    .sort((a, b) => a.dueDate - b.dueDate);
};

/* ─── Formatting helpers ─────────────────────────────────────────────────── */

export const formatDays = (days: number): string => {
  if (days >= 365) return `${(days / 365).toFixed(1)} yr`;
  if (days >= 1) return `${Math.round(days)} d`;
  return `${(days * 24).toFixed(0)} h`;
};

export const TONE_CLASS: Record<Band['tone'], { text: string; bg: string; ring: string; color: string }> = {
  critical: { text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'ring-rose-400/30', color: '#D03B3B' },
  serious: { text: 'text-orange-300', bg: 'bg-orange-500/10', ring: 'ring-orange-400/25', color: '#EC835A' },
  warning: { text: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'ring-amber-400/25', color: '#FAB219' },
  brand: { text: 'text-brand-300', bg: 'bg-brand-500/10', ring: 'ring-brand-400/25', color: '#3D8EF0' },
  neutral: { text: 'text-fg-dim', bg: 'bg-overlay/[0.05]', ring: 'ring-overlay/10', color: '#7A8699' },
};
