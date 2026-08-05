import type { AssetRuntime } from '@/engine/types';
import { CHANNEL_COLOR, SERIES } from '@/config/viz';
import { SENSOR_RANGE } from '@/components/anomaly';
import { mean, stdDev } from '@/pages/anomaly-metrics/metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * Live stream channel specifications.
 *
 * Six channels, each rendered on its own. Nothing here derives a telemetry
 * value: samples are selected and averaged across the devices in scope, which
 * is a projection of readings the platform published rather than a measurement
 * of its own.
 *
 * The gauge ceiling is the one place a chart could quietly invent a limit, so
 * it is stated per channel and sourced two ways:
 *
 *   · `SENSOR_RANGE` where the platform publishes what the instrument can
 *     physically report — voltage, current, temperature and power factor
 *   · the peak observed in the retained window where it does not — active power
 *     and supply frequency
 *
 * The second kind is captioned as what it is, because an arc drawn against an
 * invented ceiling looks exactly like one drawn against a real limit.
 * ─────────────────────────────────────────────────────────────────────────── */

export type StreamChannelKey =
  | 'voltage'
  | 'current'
  | 'power'
  | 'temperature'
  | 'frequency'
  | 'powerFactor';

export interface ChannelSpec {
  key: StreamChannelKey;
  label: string;
  unit: string;
  decimals: number;
  /** Series colour. Read at call time so it follows the active theme. */
  color: string;
  /** Published instrument ceiling, or null when the platform states none. */
  ceiling: number | null;
  /** Whether this channel carries its own statistics card. */
  statistics: boolean;
  description: string;
}

/**
 * Built per call rather than held at module scope: `CHANNEL_COLOR` is mutated in
 * place on a theme change, and a captured copy would keep the outgoing palette.
 */
export const channelSpecs = (): ChannelSpec[] => [
  {
    key: 'voltage',
    label: 'Voltage',
    unit: 'V',
    decimals: 2,
    color: CHANNEL_COLOR.voltage ?? SERIES[0],
    ceiling: SENSOR_RANGE.voltage.max,
    statistics: true,
    description: 'RMS supply voltage measured at the device input.',
  },
  {
    key: 'current',
    label: 'Current',
    unit: 'A',
    decimals: 3,
    color: CHANNEL_COLOR.current ?? SERIES[2],
    ceiling: SENSOR_RANGE.current.max,
    statistics: true,
    description: 'RMS draw on the supply conductor.',
  },
  {
    key: 'power',
    label: 'Power',
    unit: 'W',
    decimals: 1,
    color: CHANNEL_COLOR.power ?? SERIES[1],
    ceiling: null,
    statistics: true,
    description: 'Active power. Always voltage × current × power factor, as published.',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    decimals: 1,
    color: CHANNEL_COLOR.temperature ?? SERIES[3],
    ceiling: SENSOR_RANGE.temperature.max,
    statistics: false,
    description: 'Enclosure temperature reported by the on-board probe.',
  },
  {
    key: 'frequency',
    label: 'Frequency',
    unit: 'Hz',
    decimals: 2,
    color: CHANNEL_COLOR.frequency ?? SERIES[4],
    ceiling: null,
    statistics: false,
    description: 'Supply frequency. Excursions originate upstream of the device.',
  },
  {
    key: 'powerFactor',
    label: 'Power Factor',
    unit: '',
    decimals: 3,
    color: CHANNEL_COLOR.powerFactor ?? SERIES[5],
    ceiling: SENSOR_RANGE.powerFactor.max,
    statistics: false,
    description: 'Displacement factor between current and voltage waveforms.',
  },
];

/* ─── Windowed series ────────────────────────────────────────────────────── */

export interface ChannelPoint {
  t: number;
  label: string;
  value: number;
}

/**
 * One channel over the retained window, for one device or averaged across the
 * devices in scope.
 *
 * Depth is the shortest window any device in scope actually holds, so every
 * point on the axis is an average of the same number of devices. Padding the
 * short ones would make a device that joined late look like a dip.
 */
export const channelWindow = (
  assets: readonly AssetRuntime[],
  channel: StreamChannelKey,
  depth: number,
): ChannelPoint[] => {
  const source = assets.filter((asset) => asset.history.length >= 2);
  if (source.length === 0) return [];

  const available = Math.min(depth, ...source.map((asset) => asset.history.length));
  if (!Number.isFinite(available) || available <= 0) return [];

  const windows = source.map((asset) => asset.history.slice(-available));

  return Array.from({ length: available }, (_, index) => {
    const readings = windows.map((window) => window[index][channel]);
    return {
      t: windows[0][index].t,
      label: windows[0][index].label,
      value: Math.round(mean(readings) * 1000) / 1000,
    };
  });
};

/* ─── Descriptive statistics ─────────────────────────────────────────────── */

export interface ChannelStats {
  samples: number;
  latest: number;
  min: number;
  max: number;
  mean: number;
  /** Population standard deviation across the window. */
  sigma: number;
  /** Peak-to-peak spread. */
  range: number;
}

/**
 * Descriptive statistics over the points already on screen.
 *
 * These summarise the plotted window; they are not a platform metric and no
 * threshold is applied to them. `mean` and `stdDev` are the shared helpers the
 * metric drill-downs already use, so the same window summarised on two pages
 * cannot disagree.
 */
export const channelStats = (points: readonly ChannelPoint[]): ChannelStats | null => {
  if (points.length === 0) return null;

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    samples: values.length,
    latest: values[values.length - 1],
    min,
    max,
    mean: mean(values),
    sigma: stdDev(values),
    range: max - min,
  };
};

/** Gauge ceiling for a channel: the published range, or the observed peak. */
export const gaugeCeiling = (spec: ChannelSpec, stats: ChannelStats | null): number => {
  if (spec.ceiling !== null) return spec.ceiling;
  if (!stats || stats.max <= 0) return 1;
  return stats.max;
};
