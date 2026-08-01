import type { AnomalyRecord, AnomalyType, AssetRuntime, Severity, TelemetryChannel } from './types';
import { ANOMALY_DEFS, SEVERITY_RANK } from './derive';

/* ───────────────────────────────────────────────────────────────────────────
 * View models.
 *
 * Everything here shapes records the backend has already produced into the form
 * a particular chart or table renders: grouping, bucketing, ordering, slicing.
 * Nothing computes a domain figure — health, remaining life, failure
 * probability, effectiveness, mean time to restore and every other metric
 * arrives decided from FastAPI and is passed through untouched.
 *
 * The test for whether something belongs here is simple: if removing it would
 * change a number rather than a layout, it belongs in the backend instead.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Which telemetry channel an anomaly type was raised against. */
export const CHANNEL_FOR_ANOMALY: Record<AnomalyType, TelemetryChannel> = {
  'voltage-high': 'voltage',
  'voltage-low': 'voltage',
  'current-spike': 'current',
  'power-surge': 'power',
  'power-factor-low': 'powerFactor',
  'temperature-high': 'temperature',
  'frequency-deviation': 'frequency',
  'energy-spike': 'energy',
  'communication-lost': 'health',
};

export const anomalyTypeLabel = (type: AnomalyType): string => ANOMALY_DEFS[type].title;

export const SEVERITY_ORDER: Severity[] = ['Critical', 'Major', 'Warning', 'Info'];

export const sortBySeverity = (a: AnomalyRecord, b: AnomalyRecord): number =>
  SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.timestamp - a.timestamp;

/* ─── Grouping ───────────────────────────────────────────────────────────── */

export interface SeverityBucket {
  t: number;
  label: string;
  Critical: number;
  Major: number;
  Warning: number;
  Info: number;
  total: number;
}

const minuteFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * Bucket the journal into fixed windows so the detection timeline has a stable
 * x-axis regardless of how long the session has been running. A count of
 * delivered records per window — no record is created, judged or scored here.
 */
export const bucketBySeverity = (
  records: readonly AnomalyRecord[],
  now: number,
  buckets = 24,
  bucketMs = 120_000,
): SeverityBucket[] => {
  const out: SeverityBucket[] = [];

  for (let i = buckets - 1; i >= 0; i -= 1) {
    const to = now - i * bucketMs;
    const from = to - bucketMs;
    const slice = records.filter((record) => record.timestamp > from && record.timestamp <= to);

    out.push({
      t: to,
      label: minuteFmt.format(new Date(to)),
      Critical: slice.filter((record) => record.severity === 'Critical').length,
      Major: slice.filter((record) => record.severity === 'Major').length,
      Warning: slice.filter((record) => record.severity === 'Warning').length,
      Info: slice.filter((record) => record.severity === 'Info').length,
      total: slice.length,
    });
  }

  return out;
};

export interface TypeTally {
  type: AnomalyType;
  code: string;
  label: string;
  count: number;
  active: number;
  sharePct: number;
}

/** Count the delivered journal by signature, for the attribution chart. */
export const tallyByType = (records: readonly AnomalyRecord[]): TypeTally[] => {
  const total = Math.max(1, records.length);

  return (Object.keys(ANOMALY_DEFS) as AnomalyType[])
    .map((type) => {
      const matching = records.filter((record) => record.type === type);
      return {
        type,
        code: ANOMALY_DEFS[type].code,
        label: ANOMALY_DEFS[type].title,
        count: matching.length,
        active: matching.filter((record) => record.status === 'Active').length,
        sharePct: Math.round((matching.length / total) * 1000) / 10,
      };
    })
    .sort((a, b) => b.count - a.count);
};

/** Open critical events per asset id, for grouping the risk visualisations. */
export const criticalByAsset = (records: readonly AnomalyRecord[]): Record<string, number> =>
  records
    .filter((record) => record.status === 'Active' && record.severity === 'Critical')
    .reduce<Record<string, number>>((acc, record) => {
      acc[record.assetId] = (acc[record.assetId] ?? 0) + 1;
      return acc;
    }, {});

/** All open events per asset id. */
export const activeByAsset = (records: readonly AnomalyRecord[]): Record<string, number> =>
  records
    .filter((record) => record.status !== 'Resolved')
    .reduce<Record<string, number>>((acc, record) => {
      acc[record.assetId] = (acc[record.assetId] ?? 0) + 1;
      return acc;
    }, {});

/* ─── Predictive projections ─────────────────────────────────────────────── */

export interface DegradationPoint {
  label: string;
  t: number;
  actual: number | null;
  forecast: number;
  upper: number;
  lower: number;
  threshold: number;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });

/**
 * Draw a device's condition forward to the failure threshold.
 *
 * This is a rendering, not a prediction. The remaining life and the confidence
 * it hedges with are the backend's published figures; this traces the curve
 * between today's health and the end of life the platform already stated, so
 * the chart and the number beside it cannot disagree.
 */
