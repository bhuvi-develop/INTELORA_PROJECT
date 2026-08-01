import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  Gauge,
  Radio,
  ShieldCheck,
  Signal,
  Thermometer,
  Waves,
  Zap,
} from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { bandDef } from '@/engine/derive';
import { useAssetList, useConnection, useSnapshot } from '@/engine/store';
import { CHANNEL_COLOR, SERIES, STATUS_COLOR } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { AreaTrend, BarTrend, LineTrend, type SeriesDef } from '@/components/charts';
import { DataTable } from '@/components/data';
import { DeviceIdentity, StatusBadge } from '@/components/common';
import { PING_TOLERANCE_MS, SENSOR_RANGE, withinSensorRange } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from './DetailShell';
import { bucketDelay, useStreamSamples } from './useStreamSamples';

/* ───────────────────────────────────────────────────────────────────────────
 * System ingestion and stream health.
 *
 * Everything on this page describes the pipeline rather than the estate. The
 * distinction is the whole point of the card that leads here: a device outside
 * its operating limit is a fault the detector has already raised and the stream
 * is still sound, while a channel outside the instrument's range means the
 * reading is not a measurement and nothing judged from it can be trusted.
 * ─────────────────────────────────────────────────────────────────────────── */

const THROUGHPUT_SERIES: SeriesDef[] = [
  { key: 'ingestPerMinute', name: 'Message rate', color: SERIES[0], unit: 'msg/min', decimals: 0 },
];

const LATENCY_SERIES: SeriesDef[] = [
  { key: 'apiMs', name: 'API round trip', color: SERIES[1], unit: 'ms', decimals: 1 },
  { key: 'dbMs', name: 'Database round trip', color: SERIES[2], unit: 'ms', decimals: 1 },
];

