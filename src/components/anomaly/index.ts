/* Anomaly detection module.
 *
 * Everything here is owned by the anomaly view. The state lives in
 * `useAnomalyModule`, which reads the shared engine snapshot and writes nothing
 * back to it, so a drill-down on this page cannot change what any other module
 * renders. Nothing outside `src/pages/AnomalyDetectionPage.tsx` imports from
 * this folder. */

export { TaxonomyStatusBar } from './TaxonomyStatusBar';
export type { TaxonomyStatusBarProps } from './TaxonomyStatusBar';

export { FailureClassification } from './FailureClassification';
export type { FailureClassificationProps } from './FailureClassification';

export { DetectionQualityGrid } from './DetectionQualityGrid';
export type { DetectionQualityGridProps } from './DetectionQualityGrid';

/* One definition per KPI — read by the overview tiles for their identity and by
 * the drill-downs for the working behind the figure. */
export { METRIC_CARDS, metricCard, metricDetail } from './metricCatalog';
export type {
  MetricCard,
  MetricChartForm,
  MetricComposition,
  MetricDetail,
  MetricKey,
  MetricStat,
  MetricTerm,
} from './metricCatalog';

export { StreamNavGrid } from './StreamNavGrid';

export { TaxonomyReference } from './TaxonomyReference';
export type { TaxonomyReferenceProps } from './TaxonomyReference';

export { EventDetailDrawer } from './EventDetailDrawer';
export type { EventDetailDrawerProps } from './EventDetailDrawer';

export { useAnomalyModule, parameterContribution } from './useAnomalyModule';
export type {
  AnomalyModule,
  AnomalyModuleState,
  ClassTally,
  ContributionSlice,
  DetectionQuality,
  LiveStatus,
  SignalIsolation,
  StatusCheck,
  TaxonomyBreakdown,
} from './useAnomalyModule';

export {
  BROADCAST_SLA_MS,
  CHANNELS_FOR_CLASS,
  COST_MODEL,
  FAULT_CLASSES,
  FAULT_RULES,
  PING_INTERVAL_MS,
  PING_TOLERANCE_MS,
  RULE_REMEDY,
  SELECTION_FOR_SEVERITY,
  SENSOR_RANGE,
  SEVERITY_FOR_SELECTION,
  breachRatio,
  classifyRecord,
  faultClass,
  faultRule,
  isTransient,
  openMs,
  ruleRemedy,
  withinSensorRange,
} from './taxonomy';
export type {
  CategorySelection,
  FaultClassDef,
  FaultClassId,
  FaultRule,
  SeveritySelection,
} from './taxonomy';
