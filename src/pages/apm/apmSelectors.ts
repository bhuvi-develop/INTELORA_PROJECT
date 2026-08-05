import type { ApmAssetDto, ApmWorkOrder } from '@/services/apm.types';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from '@/utils/format';
import type { ReportColumn } from '@/utils/report';

/* ───────────────────────────────────────────────────────────────────────────
 * Shared derivations for the APM analytics pages.
 *
 * Grouping, filtering, ranking and formatting only. Every figure below already
 * arrived decided from the APM engine — nothing here recomputes a health index,
 * a criticality score or a reliability metric, and removing any of it would
 * change a layout rather than a number.
 *
 * Nine pages read the same `/apm/overview` payload and slice it differently.
 * Deriving those slices here rather than in each page is what keeps the same
 * asset from being described two ways on two screens.
 * ─────────────────────────────────────────────────────────────────────────── */

export const ALL = 'all';

export interface ApmFilters {
  category: string;
  criticality: string;
  riskTier: string;
  band: string;
}

export const DEFAULT_APM_FILTERS: ApmFilters = {
  category: ALL,
  criticality: ALL,
  riskTier: ALL,
  band: ALL,
};

export const apmFilterCount = (filters: ApmFilters): number =>
  Object.values(filters).filter((value) => value !== ALL).length;

export const applyApmFilters = (
  assets: readonly ApmAssetDto[],
  filters: ApmFilters,
): ApmAssetDto[] =>
  assets.filter((asset) => {
    if (filters.category !== ALL && asset.category !== filters.category) return false;
    if (filters.criticality !== ALL && asset.criticality_code !== filters.criticality) return false;
    if (filters.riskTier !== ALL && asset.risk_tier !== filters.riskTier) return false;
    if (filters.band !== ALL && asset.health_index_band !== filters.band) return false;
    return true;
  });

/** Distinct values present in the payload, so a dropdown never offers a dead option. */
export const facet = (
  assets: readonly ApmAssetDto[],
  pick: (asset: ApmAssetDto) => string | undefined,
): string[] =>
  [...new Set(assets.map(pick).filter((value): value is string => Boolean(value)))].sort();

/* ─── Colour ─────────────────────────────────────────────────────────────── */

export const BAND_COLOR: Record<string, string> = {
  healthy: STATUS_COLOR.good,
  good: SERIES[0],
  warning: STATUS_COLOR.warning,
  critical: STATUS_COLOR.critical,
};

export const RISK_COLOR: Record<string, string> = {
  critical: STATUS_COLOR.critical,
  high: STATUS_COLOR.serious,
  medium: STATUS_COLOR.warning,
  low: STATUS_COLOR.good,
};

export const bandColor = (band: string | undefined): string =>
  BAND_COLOR[String(band).toLowerCase()] ?? SERIES[0];

export const riskColor = (tier: string | undefined): string =>
  RISK_COLOR[String(tier).toLowerCase()] ?? SERIES[0];

/* ─── Grouping ───────────────────────────────────────────────────────────── */

export interface CountRow {
  label: string;
  count: number;
  color: string;
}

/** Count assets by a discrete property, largest first. */
export const countBy = (
  assets: readonly ApmAssetDto[],
  pick: (asset: ApmAssetDto) => string | undefined,
  colorFor: (key: string) => string = () => SERIES[0],
): CountRow[] => {
  const tally = new Map<string, number>();
  for (const asset of assets) {
    const key = pick(asset);
    if (!key) continue;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count, color: colorFor(label) }))
    .sort((a, b) => b.count - a.count);
};

export interface MeanRow {
  label: string;
  value: number;
  count: number;
}

