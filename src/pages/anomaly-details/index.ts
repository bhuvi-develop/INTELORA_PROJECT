/* Anomaly detection drill-downs.
 *
 * One page per card in the module's status bar. Each reads the same engine
 * snapshot the module reads, so a figure here and the card that led to it cannot
 * disagree — and neither holds state the other can see. */

export { LiveStatusDetailPage } from './LiveStatusDetailPage';
export { ActiveEventsDetailPage } from './ActiveEventsDetailPage';
export { EventLifecyclePage } from './EventLifecyclePage';
export { ClearRateAnalyticsPage } from './ClearRateAnalyticsPage';
export { CategoryBreakdownDetailPage } from './CategoryBreakdownDetailPage';
export { TaxonomySignaturesDetailPage } from './TaxonomySignaturesDetailPage';
export { AnalysisReportPage } from './AnalysisReportPage';

export { DetailShell, DetailStatStrip } from './DetailShell';
export type { DetailShellProps, DetailStat } from './DetailShell';

export { useStreamSamples, bucketDelay } from './useStreamSamples';
export type { StreamSample, StreamSeries, HistogramBin } from './useStreamSamples';