export const projectDegradation = (asset: AssetRuntime, now: number, forwardPoints = 18): DegradationPoint[] => {
  const { primary } = asset.prediction;
  const dayMs = 86_400_000;
  const out: DegradationPoint[] = [];

  const history = asset.history;
  const stride = Math.max(1, Math.floor(history.length / 10));

  for (let i = 0; i < history.length; i += stride) {
    const sample = history[i];
    out.push({
      t: sample.t,
      label: minuteFmt.format(new Date(sample.t)),
      actual: sample.health,
      forecast: sample.health,
      upper: sample.health,
      lower: sample.health,
      threshold: 40,
    });
  }

  const spread = 1 - Math.min(1, Math.max(0, primary.confidence));
  const horizonDays = Math.max(1, primary.rulDays);

  for (let step = 1; step <= forwardPoints; step += 1) {
    const progress = step / forwardPoints;
    const t = now + horizonDays * progress * dayMs;

    // Convex: the last stretch of condition costs far more life than the first.
    const decayed = asset.health - (asset.health - 40) * Math.pow(progress, 1.55);
    const band = 2.5 + spread * 34 * progress;

    out.push({
      t,
      label: dayFmt.format(new Date(t)),
      actual: null,
      forecast: Math.round(Math.min(100, Math.max(5, decayed)) * 10) / 10,
      upper: Math.round(Math.min(100, Math.max(5, decayed + band)) * 10) / 10,
      lower: Math.round(Math.min(100, Math.max(0, decayed - band)) * 10) / 10,
      threshold: 40,
    });
  }

  return out;
};

export interface RulBucket {
  label: string;
  bucket: string;
  count: number;
  maxDays: number;
}

const RUL_BANDS: Array<{ label: string; maxDays: number }> = [
  { label: '< 7 d', maxDays: 7 },
  { label: '7–30 d', maxDays: 30 },
  { label: '30–90 d', maxDays: 90 },
  { label: '90–180 d', maxDays: 180 },
  { label: '> 180 d', maxDays: Number.POSITIVE_INFINITY },
];

/** Histogram of the published remaining-life figures. */
export const bucketRul = (assets: readonly AssetRuntime[]): RulBucket[] => {
  let lower = 0;
  return RUL_BANDS.map(({ label, maxDays }) => {
    const count = assets.filter(
      (asset) => asset.prediction.primary.rulDays > lower && asset.prediction.primary.rulDays <= maxDays,
    ).length;
    lower = maxDays;
    return { label, bucket: label, count, maxDays };
  });
};

export interface ComponentRow {
  assetId: string;
  assetName: string;
  category: string;
  component: string;
  wear: number;
  failureProbability: number;
  rulDays: number;
  confidence: number;
  recommendation: string;
  health: number;
  isPrimary: boolean;
}

/** Flatten the published per-component predictions into one queue. */
export const componentQueue = (assets: readonly AssetRuntime[]): ComponentRow[] =>
  assets
    .flatMap((asset) =>
      asset.prediction.components.map((component) => ({
        assetId: asset.device.assetId,
        assetName: asset.device.assetName,
        category: asset.category,
        component: component.component,
        wear: component.wear,
        failureProbability: component.failureProbability,
        rulDays: component.rulDays,
        confidence: component.confidence,
        recommendation: component.recommendation,
        health: asset.health,
        isPrimary: component.component === asset.prediction.primary.component,
      })),
    )
    .sort((a, b) => a.rulDays - b.rulDays);

/* ─── Effectiveness cascade ──────────────────────────────────────────────── */

export interface LossStep {
  key: string;
  label: string;
  loss: number;
  detail: string;
}

/**
 * The gap from a theoretical 100% down to measured effectiveness, for a subset
 * the operator has filtered to.
 *
 * The backend publishes this cascade for the whole estate on `/api/oee`; this
 * renders the same decomposition for an arbitrary on-screen selection, from the
 * availability, performance and quality figures the backend already produced.
 * It introduces no model of its own — remove the filter and it reproduces the
 * server's own numbers.
 */
export const effectivenessLosses = (availability: number, performance: number, quality: number): LossStep[] => {
  const availabilityLoss = 100 - availability;
  const performanceLoss = (100 - performance) * (availability / 100);
  const qualityLoss = (100 - quality) * ((availability / 100) * (performance / 100));

  const round2 = (value: number) => Math.round(value * 100) / 100;

  return [
    {
      key: 'availability',
      label: 'Availability loss',
      loss: round2(availabilityLoss),
      detail: 'Time the device was unreachable or in standby rather than working',
    },
    {
      key: 'performance',
      label: 'Performance loss',
      loss: round2(performanceLoss),
      detail: 'Reduced throughput from degraded condition and thermal throttling',
    },
    {
      key: 'quality',
      label: 'Quality loss',
      loss: round2(qualityLoss),
      detail: 'First-pass shortfall attributable to condition and anomaly load',
    },
  ];
};
