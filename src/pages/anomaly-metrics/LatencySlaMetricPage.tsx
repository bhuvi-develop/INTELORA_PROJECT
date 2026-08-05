import { useMemo } from 'react';
import { Activity, Clock3, Database, Gauge, Radio, Signal, Timer, Waves } from 'lucide-react';
import { useConnection, useSnapshot } from '@/engine/store';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { BarTrend, LineTrend, RadialGauge, type SeriesDef } from '@/components/charts';
import { BROADCAST_SLA_MS, PING_TOLERANCE_MS, useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, useStreamSamples, type DetailStat } from '@/pages/anomaly-details';
import { MetricSummaryPanel } from './MetricSummaryPanel';
import { bucketLatency, mean, percentile, ratioPct, stdDev } from './metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * Detection latency and pipeline SLA.
 *
 * Time-to-detect on this platform has two legs with completely different
 * characters, and reporting them as one number hides the only actionable half.
 *
 * The **dwell** is the detector's own confirm window — 3 s on a link loss, 60 s
 * on an energy drift. It is deliberate: a breach must persist before it is
 * reported, which is why the journal reads as a list of faults rather than a list
 * of samples. Shortening it would not improve detection, it would add noise.
 *
 * The **transport** leg is the round trip from the backend to this screen. That
 * one is overhead, it is measurable, and it is the leg the 200 ms target applies
 * to. Everything below separates the two.
 * ─────────────────────────────────────────────────────────────────────────── */

