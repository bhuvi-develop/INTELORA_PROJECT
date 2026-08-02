import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, ExternalLink, Gauge, ShieldAlert, TrendingDown, Waypoints } from 'lucide-react';
import type { AssetRuntime } from '@/engine/types';
import { bandDef } from '@/engine/derive';
import { projectDegradation } from '@/engine/analytics';
import { useAnomalyJournal, useAssetList, useSnapshot } from '@/engine/store';
import { deviceDetailPath } from '@/routes/paths';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarTrend, DegradationChart, type SeriesDef } from '@/components/charts';
import { useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';
import { MetricSummaryPanel } from './MetricSummaryPanel';
import { mean } from './metricSeries';

/* ───────────────────────────────────────────────────────────────────────────
 * Prediction horizon and remaining-life reliability.
 *
 * Lead time is the window between a warning being raised and the failure it
 * warns about. Both ends are the platform's published figures: the warning is a
 * standing event, and the failure date is the remaining life on that device's
 * weakest component. Nothing on this page models either.
 *
 * The reliability question this answers is not "is the RUL correct" — that needs
 * failures the estate has not had yet — but "is the warning arriving with enough
 * runway to act on". A warned device with two days of horizon is a worse outcome
 * than an unwarned device with two hundred.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Horizon bands, in days. Fixed so the shape stays comparable between visits. */
const HORIZON_BANDS: Array<{ label: string; max: number }> = [
  { label: '< 7 d', max: 7 },
  { label: '7–30 d', max: 30 },
  { label: '30–90 d', max: 90 },
  { label: '90–180 d', max: 180 },
  { label: '> 180 d', max: Number.POSITIVE_INFINITY },
];

export const PredictionHorizonMetricPage = () => {
  const navigate = useNavigate();
  const assets = useAssetList();
  const journal = useAnomalyJournal();
  const snapshot = useSnapshot();
  const { quality, scoped } = useAnomalyModule();

  const now = snapshot.at;
  const horizon = quality.horizon;

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const warnedIds = useMemo(
    () => new Set(journal.filter((record) => record.status !== 'Resolved').map((record) => record.assetId)),
    [journal],
  );

  const warned = useMemo(
    () =>
      assets
        .filter((asset) => warnedIds.has(asset.device.assetId))
        .sort((a, b) => a.prediction.primary.rulDays - b.prediction.primary.rulDays),
    [assets, warnedIds],
  );

  const selected: AssetRuntime | null = useMemo(() => {
    if (warned.length === 0) return null;
    return warned.find((asset) => asset.device.assetId === selectedId) ?? warned[0];
  }, [warned, selectedId]);

  /* The published trajectory for the focused device — actual condition to date,
   * then the curve to the failure threshold the platform already stated. */
  const degradation = useMemo(
    () => (selected ? projectDegradation(selected, now) : []),
    [selected, now],
  );

  /** Lead time per warned device, soonest first. */
  const leadTimes = useMemo(
    () =>
      warned.slice(0, 14).map((asset) => ({
        label: asset.device.assetId,
        horizonDays: Math.round(asset.prediction.primary.rulDays * 10) / 10,
        confidencePct: Math.round(asset.prediction.primary.confidence * 1000) / 10,
        component: asset.prediction.primary.component,
      })),
    [warned],
  );

  /** Distribution of horizons across the whole estate, warned or not. */
  const bands = useMemo(() => {
    let lower = 0;
    return HORIZON_BANDS.map(({ label, max }) => {
      const inBand = (asset: AssetRuntime) =>
        asset.prediction.primary.rulDays > lower && asset.prediction.primary.rulDays <= max;
      const all = assets.filter(inBand);
      const warnedInBand = all.filter((asset) => warnedIds.has(asset.device.assetId));
      lower = max;
      return {
        label,
        devices: all.length,
        warned: warnedInBand.length,
        unwarned: all.length - warnedInBand.length,
      };
    });
  }, [assets, warnedIds]);

  const stats: DetailStat[] = [
    {
      key: 'lead',
      label: 'Lead horizon',
      value: horizon.leadDays === null || horizon.assets === 0 ? '—' : formatNumber(horizon.leadDays, 1),
      unit: horizon.assets === 0 ? undefined : 'days',
      caption: 'Mean published remaining life across the devices currently warned',
      icon: BadgeCheck,
      accent: '#22C55E',
      tone: 'good',
    },
    {
      key: 'warned',
      label: 'Warned devices',
      value: formatNumber(horizon.assets),
      caption: `Carrying at least one open event, out of ${formatNumber(assets.length)} commissioned`,
      icon: ShieldAlert,
      accent: '#EAB308',
    },
    {
      key: 'soonest',
      label: 'Soonest RUL',
      value: horizon.soonestDays === null || horizon.assets === 0 ? '—' : formatNumber(horizon.soonestDays, 1),
      unit: horizon.assets === 0 ? undefined : 'days',
      caption:
        warned.length > 0
          ? `${warned[0].device.assetId} · weakest part ${warned[0].prediction.primary.component}`
          : 'Nothing warned',
      icon: TrendingDown,
      accent: STATUS_COLOR.critical,
      tone: horizon.soonestDays !== null && horizon.soonestDays < 7 ? 'bad' : 'neutral',
    },
    {
      key: 'confidence',
      label: 'Model confidence',
      value: horizon.confidencePct === null || horizon.assets === 0 ? '—' : formatPercent(horizon.confidencePct, 1),
      caption: 'The estimator’s own confidence in the remaining-life figures above',
      icon: Gauge,
      accent: '#38BDF8',
    },
  ];

  const leadSeries: SeriesDef[] = [
    { key: 'horizonDays', name: 'Lead horizon', color: SERIES[0], unit: 'd', decimals: 1 },
  ];

  const bandSeries: SeriesDef[] = [
    { key: 'warned', name: 'Warned', color: SERIES[0], decimals: 0 },
    { key: 'unwarned', name: 'No event raised', color: SERIES[3], decimals: 0 },
  ];

  return (
    <DetailShell
      title="Prediction Horizon & RUL Reliability"
      subtitle="Whether warnings are arriving with enough runway to act on, measured against the platform's own remaining-life figures."
      eyebrow={
        <>
          <Badge tone="good" size="sm" icon={BadgeCheck}>
            {horizon.leadDays === null ? '—' : `${formatNumber(horizon.leadDays, 1)} d mean horizon`}
          </Badge>
          {horizon.soonestDays !== null && horizon.soonestDays < 7 ? (
            <Badge tone="critical" size="sm">
              {formatNumber(horizon.soonestDays, 1)} d on the soonest
            </Badge>
          ) : null}
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <MetricSummaryPanel metric="horizon" quality={quality} scopedCount={scoped.length} />

      {selected && degradation.length > 0 ? (
        <DegradationChart
          title={`Remaining-life trajectory · ${selected.device.assetId}`}
          subtitle={`${selected.category} — condition to date, then the published curve to the failure threshold`}
          eyebrow="Trajectory"
          icon={Waypoints}
          data={degradation}
          height={320}
          nowLabel="now"
          actions={
            <div className="scroll-thin flex max-w-[26rem] items-center gap-1.5 overflow-x-auto pb-0.5">
              {warned.slice(0, 8).map((asset) => {
                const active = asset.device.assetId === selected.device.assetId;
                const def = bandDef(asset.band);
                return (
                  <button
                    key={asset.device.assetId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(asset.device.assetId)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
                      active ? 'bg-overlay/[0.09] text-fg' : 'text-fg-dim hover:bg-overlay/[0.05] hover:text-fg-soft',
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: def.color }}
                      aria-hidden
                    />
                    {asset.device.assetId}
                  </button>
                );
              })}
            </div>
          }
          footnote="The solid trail is measured condition; the band is the platform's forecast with its own confidence spread, widening as the estimate reaches further out. The curve is convex because the last stretch of condition costs far more life than the first. Nothing here is modelled in the browser — this traces between today's health and the end of life the platform already published, so the chart and the figure beside it cannot disagree."
        />
      ) : (
        <Card>
          <EmptyState
            icon={Waypoints}
            title="No warned device to trace"
            description="A trajectory needs a device carrying an open event and a published remaining-life figure. Nothing is currently warned."
          />
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <BarTrend
          title="Early warning horizon per device"
          subtitle="Lead time available on each warned device, soonest first"
          eyebrow="Runway"
          icon={TrendingDown}
          data={leadTimes}
          series={leadSeries}
          layout="horizontal"
          height={Math.max(260, leadTimes.length * 28)}
          categoryWidth={92}
          colorFor={(point) => {
            const days = Number(point.horizonDays);
            if (days < 7) return STATUS_COLOR.critical;
            if (days < 30) return STATUS_COLOR.warning;
            return '#22C55E';
          }}
          references={[
            { value: 7, label: '7 d', color: STATUS_COLOR.critical },
            { value: 30, label: '30 d', color: STATUS_COLOR.warning },
          ]}
          footnote="Red is under a week of runway — a warning that arrived too late to schedule around. These are the devices where the detector fired but the horizon is already spent."
        />

        <BarTrend
          title="Horizon distribution across the estate"
          subtitle="Every device by remaining-life band, split by whether anything has been raised"
          eyebrow="Coverage"
          icon={Gauge}
          data={bands}
          series={bandSeries}
          height={Math.max(260, bands.length * 46)}
          stacked
          footnote="The left-hand bands are where warnings matter most. A tall unwarned segment under 30 days is the gap: the platform expects those devices to fail soon and the detector has raised nothing against them."
        />
      </div>

      {warned.length > 0 ? (
        <Card>
          <CardHeader
            title="Warned devices"
            subtitle="Every device carrying an open event, with the component driving its horizon"
            eyebrow="Detail"
            icon={ShieldAlert}
          />

          <ul className="mt-4 divide-y divide-overlay/[0.045]">
            {warned.map((asset) => {
              const primary = asset.prediction.primary;
              const def = bandDef(asset.band);
              const urgent = primary.rulDays < 7;

              return (
                <li key={asset.device.assetId} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: def.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-fg">
                      {asset.device.assetId}
                      <span className="ml-2 font-normal text-fg-dim">{asset.category}</span>
                    </span>
                    <span className="block truncate text-[11px] text-fg-dim">
                      {primary.component} · {primary.recommendation}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        'block text-[12.5px] font-semibold tabular-nums',
                        urgent ? 'text-rose-300' : 'text-fg',
                      )}
                    >
                      {formatNumber(primary.rulDays, 1)} d
                    </span>
                    <span className="block text-[10.5px] tabular-nums text-fg-faint">
                      {formatPercent(primary.confidence * 100, 0)} confidence
                    </span>
                  </span>

                  <Button
                    variant="ghost"
                    size="xs"
                    icon={ExternalLink}
                    onClick={() => navigate(deviceDetailPath(asset.device.assetId))}
                  >
                    Open
                  </Button>
                </li>
              );
            })}
          </ul>

          <p className="mt-3.5 border-t border-overlay/[0.06] pt-3 text-[11px] leading-relaxed text-fg-dim">
            Mean confidence across these devices is{' '}
            {formatPercent(mean(warned.map((asset) => asset.prediction.primary.confidence)) * 100, 1)}. The
            reliability this page can report is whether the runway is long enough to act on — scoring the
            remaining-life figures themselves needs failures the estate has not had yet.
          </p>
        </Card>
      ) : null}
    </DetailShell>
  );
};
