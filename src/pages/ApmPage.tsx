import { useMemo, useState } from 'react';
import { Activity, Download, Layers, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import type { AssetRuntime, HealthBand } from '@/engine/types';
import type { ApmAssetDto } from '@/types/api';
import { BANDS, bandDef, bandOf } from '@/engine/derive';
import { criticalByAsset } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { env } from '@/config/env';
import { deviceDetailPath } from '@/routes/paths';
import { useApmOverview } from '@/services/apmStore';
import {
  useAnomalyJournal,
  useAssetList,
  useCategoryRollups,
  useFleetKpis,
  useFleetTrail,
  useSnapshot,
} from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useToast } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { AssetStatusMatrix, BarTrend, LineTrend, RiskDistributionBar } from '@/components/charts';
import type { SeriesDef } from '@/components/charts';
import { AiPanel } from '@/components/ai';
import { GrafanaPanel } from '@/components/grafana';
import {
  HealthBandBadge,
  HealthMeter,
  HealthValue,
  MetaStat,
  PageHeader,
  RankList,
  SectionHeader,
  StatTile,
} from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Asset performance management.
 *
 * Fleet comparison only, per specification: health ranking, availability and
 * performance score. No telemetry channels appear here — a reading belongs to
 * Live Telemetry, and this module's job is to say which devices are holding the
 * estate back relative to each other.
 *
 * Every APM figure on this page is now read from `/apm/overview` rather than
 * averaged in the browser. That matters beyond tidiness: the module's stated
 * invariant is that the interface renders figures and derives none, and a page
 * that computed its own means was the one place that was not true. The backend
 * publishes aggregates over the *filtered* scope alongside the estate roll-up,
 * so changing the category filter is a request rather than a recomputation.
 *
 * Two figures are deliberately left as they were: the performance score and the
 * quality score. Both belong to OEE, and APM republishing them would create a
 * second source for numbers that must have exactly one. They stay averaged from
 * the platform snapshot, which is where the rest of the application reads them.
 * ─────────────────────────────────────────────────────────────────────────── */

/* Built per render so series colours follow the active theme. */
const buildTrendSeries = (): SeriesDef[] => [
  { key: 'health', name: 'Mean fleet health', color: SERIES[0], unit: '%', decimals: 1 },
  { key: 'oee', name: 'Mean effectiveness', color: SERIES[3], unit: '%', decimals: 1 },
];

type RankMode = 'worst' | 'best';