export const LatencySlaMetricPage = () => {
  const snapshot = useSnapshot();
  const connection = useConnection();
  const { quality, scoped } = useAnomalyModule();
  const { samples, spanSeconds } = useStreamSamples();

  const { platform } = snapshot;
  const latency = quality.latency;

  const apiValues = useMemo(() => samples.map((sample) => sample.apiMs), [samples]);
  const pingValues = useMemo(() => samples.map((sample) => sample.packetAgeMs), [samples]);

  const bins = useMemo(() => bucketLatency(apiValues, BROADCAST_SLA_MS), [apiValues]);

  const jitterMs = useMemo(() => stdDev(pingValues), [pingValues]);
  const apiJitterMs = useMemo(() => stdDev(apiValues), [apiValues]);

  /* Dwell is per-rule and constant; transport is measured. Plotting them on one
   * axis in milliseconds shows the true proportion — which is the point. */
  const breakdown = useMemo<SeriesDef[]>(
    () => [
      { key: 'dwellMs', name: 'Rule dwell', color: SERIES[3], unit: 'ms', decimals: 0 },
      { key: 'apiMs', name: 'API transport', color: SERIES[1], unit: 'ms', decimals: 1 },
      { key: 'dbMs', name: 'Database write', color: SERIES[2], unit: 'ms', decimals: 1 },
    ],
    [],
  );

  const breakdownData = useMemo(
    () =>
      samples.map((sample) => ({
        label: sample.label,
        dwellMs: Math.round((latency.dwellSeconds ?? 0) * 1000),
        apiMs: sample.apiMs,
        dbMs: sample.dbMs,
      })),
    [samples, latency.dwellSeconds],
  );

  const withinSla = apiValues.filter((value) => value <= BROADCAST_SLA_MS).length;
  const slaPct = ratioPct(withinSla, apiValues.length);

  const stats: DetailStat[] = [
    {
      key: 'ttd',
      label: 'Mean transport',
      value: apiValues.length === 0 ? '—' : formatNumber(mean(apiValues), 0),
      unit: apiValues.length === 0 ? undefined : 'ms',
      caption: `Backend round trip measured from this client · ${formatNumber(apiValues.length)} observation${apiValues.length === 1 ? '' : 's'}`,
      icon: Clock3,
      accent: '#38BDF8',
      tone: apiValues.length > 0 && mean(apiValues) <= BROADCAST_SLA_MS ? 'good' : 'bad',
    },
    {
      key: 'sla',
      label: `SLA < ${BROADCAST_SLA_MS} ms`,
      value: slaPct === null ? '—' : formatPercent(slaPct, 1),
      caption: `Share of round trips inside the target · p95 ${apiValues.length === 0 ? '—' : `${formatNumber(percentile(apiValues, 95), 0)} ms`}`,
      icon: Gauge,
      accent: slaPct !== null && slaPct >= 95 ? '#22C55E' : STATUS_COLOR.critical,
      tone: slaPct === null ? 'neutral' : slaPct >= 95 ? 'good' : 'bad',
    },
    {
      key: 'dwell',
      label: 'Mean rule dwell',
      value: latency.dwellSeconds === null ? '—' : formatNumber(latency.dwellSeconds, 1),
      unit: latency.dwellSeconds === null ? undefined : 's',
      caption: 'The detector’s confirm window — deliberate, not overhead',
      icon: Timer,
      accent: '#EAB308',
    },
    {
      key: 'jitter',
      label: 'Ping jitter',
      value: pingValues.length < 2 ? '—' : formatNumber(jitterMs, 0),
      unit: pingValues.length < 2 ? undefined : 'ms',
      caption: `Standard deviation of packet arrival delay against a ${PING_TOLERANCE_MS / 1000} s tolerance`,
      icon: Activity,
      accent: SERIES[2],
      tone: pingValues.length < 2 ? 'neutral' : jitterMs <= 250 ? 'good' : 'bad',
    },
  ];

  const spanLabel =
    spanSeconds < 60 ? `${formatNumber(spanSeconds)} s` : `${formatNumber(spanSeconds / 60, 1)} min`;

  return (
    <DetailShell
      title="Detection Latency & Pipeline SLA Attainment"
      subtitle="Time-to-detect split into the detector's deliberate dwell and the measurable transport leg the target applies to."
      eyebrow={
        <>
          <Badge tone={slaPct !== null && slaPct >= 95 ? 'good' : 'critical'} size="sm" icon={Gauge}>
            SLA {slaPct === null ? '—' : formatPercent(slaPct, 1)}
          </Badge>
          <Badge tone="neutral" size="sm" icon={Signal}>
            {connection.transport === 'websocket' ? 'WebSocket' : 'Polling'}
          </Badge>
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <MetricSummaryPanel metric="latency" quality={quality} scopedCount={scoped.length} />

      <LineTrend
        title="Ingestion to detection latency"
        subtitle="Rule dwell against the transport and storage legs, on one millisecond axis"
        eyebrow="Breakdown"
        icon={Waves}
        data={breakdownData}
        series={breakdown}
        height={300}
        domain={['auto', 'auto']}
        references={[{ value: BROADCAST_SLA_MS, label: `SLA ${BROADCAST_SLA_MS} ms`, color: STATUS_COLOR.warning }]}
        footnote="Plotted on one axis so the proportion is honest. The dwell line dominates by design — it is the detector holding a breach until it persists. Only the transport and storage legs are overhead, and only they are what the target measures."
      />

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <BarTrend
          title="SLA attainment distribution"
          subtitle="Where the round trips actually land, against the target boundary"
          eyebrow="Distribution"
          icon={Clock3}
          data={bins}
          series={[{ key: 'count', name: 'Observations', color: SERIES[0], decimals: 0 }]}
          height={280}
          colorFor={(point) => (point.withinSla ? '#22C55E' : STATUS_COLOR.critical)}
          footnote={`Bin edges are fixed, with the ${BROADCAST_SLA_MS} ms target sitting on an edge rather than inside a bin — a bin straddling the boundary could not be coloured honestly. Green bins are inside the SLA.`}
        />

        <Card className="flex flex-col">
          <CardHeader
            title="Broker and pipeline health"
            subtitle="What the transport is doing underneath the numbers"
            eyebrow="Transport"
            icon={Radio}
          />

          <div className="mt-4 flex items-center justify-center">
            <RadialGauge
              value={slaPct ?? 0}
              max={100}
              target={95}
              color={slaPct !== null && slaPct >= 95 ? '#22C55E' : STATUS_COLOR.critical}
              size={168}
              label="SLA attainment"
              caption={`target 95% · ${formatNumber(apiValues.length)} samples`}
              unit="%"
              decimals={1}
            />
          </div>

          <dl className="mt-4 space-y-2 border-t border-overlay/[0.06] pt-3.5">
            {[
              {
                label: 'MQTT broker',
                value: platform.mqttConnected ? 'Connected' : 'Down',
                ok: platform.mqttConnected,
              },
              {
                label: 'Gateway',
                value: platform.gatewayConnected ? 'Connected' : 'Down',
                ok: platform.gatewayConnected,
              },
              {
                label: 'Stream',
                value: connection.status,
                ok: connection.status === 'live',
              },
              {
                label: 'Sensors reporting',
                value: `${formatNumber(platform.sensorsConnected)} / ${formatNumber(platform.sensorsTotal)}`,
                ok: platform.sensorsConnected === platform.sensorsTotal,
              },
              {
                label: 'Ingest rate',
                value: `${formatNumber(platform.ingestPerMinute)} msg/min`,
                ok: true,
              },
              {
                label: 'Platform uptime',
                value: formatPercent(platform.uptimePct, 2),
                ok: platform.uptimePct >= 99,
              },
              {
                label: 'API jitter',
                value: apiValues.length < 2 ? '—' : `${formatNumber(apiJitterMs, 0)} ms σ`,
                ok: apiValues.length < 2 || apiJitterMs <= 100,
              },
              {
                label: 'Database latency',
                value: `${formatNumber(platform.databaseLatencyMs, 1)} ms`,
                ok: platform.databaseLatencyMs <= 50,
              },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="flex min-w-0 items-center gap-2 text-[11.5px] text-fg-muted">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      row.ok ? 'bg-emerald-400' : 'bg-rose-400',
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{row.label}</span>
                </dt>
                <dd
                  className={cn(
                    'shrink-0 text-[11.5px] font-semibold tabular-nums',
                    row.ok ? 'text-fg-soft' : 'text-rose-300',
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-3.5 border-t border-overlay/[0.06] pt-3 text-[11px] leading-relaxed text-fg-dim">
            Jitter is the standard deviation of arrival delay, not its mean. A stream can hold a good average
            and still be unusable if the spread is wide — the detector reads consecutive samples, so variance
            in arrival matters more than the average.
          </p>
          <p className="mt-2 text-[10.5px] leading-relaxed text-fg-faint">
            Sampled once per backend tick since this view mounted: {formatNumber(samples.length)} observations
            over {spanLabel}. The platform keeps no history of these figures.
          </p>

          <div className="mt-3.5 flex items-center gap-2 border-t border-overlay/[0.06] pt-3">
            <Database size={13} className="shrink-0 text-fg-faint" aria-hidden />
            <p className="text-[11px] leading-relaxed text-fg-dim">
              Events are written on the tick that raised them, so the stored ingest latency and this transport
              figure measure the same leg from opposite ends.
            </p>
          </div>
        </Card>
      </div>
    </DetailShell>
  );
};
