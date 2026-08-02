export const PATHS = {
  /** Branding screen — the only thing shown before the dashboard. */
  branding: '/',
  /** The Enterprise Cockpit — landing surface after sign-in and the module hub. */
  cockpit: '/app/cockpit',
  devices: '/app/devices',
  deviceDetail: '/app/devices/:assetId',
  telemetry: '/app/live-telemetry',
  anomaly: '/app/anomaly-detection',
  predictive: '/app/predictive-maintenance',
  preventive: '/app/preventive-maintenance',
  prescriptive: '/app/prescriptive-maintenance',
  apm: '/app/asset-performance',
  /* APM decision dashboard — the view served from the /api/apm/* engine rather
   * than from the live telemetry snapshot. Nested under the module path so the
   * sidebar keeps Asset Performance highlighted by prefix. */
  apmDashboard: '/app/asset-performance/dashboard',
  /* One analytics page per APM section, all nested under the module path so the
   * sidebar keeps Asset Performance highlighted by prefix. */
  apmAssets: '/app/asset-performance/assets',
  apmReliability: '/app/asset-performance/reliability',
  apmMaintenance: '/app/asset-performance/maintenance',
  apmAvailability: '/app/asset-performance/availability',
  apmHealth: '/app/asset-performance/health',
  apmCost: '/app/asset-performance/cost',
  apmCriticality: '/app/asset-performance/criticality',
  apmWorkOrders: '/app/asset-performance/workorders',
  apmReports: '/app/asset-performance/reports',
  oee: '/app/oee',
  reports: '/app/historical-reports',
  settings: '/app/settings',
} as const;

export const deviceDetailPath = (assetId: string): string => `/app/devices/${assetId}`;

export type AppPath = (typeof PATHS)[keyof typeof PATHS];
