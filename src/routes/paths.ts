export const PATHS = {
  /** Branding screen — the only thing shown before the dashboard. */
  branding: '/',
  /** The Enterprise Cockpit — landing surface after sign-in and the module hub. */
  cockpit: '/app/cockpit',
  devices: '/app/devices',
  deviceDetail: '/app/devices/:assetId',
  telemetry: '/app/live-telemetry',
  anomaly: '/app/anomaly-detection',
  /* Anomaly drill-downs. Nested under the module path so `navItemByPath` and the
   * sidebar's NavLink both resolve them to Anomaly Detection by prefix — a
   * sibling path would silently un-highlight the module the user is still in. */
  anomalyLiveStatus: '/app/anomaly-detection/details/live-status',
  anomalyActiveEvents: '/app/anomaly-detection/details/active-events',
  anomalyCategoryBreakdown: '/app/anomaly-detection/details/category-breakdown',
  anomalyTaxonomySignatures: '/app/anomaly-detection/details/taxonomy-signatures',
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
