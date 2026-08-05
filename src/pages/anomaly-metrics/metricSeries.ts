import type { AnomalyRecord, AssetRuntime, TelemetryChannel } from '@/engine/types';
import { channelMeta } from '@/engine/catalog';
import { classifyRecord, breachRatio, type FaultRule } from '@/components/anomaly';

/* ───────────────────────────────────────────────────────────────────────────
 * Shared derivations for the metric drill-downs.
 *
 * Seven pages need overlapping windowed views of the same journal. Deriving them
 * here rather than in each page means a figure on one page cannot disagree with
 * the same figure on another — the tiles they drill down from already share the
 * module's analytics, and this keeps the deeper views on the same footing.
 *
 * Nothing here computes a domain figure. Grouping, bucketing and accumulation
 * only; every input is a field the platform published.
 * ─────────────────────────────────────────────────────────────────────────── */

const minuteFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Windows the trends are bucketed into, and how wide each one is. */
export const TREND_BUCKETS = 24;
export const TREND_BUCKET_MS = 120_000;

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

/** Population standard deviation — used for ping jitter. */
export const stdDev = (values: readonly number[]): number => {
  if (values.length < 2) return 0;
  const mu = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - mu) ** 2)));
};

export const ratioPct = (numerator: number, denominator: number): number | null =>
  denominator <= 0 ? null : Math.round((numerator / denominator) * 1000) / 10;

/* ─── Windowed journal ───────────────────────────────────────────────────── */

export interface JournalWindow {
  t: number;
  label: string;
  /** Raised inside this window. */
  raised: number;
  /** Cleared by the device inside this window. */
  cleared: number;
  /** Raised here and corroborated by the model. */
  corroborated: number;
  /** Raised here on the rule alone — the precision drag. */
  uncorroborated: number;
  /** Rolling precision across everything raised up to and including this window. */
  precisionPct: number | null;
  /** Events actioned (claimed or cleared) inside this window. */
  actioned: number;
  /** Running monetary total, in the caller's units. */
  cumulativeValue: number;
}

export interface WindowOptions {
  buckets?: number;
  bucketMs?: number;
  /** Value credited per actioned event, for the cumulative series. */
  valuePerActioned?: number;
}

/**
 * Bucket the journal into fixed windows.
 *
 * Precision is reported as a running figure rather than a per-window one: a
 * two-minute window holding three events would swing between 0% and 100% and
 * read as volatility in the detector rather than in the sample size.
 */
export const bucketJournal = (
  records: readonly AnomalyRecord[],
  now: number,
  options: WindowOptions = {},
): JournalWindow[] => {
  const buckets = options.buckets ?? TREND_BUCKETS;
  const bucketMs = options.bucketMs ?? TREND_BUCKET_MS;
  const valuePerActioned = options.valuePerActioned ?? 0;

  const out: JournalWindow[] = [];
  let runningTrue = 0;
  let runningFalse = 0;
  let runningValue = 0;

  for (let index = buckets - 1; index >= 0; index -= 1) {
    const to = now - index * bucketMs;
    const from = to - bucketMs;

    const raised = records.filter((record) => record.timestamp > from && record.timestamp <= to);
    const cleared = records.filter(
      (record) => record.resolvedAt !== null && record.resolvedAt > from && record.resolvedAt <= to,
    );

    const corroborated = raised.filter((record) => record.detectionMethod !== 'rule');
    const uncorroborated = raised.length - corroborated.length;

    runningTrue += corroborated.length;
    runningFalse += uncorroborated;

    const actioned = raised.filter((record) => record.status !== 'Active').length;
    runningValue += actioned * valuePerActioned;

    out.push({
      t: to,
      label: minuteFmt.format(new Date(to)),
      raised: raised.length,
      cleared: cleared.length,
      corroborated: corroborated.length,
      uncorroborated,
      precisionPct: ratioPct(runningTrue, runningTrue + runningFalse),
      actioned,
      cumulativeValue: Math.round(runningValue * 100) / 100,
    });
  }

  return out;
};

/* ─── Grouping ───────────────────────────────────────────────────────────── */

export interface ChannelGroup {
  channel: TelemetryChannel;
  label: string;
  /** Events attributed to this channel. */
  count: number;
  /** Of those, how many the model never backed. */
  uncorroborated: number;
  /** Mean breach against the device's own limit, per cent. */
  meanBreachPct: number;
}

/**
 * Group events by the channel their rule reads.
 *
 * This is the honest form of a "noise by channel" breakdown on this estate: the
 * detector evaluates nine channel rules, so the channel is a published property
 * of the event rather than an inferred one.
 */
