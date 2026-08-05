/* Anomaly detection stream drill-downs.
 *
 * Two pages, opened from the two entry cards on the module overview. Each reads
 * the same engine snapshot the module reads and holds no state the other can
 * see, so opening one cannot change what the other renders. */

export { DetectionTimelinePage } from './DetectionTimelinePage';
export { LiveStreamPage } from './LiveStreamPage';

export {
  DAY_MS,
  HOUR_MS,
  SEVERITIES,
  bucketByHour,
  bucketDaily,
  bucketMonthly,
  bucketWeekly,
  bySeverity,
  journalStart,
  topDevices,
} from './timelineSeries';
export type { DeviceTally, TrendBucket } from './timelineSeries';

export { channelSpecs, channelStats, channelWindow, gaugeCeiling } from './streamChannels';
export type { ChannelPoint, ChannelSpec, ChannelStats, StreamChannelKey } from './streamChannels';
