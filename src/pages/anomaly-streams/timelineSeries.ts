import type { AnomalyRecord, AssetRuntime, DailyTelemetryRecord, Severity } from '@/engine/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Shared derivations for the detection timeline.
 *
 * Grouping, bucketing and ordering only. Every count below is a tally of
 * records the backend delivered — nothing here judges, scores or invents an
 * event, and removing any of it would change a layout rather than a number.
 *
 * Two sources, deliberately kept apart because they cover different spans:
 *
 *   · the live journal (`/api/anomalies`) is the detector's in-memory record,
 *     so it reaches back as far as the backend process has been running. It is
 *     what the hourly view is built from.
 *   · the daily archive (`/api/reports/daily`) is PostgreSQL-backed and covers
 *     thirty days, carrying the stored anomaly count per device per day. It is
 *     what the daily, weekly and monthly views are built from.
 *
 * Mixing them would produce a chart whose left half and right half were counted
 * by different mechanisms, so each view states which source it read.
 * ─────────────────────────────────────────────────────────────────────────── */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

export interface TrendBucket {
  /** Stable key for the row, and the react key for the chart. */
  key: string;
  /** Category-axis label. */
  label: string;
  /** Start of the window this bucket covers. */
  t: number;
  /** Events attributed to the window. */
  events: number;
}

/* ─── Live journal ───────────────────────────────────────────────────────── */

export const SEVERITIES: Severity[] = ['Critical', 'Major', 'Warning', 'Info'];

/** Records of one severity, newest first. */
export const bySeverity = (records: readonly AnomalyRecord[], severity: Severity): AnomalyRecord[] =>
  records.filter((record) => record.severity === severity).sort((a, b) => b.timestamp - a.timestamp);

/**
 * Hourly tally over the journal.
 *
 * Bins are anchored on the hour so the axis is stable between renders rather
 * than sliding with the clock. Windows before the journal starts are reported
 * as empty rather than dropped — a gap is a fact about the record, and hiding
 * it would make a short history read as a quiet one.
 */
export const bucketByHour = (
  records: readonly AnomalyRecord[],
  now: number,
  hours = 24,
): TrendBucket[] => {
  const out: TrendBucket[] = [];
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;

  for (let index = hours - 1; index >= 0; index -= 1) {
    const from = currentHour - index * HOUR_MS;
    const to = from + HOUR_MS;

    out.push({
      key: String(from),
      label: `${hourFmt.format(new Date(from))}:00`,
      t: from,
      events: records.filter((record) => record.timestamp >= from && record.timestamp < to).length,
    });
  }

  return out;
};

/** Oldest event in the journal, or null when it is empty. */
export const journalStart = (records: readonly AnomalyRecord[]): number | null =>
  records.length === 0 ? null : records.reduce((oldest, r) => Math.min(oldest, r.timestamp), Infinity);

/* ─── Daily archive ──────────────────────────────────────────────────────── */

/**
 * Daily totals from the stored archive.
 *
 * The archive is one row per device per day, so the day total is the sum across
 * devices. Days the archive does not cover simply do not appear; none are
 * synthesised to pad the axis.
 */
export const bucketDaily = (records: readonly DailyTelemetryRecord[]): TrendBucket[] => {
  const byDay = new Map<number, number>();

  for (const record of records) {
    const day = Math.floor(record.date / DAY_MS) * DAY_MS;
    byDay.set(day, (byDay.get(day) ?? 0) + record.anomalies);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, events]) => ({ key: String(t), label: dayFmt.format(new Date(t)), t, events }));
};

/**
 * Seven-day windows, anchored on the most recent day covered.
 *
 * Anchored rather than calendar-aligned on purpose: a calendar week that the
 * archive only covers two days of would read as a quiet week rather than a
 * partial one. Anchoring makes every bucket except possibly the oldest cover
 * the same seven days.
 */
export const bucketWeekly = (daily: readonly TrendBucket[]): TrendBucket[] => {
  if (daily.length === 0) return [];

  const newest = daily[daily.length - 1].t;
  const byWindow = new Map<number, number>();

  for (const day of daily) {
    const index = Math.floor((newest - day.t) / (7 * DAY_MS));
    const start = newest - index * 7 * DAY_MS - 6 * DAY_MS;
    byWindow.set(start, (byWindow.get(start) ?? 0) + day.events);
  }

  return [...byWindow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, events]) => ({
      key: String(t),
      label: `${dayFmt.format(new Date(t))} – ${dayFmt.format(new Date(t + 6 * DAY_MS))}`,
      t,
      events,
    }));
};

/** Calendar-month totals from the same archive. */
export const bucketMonthly = (daily: readonly TrendBucket[]): TrendBucket[] => {
  const byMonth = new Map<number, number>();

  for (const day of daily) {
    const date = new Date(day.t);
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    byMonth.set(start, (byMonth.get(start) ?? 0) + day.events);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, events]) => ({ key: String(t), label: monthFmt.format(new Date(t)), t, events }));
};

/* ─── Attribution ────────────────────────────────────────────────────────── */

export interface DeviceTally {
  label: string;
  assetId: string;
  assetName: string;
  category: string;
  events: number;
  active: number;
  critical: number;
}

/** Events per device across the journal, busiest first. */
export const topDevices = (records: readonly AnomalyRecord[], limit = 12): DeviceTally[] => {
  return deviceTallies(records).slice(0, limit);
};

