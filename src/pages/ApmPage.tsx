import { useMemo, useState } from 'react';
import { Activity, Download, Layers, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { BANDS, bandDef } from '@/engine/derive';
import { criticalByAsset } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { env } from '@/config/env';
import { deviceDetailPath } from '@/routes/paths';
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

  const criticals = useMemo(() => criticalByAsset(journal), [journal]);

  const scoped = useMemo(
    () => (category === 'all' ? assets : assets.filter((asset) => asset.device.category === category)),
    [assets, category],
  );

  const stats = useMemo(() => {
    const source = scoped.length > 0 ? scoped : assets;
    const mean = (pick: (asset: AssetRuntime) => number) =>
      source.length === 0 ? 0 : source.reduce((sum, asset) => sum + pick(asset), 0) / source.length;

    return {
      health: mean((asset) => asset.health),
      availability: mean((asset) => asset.performance.availability),
      performance: mean((asset) => asset.performance.performance),
      quality: mean((asset) => asset.performance.quality),
      oee: mean((asset) => asset.performance.oee),
      count: source.length,
      spread:
        source.length === 0
          ? 0
          : Math.max(...source.map((asset) => asset.health)) - Math.min(...source.map((asset) => asset.health)),
    };
  }, [scoped, assets]);

  const ranked = useMemo(() => {
    const sorted = [...scoped].sort((a, b) => a.health - b.health);
    return rankMode === 'worst' ? sorted : [...sorted].reverse();
  }, [scoped, rankMode]);

  const bandBars = useMemo(
    () =>
      BANDS.map((band) => ({
        label: band.label,
        count: scoped.filter((asset) => asset.band === band.band).length,
      })),
    [scoped],
  );

  const categoryBars = useMemo(
    () =>
      categories.map((row) => ({
        label: row.category,
        health: row.averageHealth,
        availability: row.availability,
      })),
    [categories],
  );

  const exportColumns: Array<ReportColumn<AssetRuntime>> = [
    { header: 'Asset ID', value: (row) => row.device.assetId },
    { header: 'Asset Name', value: (row) => row.device.assetName },
    { header: 'Category', value: (row) => row.device.category },
    { header: 'Brand', value: (row) => row.device.brand },
    { header: 'Status', value: (row) => row.device.status },
    { header: 'Health', value: (row) => row.health, numeric: true },
    { header: 'Condition Band', value: (row) => bandDef(row.band).label },
    { header: 'Availability %', value: (row) => row.performance.availability, numeric: true },
    { header: 'Performance %', value: (row) => row.performance.performance, numeric: true },
    { header: 'Quality %', value: (row) => row.performance.quality, numeric: true },
    { header: 'OEE %', value: (row) => row.performance.oee, numeric: true },
    { header: 'Uptime %', value: (row) => row.performance.uptimeRatio * 100, numeric: true },
    { header: 'Open Alerts', value: (row) => row.performance.anomalies24h, numeric: true },
  ];

  const runExport = () => {
    void exportReport(exportFormat, ranked, exportColumns, {
      filename: 'intelora_asset_performance',
      title: 'Asset Performance Management',
      subtitle: `${ranked.length} devices${category === 'all' ? '' : ` · ${category}`}`,
      generatedAt: at,
      notes: [
        `Mean health ${formatNumber(stats.health, 1)}, availability ${formatPercent(stats.availability, 1)}`,
        `Health spread across the group ${formatNumber(stats.spread, 1)} points`,
      ],
    });
    toast.success('Export started', `${ranked.length} devices to ${exportFormat.toUpperCase()}.`);
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
          accent={bandDef(stats.health >= 95 ? 'healthy' : stats.health >= 80 ? 'good' : 'warning').color}
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
            items={ranked.slice(0, 10).map((asset) => ({
              id: asset.device.assetId,
              title: asset.device.assetName,
              tag: asset.device.assetId,
              subtitle: `${asset.device.category} · availability ${formatPercent(asset.performance.availability, 1)}`,
              value: <HealthValue health={asset.health} />,
              trailing: <HealthBandBadge band={asset.band} size="xs" showIcon={false} />,
              href: deviceDetailPath(asset.device.assetId),
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
