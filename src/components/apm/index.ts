/* Asset Performance Management.
 *
 * APM is the decision layer of the MIKOS chain — it consumes what Anomaly
 * Detection and Predictive Maintenance published, turns it into maintenance
 * intelligence, and publishes reliability figures OEE reads downstream. It
 * detects nothing and predicts nothing itself.
 *
 * Presentation only lives here. The data access is in `hooks/useApm.ts` and the
 * payload contracts are in `services/apm.types.ts`. */

export { ApmKpiCard, ApmKpiGrid } from './ApmKpiCard';
export type { ApmKpiCardProps, ApmKpiGridProps, KpiTone } from './ApmKpiCard';

export { ApmAssetTable } from './ApmAssetTable';
export type { ApmAssetTableProps, ApmColumnKey } from './ApmAssetTable';

export { ApmWorkOrderTable } from './ApmWorkOrderTable';
export type { ApmWorkOrderTableProps } from './ApmWorkOrderTable';

export { ApmAssetDetailModal } from './ApmAssetDetailModal';
export { ApmAddAssetModal } from './ApmAddAssetModal';
export { ApmHierarchyTree } from './ApmHierarchyTree';
export { ApmWorkOrderLifecycleModal } from './ApmWorkOrderLifecycleModal';
export { ApmExecutiveDashboard } from './ApmExecutiveDashboard';
export { ApmBenchmarkingPanel } from './ApmBenchmarkingPanel';
