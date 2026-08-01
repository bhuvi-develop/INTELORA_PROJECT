import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BrainCircuit,
  CalendarClock,
  Clock3,
  Download,
  Gauge,
  Target,
  TrendingDown,
  Waypoints,
} from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { PREDICTION_HORIZON_DAYS, bandDef } from '@/engine/derive';
import { bucketRul, componentQueue, projectDegradation, type ComponentRow } from '@/engine/analytics';
import { DEVICE_CATEGORIES } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { env } from '@/config/env';
import { deviceDetailPath } from '@/routes/paths';
import { useAssetList, useSnapshot } from '@/engine/store';
import { formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Progress } from '@/components/ui/Progress';
import { Segmented } from '@/components/ui/Segmented';
import { Select } from '@/components/ui/Select';
import { BarTrend, DegradationChart, RadialGauge } from '@/components/charts';
import { AiPanel } from '@/components/ai';
import { GrafanaPanel } from '@/components/grafana';
import { DataTable, TableToolbar, type FilterDef } from '@/components/data';
import {
  DeviceIdentity,
  HealthValue,
  MetaStat,
  PageHeader,
  RankList,
  SectionHeader,
  StatTile,
} from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Predictive maintenance.
 *
 * Remaining life is projected from each component's sustained wear rate, and the
 * published figures are ratcheted: reported life only tightens and reported
 * probability only rises. A passing thermal excursion therefore does not swing
 * the estimate, and a prediction reads as a commitment that firms up rather than
 * a number that wanders.
 * ─────────────────────────────────────────────────────────────────────────── */

type Horizon = '7' | '30' | '90' | 'all';

const HORIZON_OPTIONS: Array<{ value: Horizon; label: string }> = [
  { value: '7', label: '7 d' },
  { value: '30', label: '30 d' },
  { value: '90', label: '90 d' },
  { value: 'all', label: 'All' },
];

const probabilityTone = (probability: number): string =>
  probability > 0.6 ? STATUS_COLOR.critical : probability > 0.3 ? STATUS_COLOR.warning : STATUS_COLOR.good;

const rulTone = (days: number): string =>
  days <= 7 ? STATUS_COLOR.critical : days <= 30 ? STATUS_COLOR.serious : days <= 90 ? STATUS_COLOR.warning : SERIES[0];

