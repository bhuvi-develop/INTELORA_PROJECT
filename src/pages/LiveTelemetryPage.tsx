import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, Gauge, Radio, Thermometer, WifiOff, Zap } from 'lucide-react';
import type { AssetRuntime, TelemetryChannel } from '@/engine/types';
import { CHANNELS, DEVICE_CATEGORIES, TICK_MS, channelMeta } from '@/engine/catalog';
import { MODULE_TITLES } from '@/config/navigation';
import { CHANNEL_COLOR, SERIES } from '@/config/viz';
import { env } from '@/config/env';
import { useAssetList, useEngineControl, useFleetKpis, useFleetTrail } from '@/engine/store';
import { formatNumber } from '@/utils/format';
import { exportReport, type ReportColumn } from '@/utils/report';
import { useDebounce, useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { AreaTrend, LineTrend } from '@/components/charts';
import type { SeriesDef } from '@/components/charts';
import { GrafanaPanel } from '@/components/grafana';
import { DataTable, TableToolbar, type FilterDef } from '@/components/data';
import {
  DeviceIdentity,
  HealthValue,
  LiveIndicator,
  MetaStat,
  PageHeader,
  StatusBadge,
} from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Live telemetry.
 *
 * Every asset streams the eight defined channels. The grid is a projection of
 * the current tick, so a value here is the same value the detail view, the
 * anomaly engine and the fleet aggregates are using.
 * ─────────────────────────────────────────────────────────────────────────── */

const WINDOW_OPTIONS = [
  { value: '60', label: '5m' },
  { value: '180', label: '15m' },
  { value: '360', label: '30m' },
] as const;

type WindowValue = (typeof WINDOW_OPTIONS)[number]['value'];

/* Built per render so channel colours follow the active theme. */
const buildFleetSeries = (): SeriesDef[] => [
  { key: 'power', name: 'Fleet power', color: CHANNEL_COLOR.power, unit: 'W', decimals: 0 },
];

const buildHealthSeries = (): SeriesDef[] => [
  { key: 'health', name: 'Mean health', color: CHANNEL_COLOR.health, unit: '%', decimals: 1 },
];

export const LiveTelemetryPage = () => {
  const toast = useToast();
  const { density } = useUI();
  const assets = useAssetList();
  const kpis = useFleetKpis();
  const trail = useFleetTrail();
  const { tick, running } = useEngineControl();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [windowTicks, setWindowTicks] = useState<WindowValue>('180');
  const [focusChannel, setFocusChannel] = useState<TelemetryChannel>('power');

  const FLEET_SERIES = buildFleetSeries();
  const HEALTH_SERIES = buildHealthSeries();

  const debouncedSearch = useDebounce(search, 240);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (category !== 'all' && asset.device.category !== category) return false;
      if (status !== 'all' && asset.device.status !== status) return false;
      if (needle.length > 0) {
        const haystack =
          `${asset.device.assetId} ${asset.device.assetName} ${asset.device.brand} ${asset.device.model}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [assets, debouncedSearch, category, status]);

  const windowedTrail = useMemo(() => trail.slice(-Number(windowTicks)), [trail, windowTicks]);

  /* Fleet totals per channel, computed from the same samples the table shows. */
  const channelTotals = useMemo(() => {
    const reporting = assets.filter((asset) => asset.device.status !== 'Offline');
    const sum = (pick: (asset: AssetRuntime) => number) => reporting.reduce((total, asset) => total + pick(asset), 0);
    const mean = (pick: (asset: AssetRuntime) => number) =>
      reporting.length === 0 ? 0 : sum(pick) / reporting.length;

    return {
      voltage: mean((asset) => asset.live.voltage),
      current: sum((asset) => asset.live.current),
      power: sum((asset) => asset.live.power),
      energy: sum((asset) => asset.live.energy),
      frequency: mean((asset) => asset.live.frequency),
      powerFactor: mean((asset) => asset.live.powerFactor),
      temperature: mean((asset) => asset.live.temperature),
      health: mean((asset) => asset.health),
    } satisfies Record<TelemetryChannel, number>;
  }, [assets]);

  const columns = useMemo<Array<ColumnDef<AssetRuntime, unknown>>>(
    () => [
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.device.assetName,
        enableSorting: true,
        meta: { width: '17rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.device.assetId}
            assetName={row.original.device.assetName}
            meta={row.original.device.category}
          />
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.device.status,
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.device.status} size="xs" />,
      },
      ...CHANNELS.map<ColumnDef<AssetRuntime, unknown>>((meta) => ({
        id: meta.key,
        header: `${meta.label}${meta.unit ? ` (${meta.unit})` : ''}`,
        accessorFn: (row: AssetRuntime) => row.live[meta.key],
        enableSorting: true,
        meta: { numeric: true },
        cell: ({ row }) => {
          const value = row.original.live[meta.key];
          if (meta.key === 'health') return <HealthValue health={value} />;
          const offline = row.original.device.status === 'Offline';
          return (
            <span
              className={offline ? 'text-[12px] tabular-nums text-fg-faint' : 'text-[12px] tabular-nums text-fg-soft'}
            >
              {formatNumber(value, meta.decimals)}
            </span>
          );
        },
      })),
    ],
    [],
  );

  const filters: FilterDef[] = [
    {
      key: 'status',
      label: 'Status',
      value: status,
      options: [
        { value: 'all', label: 'All statuses' },
        { value: 'Online', label: 'Online' },
        { value: 'Standby', label: 'Standby' },
        { value: 'Offline', label: 'Offline' },
      ],
      onChange: setStatus,
    },
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

  const exportColumns: Array<ReportColumn<AssetRuntime>> = [
    { header: 'Asset ID', value: (row) => row.device.assetId },
    { header: 'Asset Name', value: (row) => row.device.assetName },
    { header: 'Category', value: (row) => row.device.category },
    { header: 'Status', value: (row) => row.device.status },
    ...CHANNELS.map<ReportColumn<AssetRuntime>>((meta) => ({
      header: `${meta.label}${meta.unit ? ` (${meta.unit})` : ''}`,
      value: (row) => row.live[meta.key],
      numeric: true,
    })),
  ];

  const focusMeta = channelMeta(focusChannel);

  /* Per-device series for the focused channel, capped so the plot stays legible. */
  const focusSeriesAssets = useMemo(
    () =>
      filtered
        .filter((asset) => asset.device.status !== 'Offline')
        .sort((a, b) => b.live[focusChannel] - a.live[focusChannel])
        .slice(0, 6),
    [filtered, focusChannel],
  );

  const focusData = useMemo(() => {
    if (focusSeriesAssets.length === 0) return [];
    const length = Math.min(
      Number(windowTicks),
      ...focusSeriesAssets.map((asset) => asset.history.length),
    );
    if (!Number.isFinite(length) || length <= 0) return [];

    const slices = focusSeriesAssets.map((asset) => asset.history.slice(-length));
    return slices[0].map((sample, index) => {
      const point: Record<string, number | string> = { t: sample.t, label: sample.label };
      focusSeriesAssets.forEach((asset, assetIndex) => {
        point[asset.device.assetId] = slices[assetIndex][index][focusChannel];
      });
      return point;
    });
  }, [focusSeriesAssets, windowTicks, focusChannel]);

  const focusSeries: SeriesDef[] = focusSeriesAssets.map((asset, index) => ({
    key: asset.device.assetId,
    name: asset.device.assetId,
    color: SERIES[index % SERIES.length],
    unit: focusMeta.unit,
    decimals: focusMeta.decimals,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.telemetry.title}
        subtitle={MODULE_TITLES.telemetry.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Radio}>
              {TICK_MS / 1000}s sample interval
            </Badge>
            <Badge tone={running ? 'good' : 'neutral'} size="sm" dot>
              {running ? 'Streaming' : 'Paused'}
            </Badge>
            <Badge tone="neutral" size="sm">
              tick {formatNumber(tick)}
            </Badge>
            {kpis.offlineAssets > 0 ? (
              <Badge tone="warning" size="sm" icon={WifiOff}>
                {kpis.offlineAssets} not reporting
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Reporting" value={`${kpis.onlineAssets + kpis.standbyAssets}/${kpis.totalAssets}`} />
            <MetaStat label="Fleet power" value={`${formatNumber(channelTotals.power, 0)} W`} />
            <MetaStat label="Mean temperature" value={`${formatNumber(channelTotals.temperature, 1)} °C`} />
            <MetaStat label="Cumulative energy" value={`${formatNumber(channelTotals.energy, 3)} kWh`} />
          </>
        }
        actions={
          <>
            <LiveIndicator showTick />
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (filtered.length === 0) {
                  toast.warning('Nothing to export', 'The current filters return no devices.');
                  return;
                }
                void exportReport('csv', filtered, exportColumns, {
                  filename: 'intelora_live_telemetry',
                  title: 'Live Telemetry Snapshot',
                  subtitle: `${filtered.length} devices at tick ${tick}`,
                });
                toast.success('Snapshot exported', `${filtered.length} devices written to CSV.`);
              }}
            >
              Export snapshot
            </Button>
          </>
        }
      />

      {/* Fleet channel readouts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
        {CHANNELS.map((meta) => {
          const value = channelTotals[meta.key];
          const aggregate = ['current', 'power', 'energy'].includes(meta.key) ? 'total' : 'mean';
          const active = focusChannel === meta.key;
          return (
            <button
              key={meta.key}
              type="button"
              onClick={() => setFocusChannel(meta.key)}
              aria-pressed={active}
              className={[
                'rounded-xl border p-3 text-left transition-colors',
                active
                  ? 'border-brand-400/30 bg-brand-500/[0.08]'
                  : 'border-overlay/[0.06] bg-ink-850/50 hover:border-overlay/[0.12]',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5" style={{ color: CHANNEL_COLOR[meta.key] }}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{meta.label}</span>
              </span>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-[1.0625rem] font-semibold leading-none tabular-nums text-fg">
                  {formatNumber(value, meta.decimals)}
                </span>
                {meta.unit ? <span className="text-[11px] font-medium text-fg-muted">{meta.unit}</span> : null}
              </p>
              <p className="mt-1 text-[9.5px] uppercase tracking-[0.1em] text-fg-faint">fleet {aggregate}</p>
            </button>
          );
        })}
      </div>

      {/* Fleet trends */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-fg-muted">
          Showing the last{' '}
          <span className="font-semibold text-fg">
            {WINDOW_OPTIONS.find((option) => option.value === windowTicks)?.label}
          </span>{' '}
          of streaming data
        </p>
        <Segmented
          ariaLabel="Streaming window"
          layoutId="telemetry-window"
          size="xs"
          options={WINDOW_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          value={windowTicks}
          onChange={(value) => setWindowTicks(value as WindowValue)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AreaTrend
          title="Fleet power draw"
          subtitle="Aggregate instantaneous draw across reporting devices"
          eyebrow="Energy"
          icon={Zap}
          data={windowedTrail}
          series={FLEET_SERIES}
          height={260}
          domain={['auto', 'auto']}
        />
        <LineTrend
          title="Mean fleet health"
          subtitle="Condition averaged across reporting devices"
          eyebrow="Condition"
          icon={Activity}
          data={windowedTrail}
          series={HEALTH_SERIES}
          height={260}
          domain={['auto', 'auto']}
          endLabels
        />
      </div>

      {/* Focused channel across devices */}
      <LineTrend
        title={`${focusMeta.label} — highest six devices`}
        subtitle={`Per-device comparison on the selected channel${focusMeta.unit ? `, in ${focusMeta.unit}` : ''}`}
        eyebrow="Channel focus"
        icon={focusChannel === 'temperature' ? Thermometer : Gauge}
        data={focusData}
        series={focusSeries}
        height={300}
        domain={['auto', 'auto']}
        footnote="Devices are ranked by current value on this channel, so the set follows the stream. Series colours are assigned in fixed palette order and never cycled."
      />

      {/* Live grid */}
      <DataTable<AssetRuntime>
        data={filtered}
        columns={columns}
        rowKey={(row) => row.device.assetId}
        density={density}
        minWidth="96rem"
        emptyIcon={Radio}
        emptyTitle="No devices match the current filters"
        emptyDescription="Clear a filter or widen the search term to see streaming channels."
        toolbar={
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search device, brand or model…"
            filters={filters}
            activeFilterCount={[status, category].filter((value) => value !== 'all').length}
            onReset={() => {
              setSearch('');
              setStatus('all');
              setCategory('all');
            }}
          />
        }
        footer={
          <p className="text-[11px] text-fg-dim">
            {formatNumber(filtered.length)} device{filtered.length === 1 ? '' : 's'} · every row updates on the
            five-second tick without a page refresh. Offline devices report zero on all electrical channels.
          </p>
        }
      />

      <GrafanaPanel
        dashboard={env.grafana.dashboards.telemetry}
        panelId={2}
        title="Channel detail"
        subtitle="High-resolution channel view served from Grafana"
        height={320}
        refresh="10s"
        variables={{ channel: focusChannel, category }}
      />
    </div>
  );
};