export const ApmPage = () => {
  const toast = useToast();
  const assets = useAssetList();
  const kpis = useFleetKpis();
  const categories = useCategoryRollups();
  const trail = useFleetTrail();
  const journal = useAnomalyJournal();
  const { at } = useSnapshot();

  const [rankMode, setRankMode] = useState<RankMode>('worst');
  const [category, setCategory] = useState('all');
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const TREND_SERIES = buildTrendSeries();

  /* The APM projection for the current scope. Filtering is a query parameter, so
     the aggregates below arrive already computed over the filtered set. Ordered
     by raw condition ascending, which is what the ranking widget is labelled by —
     not by the health index, which is a different figure. */
  const apm = useApmOverview({
    category: category === 'all' ? undefined : category,
    sort: 'health',
  });

  const criticals = useMemo(() => criticalByAsset(journal), [journal]);

  /* Still needed by the estate matrix and the risk composition bar, which take
     the platform's runtime records rather than APM's projection. */
  const scoped = useMemo(
    () => (category === 'all' ? assets : assets.filter((asset) => asset.device.category === category)),
    [assets, category],
  );

  const stats = useMemo(() => {
    const scopeData = apm.data?.scope;

    const source = scoped;
    const mean = (pick: (asset: AssetRuntime) => number) =>
      source.length === 0 ? 0 : source.reduce((sum, asset) => sum + pick(asset), 0) / source.length;

    return {
      /* Published by APM over the requested scope.
         The client means are a first-paint bridge and nothing more. Changing the
         filter starts a request and clears the previous scope's payload — showing
         one scope's figures under another scope's label is worse than showing
         nothing — but rendering zero in the gap would flash "0.0%" across four
         tiles every time the filter moved. These cover that gap with the same
         source the page used before, and every one is superseded the instant the
         scoped response lands. Backend stays authoritative. */
      health: scopeData?.mean_health ?? mean((asset) => asset.health),
      availability: scopeData?.availability_pct ?? mean((asset) => asset.performance.availability),
      spread:
        scopeData?.health_spread ??
        (source.length === 0
          ? 0
          : Math.max(...source.map((asset) => asset.health)) -
            Math.min(...source.map((asset) => asset.health))),
      count: scopeData?.assets ?? source.length,
      /* Performance and quality are OEE's figures. APM does not republish them,
         so these are not a bridge — they are the permanent source, exactly as
         before. */
      performance: mean((asset) => asset.performance.performance),
      quality: mean((asset) => asset.performance.quality),
    };
  }, [apm.data, scoped]);

  /* Rows for the ranking widget, normalised so the list renders identically from
     either source: APM's projection once loaded, the platform snapshot in the gap
     while a newly filtered scope is in flight. */
  const rankRows = useMemo(() => {
    const fromApm = apm.data?.assets;

    const rows = fromApm
      ? fromApm.map((asset) => ({
          assetId: asset.asset_id,
          assetName: asset.asset_name,
          category: asset.category,
          health: asset.inputs.predictive.health_score,
          band: asset.inputs.predictive.health_band as HealthBand,
          availability: asset.availability_pct,
        }))
      : [...scoped]
          .sort((a, b) => a.health - b.health)
          .map((asset) => ({
            assetId: asset.device.assetId,
            assetName: asset.device.assetName,
            category: asset.device.category as string,
            health: asset.health,
            band: asset.band,
            availability: asset.performance.availability,
          }));

    /* Ordered worst-condition-first by whichever source produced it. Reversing is
       a presentation choice and stays here; the ordering itself is not recomputed. */
    return rankMode === 'worst' ? rows : [...rows].reverse();
  }, [apm.data, scoped, rankMode]);

  /* The export always comes from APM's projection — it carries criticality, risk,
     cost and the recommended action, none of which exist on the runtime record. */
  const exportRows = useMemo(() => apm.data?.assets ?? [], [apm.data]);

  /* Condition-band colour for the fleet-health tile.
     `bandOf` applies the platform's own thresholds, which the backend publishes
     and `applyBandThresholds` installs. The inlined ternary this replaces
     hard-coded 95 and 80 into the page and omitted the critical band entirely, so
     a fleet mean below 65 was coloured as a warning — and it would not have
     followed a threshold change on the backend. */
  const healthAccent = bandDef(bandOf(stats.health)).color;

  const bandBars = useMemo(() => {
    /* Counted server-side over the same scope. `condition_band_counts` is over
       PdM's health score, matching this widget's label and its footnote —
       `band_counts` on the same payload is over APM's composite and would move
       every bar without changing the label above it.
       Falls back to the snapshot in the in-flight gap, for the same reason the
       stat tiles do: four bars dropping to zero on every filter change reads as a
       fleet that just vanished. */
    const counts = apm.data?.scope.condition_band_counts;
    return BANDS.map((band) => ({
      label: band.label,
      count: counts
        ? counts[band.band] ?? 0
        : scoped.filter((asset) => asset.band === band.band).length,
    }));
  }, [apm.data, scoped]);

  const categoryBars = useMemo(
    () =>
      categories.map((row) => ({
        label: row.category,
        health: row.averageHealth,
        availability: row.availability,
      })),
    [categories],
  );

  /* The report now carries the APM record rather than a subset of the runtime
     record. Same button, same formats, materially more useful export: criticality,
     reliability, risk and the recommended action were all computed for the screen
     already and were simply not being written out. */
  const exportColumns: Array<ReportColumn<ApmAssetDto>> = [
    { header: 'Asset ID', value: (row) => row.asset_id },
    { header: 'Asset Name', value: (row) => row.asset_name },
    { header: 'Category', value: (row) => row.category },
    { header: 'Brand', value: (row) => row.brand },
    { header: 'Status', value: (row) => row.status },
    { header: 'Health', value: (row) => row.inputs.predictive.health_score, numeric: true },
    {
      header: 'Condition Band',
      value: (row) => bandDef(bandOf(row.inputs.predictive.health_score)).label,
    },
    { header: 'Asset Health Index', value: (row) => row.health_index, numeric: true },
    { header: 'Criticality', value: (row) => row.criticality_label },
    { header: 'Criticality Score', value: (row) => row.criticality_score, numeric: true },
    { header: 'Availability %', value: (row) => row.availability_pct, numeric: true },
    { header: 'MTBF Hours', value: (row) => row.mtbf_hours, numeric: true },
    { header: 'MTTR Minutes', value: (row) => row.mttr_minutes, numeric: true },
    { header: 'Failures', value: (row) => row.failures, numeric: true },
    { header: 'Downtime Hours', value: (row) => row.downtime_hours, numeric: true },
    { header: 'Utilisation %', value: (row) => row.utilisation_pct, numeric: true },
    { header: 'Risk Score', value: (row) => row.risk_score, numeric: true },
    { header: 'Risk', value: (row) => row.risk_label },
    { header: 'Priority', value: (row) => row.priority },
    { header: 'Cost Exposure', value: (row) => row.cost_exposure, numeric: true },
    { header: 'Decision', value: (row) => row.lifecycle_decision },
    { header: 'Recommended Action', value: (row) => String(row.recommended_action.action ?? '') },
    { header: 'Open Work Orders', value: (row) => row.open_work_orders, numeric: true },
  ];

  const runExport = () => {
    /* The export needs APM's projection, so it cannot run before the first load.
       Saying so is better than writing a file with correct headers and no rows. */
    if (exportRows.length === 0) {
      toast.info('Nothing to export yet', 'The APM projection is still loading for this scope.');
      return;
    }

    void exportReport(exportFormat, exportRows, exportColumns, {
      filename: 'intelora_asset_performance',
      title: 'Asset Performance Management',
      subtitle: `${exportRows.length} devices${category === 'all' ? '' : ` · ${category}`}`,
      generatedAt: at,
      notes: [
        `Mean health ${formatNumber(stats.health, 1)}, availability ${formatPercent(stats.availability, 1)}`,
        `Health spread across the group ${formatNumber(stats.spread, 1)} points`,
      ],
    });
    toast.success('Export started', `${exportRows.length} devices to ${exportFormat.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.apm.title}
        subtitle={MODULE_TITLES.apm.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Activity}>
              {stats.count} devices compared
            </Badge>
            <Badge tone="neutral" size="sm">
              Mean health {formatNumber(stats.health, 1)}
            </Badge>
            {kpis.criticalAssets > 0 ? (
              <Badge tone="critical" size="sm" icon={ShieldAlert}>
                {kpis.criticalAssets} critical
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Availability" value={formatPercent(stats.availability, 1)} />
            <MetaStat label="Performance score" value={formatPercent(stats.performance, 1)} />
            <MetaStat label="Quality" value={formatPercent(stats.quality, 1)} />
            <MetaStat label="Health spread" value={`${formatNumber(stats.spread, 1)} pts`} />
          </>
        }
        actions={
          <>
            <Select
              size="sm"
              aria-label="Category scope"
              options={[
                { value: 'all', label: 'Whole estate' },
                ...DEVICE_CATEGORIES.map((entry) => ({ value: entry, label: entry })),
              ]}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              containerClassName="w-44"
            />
            <Select
              size="sm"
              aria-label="Export format"
              options={[
                { value: 'csv', label: 'CSV' },
                { value: 'excel', label: 'Excel' },
                { value: 'pdf', label: 'PDF' },
              ]}
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as ReportFormat)}
              containerClassName="w-24"
            />
            <Button variant="primary" size="sm" icon={Download} onClick={runExport}>
              Export
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Average fleet health"
          value={formatNumber(stats.health, 1)}
          unit="%"
          caption={`${stats.count} device${stats.count === 1 ? '' : 's'} in scope`}
          icon={Activity}
          accent={healthAccent}
          trail={trail.map((point) => point.health)}
        />
        <StatTile
          label="Availability"
          value={formatNumber(stats.availability, 1)}
          unit="%"
          caption="Share of observed time spent reporting"
          icon={ShieldCheck}
          accent={stats.availability >= 95 ? STATUS_COLOR.good : STATUS_COLOR.warning}
        />
        <StatTile
          label="Performance score"
          value={formatNumber(stats.performance, 1)}
          unit="%"
          caption="Throughput against nominal capability"
          icon={TrendingUp}
          accent={stats.performance >= 90 ? STATUS_COLOR.good : STATUS_COLOR.warning}
          trail={trail.map((point) => point.oee)}
        />
        <StatTile
          label="Health spread"
          value={formatNumber(stats.spread, 1)}
          unit="pts"
          caption="Gap between the strongest and weakest device"
          icon={Layers}
          accent={stats.spread > 40 ? STATUS_COLOR.warning : SERIES[0]}
        />
      </div>

      <AiPanel module="apm" />

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <LineTrend
          title="Fleet condition trend"
          subtitle="Mean health and effectiveness across the streaming window"
          eyebrow="Trend"
          icon={Activity}
          data={trail}
          series={TREND_SERIES}
          height={280}
          domain={[40, 100]}
          endLabels
          references={[{ value: 95, label: 'Healthy 95' }]}
          footnote="Both series are means across reporting devices. The spread below matters more than the mean: a good average can hide a failing tail."
        />

        <BarTrend
          title="Condition distribution"
          subtitle="Device count per health band in the current scope"
          eyebrow="Population"
          icon={Layers}
          data={bandBars}
          series={[{ key: 'count', name: 'Devices', color: SERIES[0], decimals: 0 }]}
          height={280}
          colorFor={(point) => {
            const label = String(point.label ?? '');
            return BANDS.find((band) => band.label === label)?.color ?? SERIES[0];
          }}
          footnote="Bands: Healthy 95+, Good 80–94, Warning 65–79, Critical below 65."
        />
      </div>

      {/* Fleet comparison — ranking is this module's core job. */}
      <div className="space-y-4">
        <SectionHeader
          title="Fleet health ranking"
          subtitle="Which devices are holding the estate back, and which are setting the standard"
          actions={
            <Segmented
              ariaLabel="Ranking direction"
              layoutId="apm-rank"
              size="xs"
              options={[
                { value: 'worst', label: 'Worst first' },
                { value: 'best', label: 'Best first' },
              ]}
              value={rankMode}
              onChange={setRankMode}
            />
          }
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <RankList
            title={rankMode === 'worst' ? 'Worst performers' : 'Best performers'}
            subtitle={
              rankMode === 'worst'
                ? 'Lowest health — these set the floor for every fleet-level figure'
                : 'Highest health — the benchmark for the rest of the estate'
            }
            eyebrow="Ranking"
            icon={rankMode === 'worst' ? ShieldAlert : ShieldCheck}
            items={rankRows.slice(0, 10).map((asset) => ({
              id: asset.assetId,
              title: asset.assetName,
              tag: asset.assetId,
              subtitle: `${asset.category} · availability ${formatPercent(asset.availability, 1)}`,
              value: <HealthValue health={asset.health} />,
              trailing: <HealthBandBadge band={asset.band} size="xs" showIcon={false} />,
              href: deviceDetailPath(asset.assetId),
            }))}
          />

          <Card flush>
            <div className="p-4 sm:p-5">
              <CardHeader
                title="Category comparison"
                subtitle="Mean condition, availability and effectiveness per device class"
                eyebrow="Rollup"
                icon={Layers}
              />
            </div>

            <div className="scroll-x">
              <table className="w-full border-collapse" style={{ minWidth: '38rem' }}>
                <thead>
                  <tr className="border-y border-overlay/[0.06] bg-ink-850/40">
                    {['Category', 'Devices', 'Health', 'Availability', 'Performance'].map((label, index) => (
                      <th
                        key={label}
                        scope="col"
                        className={`whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-dim ${
                          index === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-overlay/[0.04]">
                  {categories.map((row) => (
                    <tr key={row.category} className="row-hover">
                      <td className="px-4 py-2.5 text-[12px] font-medium text-fg">{row.category}</td>
                      <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-fg-soft">
                        {row.online}/{row.assets}
                      </td>
                      <td className="px-4 py-2.5">
                        <HealthMeter health={row.averageHealth} width="w-16" className="justify-end" />
                      </td>
                      <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-fg-soft">
                        {formatPercent(row.availability, 1)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2.5">
                          <Progress
                            value={row.oee}
                            size="xs"
                            color={row.oee >= 85 ? STATUS_COLOR.good : STATUS_COLOR.warning}
                            className="w-14"
                            label={`Effectiveness ${formatPercent(row.oee, 1)}`}
                          />
                          <span className="w-11 text-right text-[12px] tabular-nums text-fg-soft">
                            {formatPercent(row.oee, 1)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <BarTrend
        title="Category health against availability"
        subtitle="Grouped comparison across every device class"
        eyebrow="Comparison"
        icon={TrendingUp}
        data={categoryBars}
        series={[
          { key: 'health', name: 'Mean health', color: SERIES[0], unit: '%', decimals: 1 },
          { key: 'availability', name: 'Availability', color: SERIES[2], unit: '%', decimals: 1 },
        ]}
        layout="horizontal"
        height={340}
        categoryWidth={150}
        footnote="Grouped rather than stacked: health and availability are independent measures, so stacking them would imply a total that does not exist."
      />

      <AssetStatusMatrix
        title="Estate condition matrix"
        subtitle="Every device in scope, coloured by condition band and grouped by category"
        eyebrow="Comparison"
        icon={Layers}
        assets={scoped}
        footnote="Categories are ordered by mean condition. Select any cell to open that device."
      />

      <RiskDistributionBar
        title="Risk composition by category"
        subtitle="How operational risk is distributed across the estate"
        eyebrow="Distribution"
        icon={ShieldAlert}
        assets={scoped}
        criticalByAsset={criticals}
      />

      <GrafanaPanel
        dashboard={env.grafana.dashboards.apm}
        panelId={5}
        title="Availability and downtime attribution"
        subtitle="Historical performance analysis served from Grafana"
        height={320}
        refresh="1m"
        variables={{ category }}
      />
    </div>
  );
};