export const PredictiveMaintenancePage = () => {
  const toast = useToast();
  const { density } = useUI();
  const assets = useAssetList();
  const { at } = useSnapshot();

  const [search, setSearch] = useState('');
  const [horizon, setHorizon] = useState<Horizon>('90');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<AssetRuntime | null>(null);
  const [exportFormat, setExportFormat] = useState<ReportFormat>('csv');

  const debouncedSearch = useDebounce(search, 240);

  const queue = useMemo(() => componentQueue(assets), [assets]);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    const limit = horizon === 'all' ? Number.POSITIVE_INFINITY : Number(horizon);

    return queue.filter((row) => {
      if (row.rulDays > limit) return false;
      if (category !== 'all' && row.category !== category) return false;
      if (needle.length > 0) {
        const haystack = `${row.assetId} ${row.assetName} ${row.component} ${row.category}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [queue, horizon, category, debouncedSearch]);

  const stats = useMemo(() => {
    const primaries = assets.map((asset) => asset.prediction.primary);
    const meanRul = primaries.length === 0 ? 0 : primaries.reduce((sum, p) => sum + p.rulDays, 0) / primaries.length;
    const meanConfidence =
      primaries.length === 0 ? 0 : primaries.reduce((sum, p) => sum + p.confidence, 0) / primaries.length;

    return {
      scored: assets.length,
      components: queue.length,
      meanRul,
      meanConfidence,
      withinHorizon: queue.filter((row) => row.rulDays <= PREDICTION_HORIZON_DAYS).length,
      urgent: queue.filter((row) => row.rulDays <= 7).length,
      highProbability: queue.filter((row) => row.failureProbability >= 0.5).length,
    };
  }, [assets, queue]);

  const rulBuckets = useMemo(() => bucketRul(assets), [assets]);

  const projection = useMemo(() => (selected ? projectDegradation(selected, at) : []), [selected, at]);

  const columns = useMemo<Array<ColumnDef<ComponentRow, unknown>>>(
    () => [
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetName,
        enableSorting: true,
        meta: { width: '17rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.assetId}
            assetName={row.original.assetName}
            meta={row.original.category}
          />
        ),
      },
      {
        id: 'component',
        header: 'Component',
        accessorFn: (row) => row.component,
        enableSorting: true,
        meta: { width: '12rem' },
        cell: ({ row }) => (
          <span className="text-[12.5px] font-medium text-fg">
            {row.original.isPrimary ? <span className="mr-1 text-brand-300">●</span> : null}
            {row.original.component}
          </span>
        ),
      },
      {
        id: 'probability',
        header: 'Failure probability',
        accessorFn: (row) => row.failureProbability,
        enableSorting: true,
        meta: { width: '11rem', numeric: true },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2.5">
            <Progress
              value={row.original.failureProbability * 100}
              size="xs"
              color={probabilityTone(row.original.failureProbability)}
              className="w-14"
              label={`Failure probability ${formatPercent(row.original.failureProbability * 100, 1)}`}
            />
            <span className="w-12 text-right text-[12.5px] font-semibold tabular-nums text-fg">
              {formatPercent(row.original.failureProbability * 100, 1)}
            </span>
          </div>
        ),
      },
      {
        id: 'rul',
        header: 'Remaining life',
        accessorFn: (row) => row.rulDays,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span
            className="text-[12.5px] font-semibold tabular-nums"
            style={{ color: rulTone(row.original.rulDays) }}
          >
            {formatNumber(row.original.rulDays, row.original.rulDays < 10 ? 1 : 0)} d
          </span>
        ),
      },
      {
        id: 'confidence',
        header: 'Confidence',
        accessorFn: (row) => row.confidence,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {formatPercent(row.original.confidence * 100, 0)}
          </span>
        ),
      },
      {
        id: 'wear',
        header: 'Wear',
        accessorFn: (row) => row.wear,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-dim">{formatPercent(row.original.wear * 100, 1)}</span>
        ),
      },
      {
        id: 'health',
        header: 'Device health',
        accessorFn: (row) => row.health,
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => <HealthValue health={row.original.health} />,
      },
      {
        id: 'recommendation',
        header: 'Recommendation',
        accessorFn: (row) => row.recommendation,
        enableSorting: false,
        meta: { width: '19rem' },
        cell: ({ row }) => (
          <span className="text-[11.5px] leading-relaxed text-fg-muted">{row.original.recommendation}</span>
        ),
      },
    ],
    [],
  );

  const filters: FilterDef[] = [
    {
      key: 'category',
      label: 'Category',
      value: category,
      options: [
        { value: 'all', label: 'All categories' },
        ...DEVICE_CATEGORIES.map((entry) => ({ value: entry, label: entry })),
      ],
      onChange: setCategory,
    },
  ];

  const exportColumns: Array<ReportColumn<ComponentRow>> = [
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Category', value: (row) => row.category },
    { header: 'Component', value: (row) => row.component },
    { header: 'Failure Probability', value: (row) => row.failureProbability, numeric: true },
    { header: 'Remaining Life (days)', value: (row) => row.rulDays, numeric: true },
    { header: 'Confidence', value: (row) => row.confidence, numeric: true },
    { header: 'Wear', value: (row) => row.wear, numeric: true },
    { header: 'Device Health', value: (row) => row.health, numeric: true },
    { header: 'Recommendation', value: (row) => row.recommendation },
  ];

  const runExport = () => {
    if (filtered.length === 0) {
      toast.warning('Nothing to export', 'No components fall inside the selected horizon.');
      return;
    }
    void exportReport(exportFormat, filtered, exportColumns, {
      filename: 'intelora_predictions',
      title: 'Predictive Maintenance',
      subtitle: `${filtered.length} components${horizon === 'all' ? '' : ` inside a ${horizon}-day horizon`}`,
      generatedAt: at,
      notes: [
        `${stats.urgent} component(s) inside seven days`,
        `Mean confidence ${formatPercent(stats.meanConfidence * 100, 0)}`,
      ],
    });
    toast.success('Export started', `${filtered.length} predictions to ${exportFormat.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.predictive.title}
        subtitle={MODULE_TITLES.predictive.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={BrainCircuit}>
              {stats.scored} devices scored
            </Badge>
            <Badge tone="neutral" size="sm">
              {stats.components} components tracked
            </Badge>
            {stats.urgent > 0 ? (
              <Badge tone="critical" size="sm" icon={TrendingDown}>
                {stats.urgent} inside 7 days
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Mean remaining life" value={`${formatNumber(stats.meanRul, 0)} d`} />
            <MetaStat label="Inside 30-day horizon" value={formatNumber(stats.withinHorizon)} />
            <MetaStat label="Probability ≥ 50%" value={formatNumber(stats.highProbability)} />
            <MetaStat label="Mean confidence" value={formatPercent(stats.meanConfidence * 100, 0)} />
          </>
        }
        actions={
          <>
            <Segmented
              ariaLabel="Prediction horizon"
              layoutId="predictive-horizon"
              size="xs"
              options={HORIZON_OPTIONS}
              value={horizon}
              onChange={setHorizon}
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
          label="Mean remaining life"
          value={formatNumber(stats.meanRul, 0)}
          unit="days"
          caption="Across each device's weakest component"
          icon={Clock3}
          accent={rulTone(stats.meanRul)}
        />
        <StatTile
          label="Inside 7 days"
          value={formatNumber(stats.urgent)}
          caption="Components requiring immediate scheduling"
          icon={TrendingDown}
          accent={stats.urgent > 0 ? STATUS_COLOR.critical : STATUS_COLOR.good}
        />
        <StatTile
          label="Inside 30 days"
          value={formatNumber(stats.withinHorizon)}
          caption={`${PREDICTION_HORIZON_DAYS}-day prediction horizon`}
          icon={CalendarClock}
          accent={STATUS_COLOR.warning}
        />
        <StatTile
          label="Mean confidence"
          value={formatNumber(stats.meanConfidence * 100, 1)}
          unit="%"
          caption="Highest when a prediction is unambiguous"
          icon={Target}
          accent={SERIES[2]}
        />
      </div>

      <AiPanel module="predictive" />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <BarTrend
          title="Remaining life distribution"
          subtitle="Device count per remaining-life band, using each device's weakest component"
          eyebrow="Population"
          icon={Clock3}
          data={rulBuckets}
          series={[{ key: 'count', name: 'Devices', color: SERIES[0], decimals: 0 }]}
          height={280}
          colorFor={(point) => {
            const label = String(point.label ?? '');
            return label === '< 7 d'
              ? STATUS_COLOR.critical
              : label === '7–30 d'
                ? STATUS_COLOR.serious
                : label === '30–90 d'
                  ? STATUS_COLOR.warning
                  : SERIES[0];
          }}
          footnote="The left two bands define the intervention queue for the coming month."
        />

        <RankList
          title="Intervention queue"
          subtitle="Components closest to their failure boundary, soonest first"
          eyebrow="Priority"
          icon={Waypoints}
          items={queue.slice(0, 8).map((row) => ({
            id: `${row.assetId}-${row.component}`,
            title: row.component,
            tag: row.assetId,
            subtitle: `${row.assetName} · ${formatPercent(row.failureProbability * 100, 1)} probability`,
            value: `${formatNumber(row.rulDays, row.rulDays < 10 ? 1 : 0)} d`,
            trailing: (
              <Progress
                value={row.wear * 100}
                size="xs"
                color={rulTone(row.rulDays)}
                className="w-16"
                label={`${row.component} wear`}
              />
            ),
            href: deviceDetailPath(row.assetId),
          }))}
        />
      </div>

      <div className="space-y-4">
        <SectionHeader
          title="Component predictions"
          subtitle="Every tracked component with its probability, remaining life, confidence and remedy"
        />

        <DataTable<ComponentRow>
          data={filtered}
          columns={columns}
          rowKey={(row) => `${row.assetId}-${row.component}`}
          density={density}
          onRowClick={(row) => {
            const asset = assets.find((entry) => entry.device.assetId === row.assetId);
            if (asset) setSelected(asset);
          }}
          minWidth="98rem"
          emptyIcon={Waypoints}
          emptyTitle="No components inside this horizon"
          emptyDescription="Widen the horizon or clear the category filter. Every device carries a scored prediction for each serviceable component."
          toolbar={
            <TableToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search device, component or category…"
              filters={filters}
              activeFilterCount={category === 'all' ? 0 : 1}
              onReset={() => {
                setSearch('');
                setCategory('all');
                setHorizon('90');
              }}
            />
          }
          footer={
            <p className="text-[11px] text-fg-dim">
              {formatNumber(filtered.length)} of {formatNumber(queue.length)} tracked components. Select a row to see the
              projected degradation trajectory.
            </p>
          }
        />
      </div>

      <GrafanaPanel
        dashboard={env.grafana.dashboards.predictive}
        panelId={3}
        title="Degradation trend surface"
        subtitle="Wear trajectory and residual drift served from Grafana"
        height={320}
        refresh="1m"
        variables={{ horizon }}
      />

      {/* ─── Device projection ──────────────────────────────────────────── */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        size="xl"
        title={selected ? `${selected.device.assetId} · remaining useful life` : ''}
        subtitle={
          selected
            ? `${selected.device.assetName} · ${selected.device.brand} ${selected.device.model} · scored ${formatRelative(at)}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={CalendarClock}
              onClick={() => {
                toast.success(
                  'Intervention scheduled',
                  `${selected?.prediction.primary.component} on ${selected?.device.assetId} queued for service.`,
                );
                setSelected(null);
              }}
            >
              Schedule intervention
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" size="sm">
                {selected.device.category}
              </Badge>
              <Badge
                tone={selected.band === 'critical' ? 'critical' : selected.band === 'warning' ? 'warning' : 'good'}
                size="sm"
                dot
              >
                {bandDef(selected.band).label}
              </Badge>
              <Badge tone="brand" size="sm">
                {formatPercent(selected.prediction.primary.confidence * 100, 0)} confidence
              </Badge>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
              <Card className="flex flex-col items-center justify-center">
                <RadialGauge
                  value={selected.prediction.primary.failureProbability * 100}
                  unit="%"
                  label="Failure probability"
                  caption={`${selected.prediction.primary.component} · ${PREDICTION_HORIZON_DAYS}-day horizon`}
                  color={probabilityTone(selected.prediction.primary.failureProbability)}
                  size={144}
                  decimals={1}
                />
                <div className="mt-3 grid w-full grid-cols-2 gap-2 border-t border-overlay/[0.06] pt-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Remaining life</p>
                    <p className="mt-1 text-[15px] font-semibold tabular-nums text-fg">
                      {formatNumber(selected.prediction.primary.rulDays, 0)} d
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Health now</p>
                    <p className="mt-1 text-[15px] font-semibold tabular-nums text-fg">
                      {formatNumber(selected.health, 1)}
                    </p>
                  </div>
                </div>
              </Card>

              <DegradationChart
                title="Projected health trajectory"
                subtitle="Observed history joined to the projected decay, with the confidence band"
                eyebrow="Projection"
                data={projection}
                height={280}
                footnote="The band widens with distance and with model uncertainty, so a low-confidence prediction visibly hedges. Intervene before the lower bound reaches the failure threshold."
              />
            </div>

            <Card>
              <CardHeader
                title="Component breakdown"
                subtitle="Wear, probability and remedy for every serviceable part"
                eyebrow="Detail"
                icon={Gauge}
              />
              <ul className="mt-4 space-y-2">
                {selected.prediction.components.map((component) => {
                  const isPrimary = component.component === selected.prediction.primary.component;
                  return (
                    <li
                      key={component.component}
                      className={[
                        'rounded-xl border p-3.5',
                        isPrimary ? 'border-brand-400/25 bg-brand-500/[0.06]' : 'border-overlay/[0.06] bg-ink-850/50',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-fg">
                            {isPrimary ? '● ' : ''}
                            {component.component}
                          </p>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">
                            {component.recommendation}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-semibold tabular-nums text-fg">
                            {formatPercent(component.failureProbability * 100, 1)}
                          </p>
                          <p className="mt-0.5 text-[10.5px] tabular-nums text-fg-dim">
                            {formatNumber(component.rulDays, component.rulDays < 10 ? 1 : 0)} d ·{' '}
                            {formatPercent(component.confidence * 100, 0)} confidence
                          </p>
                        </div>
                      </div>
                      <Progress
                        value={component.wear * 100}
                        size="xs"
                        color={rulTone(component.rulDays)}
                        className="mt-2.5"
                        label={`${component.component} wear`}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
