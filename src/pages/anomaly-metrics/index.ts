/* Detection-quality metric drill-downs.
 *
 * One page per KPI tile in `DetectionQualityGrid`. Each reads the same
 * `useAnomalyModule` analytics the tile does, so a headline and its drill-down
 * cannot disagree — and each holds its own selection state, so opening one
 * cannot change what any other view renders. */

export { FalsePositivesMetricPage } from './FalsePositivesMetricPage';
export { FalseNegativesMetricPage } from './FalseNegativesMetricPage';
export { LatencySlaMetricPage } from './LatencySlaMetricPage';
export { PredictionHorizonMetricPage } from './PredictionHorizonMetricPage';
export { RecommendationAcceptanceMetricPage } from './RecommendationAcceptanceMetricPage';
export { BusinessImpactMetricPage } from './BusinessImpactMetricPage';
export { EngineeringConfidenceMetricPage } from './EngineeringConfidenceMetricPage';

export {
  TREND_BUCKETS,
  TREND_BUCKET_MS,
  bucketJournal,
  bucketLatency,
  groupByChannel,
  groupMissesByCategory,
  mean,
  percentile,
  ratioPct,
  riskRows,
  stdDev,
} from './metricSeries';
export type {
  CategoryGroup,
  ChannelGroup,
  JournalWindow,
  LatencyBin,
  RiskRow,
  WindowOptions,
} from './metricSeries';