export const LiveStatusDetailPage = () => {
  const { density } = useUI();
  const snapshot = useSnapshot();
  const assets = useAssetList();
  const connection = useConnection();
  const { samples, spanSeconds } = useStreamSamples();

  const { platform } = snapshot;

  const reporting = useMemo(
    () => assets.filter((asset) => asset.device.status !== 'Offline'),
    [assets],
  );

  /* Plausibility, not compliance — see the module note above. */
  const implausible = useMemo(
    () =>
      reporting.filter(
        (asset) =>
          !withinSensorRange('voltage', asset.live.voltage) ||
          !withinSensorRange('temperature', asset.live.temperature) ||
          !withinSensorRange('current', asset.live.current) ||
          !withinSensorRange('powerFactor', asset.live.powerFactor),
      ),
    [reporting],
  );

  const envelope = useMemo(() => {
    if (reporting.length === 0) return null;
    const voltages = reporting.map((asset) => asset.live.voltage);
    const temperatures = reporting.map((asset) => asset.live.temperature);
    const currents = reporting.map((asset) => asset.live.current);
    return {
      vMin: Math.min(...voltages),
      vMax: Math.max(...voltages),
      tMax: Math.max(...temperatures),
      iMax: Math.max(...currents),
    };
  }, [reporting]);

  const packetAgeMs = connection.lastUpdatedAt > 0 ? Math.max(0, Date.now() - connection.lastUpdatedAt) : null;
  const pingOk = packetAgeMs !== null && packetAgeMs <= PING_TOLERANCE_MS;
  const socketOk = platform.mqttConnected && platform.gatewayConnected && connection.status === 'live';

  const delayBins = useMemo(() => bucketDelay(samples), [samples]);

  const latencyStats = useMemo(() => {
    if (samples.length === 0) return null;
    const api = samples.map((sample) => sample.apiMs);
    const sorted = [...api].sort((a, b) => a - b);
    return {
      mean: api.reduce((sum, value) => sum + value, 0) / api.length,
      p95: sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)],
      max: sorted[sorted.length - 1],
    };
  }, [samples]);

  const stats: DetailStat[] = [
    {
      key: 'socket',
      label: 'Transport',
      value: socketOk ? 'Connected' : connection.status,
      caption: `${connection.transport === 'websocket' ? 'WebSocket' : connection.transport === 'polling' ? 'HTTP polling' : 'No transport'} · MQTT ${platform.mqttConnected ? 'up' : 'down'} · gateway ${platform.gatewayConnected ? 'up' : 'down'}`,
      icon: Signal,
      accent: socketOk ? '#22C55E' : STATUS_COLOR.critical,
      tone: socketOk ? 'good' : 'bad',
    },
    {
      key: 'ping',
      label: 'Packet age',
      value: packetAgeMs === null ? '—' : formatNumber(packetAgeMs / 1000, 2),
      unit: packetAgeMs === null ? undefined : 's',
      caption: `Tolerance t_now − t_packet ≤ ${PING_TOLERANCE_MS / 1000} s at a 1 Hz publication rate`,
      icon: Activity,
      accent: pingOk ? '#22C55E' : STATUS_COLOR.critical,
      tone: pingOk ? 'good' : 'bad',
    },
    {
      key: 'rate',
      label: 'Message rate',
      value: formatNumber(platform.ingestPerMinute),
      unit: 'msg/min',
      caption: `${formatNumber(platform.ingestPerMinute / 60, 1)} per second across the estate`,
      icon: Waves,
      accent: SERIES[0],
    },
    {
      key: 'endpoints',
      label: 'Active endpoints',
      value: `${formatNumber(reporting.length)} / ${formatNumber(assets.length)}`,
      caption:
        implausible.length === 0
          ? 'Every reporting channel inside the instrument range'
          : `${formatNumber(implausible.length)} channel${implausible.length === 1 ? '' : 's'} out of instrument range`,
      icon: Radio,
      accent: implausible.length === 0 ? '#38BDF8' : STATUS_COLOR.warning,
      tone: implausible.length === 0 ? 'neutral' : 'bad',
    },
    {
      key: 'latency',
      label: 'API round trip',
      value: latencyStats ? formatNumber(latencyStats.mean, 1) : '—',
      unit: latencyStats ? 'ms' : undefined,
      caption: latencyStats
        ? `p95 ${formatNumber(latencyStats.p95, 1)} ms · peak ${formatNumber(latencyStats.max, 1)} ms over ${formatNumber(samples.length)} samples`
        : 'Waiting for the first observation',
      icon: Gauge,
      accent: SERIES[1],
    },
  ];

  /* ─── Endpoint matrix ──────────────────────────────────────────────────── */

  const columns = useMemo<Array<ColumnDef<AssetRuntime, unknown>>>(
    () => [
      {
        id: 'device',
        header: 'Endpoint',
        accessorFn: (row) => row.device.assetName,
        enableSorting: true,
        meta: { width: '17rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.device.assetId}
            assetName={row.original.device.assetName}
            meta={`${row.original.device.brand} ${row.original.device.model}`}
          />
        ),
      },
      {
        id: 'status',
        header: 'Link',
        accessorFn: (row) => row.device.status,
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.device.status} size="xs" />,
      },
      {
        id: 'voltage',
        header: `V_rms (0–${SENSOR_RANGE.voltage.max} V)`,
        accessorFn: (row) => row.live.voltage,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => {
          const value = row.original.live.voltage;
          const ok = withinSensorRange('voltage', value);
          return (
            <span className={cn('text-[12px] tabular-nums', ok ? 'text-fg' : 'text-rose-300')}>
              {formatNumber(value, 2)} V
            </span>
          );
        },
      },
      {
        id: 'current',
        header: 'I_rms',
        accessorFn: (row) => row.live.current,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => {
          const value = row.original.live.current;
          const ok = withinSensorRange('current', value);
          return (
            <span className={cn('text-[12px] tabular-nums', ok ? 'text-fg' : 'text-rose-300')}>
              {formatNumber(value, 3)} A
            </span>
          );
        },
      },
      {
        id: 'temperature',
        header: `T_enc (< ${SENSOR_RANGE.temperature.max} °C)`,
        accessorFn: (row) => row.live.temperature,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => {
          const value = row.original.live.temperature;
          const ok = withinSensorRange('temperature', value);
          return (
            <span className={cn('text-[12px] tabular-nums', ok ? 'text-fg' : 'text-rose-300')}>
              {formatNumber(value, 1)} °C
            </span>
          );
        },
      },
      {
        id: 'pf',
        header: 'PF',
        accessorFn: (row) => row.live.powerFactor,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {formatNumber(row.original.live.powerFactor, 3)}
          </span>
        ),
      },
      {
        id: 'health',
        header: 'Condition',
        accessorFn: (row) => row.health,
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => {
          const def = bandDef(row.original.band);
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: def.color }}
                aria-hidden
              />
              <span className="text-[12px] tabular-nums text-fg-soft">
                {formatPercent(row.original.health, 1)}
              </span>
            </span>
          );
        },
      },
      {
        id: 'plausible',
        header: 'Instrument',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const asset = row.original;
          if (asset.device.status === 'Offline') {
            return <Badge tone="neutral" size="xs">Not reporting</Badge>;
          }
          const ok =
            withinSensorRange('voltage', asset.live.voltage) &&
            withinSensorRange('temperature', asset.live.temperature) &&
            withinSensorRange('current', asset.live.current) &&
            withinSensorRange('powerFactor', asset.live.powerFactor);
          return ok ? (
            <Badge tone="good" size="xs" icon={ShieldCheck}>
              In range
            </Badge>
          ) : (
            <Badge tone="critical" size="xs">
              Out of range
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const spanLabel =
    spanSeconds < 60
      ? `${formatNumber(spanSeconds)} s`
      : `${formatNumber(spanSeconds / 60, 1)} min`;

  return (
    <DetailShell
      title="System Ingestion & Stream Health"
      subtitle="The pipeline behind every figure on the anomaly view: transport, publication rate, arrival delay and instrument plausibility."
      eyebrow={
        <>
          <Badge tone={socketOk ? 'good' : 'critical'} size="sm" dot>
            {socketOk ? 'Stream live' : 'Stream degraded'}
          </Badge>
          <Badge tone="neutral" size="sm" icon={Zap}>
            tick {formatNumber(snapshot.tick)}
          </Badge>
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <div className="grid gap-4 xl:grid-cols-2">
        <AreaTrend
          title="Ingestion throughput"
          subtitle="Messages per minute the platform reports accepting"
          eyebrow="Throughput"
          icon={Waves}
          data={samples}
          series={THROUGHPUT_SERIES}
          height={280}
          footnote={`Sampled once per backend tick since this view mounted — ${formatNumber(samples.length)} observation${samples.length === 1 ? '' : 's'} covering ${spanLabel}. The platform keeps no history of this figure, so nothing before that is shown rather than back-filled.`}
        />

        <LineTrend
          title="Pipeline latency"
          subtitle="Backend and database round trip, measured from this client"
          eyebrow="Latency"
          icon={Gauge}
          data={samples}
          series={LATENCY_SERIES}
          height={280}
          domain={['auto', 'auto']}
          footnote="Two legs measured separately. A rising database leg with a flat API leg points at storage rather than at the service."
        />
      </div>

      <BarTrend
        title="Telemetry ping stability"
        subtitle="Distribution of packet arrival delay against the 1.5 s tolerance"
        eyebrow="Distribution"
        icon={Activity}
        data={delayBins}
        series={[{ key: 'count', name: 'Observations', color: CHANNEL_COLOR.health ?? SERIES[0], decimals: 0 }]}
        height={240}
        colorFor={(point) =>
          Number(point.from) >= PING_TOLERANCE_MS ? STATUS_COLOR.critical : SERIES[0]
        }
        footnote={`Bin edges are fixed in milliseconds so the shape stays comparable between visits — a histogram that rescales its own bins makes a stable stream and a degrading one look alike. Anything in the ≥ 1.5 s bin is a missed publication window.`}
      />

      <DataTable<AssetRuntime>
        data={assets}
        columns={columns}
        rowKey={(row) => row.device.assetId}
        density={density}
        minWidth="76rem"
        emptyIcon={Radio}
        emptyTitle="No endpoints commissioned"
        emptyDescription="The asset register returned nothing. Check the platform connection."
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-fg">Endpoint health matrix</p>
              <p className="mt-0.5 text-[11.5px] text-fg-dim">
                Live channels against the instrument range each sensor can physically report
              </p>
            </div>
            {envelope ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Zap size={11} className="text-fg-faint" aria-hidden />V {formatNumber(envelope.vMin, 1)}–
                  {formatNumber(envelope.vMax, 1)} V
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Thermometer size={11} className="text-fg-faint" aria-hidden />
                  T max {formatNumber(envelope.tMax, 1)} °C
                </span>
                <span className="inline-flex items-center gap-1.5">
                  I max {formatNumber(envelope.iMax, 3)} A
                </span>
              </div>
            ) : null}
          </div>
        }
      />
    </DetailShell>
  );
};
