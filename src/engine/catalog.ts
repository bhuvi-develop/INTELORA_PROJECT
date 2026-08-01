import type { ChannelMeta, DeviceCategory } from './types';

/* ───────────────────────────────────────────────────────────────────────────
 * Display metadata.
 *
 * This module once held the device register and generated the fleet. It no
 * longer does: the estate is commissioned in PostgreSQL and served by FastAPI,
 * and the interface learns what exists by asking.
 *
 * What remains is how to label what arrives — the unit and precision each
 * telemetry channel is rendered with — plus two facet lists the store fills
 * from the asset register so filter dropdowns can be built without every page
 * issuing its own request.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Telemetry channels, in publication order, with the unit and precision each is
 * displayed at. The values themselves always come from the backend.
 */
export const CHANNELS: ChannelMeta[] = [
  { key: 'voltage', label: 'Voltage', unit: 'V', decimals: 2 },
  { key: 'current', label: 'Current', unit: 'A', decimals: 3 },
  { key: 'power', label: 'Power', unit: 'W', decimals: 1 },
  { key: 'energy', label: 'Energy', unit: 'kWh', decimals: 3 },
  { key: 'frequency', label: 'Frequency', unit: 'Hz', decimals: 2 },
  { key: 'powerFactor', label: 'Power Factor', unit: '', decimals: 3 },
  { key: 'temperature', label: 'Temperature', unit: '°C', decimals: 1 },
  { key: 'health', label: 'Health Score', unit: '%', decimals: 1 },
];

export const channelMeta = (key: string): ChannelMeta =>
  CHANNELS.find((channel) => channel.key === key) ?? CHANNELS[0];

/* ─── Platform configuration ─────────────────────────────────────────────── */

/**
 * Sensor publication interval, in milliseconds.
 *
 * Seeded with the MIKOS default and replaced by the value the backend reports,
 * so a panel that tells an operator how often a device samples is quoting the
 * running configuration rather than an assumption compiled into the bundle.
 */
export let TICK_MS = 1_000;

/** Degradation clock multiplier the backend is running its live stream at. */
export let WEAR_TIME_SCALE = 60;

export const applyPlatformConfig = (config: {
  tickIntervalSeconds?: number;
  wearTimeScale?: number;
}): void => {
  if (typeof config.tickIntervalSeconds === 'number' && config.tickIntervalSeconds > 0) {
    TICK_MS = config.tickIntervalSeconds * 1000;
  }
  if (typeof config.wearTimeScale === 'number' && config.wearTimeScale > 0) {
    WEAR_TIME_SCALE = config.wearTimeScale;
  }
};

/* ─── Fleet facets ───────────────────────────────────────────────────────── */

/**
 * Categories and brands present in the commissioned estate.
 *
 * Filled by the platform store from the asset register and mutated in place so
 * the exported reference stays stable for anything that captured it. These are
 * facets of what the backend returned, never a list of what the interface
 * expects to exist.
 */
export const DEVICE_CATEGORIES: DeviceCategory[] = [];

export const DEVICE_BRANDS: string[] = [];

export const applyFleetFacets = (categories: string[], brands: string[]): void => {
  DEVICE_CATEGORIES.length = 0;
  DEVICE_CATEGORIES.push(...(categories as DeviceCategory[]));

  DEVICE_BRANDS.length = 0;
  DEVICE_BRANDS.push(...brands);
};
