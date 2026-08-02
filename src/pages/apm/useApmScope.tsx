import { useCallback, useMemo, useState } from 'react';
import type { ApmAssetDto } from '@/services/apm.types';
import { Select } from '@/components/ui/Select';
import { useApmOverview } from '@/hooks/useApm';
import {
  ALL,
  DEFAULT_APM_FILTERS,
  apmFilterCount,
  applyApmFilters,
  facet,
  type ApmFilters,
} from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Shared scope for the APM analytics pages.
 *
 * Every page narrows the same estate on the same four dimensions, so the filter
 * state, the facet lists and the narrowing live here rather than nine times
 * over. The pages differ in what they draw, not in what they are looking at.
 *
 * All nine also read one query. React Query dedupes `apmKeys.overview()` across
 * mounted components, so navigating between sections costs no extra request and
 * every page is guaranteed to be describing the same instant of the estate.
 * ─────────────────────────────────────────────────────────────────────────── */

const NO_ASSETS: ApmAssetDto[] = [];

export const useApmScope = () => {
  const query = useApmOverview();
  const [filters, setFilters] = useState<ApmFilters>(DEFAULT_APM_FILTERS);

  const all = query.data?.assets ?? NO_ASSETS;

  const setFilter = useCallback(<K extends keyof ApmFilters>(key: K, value: ApmFilters[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }, []);

  const reset = useCallback(() => setFilters(DEFAULT_APM_FILTERS), []);

  const assets = useMemo(() => applyApmFilters(all, filters), [all, filters]);

  /* Facets come from the payload rather than from a hard-coded list, so a
   * dropdown never offers a value the estate does not contain. */
  const facets = useMemo(
    () => ({
      categories: facet(all, (asset) => asset.category),
      criticalities: facet(all, (asset) => asset.criticality_code),
      riskTiers: facet(all, (asset) => asset.risk_tier),
      bands: facet(all, (asset) => asset.health_index_band),
    }),
    [all],
  );

  return {
    query,
    /** Every asset APM returned, before filtering. */
    all,
    /** The current selection. */
    assets,
    scope: query.data?.scope,
    overview: query.data,
    filters,
    setFilter,
    reset,
    filterCount: apmFilterCount(filters),
    facets,
    loading: query.isPending,
    error: query.isError,
  };
};

export type ApmScope = ReturnType<typeof useApmScope>;

/* ─── Filter controls ────────────────────────────────────────────────────── */

const option = (value: string) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) });

/** The four dropdowns, rendered into the shell's sticky rail. */
export const ApmFilterControls = ({ scope }: { scope: ApmScope }) => (
  <>
    <Select
      size="sm"
      label="Device class"
      options={[{ value: ALL, label: 'All classes' }, ...scope.facets.categories.map(option)]}
      value={scope.filters.category}
      onChange={(event) => scope.setFilter('category', event.target.value)}
      containerClassName="w-44"
    />
    <Select
      size="sm"
      label="Criticality"
      options={[{ value: ALL, label: 'All criticality' }, ...scope.facets.criticalities.map(option)]}
      value={scope.filters.criticality}
      onChange={(event) => scope.setFilter('criticality', event.target.value)}
      containerClassName="w-44"
    />
    <Select
      size="sm"
      label="Risk tier"
      options={[{ value: ALL, label: 'All risk tiers' }, ...scope.facets.riskTiers.map(option)]}
      value={scope.filters.riskTier}
      onChange={(event) => scope.setFilter('riskTier', event.target.value)}
      containerClassName="w-40"
    />
    <Select
      size="sm"
      label="Health band"
      options={[{ value: ALL, label: 'All bands' }, ...scope.facets.bands.map(option)]}
      value={scope.filters.band}
      onChange={(event) => scope.setFilter('band', event.target.value)}
      containerClassName="w-40"
    />
  </>
);
