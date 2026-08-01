import { CHART_MARK, SERIES, SERIES_ALLPAIRS, SURFACE } from '@/config/viz';
import { formatCompact, formatNumber } from '@/utils/format';

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
  unit?: string;
  decimals?: number;
  /** Render as a dashed reference line rather than a data series (targets, thresholds). */
  reference?: boolean;
}

/**
 * Assign categorical hues in the fixed validated order — never cycled.
 * A ninth series is a design error, so the helper caps and reports rather
 * than inventing a hue.
 */
export const assignSeriesColors = <T extends { key: string; name: string }>(
  entries: readonly T[],
  mode: 'adjacent' | 'all-pairs' = 'adjacent',
): Array<T & { color: string }> => {
  const palette = mode === 'all-pairs' ? SERIES_ALLPAIRS : SERIES;
  if (entries.length > palette.length) {
    // Fold the tail into a single neutral "Other" slot rather than cycling hues.
    const head = entries.slice(0, palette.length - 1);
    const tail = entries[palette.length - 1];
    return [
      ...head.map((entry, i) => ({ ...entry, color: palette[i] })),
      { ...tail, name: 'Other', color: SURFACE.inkMuted },
    ];
  }
  return entries.map((entry, i) => ({ ...entry, color: palette[i] }));
};

/* Axis ticks and gridlines are additionally styled from CSS in `index.css`,
 * which wins over an SVG presentation attribute — so those two flip with the
 * theme even though the value below is only read once. The cursor tokens have no
 * CSS counterpart, so they are getters that read the live palette. */
export const axisDefaults = {
  stroke: 'transparent',
  tick: { fill: SURFACE.inkMuted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridDefaults = {
  stroke: SURFACE.gridline,
  strokeDasharray: CHART_MARK.gridDash,
  vertical: false,
} as const;

/** Crosshair on hover. Read at render time so it follows the theme. */
export const cursorDefaults = {
  get stroke() {
    return SURFACE.cursor;
  },
  strokeWidth: 1,
  strokeDasharray: '3 4',
};

/** Column highlight behind a hovered bar. */
export const barCursor = {
  get fill() {
    return SURFACE.barCursor;
  },
};

export const margin = { top: 8, right: 12, bottom: 0, left: -14 } as const;
export const marginWithEndLabels = { top: 8, right: 44, bottom: 0, left: -14 } as const;

/** Compact axis tick formatter: 12.4k, 940, 0.86. */
export const tickFormatter = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs >= 10_000) return formatCompact(value);
  if (abs >= 100) return formatNumber(value);
  if (abs >= 1) return formatNumber(value, 1);
  return formatNumber(value, 2);
};

/** Rounded 4px data-end anchored to the baseline. */
export const barRadius = CHART_MARK.barRadius;

export const gradientId = (key: string): string => `grad-${key.replace(/[^a-zA-Z0-9]/g, '')}`;
