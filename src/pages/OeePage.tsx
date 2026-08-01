import { useMemo, useState } from 'react';
import { Activity, Clock3, Download, Gauge, Layers, Target, TrendingDown } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { OEE_TARGET, OEE_WORLD_CLASS } from '@/engine/derive';
import { effectivenessLosses } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { env } from '@/config/env';
import { deviceDetailPath } from '@/routes/paths';
import { useAssetList, useCategoryRollups, useFleetTrail, useSnapshot } from '@/engine/store';
import { formatNumber, formatPercent } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useToast } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Select } from '@/components/ui/Select';
import { BarTrend, LineTrend, WaterfallChart } from '@/components/charts';
import type { SeriesDef } from '@/components/charts';
import { AiPanel } from '@/components/ai';
import { GrafanaPanel } from '@/components/grafana';
import { MetaStat, PageHeader, RankList, SectionHeader, StatTile } from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Overall equipment effectiveness.
 *
 * Availability × performance × quality, kept consistent with health by
 * construction: availability is measured uptime, while performance and quality
 * are functions of condition and anomaly load in the engine's derivation layer.
 * A device cannot show poor health and perfect effectiveness.
 *
 * The loss cascade decomposes the real gap rather than assuming a distribution —
 * each arm is scaled by the factors before it, which is how the three compose.
 * ─────────────────────────────────────────────────────────────────────────── */

/* Built per render so series colours follow the active theme. */
const buildTrendSeries = (): SeriesDef[] => [
  { key: 'oee', name: 'Effectiveness', color: SERIES[0], unit: '%', decimals: 1 },
  { key: 'health', name: 'Mean health', color: SERIES[2], unit: '%', decimals: 1 },
];

const FactorBar = ({
  label,
  value,
  target,
  color,
  caption,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
  caption: string;
}) => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] font-medium text-fg-soft">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold tabular-nums text-fg">{formatPercent(value, 1)}</span>
        <span className="text-[10px] tabular-nums text-fg-faint">/ {target}%</span>
      </span>
    </div>
    <Progress value={value} marker={target} color={color} size="md" className="mt-2" label={label} />
    <p className="mt-1.5 text-[10.5px] leading-relaxed text-fg-dim">{caption}</p>
  </div>
);

