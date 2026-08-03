export const PATHS = {
  /** Branding screen — the only thing shown before the workspace. */
  branding: '/',
  /** The empty workspace. Nothing loads until a module is chosen. */
  workspace: '/app',
  /** The Enterprise Cockpit — one module among several, no longer the landing. */
  cockpit: '/app/cockpit',
  devices: '/app/devices',
  deviceDetail: '/app/devices/:assetId',
  telemetry: '/app/live-telemetry',
  anomaly: '/app/anomaly-detection',
  predictive: '/app/predictive-maintenance',
  preventive: '/app/preventive-maintenance',
  prescriptive: '/app/prescriptive-maintenance',
  apm: '/app/asset-performance',
  oee: '/app/oee',
  reports: '/app/historical-reports',
  settings: '/app/settings',
} as const;

export const deviceDetailPath = (assetId: string): string => `/app/devices/${assetId}`;

export type AppPath = (typeof PATHS)[keyof typeof PATHS];
