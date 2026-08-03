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
  /* Anomaly drill-downs. Nested under the module path so `navItemByPath` and the
   * sidebar's NavLink both resolve them to Anomaly Detection by prefix — a
   * sibling path would silently un-highlight the module the user is still in. */
  anomalyLiveStatus: '/app/anomaly-detection/details/live-status',
  anomalyActiveEvents: '/app/anomaly-detection/details/active-events',
  anomalyCategoryBreakdown: '/app/anomaly-detection/details/category-breakdown',
  anomalyTaxonomySignatures: '/app/anomaly-detection/details/taxonomy-signatures',
  /* Stream analytics, opened from the two entry cards on the module overview.
   * Same nesting rule as the drill-downs above. */
  anomalyDetectionTimeline: '/app/anomaly-detection/detection-timeline',
  anomalyLiveStream: '/app/anomaly-detection/live-stream',
  /** Module-scoped anomaly report — the journal with its taxonomy, exportable. */
  anomalyReports: '/app/anomaly-detection/reports',
  /**
   * Feedback log report — engineer verdicts and the rule-only detections awaiting
   * one. The only surface that can flag a false alarm, so it is a page in its own
   * right rather than a table embedded in the analytics view.
   */
  anomalyFeedbackReport: '/app/anomaly-detection/reports/feedback',
  /* Detection-quality metric drill-downs, one per KPI tile. Same nesting rule as
   * the status-bar drill-downs above. */
  metricFalsePositives: '/app/anomaly-detection/metrics/false-positives',
  metricFalseNegatives: '/app/anomaly-detection/metrics/false-negatives',
  metricLatencySla: '/app/anomaly-detection/metrics/latency-sla',
  metricPredictionHorizon: '/app/anomaly-detection/metrics/prediction-horizon',
  metricRecommendationAcceptance: '/app/anomaly-detection/metrics/recommendation-acceptance',
  metricBusinessImpact: '/app/anomaly-detection/metrics/business-impact',
  metricEngineeringConfidence: '/app/anomaly-detection/metrics/engineering-confidence',
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