/** Mean of one numeric field, grouped by a discrete one. */
export const meanBy = (
  assets: readonly ApmAssetDto[],
  group: (asset: ApmAssetDto) => string | undefined,
  value: (asset: ApmAssetDto) => number | undefined,
): MeanRow[] => {
  const buckets = new Map<string, number[]>();
  for (const asset of assets) {
    const key = group(asset);
    const reading = value(asset);
    if (!key || reading === undefined || !Number.isFinite(reading)) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(reading);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .map(([label, readings]) => ({
      label,
      count: readings.length,
      value: Math.round((readings.reduce((sum, r) => sum + r, 0) / readings.length) * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value);
};

/** Top N assets by a numeric field. Pass `asc` for "worst first" on a low-is-bad metric. */
export const rankBy = (
  assets: readonly ApmAssetDto[],
  value: (asset: ApmAssetDto) => number | undefined,
  limit = 12,
  direction: 'asc' | 'desc' = 'desc',
): ApmAssetDto[] =>
  [...assets]
    .filter((asset) => Number.isFinite(value(asset)))
    .sort((a, b) => {
      const left = value(a) ?? 0;
      const right = value(b) ?? 0;
      return direction === 'asc' ? left - right : right - left;
    })
    .slice(0, limit);

/* ─── Histogram ──────────────────────────────────────────────────────────── */

export interface HistogramBin {
  label: string;
  count: number;
  from: number;
  to: number;
}

/**
 * Fixed-edge histogram, so the shape stays comparable between visits.
 * A histogram that rescales its own bins makes a stable estate and a degrading
 * one look identical.
 */
export const histogram = (
  values: readonly number[],
  edges: readonly number[],
  suffix = '',
): HistogramBin[] =>
  edges.slice(0, -1).map((from, index) => {
    const to = edges[index + 1];
    const last = index === edges.length - 2;
    return {
      label: `${from}–${to}${suffix}`,
      from,
      to,
      count: values.filter((value) => value >= from && (last ? value <= to : value < to)).length,
    };
  });

/* ─── Export ─────────────────────────────────────────────────────────────── */

/**
 * The asset export, shared by every page that offers one.
 *
 * One column set means a CSV taken from the reliability page and one taken from
 * the cost page can be joined on asset id without reconciling headers first.
 */
export const APM_ASSET_COLUMNS: Array<ReportColumn<ApmAssetDto>> = [
  { header: 'Asset ID', value: (row) => row.asset_id },
  { header: 'Asset Name', value: (row) => row.asset_name },
  { header: 'Category', value: (row) => row.category },
  { header: 'Brand', value: (row) => row.brand },
  { header: 'Model', value: (row) => row.model },
  { header: 'Status', value: (row) => row.status },
  { header: 'Health Index', value: (row) => row.health_index, numeric: true },
  { header: 'Health Band', value: (row) => row.health_index_band },
  { header: 'PdM Health Score', value: (row) => row.inputs?.predictive?.health_score ?? '', numeric: true },
  { header: 'RUL Days', value: (row) => row.inputs?.predictive?.rul_days ?? '', numeric: true },
  { header: 'Failure Probability', value: (row) => row.inputs?.predictive?.failure_probability ?? '', numeric: true },
  { header: 'Open Anomalies', value: (row) => row.inputs?.anomaly_detection?.open_total ?? '', numeric: true },
  { header: 'Availability %', value: (row) => row.availability_pct, numeric: true },
  { header: 'Inherent Availability %', value: (row) => row.inherent_availability_pct, numeric: true },
  { header: 'MTBF Hours', value: (row) => row.mtbf_hours, numeric: true },
  { header: 'MTTR Minutes', value: (row) => row.mttr_minutes, numeric: true },
  { header: 'Failure Rate /1000h', value: (row) => row.failure_rate_per_1000h, numeric: true },
  { header: 'Failures', value: (row) => row.failures, numeric: true },
  { header: 'Downtime Hours', value: (row) => row.downtime_hours, numeric: true },
  { header: 'Downtime Cost', value: (row) => row.downtime_cost, numeric: true },
  { header: 'Utilisation %', value: (row) => row.utilisation_pct, numeric: true },
  { header: 'Effective Age Days', value: (row) => row.effective_age_days, numeric: true },
  { header: 'Criticality Score', value: (row) => row.criticality_score, numeric: true },
  { header: 'Criticality', value: (row) => row.criticality_label },
  { header: 'Risk Score', value: (row) => row.risk_score, numeric: true },
  { header: 'Risk Tier', value: (row) => row.risk_tier },
  { header: 'Risk Driver', value: (row) => row.risk_driver },
  { header: 'Priority', value: (row) => row.priority },
  { header: 'Priority Rank', value: (row) => row.priority_rank, numeric: true },
  { header: 'Cost Exposure', value: (row) => row.cost_exposure, numeric: true },
  { header: 'Lifecycle Decision', value: (row) => row.lifecycle_decision },
  { header: 'Open Work Orders', value: (row) => row.open_work_orders, numeric: true },
  {
    header: 'Recommended Action',
    value: (row) => String((row.recommended_action as Record<string, unknown>)?.action ?? ''),
  },
];

/* ─── Formatting ─────────────────────────────────────────────────────────── */

/** A ratio with no denominator is unknown, not zero. */
export const orDash = (value: number | undefined, decimals = 1, suffix = ''): string =>
  value === undefined || !Number.isFinite(value) ? '—' : `${formatNumber(value, decimals)}${suffix}`;

export const pct = (value: number | undefined, decimals = 1): string =>
  value === undefined || !Number.isFinite(value) ? '—' : formatPercent(value, decimals);

export const money = (value: number | undefined): string =>
  value === undefined || !Number.isFinite(value) ? '—' : formatCurrency(value);

/** Recommended action text, which the engine nests under its own object. */
export const recommendedAction = (asset: ApmAssetDto): string =>
  String(
    (asset.recommended_action as Record<string, unknown>)?.action ??
      asset.lifecycle_decision ??
      'No action recommended',
  );

/* ─── Work order export ──────────────────────────────────────────────────── */

/**
 * The work order export column set.
 *
 * Held beside the asset column set rather than in the table component, so a
 * report page can offer the export without importing a React component to get
 * at its headers.
 */
export const WORK_ORDER_COLUMNS: Array<ReportColumn<ApmWorkOrder>> = [
  { header: 'Work Order', value: (row) => row.work_order_id },
  { header: 'Asset ID', value: (row) => row.asset_id },
  { header: 'Asset Name', value: (row) => row.asset_name ?? '' },
  { header: 'Category', value: (row) => row.category ?? '' },
  { header: 'Title', value: (row) => row.title ?? '' },
  { header: 'Type', value: (row) => row.work_order_type ?? '' },
  { header: 'Origin', value: (row) => row.origin ?? '' },
  { header: 'Planned', value: (row) => (row.planned ? 'Planned' : 'Reactive') },
  { header: 'Priority', value: (row) => row.priority ?? '' },
  { header: 'Priority Score', value: (row) => row.priority_score ?? '', numeric: true },
  { header: 'Status', value: (row) => row.status },
  { header: 'Assignee', value: (row) => row.assignee ?? '' },
  { header: 'Component', value: (row) => row.component ?? '' },
  { header: 'Raised', value: (row) => (row.raised_at ? formatDateTime(new Date(row.raised_at).getTime()) : '') },
  { header: 'Due', value: (row) => (row.due_at ? formatDateTime(new Date(row.due_at).getTime()) : '') },
  { header: 'Age Days', value: (row) => row.age_days ?? '', numeric: true },
  { header: 'Estimated Hours', value: (row) => row.estimated_hours ?? '', numeric: true },
  { header: 'Estimated Cost', value: (row) => row.estimated_cost ?? '', numeric: true },
  { header: 'Risk Score', value: (row) => row.risk_score ?? '', numeric: true },
];

