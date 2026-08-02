import { useCallback, useMemo } from 'react';
import { Activity, Brain, Fingerprint, Gauge, Radio, Sigma, Waves } from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { channelMeta } from '@/engine/catalog';
import { useAnomalyJournal, useAssetList, useSnapshot } from '@/engine/store';
import { CHANNEL_COLOR, SERIES, STATUS_COLOR } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarTrend, RadialGauge } from '@/components/charts';
import {
  breachRatio,
  classifyRecord,
  parameterContribution,
  useAnomalyModule,
  type ContributionSlice,
} from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';
import { MetricSummaryPanel } from './MetricSummaryPanel';
import { groupByChannel, mean } from './metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * Engineering confidence and feature attribution.
 *
 * A note on the title, because it matters: the scorer publishes one probability
 * per event and no per-feature values. There are no SHAP values on this platform
 * to display. What is shown instead is measured attribution — each channel's
 * departure from that device's own trailing mean at the moment of the raise,
 * normalised across channels.
 *
 * That answers the question a SHAP plot answers (which signal moved) from the
 * stream the detector was actually reading, and it is labelled as what it is.
 * Presenting it as SHAP would be a stronger claim than the model can support.
 * ─────────────────────────────────────────────────────────────────────────── */

export const EngineeringConfidenceMetricPage = () => {
  const journal = useAnomalyJournal();
  const assets = useAssetList();
  const snapshot = useSnapshot();
  const { quality, scoped } = useAnomalyModule();

  const now = snapshot.at;
  const confidence = quality.confidence;
  const { platform } = snapshot;

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  const unresolved = useMemo(
    () => journal.filter((record) => record.status !== 'Resolved'),
    [journal],
  );

  /** Channel attribution across the whole open queue. */
  const channels = useMemo(() => groupByChannel(unresolved, now), [unresolved, now]);

  const drivers = useMemo(
    () =>
      channels
        .map((group) => ({
          label: group.label,
          meanBreachPct: group.meanBreachPct,
          events: group.count,
          color: CHANNEL_COLOR[group.channel] ?? SERIES[0],
        }))
        .sort((a, b) => b.meanBreachPct - a.meanBreachPct),
    [channels],
  );

  /** The worst open event, and the measured contribution behind it. */
  const worst = useMemo(() => {
    if (unresolved.length === 0) return null;
    return unresolved.reduce((peak, record) =>
      breachRatio(record) > breachRatio(peak) ? record : peak,
    );
  }, [unresolved]);

  const contribution = useMemo<ContributionSlice[]>(() => {
    if (!worst) return [];
    const asset = assets.find((entry) => entry.device.assetId === worst.assetId);
    return asset ? parameterContribution(asset, worst) : [];
  }, [worst, assets]);

  /** Per-device telemetry integrity — the SNR term, device by device. */
  const sensorRows = useMemo(
    () =>
      assets
        .map((asset) => {
          const reporting = asset.device.status !== 'Offline';
          const openHere = unresolved.filter((record) => record.assetId === asset.device.assetId).length;
          return {
            id: asset.device.assetId,
            category: asset.category,
            reporting,
            health: asset.health,
            samples: asset.history.length,
            open: openHere,
          };
        })
        .sort((a, b) => Number(a.reporting) - Number(b.reporting) || a.health - b.health),
    [assets, unresolved],
  );

  const reporting = sensorRows.filter((row) => row.reporting).length;

  const meanConfidence = useMemo(
    () => mean(unresolved.map((record) => record.confidence)) * 100,
    [unresolved],
  );

  const stats: DetailStat[] = [
    {
      key: 'score',
      label: 'Confidence score',
      value:
        confidence.scorePct === null || unresolved.length === 0
          ? '—'
          : formatPercent(confidence.scorePct, 1),
      caption: 'Published model probability, derated by how much of the estate is actually reporting',
      icon: Brain,
      accent: '#EC4899',
      tone: (confidence.scorePct ?? 0) >= 80 ? 'good' : 'bad',
    },
    {
      key: 'model',
      label: 'Model probability',
      value: confidence.modelPct === null ? '—' : formatPercent(confidence.modelPct, 1),
      caption: `Mean per-event confidence the detector published across ${formatNumber(unresolved.length)} open event${unresolved.length === 1 ? '' : 's'}`,
      icon: Sigma,
      accent: SERIES[0],
    },
    {
      key: 'snr',
      label: 'Telemetry SNR',
      value: confidence.snrPct === null ? '—' : formatPercent(confidence.snrPct, 1),
      caption: `${formatNumber(platform.sensorsConnected)} of ${formatNumber(platform.sensorsTotal)} sensors reporting`,
      icon: Radio,
      accent: (confidence.snrPct ?? 0) >= 99 ? '#22C55E' : STATUS_COLOR.warning,
      tone: (confidence.snrPct ?? 0) >= 99 ? 'good' : 'bad',
    },
    {
      key: 'driver',
      label: 'Leading driver',
      value: confidence.driver,
      caption:
        confidence.driverPct > 0
          ? `Mean breach ${formatPercent(confidence.driverPct, 1)} against the devices' own limits`
          : 'No channel carrying a breach',
      icon: Fingerprint,
      accent: '#A855F7',
    },
  ];

  return (
    <DetailShell
      title="Engineering Confidence & Feature Attribution"
      subtitle="How much the detector's own confidence is worth given how much of the estate it can currently see, and which channel is driving it."
      eyebrow={
        <>
          <Badge tone={(confidence.scorePct ?? 0) >= 80 ? 'good' : 'warning'} size="sm" icon={Brain}>
            {confidence.scorePct === null ? '—' : formatPercent(confidence.scorePct, 1)} confidence
          </Badge>
          <Badge tone="neutral" size="sm" icon={Fingerprint}>
            Measured attribution, not SHAP
          </Badge>
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <MetricSummaryPanel metric="confidence" quality={quality} scopedCount={scoped.length} />

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <BarTrend
          title="Channel attribution across the open queue"
          subtitle="Mean breach against each device's own limit, per telemetry channel"
          eyebrow="Drivers"
          icon={Waves}
          data={drivers}
          series={[{ key: 'meanBreachPct', name: 'Mean breach', color: SERIES[0], unit: '%', decimals: 2 }]}
          layout="horizontal"
          height={Math.max(240, drivers.length * 40)}
          categoryWidth={124}
          colorFor={(point) => String(point.color)}
          footnote="Ranked by how far past its own limit each channel is sitting, not by event count — a channel with one enormous breach outranks one with many marginal ones. Energy usually leads because a consumption drift is measured against the device's own trailing baseline rather than a fixed ceiling, so a modest absolute change is a large proportional one."
        />

        <Card className="flex flex-col">
          <CardHeader
            title="Telemetry integrity"
            subtitle="The SNR term, and what it is derating the model probability by"
            eyebrow="Signal quality"
            icon={Gauge}
          />

          <div className="mt-4 flex items-center justify-center">
            <RadialGauge
              value={confidence.snrPct ?? 0}
              max={100}
              target={99}
              color={(confidence.snrPct ?? 0) >= 99 ? '#22C55E' : STATUS_COLOR.warning}
              size={168}
              label="Sensors reporting"
              caption={`${formatNumber(reporting)} of ${formatNumber(sensorRows.length)} endpoints · target 99%`}
              unit="%"
              decimals={1}
            />
          </div>

          <dl className="mt-4 space-y-2 border-t border-overlay/[0.06] pt-3.5">
            {[
              { label: 'Model probability', value: formatPercent(meanConfidence, 1) },
              { label: 'SNR factor', value: formatPercent(confidence.snrPct ?? 0, 1) },
              {
                label: 'Composite',
                value: confidence.scorePct === null ? '—' : formatPercent(confidence.scorePct, 1),
              },
              { label: 'Ingest rate', value: `${formatNumber(platform.ingestPerMinute)} msg/min` },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="truncate text-[11.5px] text-fg-muted">{row.label}</dt>
                <dd className="shrink-0 text-[11.5px] font-semibold tabular-nums text-fg-soft">{row.value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3.5 border-t border-overlay/[0.06] pt-3 font-mono text-[11px] text-fg-soft">
            confidence = P(model) × (sensors_reporting / sensors_total)
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">
            The derating is the point. A 95% score drawn from a half-silent fleet is not the same claim as a 95%
            score drawn from a complete one, and reporting them identically would hide the difference exactly
            when it matters most.
          </p>
        </Card>
      </div>

      {/* ─── Measured attribution for the worst open event ───────────────── */}
      <Card>
        <CardHeader
          title="Parameter contribution"
          subtitle={
            worst
              ? `${ruleFor(worst)?.signature ?? worst.title} on ${worst.assetId} — the largest open breach`
              : 'No open event to attribute'
          }
          eyebrow="Explainability"
          icon={Fingerprint}
        />

        {contribution.length > 0 && worst ? (
          <>
            <ul className="mt-4 space-y-2.5">
              {contribution.map((slice) => (
                <li key={slice.channel} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-[11.5px] text-fg-soft">{slice.label}</span>
                  <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-overlay/[0.07]">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500 ease-enterprise"
                      style={{ width: `${slice.pct}%`, backgroundColor: slice.color }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right text-[12px] font-semibold tabular-nums text-fg">
                    {formatPercent(slice.pct, 1)}
                  </span>
                  <span
                    className={cn(
                      'w-20 shrink-0 text-right text-[10.5px] tabular-nums',
                      slice.deviationPct >= 0 ? 'text-fg-muted' : 'text-fg-dim',
                    )}
                    title="Signed departure from the device's own window mean"
                  >
                    {slice.deviationPct > 0 ? '+' : ''}
                    {formatNumber(slice.deviationPct, 2)}%
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 grid grid-cols-2 gap-2.5 border-t border-overlay/[0.06] pt-3.5 sm:grid-cols-4">
              {[
                { label: 'Observed', value: `${formatNumber(worst.observed, 2)} ${worst.unit}` },
                { label: 'Threshold', value: `${formatNumber(worst.threshold, 2)} ${worst.unit}` },
                { label: 'Breach', value: formatPercent(breachRatio(worst) * 100, 1) },
                { label: 'Model score', value: formatNumber(worst.anomalyScore, 2) },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg border border-overlay/[0.06] bg-ink-850/50 p-2.5">
                  <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                    {cell.label}
                  </dt>
                  <dd className="mt-1 truncate text-[12.5px] font-semibold tabular-nums text-fg">
                    {cell.value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-3.5 border-t border-overlay/[0.06] pt-3 text-[11.5px] leading-relaxed text-fg-dim">
              The scorer publishes a single probability per event and no per-feature values, so this is not a
              SHAP decomposition and is not presented as one. Each share is the channel's departure from this
              device's own trailing mean at the moment of the raise, normalised across channels — measured from
              the stream the detector was reading. Leading driver:{' '}
              <span className="font-semibold text-fg-soft">
                {channelMeta(contribution[0].channel).label}
              </span>
              .
            </p>
          </>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={Fingerprint}
              title="Nothing open to attribute"
              description="Attribution needs a live event and the retained sample window on its device. Nothing is currently open."
              compact
            />
          </div>
        )}
      </Card>

      {/* ─── Per-endpoint integrity ─────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Endpoint signal quality"
          subtitle="Which devices are contributing to the SNR term, and which are silent"
          eyebrow="Per device"
          icon={Activity}
          actions={
            <span className="text-[11px] tabular-nums text-fg-dim">
              {formatNumber(reporting)} / {formatNumber(sensorRows.length)} reporting
            </span>
          }
        />

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sensorRows.map((row) => (
            <div
              key={row.id}
              className={cn(
                'flex items-center gap-2.5 rounded-lg border p-2.5',
                row.reporting
                  ? 'border-overlay/[0.06] bg-ink-850/40'
                  : 'border-rose-400/25 bg-rose-500/[0.06]',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  row.reporting ? 'bg-emerald-400' : 'bg-rose-400',
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 font-mono text-[11px] text-fg-soft">{row.id}</span>
                  <span className="truncate text-[10.5px] text-fg-dim">{row.category}</span>
                </span>
                <span className="block truncate text-[10.5px] text-fg-dim">
                  {row.reporting ? `${formatNumber(row.samples)} samples retained` : 'not publishing'}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[11.5px] font-semibold tabular-nums text-fg">
                  {formatPercent(row.health, 0)}
                </span>
                {row.open > 0 ? (
                  <span className="block text-[10px] tabular-nums text-rose-300">{row.open} open</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-overlay/[0.06] pt-3 text-[11px] leading-relaxed text-fg-dim">
          A silent endpoint is not a healthy one — it is an endpoint the platform cannot assert anything about.
          Each one drags the SNR factor down proportionally, which is why the composite score falls even when
          every reporting device looks fine.
        </p>
      </Card>
    </DetailShell>
  );
};