export const groupByChannel = (records: readonly AnomalyRecord[], now: number): ChannelGroup[] => {
  const byChannel = new Map<TelemetryChannel, AnomalyRecord[]>();

  for (const record of records) {
    const rule: FaultRule | null = classifyRecord(record, now);
    if (!rule) continue;
    const bucket = byChannel.get(rule.channel) ?? [];
    bucket.push(record);
    byChannel.set(rule.channel, bucket);
  }

  return [...byChannel.entries()]
    .map(([channel, members]) => ({
      channel,
      label: channelMeta(channel).label,
      count: members.length,
      uncorroborated: members.filter((record) => record.detectionMethod === 'rule').length,
      meanBreachPct: Math.round(mean(members.map((record) => breachRatio(record) * 100)) * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count);
};

export interface CategoryGroup {
  category: string;
  /** Devices of this class in the estate. */
  devices: number;
  /** Devices of this class the platform rates at risk. */
  atRisk: number;
  /** At-risk devices with nothing raised against them. */
  missed: number;
  /** Devices carrying at least one open event. */
  flagged: number;
  /** Share of at-risk devices that were missed, per cent. */
  missRatePct: number | null;
}

/**
 * Miss rate per device class.
 *
 * A device the platform already rates critical or high-risk while nothing has
 * been raised against it is a breakdown the detector did not see. Splitting that
 * by class shows whether the gap is a model problem or a hardware-class problem.
 */
export const groupMissesByCategory = (
  assets: readonly AssetRuntime[],
  unresolved: readonly AnomalyRecord[],
): CategoryGroup[] => {
  const flaggedIds = new Set(unresolved.map((record) => record.assetId));
  const byCategory = new Map<string, AssetRuntime[]>();

  for (const asset of assets) {
    const bucket = byCategory.get(asset.category) ?? [];
    bucket.push(asset);
    byCategory.set(asset.category, bucket);
  }

  return [...byCategory.entries()]
    .map(([category, members]) => {
      const atRisk = members.filter(
        (asset) =>
          asset.band === 'critical' || asset.riskTier === 'critical' || asset.riskTier === 'high',
      );
      const missed = atRisk.filter((asset) => !flaggedIds.has(asset.device.assetId));

      return {
        category,
        devices: members.length,
        atRisk: atRisk.length,
        missed: missed.length,
        flagged: members.filter((asset) => flaggedIds.has(asset.device.assetId)).length,
        missRatePct: ratioPct(missed.length, atRisk.length),
      };
    })
    .sort((a, b) => b.missed - a.missed || a.category.localeCompare(b.category));
};

/* ─── Histogram ──────────────────────────────────────────────────────────── */

export interface LatencyBin {
  label: string;
  from: number;
  to: number;
  count: number;
  sharePct: number;
  /** True when the whole bin sits inside the SLA. */
  withinSla: boolean;
}

/**
 * Bucket round-trip observations against the SLA boundary.
 *
 * Edges are fixed so the shape stays comparable between visits, and the SLA
 * boundary is an edge rather than falling inside a bin — otherwise a bin
 * straddling the target could not be coloured honestly.
 */
export const bucketLatency = (values: readonly number[], slaMs: number): LatencyBin[] => {
  const edges = [0, 50, 100, slaMs, 500, 1000, 2000, 5000];
  const total = Math.max(1, values.length);

  return edges.map((from, index) => {
    const to = index === edges.length - 1 ? Number.POSITIVE_INFINITY : edges[index + 1];
    const count = values.filter((value) => value >= from && value < to).length;

    return {
      label: to === Number.POSITIVE_INFINITY ? `≥ ${from / 1000}s` : `${from}–${to}`,
      from,
      to,
      count,
      sharePct: Math.round((count / total) * 1000) / 10,
      withinSla: to <= slaMs,
    };
  });
};

/* ─── Devices at risk ────────────────────────────────────────────────────── */

export interface RiskRow {
  asset: AssetRuntime;
  /** Open events currently raised against this device. */
  open: number;
  /** True when the platform rates it at risk and nothing has been raised. */
  missed: boolean;
}

export const riskRows = (
  assets: readonly AssetRuntime[],
  unresolved: readonly AnomalyRecord[],
): RiskRow[] => {
  const openByAsset = new Map<string, number>();
  for (const record of unresolved) {
    openByAsset.set(record.assetId, (openByAsset.get(record.assetId) ?? 0) + 1);
  }

  return assets
    .map((asset) => {
      const open = openByAsset.get(asset.device.assetId) ?? 0;
      const atRisk =
        asset.band === 'critical' || asset.riskTier === 'critical' || asset.riskTier === 'high';
      return { asset, open, missed: atRisk && open === 0 };
    })
    .sort(
      (a, b) =>
        Number(b.missed) - Number(a.missed) ||
        a.asset.prediction.primary.rulDays - b.asset.prediction.primary.rulDays,
    );
};
