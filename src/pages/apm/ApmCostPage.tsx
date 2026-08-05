import { useMemo } from 'react';
import { Banknote, CircleDollarSign, Coins, Layers, PieChart, TrendingUp, Wallet } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { BarTrend, DonutSplit } from '@/components/charts';
import { SectionHeader } from '@/components/common';
import { ApmAssetTable, ApmKpiGrid, type ApmKpiCardProps } from '@/components/apm';
import { useApmEffectiveness } from '@/hooks/useApm';
import { ApmPageShell } from './ApmPageShell';
import { ApmFilterControls, useApmScope } from './useApmScope';
import { money, orDash, rankBy } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Cost analytics.
 *
 * Spend and exposure are separate blocks and separate charts, because they are
 * separate kinds of number. Spend is committed and is a fact. Exposure is a
 * probability times a consequence and is not a cost yet — it is what the estate
 * stands to lose if nothing is done. Adding them into one total is how a
 * maintenance budget argument gets lost, so nothing on this page does.
 * ─────────────────────────────────────────────────────────────────────────── */

export const ApmCostPage = () => {
  const scope = useApmScope();
  const { assets } = scope;
  const effectiveness = useApmEffectiveness();
  const economics = effectiveness.data?.economics;

  const kpis = useMemo<ApmKpiCardProps[]>(
    () => [
      {
        label: 'Committed spend',
        value: economics?.committed_spend === undefined ? null : money(economics.committed_spend),
        accent: '#B45309',
        icon: CircleDollarSign,
        caption: `Planned ${money(economics?.planned_spend)} · reactive ${money(economics?.reactive_spend)}`,
        explainer: 'Money already spent. Risk exposure is reported separately and is deliberately not added to it.',
        loading: effectiveness.isPending,
      },
      {
        label: 'Planned share',
        value:
          economics?.planned_spend_ratio === undefined
            ? null
            : orDash(economics.planned_spend_ratio * 100, 1),
        unit: '%',
        accent: SERIES[4],
        icon: Wallet,
        meter:
          economics?.planned_spend_ratio === undefined
            ? undefined
            : { value: economics.planned_spend_ratio * 100 },
        caption: 'Share of committed spend that was scheduled rather than reactive',
        loading: effectiveness.isPending,
      },
      {
        label: 'Total exposure',
        value: economics?.total_exposure === undefined ? null : money(economics.total_exposure),
        accent: STATUS_COLOR.warning,
        icon: Coins,
        caption: `${money(economics?.unaddressed_exposure)} of it unaddressed`,
        explainer:
          'Probability times consequence across the estate. Not a cost — the amount at stake if nothing is actioned.',
        loading: effectiveness.isPending,
      },
      {
        label: 'Downtime cost',
        value: economics?.downtime_cost === undefined ? null : money(economics.downtime_cost),
        accent: STATUS_COLOR.critical,
        icon: Banknote,
        caption: 'Observed unavailability priced at the configured rate',
        loading: effectiveness.isPending,
      },
      {
        label: 'Backlog cost',
        value: economics?.backlog_cost === undefined ? null : money(economics.backlog_cost),
        accent: SERIES[6],
        icon: Layers,
        caption: 'Estimated cost of the outstanding work queue',
        loading: effectiveness.isPending,
      },
      {
        label: 'Return on spend',
        value: economics?.roi === undefined ? null : orDash(economics.roi, 2),
        unit: '×',
        accent: STATUS_COLOR.good,
        tone: (economics?.roi ?? 0) >= 1 ? 'good' : 'bad',
        icon: TrendingUp,
        caption: `${money(economics?.return_per_unit_spend)} returned per unit spent · ${money(economics?.avoidable_exposure)} avoidable`,
        explainer:
          'Avoided exposure against committed spend. Below 1× means the programme is currently costing more than the risk it is retiring.',
        loading: effectiveness.isPending,
      },
    ],
    [economics, effectiveness.isPending],
  );

  /** Exposure and downtime cost per class — two measures, one currency, stacked. */
  const byClass = useMemo(() => {
    const groups = new Map<string, { label: string; exposure: number; downtime: number }>();
    for (const asset of assets) {
      const row = groups.get(asset.category) ?? { label: asset.category, exposure: 0, downtime: 0 };
      row.exposure += asset.cost_exposure ?? 0;
      row.downtime += asset.downtime_cost ?? 0;
      groups.set(asset.category, row);
    }
    return [...groups.values()]
      .map((row) => ({
        label: row.label,
        exposure: Math.round(row.exposure),
        downtime: Math.round(row.downtime),
      }))
      .sort((a, b) => b.exposure + b.downtime - (a.exposure + a.downtime));
  }, [assets]);

  const spendSplit = useMemo(
    () =>
      [
        { key: 'planned', name: 'Planned spend', value: economics?.planned_spend ?? 0, color: STATUS_COLOR.good },
        { key: 'reactive', name: 'Reactive spend', value: economics?.reactive_spend ?? 0, color: STATUS_COLOR.critical },
      ].filter((slice) => slice.value > 0),
    [economics],
  );

  const topExposure = useMemo(() => rankBy(assets, (a) => a.cost_exposure, 12, 'desc'), [assets]);

  return (
    <ApmPageShell
      title="Cost Analytics"
      subtitle="Committed spend and risk exposure, kept apart — one is money gone, the other is money at stake."
      crumb="Cost"
      loading={scope.loading}
      error={scope.error}
      activeFilterCount={scope.filterCount}
      onResetFilters={scope.reset}
      filters={<ApmFilterControls scope={scope} />}
      filterNote="The spend KPIs read the engine's fleet economics block and are not narrowed by these filters. The per-asset exposure charts and the table are."
    >
      <ApmKpiGrid items={kpis} columns={6} />

      <SectionHeader
        title="Where the money is"
        subtitle="Spend split by how it was incurred, exposure split by where it sits"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {spendSplit.length > 0 ? (
          <DonutSplit
            title="Planned against reactive spend"
            subtitle="How the committed spend was incurred"
            eyebrow="Spend"
            icon={PieChart}
            data={spendSplit}
            height={216}
            centerValue={money(economics?.committed_spend)}
            centerLabel="committed"
            footnote="A falling planned share means the estate is increasingly setting the maintenance schedule rather than the other way round. It is the single most diagnostic ratio on this page."
          />
        ) : null}

        <BarTrend
          title="Highest exposure by asset"
          subtitle="Probability times consequence, per asset"
          eyebrow="Exposure"
          icon={Coins}
          data={topExposure.map((asset) => ({ label: asset.asset_id, value: asset.cost_exposure }))}
          series={[{ key: 'value', name: 'Cost exposure', color: STATUS_COLOR.warning, unit: 'USD', decimals: 0 }]}
          layout="horizontal"
          height={Math.max(220, topExposure.length * 30)}
          categoryWidth={104}
          footnote="Exposure combines failure probability from PdM with the replacement and downtime consequence from the criticality model. It is what an intervention on this asset would retire."
        />
      </div>

      <BarTrend
        title="Cost breakdown by device class"
        subtitle="Risk exposure against realised downtime cost, per class"
        eyebrow="Breakdown"
        icon={Layers}
        data={byClass}
        series={[
          { key: 'exposure', name: 'Risk exposure', color: STATUS_COLOR.warning, unit: 'USD', decimals: 0 },
          { key: 'downtime', name: 'Downtime cost', color: STATUS_COLOR.critical, unit: 'USD', decimals: 0 },
        ]}
        height={300}
        stacked
        footnote="Both bars are in currency and stack honestly, but they are different kinds of number: the amber segment has not been spent and may never be, the red segment already has been. A class where red dominates is one where the exposure has already turned into cost."
      />

      <SectionHeader title="Asset register" subtitle="Cost record per asset" />

      <ApmAssetTable
        assets={assets}
        columns={['asset', 'category', 'criticality', 'exposure', 'downtimeCost', 'downtime', 'lifecycle', 'workOrders']}
        title="Cost register"
        subtitle="Exposure, realised downtime cost and the lifecycle decision that follows"
        exportName="intelora_apm_cost"
        minWidth="92rem"
      />
    </ApmPageShell>
  );
};
