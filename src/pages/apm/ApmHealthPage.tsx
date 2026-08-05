import { useMemo } from 'react';
import { Activity, AlertTriangle, HeartPulse, Layers, PieChart, ShieldAlert } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { AreaTrend, BarTrend, DonutSplit, ScatterRisk, type ScatterPoint } from '@/components/charts';
import { SectionHeader } from '@/components/common';
import { ApmAssetTable, ApmKpiGrid, type ApmKpiCardProps } from '@/components/apm';
import { ApmPageShell } from './ApmPageShell';
import { ApmFilterControls, useApmScope } from './useApmScope';
import { bandColor, countBy, histogram, meanBy, orDash } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Asset health analytics.
 *
 * The health index is APM's own composite — it aggregates the PdM condition
 * score, the open anomaly pressure AD published and the asset's duty into one
 * figure per asset. It is deliberately not the same number as the raw PdM
 * score, and the two are never drawn on one axis here: the distribution below
 * is the composite, and the scatter shows the composite against the PdM input
 * so the gap between them is visible rather than averaged away.
 * ─────────────────────────────────────────────────────────────────────────── */

const HEALTH_EDGES = [0, 20, 40, 60, 80, 100];

export const ApmHealthPage = () => {
  const scope = useApmScope();
  const { assets } = scope;

  const kpis = useMemo<ApmKpiCardProps[]>(() => {
    const indices = assets.map((asset) => asset.health_index).filter(Number.isFinite);
    const mean = indices.length ? indices.reduce((s, v) => s + v, 0) / indices.length : undefined;
    const impaired = assets.filter((asset) => asset.health_index < 60).length;
    const gap = assets.length
      ? assets.reduce((s, a) => s + (a.condition_gap ?? 0), 0) / assets.length
      : undefined;

    return [
      {
        label: 'Mean health index',
        value: mean === undefined ? null : orDash(mean, 1),
        unit: '%',
        accent: SERIES[0],
        icon: HeartPulse,
        meter: mean === undefined ? undefined : { value: mean },
        caption: `Across ${assets.length} asset${assets.length === 1 ? '' : 's'} in scope`,
        explainer:
          "APM's composite index: the PdM condition score derated by open anomaly pressure from AD and by the asset's duty.",
        loading: scope.loading,
      },
      {
        label: 'Weakest asset',
        value: indices.length ? orDash(Math.min(...indices), 1) : null,
        unit: '%',
        accent: STATUS_COLOR.critical,
        tone: 'bad',
        icon: AlertTriangle,
        caption: 'Lowest composite index in the current selection',
        loading: scope.loading,
      },
      {
        label: 'Operationally impaired',
        value: String(impaired),
        accent: STATUS_COLOR.warning,
        tone: impaired > 0 ? 'bad' : 'good',
        icon: ShieldAlert,
        caption: 'Assets below the 60% composite floor',
        explainer: 'The floor at which APM stops treating an asset as fully serviceable.',
        loading: scope.loading,
      },
      {
        label: 'Mean condition gap',
        value: gap === undefined ? null : orDash(gap, 1),
        unit: 'pts',
        accent: SERIES[4],
        icon: Activity,
        caption: 'Distance between the composite index and the raw PdM score',
        explainer:
          'A positive gap means APM is rating the asset below what condition alone would suggest — usually alarm pressure or criticality weighting.',
        loading: scope.loading,
      },
    ];
  }, [assets, scope.loading]);

  const bands = useMemo(
    () => countBy(assets, (asset) => asset.health_index_band, bandColor),
    [assets],
  );

  const distribution = useMemo(
    () => histogram(assets.map((asset) => asset.health_index), HEALTH_EDGES, '%'),
    [assets],
  );

  const byClass = useMemo(
    () => meanBy(assets, (a) => a.category, (a) => a.health_index),
    [assets],
  );

  const points = useMemo<ScatterPoint[]>(
    () =>
      assets.map((asset) => ({
        id: asset.asset_id,
        label: asset.asset_id,
        x: Math.round((asset.inputs?.predictive?.health_score ?? 0) * 10) / 10,
        y: Math.round(asset.health_index * 10) / 10,
        z: Math.max(1, asset.open_work_orders ?? 1),
        group: asset.risk_tier ?? 'unranked',
        meta: `${asset.category} · criticality ${asset.criticality_label}`,
      })),
    [assets],
  );

  return (
    <ApmPageShell
      title="Asset Health Analytics"
      subtitle="The composite health index across the estate, and how far it sits from the raw condition score it was built on."
      crumb="Asset Health"
      loading={scope.loading}
      error={scope.error}
      activeFilterCount={scope.filterCount}
      onResetFilters={scope.reset}
      filters={<ApmFilterControls scope={scope} />}
      filterNote="Filters narrow every chart and the table below together. The health index is APM's own output — the PdM score it derates is shown alongside rather than replaced."
    >
      <ApmKpiGrid items={kpis} />

      <SectionHeader
        title="Distribution"
        subtitle="Where the estate sits on the composite index, and how that splits by band and by class"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AreaTrend
          title="Health index distribution"
          subtitle="Assets per ten-point band of the composite index"
          eyebrow="Distribution"
          icon={HeartPulse}
          data={distribution}
          series={[{ key: 'count', name: 'Assets', color: SERIES[0], decimals: 0 }]}
          height={280}
          footnote="Bin edges are fixed so the shape stays comparable between visits. A histogram that rescales its own bins makes a stable estate and a degrading one look identical."
        />

        <DonutSplit
          title="Condition band split"
          subtitle="Assets per band of the composite index"
          eyebrow="Bands"
          icon={PieChart}
          data={bands.map((row) => ({ key: row.label, name: row.label, value: row.count, color: row.color }))}
          height={216}
          centerValue={String(assets.length)}
          centerLabel="assets in scope"
          footnote="Bands are the platform's four condition boundaries applied to APM's composite index, not to the raw PdM score. The two are different figures."
        />
      </div>

      <BarTrend
        title="Mean health index by device class"
        subtitle="Which hardware classes are holding the estate up, and which are pulling it down"
        eyebrow="Comparison"
        icon={Layers}
        data={byClass}
        series={[{ key: 'value', name: 'Mean health index', color: SERIES[2], unit: '%', decimals: 1 }]}
        layout="horizontal"
        height={Math.max(200, byClass.length * 46)}
        categoryWidth={148}
        footnote="A class sitting well below the others is a hardware problem rather than an individual asset problem, and is the case for a fleet-level intervention."
      />

      <ScatterRisk
        title="Composite index against PdM condition"
        subtitle="Every asset, with the gap between what condition says and what APM concluded"
        eyebrow="Attribution"
        icon={Activity}
        points={points}
        xLabel="PdM health score (%)"
        yLabel="APM composite index (%)"
        height={340}
        quadrant={{ x: 60, y: 60 }}
        quadrantLabels={[
          'Derated by APM',
          'Healthy on both',
          'Weak on both',
          'Condition worse than composite',
        ]}
        footnote="Points below the diagonal are assets APM rated worse than condition alone would — the derating is alarm pressure from AD or a criticality weighting. Bubble size is open work orders."
      />

      <SectionHeader title="Asset register" subtitle="The records behind every chart above" />

      <ApmAssetTable
        assets={assets}
        columns={['asset', 'category', 'health', 'band', 'pdmHealth', 'rul', 'anomalies', 'risk', 'action']}
        title="Health register"
        subtitle="Composite index against the PdM and AD inputs it was derived from"
        exportName="intelora_apm_health"
        minWidth="96rem"
      />
    </ApmPageShell>
  );
};