export const OeePage = () => {
  const toast = useToast();
  const assets = useAssetList();
  const categories = useCategoryRollups();
  const trail = useFleetTrail();
  const { at } = useSnapshot();

  const [category, setCategory] = useState('all');
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const TREND_SERIES = buildTrendSeries();

  const scoped = useMemo(
    () => (category === 'all' ? assets : assets.filter((asset) => asset.device.category === category)),
    [assets, category],
  );

  const scopedOee = useMemo(() => {
    const source = scoped.length > 0 ? scoped : assets;
    const mean = (pick: (asset: AssetRuntime) => number) =>
      source.length === 0 ? 0 : source.reduce((sum, asset) => sum + pick(asset), 0) / source.length;

    const availability = mean((asset) => asset.performance.availability);
    const performance = mean((asset) => asset.performance.performance);
    const quality = mean((asset) => asset.performance.quality);

    return {
      availability,
      performance,
      quality,
      oee: mean((asset) => asset.performance.oee),
      count: source.length,
    };
  }, [scoped, assets]);

  const losses = useMemo(
    () => effectivenessLosses(scopedOee.availability, scopedOee.performance, scopedOee.quality),
    [scopedOee],
  );

  const gap = Math.max(0, OEE_TARGET - scopedOee.oee);

  /* The binding constraint — the factor with the largest shortfall against its
   * own objective, which is where effort actually returns. */
  const constraint = useMemo(() => {
    const candidates = [
      { key: 'Availability', shortfall: 90 - scopedOee.availability, value: scopedOee.availability },
      { key: 'Performance', shortfall: 95 - scopedOee.performance, value: scopedOee.performance },
      { key: 'Quality', shortfall: 99 - scopedOee.quality, value: scopedOee.quality },
    ];
    return candidates.sort((a, b) => b.shortfall - a.shortfall)[0];
  }, [scopedOee]);

  const categoryBars = useMemo(
    () =>
      categories.map((row) => ({
        label: row.category,
        oee: row.oee,
      })),
    [categories],
  );

  const factorBars = useMemo(
    () =>
      categories.map((row) => {
        const rows = assets.filter((asset) => asset.device.category === row.category);
        const mean = (pick: (asset: AssetRuntime) => number) =>
          rows.length === 0 ? 0 : rows.reduce((sum, asset) => sum + pick(asset), 0) / rows.length;
        return {
          label: row.category,
          availability: Number(mean((asset) => asset.performance.availability).toFixed(1)),
          performance: Number(mean((asset) => asset.performance.performance).toFixed(1)),
          quality: Number(mean((asset) => asset.performance.quality).toFixed(1)),
        };
      }),
    [categories, assets],
  );

  const ranked = useMemo(() => [...scoped].sort((a, b) => a.performance.oee - b.performance.oee), [scoped]);

  const exportColumns: Array<ReportColumn<AssetRuntime>> = [
    { header: 'Asset ID', value: (row) => row.device.assetId },
    { header: 'Asset Name', value: (row) => row.device.assetName },
    { header: 'Category', value: (row) => row.device.category },
    { header: 'Status', value: (row) => row.device.status },
    { header: 'OEE %', value: (row) => row.performance.oee, numeric: true },
    { header: 'Availability %', value: (row) => row.performance.availability, numeric: true },
    { header: 'Performance %', value: (row) => row.performance.performance, numeric: true },
    { header: 'Quality %', value: (row) => row.performance.quality, numeric: true },
    { header: 'Health', value: (row) => row.health, numeric: true },
    { header: 'Target %', value: () => OEE_TARGET, numeric: true },
  ];

  const runExport = () => {
    void exportReport(exportFormat, ranked, exportColumns, {
      filename: 'intelora_effectiveness',
      title: 'Overall Equipment Effectiveness',
      subtitle: `${ranked.length} devices${category === 'all' ? '' : ` · ${category}`}`,
      generatedAt: at,
      notes: [
        `Effectiveness ${formatPercent(scopedOee.oee, 1)} against a ${OEE_TARGET}% target`,
        `Binding constraint: ${constraint.key.toLowerCase()} at ${formatPercent(constraint.value, 1)}`,
      ],
    });
    toast.success('Export started', `${ranked.length} devices to ${exportFormat.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.oee.title}
        subtitle={MODULE_TITLES.oee.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Gauge}>
              Effectiveness {formatPercent(scopedOee.oee, 1)}
            </Badge>
            <Badge tone={scopedOee.oee >= OEE_TARGET ? 'good' : 'warning'} size="sm" dot>
              {scopedOee.oee >= OEE_TARGET
                ? `${formatPercent(scopedOee.oee - OEE_TARGET, 1)} above target`
                : `${formatPercent(gap, 1)} below target`}
            </Badge>
            <Badge tone="neutral" size="sm">
              Target {OEE_TARGET}% · world class {OEE_WORLD_CLASS}%
            </Badge>
          </>
        }
        meta={
          <>
            <MetaStat label="Availability" value={formatPercent(scopedOee.availability, 1)} />
            <MetaStat label="Performance" value={formatPercent(scopedOee.performance, 1)} />
            <MetaStat label="Quality" value={formatPercent(scopedOee.quality, 1)} />
            <MetaStat label="Binding constraint" value={constraint.key} />
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
          label="Overall effectiveness"
          value={formatNumber(scopedOee.oee, 1)}
          unit="%"
          caption={`${scopedOee.count} device${scopedOee.count === 1 ? '' : 's'} in scope`}
          icon={Gauge}
          accent={scopedOee.oee >= OEE_TARGET ? STATUS_COLOR.good : STATUS_COLOR.warning}
          trail={trail.map((point) => point.oee)}
          target={{ value: OEE_TARGET, unit: '%' }}
        />
        <StatTile
          label="Availability"
          value={formatNumber(scopedOee.availability, 1)}
          unit="%"
          caption="Share of observed time spent reporting"
          icon={Clock3}
          accent={scopedOee.availability >= 90 ? STATUS_COLOR.good : STATUS_COLOR.warning}
          target={{ value: 90, unit: '%' }}
        />
        <StatTile
          label="Performance"
          value={formatNumber(scopedOee.performance, 1)}
          unit="%"
          caption="Throughput against nominal capability"
          icon={Activity}
          accent={scopedOee.performance >= 95 ? STATUS_COLOR.good : STATUS_COLOR.warning}
          target={{ value: 95, unit: '%' }}
        />
        <StatTile
          label="Quality"
          value={formatNumber(scopedOee.quality, 1)}
          unit="%"
          caption="First-pass yield from condition and alarm load"
          icon={Target}
          accent={scopedOee.quality >= 99 ? STATUS_COLOR.good : STATUS_COLOR.warning}
          target={{ value: 99, unit: '%' }}
        />
      </div>

      <AiPanel module="oee" />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.45fr]">
        <Card className="flex flex-col">
          <CardHeader
            title="Factor decomposition"
            subtitle="Effectiveness is the product of the three factors, each against its own objective"
            eyebrow="Factors"
            icon={Layers}
          />

          <div className="mt-5 space-y-5">
            <FactorBar
              label="Availability"
              value={scopedOee.availability}
              target={90}
              color={SERIES[2]}
              caption="Time spent reporting rather than unreachable or idle"
            />
            <FactorBar
              label="Performance"
              value={scopedOee.performance}
              target={95}
              color={SERIES[3]}
              caption="Reduced by degraded condition and thermal throttling"
            />
            <FactorBar
              label="Quality"
              value={scopedOee.quality}
              target={99}
              color={SERIES[4]}
              caption="First-pass yield, degraded by condition and open alarms"
            />
          </div>

          <div className="mt-5 rounded-xl border border-brand-400/20 bg-brand-500/[0.06] p-3.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-100">
              <TrendingDown size={12} aria-hidden />
              {constraint.key} is the binding constraint
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
              At {formatPercent(constraint.value, 1)} it sits furthest from its objective, so effort spent on the other
              two factors will not move the headline figure. Multiplication is unforgiving: the weakest factor caps the
              product regardless of how strong the others are.
            </p>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <LineTrend
            title="Effectiveness trend"
            subtitle="Effectiveness alongside mean condition across the streaming window"
            eyebrow="Trend"
            icon={Activity}
            data={trail}
            series={TREND_SERIES}
            height={252}
            domain={[40, 100]}
            endLabels
            references={[{ value: OEE_TARGET, label: `Target ${OEE_TARGET}%` }]}
            footnote="The two series track together because performance and quality are functions of condition — a device cannot show poor health and perfect effectiveness."
          />

          <BarTrend
            title="Effectiveness by category"
            subtitle="Mean effectiveness per device class against target"
            eyebrow="Comparison"
            icon={Layers}
            data={categoryBars}
            series={[{ key: 'oee', name: 'Effectiveness', color: SERIES[0], unit: '%', decimals: 1 }]}
            layout="horizontal"
            height={252}
            categoryWidth={150}
            references={[{ value: OEE_TARGET, label: `${OEE_TARGET}%` }]}
            colorFor={(point) => {
              const value = Number(point.oee ?? 0);
              return value >= OEE_TARGET
                ? STATUS_COLOR.good
                : value >= 65
                  ? STATUS_COLOR.warning
                  : STATUS_COLOR.critical;
            }}
          />
        </div>
      </div>

      <WaterfallChart
        title="Loss accounting cascade"
        subtitle="How a theoretical 100% is consumed by availability, performance and quality losses"
        eyebrow="Attribution"
        icon={TrendingDown}
        steps={losses.map((loss) => ({
          key: loss.key,
          label: loss.label,
          loss: loss.loss,
          detail: loss.detail,
        }))}
        start={100}
        startLabel="Theoretical"
        endLabel="Actual"
        unit="%"
        height={320}
        footnote="Each arm is scaled by the factors preceding it, so the cascade sums to the measured gap rather than to an assumed distribution."
      />

      <div className="space-y-4">
        <SectionHeader
          title="Effectiveness ranking"
          subtitle="Where the recoverable loss is concentrated"
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <RankList
            title="Lowest effectiveness"
            subtitle="Devices consuming the largest share of the recoverable loss"
            eyebrow="Ranking"
            icon={TrendingDown}
            items={ranked.slice(0, 8).map((asset) => ({
              id: asset.device.assetId,
              title: asset.device.assetName,
              tag: asset.device.assetId,
              subtitle: `${asset.device.category} · A ${formatNumber(asset.performance.availability, 0)} · P ${formatNumber(asset.performance.performance, 0)} · Q ${formatNumber(asset.performance.quality, 0)}`,
              value: formatPercent(asset.performance.oee, 1),
              trailing: (
                <Progress
                  value={asset.performance.oee}
                  marker={OEE_TARGET}
                  size="xs"
                  color={asset.performance.oee >= OEE_TARGET ? STATUS_COLOR.good : STATUS_COLOR.warning}
                  className="w-16"
                  label={`Effectiveness ${formatPercent(asset.performance.oee, 1)}`}
                />
              ),
              href: deviceDetailPath(asset.device.assetId),
            }))}
          />

          <BarTrend
            title="Factor comparison by category"
            subtitle="Availability, performance and quality side by side"
            eyebrow="Breakdown"
            icon={Gauge}
            data={factorBars}
            series={[
              { key: 'availability', name: 'Availability', color: SERIES[2], unit: '%', decimals: 1 },
              { key: 'performance', name: 'Performance', color: SERIES[3], unit: '%', decimals: 1 },
              { key: 'quality', name: 'Quality', color: SERIES[4], unit: '%', decimals: 1 },
            ]}
            layout="horizontal"
            height={360}
            categoryWidth={150}
            footnote="Grouped, never stacked: the three factors multiply into effectiveness, so stacking them would misrepresent the total."
          />
        </div>
      </div>

      <GrafanaPanel
        dashboard={env.grafana.dashboards.oee}
        panelId={6}
        title="Effectiveness and loss history"
        subtitle="Long-term effectiveness analysis served from Grafana"
        height={320}
        refresh="1m"
        variables={{ category }}
      />
    </div>
  );
};
