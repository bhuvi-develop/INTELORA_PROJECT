import { useMemo, useState } from 'react';
import { Boxes, Layers, PieChart, Plus, ShieldAlert, Wrench } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { BarTrend, DonutSplit } from '@/components/charts';
import { SectionHeader } from '@/components/common';
import { Button } from '@/components/ui/Button';
import { ApmAddAssetModal, ApmAssetTable, ApmKpiGrid, type ApmKpiCardProps } from '@/components/apm';
import { ApmPageShell } from './ApmPageShell';
import { ApmFilterControls, useApmScope } from './useApmScope';
import { bandColor, countBy, orDash, riskColor } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Asset management.
 *
 * The register itself — every asset APM holds a record for, with the full
 * column set rather than the slice a themed page would show. The other eight
 * pages answer a question; this one answers "show me everything and let me
 * find it".
 * ─────────────────────────────────────────────────────────────────────────── */

export const ApmAssetsPage = ({ hierarchyContent }: { hierarchyContent?: React.ReactNode } = {}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const scope = useApmScope();
  const { assets, all } = scope;

  const kpis = useMemo<ApmKpiCardProps[]>(() => {
    const online = assets.filter((asset) => asset.status === 'Online').length;
    const atRisk = assets.filter(
      (asset) => asset.risk_tier === 'critical' || asset.risk_tier === 'high',
    ).length;
    const openWork = assets.reduce((sum, asset) => sum + (asset.open_work_orders ?? 0), 0);

    return [
      {
        label: 'Assets in scope',
        value: String(assets.length),
        accent: SERIES[0],
        icon: Boxes,
        caption:
          assets.length === all.length
            ? 'The whole register'
            : `Filtered from ${all.length} commissioned`,
        loading: scope.loading,
      },
      {
        label: 'Reporting',
        value: String(online),
        accent: STATUS_COLOR.good,
        tone: online === assets.length ? 'good' : 'warn',
        icon: Layers,
        caption: `${assets.length - online} not currently online`,
        loading: scope.loading,
      },
      {
        label: 'At risk',
        value: String(atRisk),
        accent: STATUS_COLOR.critical,
        tone: atRisk > 0 ? 'bad' : 'good',
        icon: ShieldAlert,
        caption: 'Ranked into the critical or high risk tiers',
        loading: scope.loading,
      },
      {
        label: 'Open work orders',
        value: String(openWork),
        accent: SERIES[1],
        icon: Wrench,
        caption: 'Across the assets in scope',
        loading: scope.loading,
      },
    ];
  }, [assets, all.length, scope.loading]);

  const byClass = useMemo(() => countBy(assets, (a) => a.category, () => SERIES[0]), [assets]);
  const byBand = useMemo(() => countBy(assets, (a) => a.health_index_band, bandColor), [assets]);
  const byRisk = useMemo(() => countBy(assets, (a) => a.risk_tier, riskColor), [assets]);

  return (
    <ApmPageShell
      title="Asset Management"
      subtitle="The APM register — every asset, every derived figure, searchable and exportable."
      crumb="Assets"
      loading={scope.loading}
      error={scope.error}
      activeFilterCount={scope.filterCount}
      onResetFilters={scope.reset}
      filters={<ApmFilterControls scope={scope} />}
      filterNote="Filters narrow the distributions and the register together. The export always writes the full APM column set, not the visible columns, so files from different pages join on asset id."
    >
      {hierarchyContent && <div className="mb-6">{hierarchyContent}</div>}
      
      <ApmKpiGrid items={kpis} />

      <SectionHeader
        title="Register composition"
        subtitle="How the selection splits by class, condition band and risk tier"
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <DonutSplit
          title="By device class"
          subtitle="Assets per hardware class"
          eyebrow="Class"
          icon={PieChart}
          data={byClass.map((row) => ({
            key: row.label,
            name: row.label,
            value: row.count,
            color: SERIES[byClass.indexOf(row) % SERIES.length],
          }))}
          height={200}
          centerValue={String(assets.length)}
          centerLabel="assets"
        />

        <DonutSplit
          title="By condition band"
          subtitle="Assets per band of the composite index"
          eyebrow="Condition"
          icon={PieChart}
          data={byBand.map((row) => ({ key: row.label, name: row.label, value: row.count, color: row.color }))}
          height={200}
          centerValue={orDash(
            assets.length
              ? assets.reduce((s, a) => s + (a.health_index ?? 0), 0) / assets.length
              : undefined,
            1,
            '%',
          )}
          centerLabel="mean index"
        />

        <DonutSplit
          title="By risk tier"
          subtitle="Assets per tier of APM's risk ranking"
          eyebrow="Risk"
          icon={PieChart}
          data={byRisk.map((row) => ({ key: row.label, name: row.label, value: row.count, color: row.color }))}
          height={200}
          centerValue={String(byRisk.length)}
          centerLabel="tiers present"
        />
      </div>

      <BarTrend
        title="Assets per device class"
        subtitle="Register size by hardware class"
        eyebrow="Distribution"
        icon={Layers}
        data={byClass}
        series={[{ key: 'count', name: 'Assets', color: SERIES[0], decimals: 0 }]}
        layout="horizontal"
        height={Math.max(180, byClass.length * 46)}
        categoryWidth={148}
        footnote="Class is the only grouping dimension the register carries — the estate has no site or plant hierarchy modelled against it."
      />

      <div className="flex items-center justify-between">
        <SectionHeader title="Register" subtitle="Every column APM derives, on one table" />
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={() => setIsAddModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          Add Asset
        </Button>
      </div>

      <ApmAssetTable
        assets={assets}
        columns={[
          'asset',
          'category',
          'status',
          'health',
          'availability',
          'mtbf',
          'mttr',
          'criticality',
          'risk',
          'priority',
          'action',
        ]}
        title="Asset register"
        subtitle="Sorted, searchable and paginated across the full APM record"
        exportName="intelora_apm_assets"
        minWidth="118rem"
      />

      <ApmAddAssetModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </ApmPageShell>
  );
};