/** Every device that has raised at least one event, busiest first. */
export const deviceTallies = (records: readonly AnomalyRecord[]): DeviceTally[] => {
  const byAsset = new Map<string, DeviceTally>();

  for (const record of records) {
    const entry = byAsset.get(record.assetId) ?? {
      label: record.assetId,
      assetId: record.assetId,
      assetName: record.assetName,
      category: record.category,
      events: 0,
      active: 0,
      critical: 0,
    };

    entry.events += 1;
    if (record.status === 'Active') entry.active += 1;
    if (record.severity === 'Critical') entry.critical += 1;
    byAsset.set(record.assetId, entry);
  }

  return [...byAsset.values()].sort((a, b) => b.events - a.events);
};

/* ─── Filtering ──────────────────────────────────────────────────────────── */

/**
 * What the global filter bar can actually narrow on.
 *
 * Deliberately not "factory" or "site": the asset register holds asset id, name,
 * category, brand, model and status and nothing else — there is no location
 * hierarchy anywhere in the platform to filter by. Offering an empty Factory
 * dropdown would imply the estate has one.
 */
export interface TimelineFilters {
  /** Hours back from now. `0` means every record held. */
  rangeHours: number;
  assetId: string;
  category: string;
  brand: string;
  severity: string;
  status: string;
}

export const ALL = 'all';

export const DEFAULT_FILTERS: TimelineFilters = {
  rangeHours: 0,
  assetId: ALL,
  category: ALL,
  brand: ALL,
  severity: ALL,
  status: ALL,
};

export const activeFilterCount = (filters: TimelineFilters): number =>
  (filters.rangeHours === 0 ? 0 : 1) +
  [filters.assetId, filters.category, filters.brand, filters.severity, filters.status].filter(
    (value) => value !== ALL,
  ).length;

/**
 * Narrow the journal.
 *
 * Brand is not carried on the event, so it is resolved through the asset
 * register by id. A record whose device is no longer in the register keeps its
 * place unless brand is actually being filtered on — dropping it silently would
 * make the totals disagree with the unfiltered view for no stated reason.
 */
export const applyFilters = (
  records: readonly AnomalyRecord[],
  filters: TimelineFilters,
  brandById: ReadonlyMap<string, string>,
  now: number,
): AnomalyRecord[] => {
  const from = filters.rangeHours > 0 ? now - filters.rangeHours * HOUR_MS : null;

  return records.filter((record) => {
    if (from !== null && record.timestamp < from) return false;
    if (filters.assetId !== ALL && record.assetId !== filters.assetId) return false;
    if (filters.category !== ALL && record.category !== filters.category) return false;
    if (filters.severity !== ALL && record.severity !== filters.severity) return false;
    if (filters.status !== ALL && record.status !== filters.status) return false;
    if (filters.brand !== ALL && brandById.get(record.assetId) !== filters.brand) return false;
    return true;
  });
};

/** Asset id → brand, for the dimensions the event record does not carry. */
export const brandIndex = (assets: readonly AssetRuntime[]): Map<string, string> =>
  new Map(assets.map((asset) => [asset.device.assetId, asset.device.brand]));

/* ─── Distributions ──────────────────────────────────────────────────────── */

export interface Slice {
  key: string;
  name: string;
  value: number;
  color: string;
}

/** Journal split by severity, in fixed severity order. */
export const severitySplit = (
  records: readonly AnomalyRecord[],
  colorFor: (severity: Severity) => string,
): Slice[] =>
  SEVERITIES.map((severity) => ({
    key: severity,
    name: severity,
    value: records.filter((record) => record.severity === severity).length,
    color: colorFor(severity),
  }));

export interface GroupRow {
  label: string;
  total: number;
  Critical: number;
  Major: number;
  Warning: number;
  Info: number;
}

/**
 * Events per device class, split by severity.
 *
 * Device class stands in for the plant hierarchy the estate does not have. It is
 * a published property of every event, so the grouping is measured rather than
 * assumed.
 */
export const groupBy = (
  records: readonly AnomalyRecord[],
  pick: (record: AnomalyRecord) => string | undefined,
): GroupRow[] => {
  const byKey = new Map<string, GroupRow>();

  for (const record of records) {
    const key = pick(record);
    if (!key) continue;

    const row = byKey.get(key) ?? {
      label: key,
      total: 0,
      Critical: 0,
      Major: 0,
      Warning: 0,
      Info: 0,
    };
    row.total += 1;
    row[record.severity] += 1;
    byKey.set(key, row);
  }

  return [...byKey.values()].sort((a, b) => b.total - a.total);
};

/* ─── Heatmap ────────────────────────────────────────────────────────────── */

export const HEATMAP_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export interface HeatCell {
  row: string;
  col: number;
  value: number;
}

/**
 * Severity against hour of day.
 *
 * Hour is taken from the event's own timestamp in the viewer's zone, so a cell
 * is a count of records rather than a rate. Every hour is present even when
 * empty: a missing column would compress the axis and make a quiet night look
 * like a short history.
 */
export const severityByHour = (records: readonly AnomalyRecord[]): HeatCell[] => {
  const cells: HeatCell[] = [];

  for (const severity of SEVERITIES) {
    for (const hour of HEATMAP_HOURS) {
      cells.push({
        row: severity,
        col: hour,
        value: records.filter(
          (record) => record.severity === severity && new Date(record.timestamp).getHours() === hour,
        ).length,
      });
    }
  }

  return cells;
};
