/* Asset Performance Management — the module's pages.
 *
 * One overview that navigates, and nine analytics pages behind it. All ten read
 * the same `/apm/overview` query through `useApmScope`; React Query dedupes it,
 * so moving between sections costs no extra request and every page is
 * describing the same instant of the estate. */

export { ApmDashboardPage } from './ApmDashboardPage';
export { ApmAssetsPage } from './ApmAssetsPage';
export { ApmReliabilityPage } from './ApmReliabilityPage';
export { ApmMaintenancePage } from './ApmMaintenancePage';
export { ApmAvailabilityPage } from './ApmAvailabilityPage';
export { ApmHealthPage } from './ApmHealthPage';
export { ApmCostPage } from './ApmCostPage';
export { ApmCriticalityPage } from './ApmCriticalityPage';
export { ApmWorkOrdersPage } from './ApmWorkOrdersPage';
export { ApmReportsPage } from './ApmReportsPage';

export { ApmPageShell, ApmSectionCard, ScopeBadge } from './ApmPageShell';
export type { ApmPageShellProps, ApmSectionCardProps } from './ApmPageShell';

export { ApmFilterControls, useApmScope } from './useApmScope';
export type { ApmScope } from './useApmScope';

export {
  ALL,
  APM_ASSET_COLUMNS,
  WORK_ORDER_COLUMNS,
  DEFAULT_APM_FILTERS,
  apmFilterCount,
  applyApmFilters,
  bandColor,
  countBy,
  facet,
  histogram,
  meanBy,
  money,
  orDash,
  pct,
  rankBy,
  recommendedAction,
  riskColor,
} from './apmSelectors';
export type { ApmFilters, CountRow, HistogramBin, MeanRow } from './apmSelectors';
