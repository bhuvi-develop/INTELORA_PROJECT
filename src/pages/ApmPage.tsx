import { useMemo, useState } from 'react';
import {
  Activity,
  Download,
  Layers,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { AssetRuntime, HealthBand } from '@/engine/types';
import type { ApmAssetDto, ApmWorkOrder } from '@/services/apm.types';
import { BANDS, bandDef, bandOf } from '@/engine/derive';
import { criticalByAsset } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { env } from '@/config/env';
import { useApmHierarchy, useApmOverview } from '@/hooks/useApm';
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
import {
  ApmAssetDetailModal,
  ApmBenchmarkingPanel,
  ApmExecutiveDashboard,
  ApmHierarchyTree,
  ApmWorkOrderLifecycleModal,
} from '@/components/apm';
import {
  ApmAssetsPage,
  ApmAvailabilityPage,
  ApmCostPage,
  ApmCriticalityPage,
  ApmHealthPage,
  ApmMaintenancePage,
  ApmReliabilityPage,
  ApmReportsPage,
  ApmWorkOrdersPage,
} from '@/pages/apm';

/* ───────────────────────────────────────────────────────────────────────────
 * Enterprise Asset Performance Management (APM) Module.
 *
 * Comprehensive decision and analytics hub for connected estate assets.
 * ─────────────────────────────────────────────────────────────────────────── */

const buildTrendSeries = (): SeriesDef[] => [
  { key: 'health', name: 'Mean fleet health', color: SERIES[0], unit: '%', decimals: 1 },
  { key: 'oee', name: 'Mean effectiveness', color: SERIES[3], unit: '%', decimals: 1 },
];

type RankMode = 'worst' | 'best';
type ApmTab =
  | 'overview'
  | 'registry'
  | 'criticality'
  | 'reliability'
  | 'maintenance'
  | 'cost'
  | 'executive'
  | 'reports';

export const ApmPage = () => {
  const toast = useToast();
  const assets = useAssetList();
  const kpis = useFleetKpis();
  const categories = useCategoryRollups();
  const trail = useFleetTrail();
  const journal = useAnomalyJournal();
  const { at } = useSnapshot();

  const [activeTab, setActiveTab] = useState<ApmTab>('overview');
  const [rankMode, setRankMode] = useState<RankMode>('worst');
  const [category, setCategory] = useState('all');
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  // Modal State for Asset Details & Work Order Lifecycles
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ApmWorkOrder | null>(null);

  const TREND_SERIES = buildTrendSeries();

  const apmQuery = useApmOverview(category === 'all' ? undefined : category);
  const hierarchyQuery = useApmHierarchy();

  const apmAssets = useMemo(() => apmQuery.data?.assets || [], [apmQuery.data]);
  const criticals = useMemo(() => criticalByAsset(journal), [journal]);

  const selectedAssetObject = useMemo(
    () => apmAssets.find((a) => a.asset_id === selectedAssetId) || null,
    [apmAssets, selectedAssetId]
  );

  const scoped = useMemo(
    () => (category === 'all' ? assets : assets.filter((asset) => asset.device.category === category)),
    [assets, category]
  );

  const stats = useMemo(() => {
    const scopeData = apmQuery.data?.scope;
    const source = scoped;
    const mean = (pick: (asset: AssetRuntime) => number) =>
      source.length === 0 ? 0 : source.reduce((sum, asset) => sum + pick(asset), 0) / source.length;

    return {
      health: scopeData?.mean_health ?? mean((asset) => asset.health),
      availability: scopeData?.availability_pct ?? mean((asset) => asset.performance.availability),
      spread:
        scopeData?.health_spread ??
        (source.length === 0
          ? 0
          : Math.max(...source.map((asset) => asset.health)) -
            Math.min(...source.map((asset) => asset.health))),
      count: scopeData?.assets ?? source.length,
      performance: mean((asset) => asset.performance.performance),
      quality: mean((asset) => asset.performance.quality),
    };
  }, [apmQuery.data, scoped]);

  const rankRows = useMemo(() => {
    const fromApm = apmQuery.data?.assets;
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

    return rankMode === 'worst' ? rows : [...rows].reverse();
  }, [apmQuery.data, scoped, rankMode]);

  const healthAccent = bandDef(bandOf(stats.health)).color;

  const bandBars = useMemo(() => {
    const counts = apmQuery.data?.scope.condition_band_counts;
    return BANDS.map((band) => ({
      label: band.label,
      count: counts
        ? counts[band.band] ?? 0
        : scoped.filter((asset) => asset.band === band.band).length,
    }));
  }, [apmQuery.data, scoped]);

  const categoryBars = useMemo(
    () =>
      categories.map((row) => ({
        label: row.category,
        health: row.averageHealth,
        availability: row.availability,
      })),
    [categories]
  );

  const exportColumns: Array<ReportColumn<ApmAssetDto>> = [
    { header: 'Asset ID', value: (row) => row.asset_id },
    { header: 'Asset Name', value: (row) => row.asset_name },
    { header: 'Category', value: (row) => row.category },
    { header: 'Brand', value: (row) => row.brand },
    { header: 'Status', value: (row) => row.status },
    { header: 'Health Index', value: (row) => row.health_index, numeric: true },
    { header: 'Criticality', value: (row) => row.criticality_label },
    { header: 'Criticality Score', value: (row) => row.criticality_score, numeric: true },
    { header: 'Availability %', value: (row) => row.availability_pct, numeric: true },
    { header: 'MTBF Hours', value: (row) => row.mtbf_hours, numeric: true },
    { header: 'MTTR Minutes', value: (row) => row.mttr_minutes, numeric: true },
    { header: 'Risk Tier', value: (row) => row.risk_tier },
    { header: 'Cost Exposure', value: (row) => row.cost_exposure, numeric: true },
    { header: 'Open Work Orders', value: (row) => row.open_work_orders, numeric: true },
  ];

  const runExport = () => {
    if (apmAssets.length === 0) {
      toast.info('Nothing to export yet', 'The APM projection is loading.');
      return;
    }

    void exportReport(exportFormat, apmAssets, exportColumns, {
      filename: 'intelora_asset_performance',
      title: 'Asset Performance Management Report',
      subtitle: `${apmAssets.length} assets connected`,
      generatedAt: at,
    });
    toast.success('Export started', `${apmAssets.length} records to ${exportFormat.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title={MODULE_TITLES.apm.title}
        subtitle="Enterprise Asset Performance, Reliability, Criticality, Maintenance & ROI Intelligence"
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Activity}>
              {stats.count} assets compared
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
            <MetaStat label="Performance" value={formatPercent(stats.performance, 1)} />
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

      {/* Top APM Module Capabilities Segmented Navigation Bar */}
      <Card className="p-2 backdrop-blur-md sticky top-0 z-20 bg-ink-900/90 border-overlay/[0.1]">
        <Segmented
          ariaLabel="APM Capabilities Navigation"
          layoutId="apm-tabs"
          size="sm"
          options={[
            { value: 'overview', label: '📊 Fleet Overview' },
            { value: 'registry', label: '🌳 Registry & Hierarchy' },
            { value: 'criticality', label: '🎯 Health & Criticality' },
            { value: 'reliability', label: '⚡ Reliability' },
            { value: 'maintenance', label: '🛠️ Maintenance & Orders' },
            { value: 'cost', label: '💰 Cost & ROI' },
            { value: 'executive', label: '📈 Executive & Benchmarks' },
            { value: 'reports', label: '📄 Reports' },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val as ApmTab)}
        />
      </Card>

      {/* Tab 1: Fleet Overview (Preserves all original sections) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
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
              caption="Gap between strongest and weakest device"
              icon={Layers}
              accent={stats.spread > 40 ? STATUS_COLOR.warning : SERIES[0]}
            />
          </div>

          <AiPanel module="apm" />

          <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
            <LineTrend
              title="Fleet condition trend"
              subtitle="Mean health and effectiveness across streaming window"
              eyebrow="Trend"
              icon={Activity}
              data={trail}
              series={TREND_SERIES}
              height={280}
              domain={[40, 100]}
              endLabels
              references={[{ value: 95, label: 'Healthy 95' }]}
              footnote="Both series are means across reporting devices."
            />

            <BarTrend
              title="Condition distribution"
              subtitle="Device count per health band in scope"
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

          <div className="space-y-4">
            <SectionHeader
              title="Fleet health ranking"
              subtitle="Which devices are holding the estate back vs setting the standard"
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
                    ? 'Lowest health — set the floor for fleet figures'
                    : 'Highest health — benchmark for the estate'
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
                  onClick: () => setSelectedAssetId(asset.assetId),
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
          />

          <AssetStatusMatrix
            title="Estate condition matrix"
            subtitle="Every device in scope, coloured by condition band"
            eyebrow="Comparison"
            icon={Layers}
            assets={scoped}
          />

          <RiskDistributionBar
            title="Risk composition by category"
            subtitle="How operational risk is distributed across estate"
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
      )}

      {/* Tab 2: Asset Registry & Hierarchy */}
      {activeTab === 'registry' && (
        <div className="space-y-6">
          <ApmHierarchyTree
            root={hierarchyQuery.data?.root}
            loading={hierarchyQuery.isLoading}
            onSelectAsset={(id) => setSelectedAssetId(id)}
          />
          <ApmAssetsPage />
        </div>
      )}

      {/* Tab 3: Composite Health & Criticality Engine */}
      {activeTab === 'criticality' && (
        <div className="space-y-6">
          <ApmCriticalityPage />
          <ApmHealthPage />
        </div>
      )}

      {/* Tab 4: Reliability Analytics */}
      {activeTab === 'reliability' && (
        <div className="space-y-6">
          <ApmReliabilityPage />
          <ApmAvailabilityPage />
        </div>
      )}

      {/* Tab 5: Maintenance Center & Work Orders */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <ApmMaintenancePage />
          <ApmWorkOrdersPage />
        </div>
      )}

      {/* Tab 6: Cost & ROI Analytics */}
      {activeTab === 'cost' && (
        <div className="space-y-6">
          <ApmCostPage />
        </div>
      )}

      {/* Tab 7: Executive Dashboard & Benchmarking */}
      {activeTab === 'executive' && (
        <div className="space-y-6">
          <ApmExecutiveDashboard
            assets={apmAssets}
            reliability={apmQuery.data?.fleet_reliability}
            onSelectAsset={(id) => setSelectedAssetId(id)}
          />
          <ApmBenchmarkingPanel assets={apmAssets} />
        </div>
      )}

      {/* Tab 8: Reports */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <ApmReportsPage />
        </div>
      )}

      {/* Asset Detail Drawer / Modal */}
      <ApmAssetDetailModal
        asset={selectedAssetObject}
        isOpen={Boolean(selectedAssetId)}
        onClose={() => setSelectedAssetId(null)}
      />

      {/* Work Order Lifecycle Modal */}
      <ApmWorkOrderLifecycleModal
        order={selectedOrder}
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
};
