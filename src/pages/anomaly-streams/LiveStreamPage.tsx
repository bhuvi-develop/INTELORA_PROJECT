import { useMemo, useState } from 'react';
import { Activity, Gauge, Radio, Sigma, Waves } from 'lucide-react';
import { TICK_MS } from '@/engine/catalog';
import { useAssetList, useConnection } from '@/engine/store';
import { formatNumber } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { LineTrend, RadialGauge, type SeriesDef } from '@/components/charts';
import { LiveIndicator, SectionHeader } from '@/components/common';
import { DetailShell } from '@/pages/anomaly-details';
import {
  channelSpecs,
  channelStats,
  channelWindow,
  gaugeCeiling,
  type ChannelPoint,
  type ChannelSpec,
  type ChannelStats,
  type StreamChannelKey,
} from './streamChannels';

/* ───────────────────────────────────────────────────────────────────────────
 * Live stream, channel by channel.
 *
 * The overview carried one plot with several channels on it, each normalised to
 * its own departure from a baseline so they could share an axis. That form
 * answers "which signal moved" and destroys the reading itself — a voltage in
 * volts and a temperature in degrees cannot honestly share a y-axis, so both had
 * to be converted into per-cent-of-baseline to appear together.
 *
 * Here each channel keeps its own units, its own axis and its own card. Nothing
 * is normalised, nothing is overlaid, and the number on the gauge is the number
 * the sensor published.
 *
 * The gauge ceiling is the one place a chart could invent a limit. Voltage,
 * current, temperature and power factor are drawn against the published
 * instrument range; active power and supply frequency have no published ceiling
 * and are drawn against the peak observed in the window, captioned as such.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Samples drawn per channel — the depth the platform hydrates each window to. */
const WINDOW_SAMPLES = 180;

const ALL_DEVICES = 'all';

/** Statistics card. Only the three electrical channels carry one. */
const StatisticsCard = ({ spec, stats }: { spec: ChannelSpec; stats: ChannelStats | null }) => (
  <Card className="flex flex-col">
    <CardHeader
      title={`${spec.label} statistics`}
      subtitle="Descriptive summary of the window plotted alongside"
      eyebrow="Statistics"
      icon={Sigma}
    />

    {stats ? (
      <>
        <dl className="mt-4 space-y-2">
          {[
            { label: 'Latest', value: stats.latest },
            { label: 'Mean', value: stats.mean },
            { label: 'Minimum', value: stats.min },
            { label: 'Maximum', value: stats.max },
            { label: 'Range', value: stats.range },
            { label: 'Std deviation', value: stats.sigma },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="truncate text-[11.5px] text-fg-muted">{row.label}</dt>
              <dd className="shrink-0 text-[12px] font-semibold tabular-nums text-fg-soft">
                {formatNumber(row.value, spec.decimals)}
                {spec.unit ? <span className="ml-1 font-normal text-fg-faint">{spec.unit}</span> : null}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3.5 border-t border-overlay/[0.06] pt-3 text-[10.5px] leading-relaxed text-fg-faint">
          Over {formatNumber(stats.samples)} retained sample{stats.samples === 1 ? '' : 's'}. These
          summarise the window on screen — they are not a platform metric and no threshold is applied
          to them.
        </p>
      </>
    ) : (
      <div className="mt-4">
        <EmptyState
          icon={Sigma}
          title="No samples retained"
          description="The selected device has not published enough readings to summarise."
          compact
        />
      </div>
    )}
  </Card>
);

/** Gauge card. Ceiling is published or observed, and the caption says which. */
const GaugeCard = ({ spec, stats }: { spec: ChannelSpec; stats: ChannelStats | null }) => {
  const ceiling = gaugeCeiling(spec, stats);
  const published = spec.ceiling !== null;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={`${spec.label} gauge`}
        subtitle="Current reading against its scale"
        eyebrow="Gauge"
        icon={Gauge}
      />

      {stats ? (
        <>
          <div className="mt-4 flex flex-1 items-center justify-center">
            <RadialGauge
              value={stats.latest}
              max={ceiling}
              color={spec.color}
              size={172}
              label={spec.label}
              caption={`${formatNumber(ceiling, spec.decimals)}${spec.unit ? ` ${spec.unit}` : ''} full scale`}
              unit={spec.unit || undefined}
              decimals={spec.decimals}
            />
          </div>

          <p className="mt-3 border-t border-overlay/[0.06] pt-3 text-[10.5px] leading-relaxed text-fg-faint">
            {published
              ? 'Arc drawn against the published instrument range — what the sensor can physically report, not what the device should be doing.'
              : 'The platform publishes no ceiling for this channel, so the arc is scaled to the highest reading in the window. The number is the measurement; the arc is only its position in that window.'}
          </p>
        </>
      ) : (
        <div className="mt-4">
          <EmptyState
            icon={Gauge}
            title="Not reporting"
            description="No reading has arrived for this channel on the current selection."
            compact
          />
        </div>
      )}
    </Card>
  );
};

export const LiveStreamPage = () => {
  const assets = useAssetList();
  const connection = useConnection();

  const [assetId, setAssetId] = useState<string>(ALL_DEVICES);

  const specs = channelSpecs();

  /* Scope is either one device or every reporting device. Offline endpoints are
   * excluded from the fleet view: they publish zero on every electrical channel,
   * and averaging a zero in would read as a fleet-wide sag. */
  const scope = useMemo(() => {
    if (assetId !== ALL_DEVICES) {
      return assets.filter((asset) => asset.device.assetId === assetId);
    }
    return assets.filter((asset) => asset.device.status !== 'Offline');
  }, [assets, assetId]);

  /* One window and one summary per channel, built once and read by all three
   * cards in that channel's section so they cannot disagree.
   *
   * Keyed by channel rather than holding the spec, because the spec carries a
   * colour that follows the theme — memoising it here would keep the outgoing
   * palette until the next batch of samples arrived. */
  const windows = useMemo(() => {
    const out = new Map<StreamChannelKey, { points: ChannelPoint[]; stats: ChannelStats | null }>();
    for (const spec of channelSpecs()) {
      const points = channelWindow(scope, spec.key, WINDOW_SAMPLES);
      out.set(spec.key, { points, stats: channelStats(points) });
    }
    return out;
  }, [scope]);

  const deviceOptions = useMemo(
    () => [
      { value: ALL_DEVICES, label: `All reporting devices (${assets.filter((a) => a.device.status !== 'Offline').length})` },
      ...assets.map((asset) => ({
        value: asset.device.assetId,
        label: `${asset.device.assetId} — ${asset.device.assetName}`,
      })),
    ],
    [assets],
  );

  const aggregated = assetId === ALL_DEVICES && scope.length > 1;

  return (
    <DetailShell
      title="Live Stream by Channel"
      subtitle="Each telemetry channel on its own axis, in its own units, in its own card. Nothing is normalised and nothing is overlaid."
      eyebrow={
        <>
          <Badge tone="brand" size="sm" icon={Radio}>
            {TICK_MS / 1000}s sample interval
          </Badge>
          <Badge tone={connection.status === 'live' ? 'good' : 'warning'} size="sm" dot>
            {connection.status === 'live' ? 'Streaming' : connection.status}
          </Badge>
          <Badge tone="neutral" size="sm">
            {formatNumber(scope.length)} device{scope.length === 1 ? '' : 's'} in scope
          </Badge>
        </>
      }
      actions={
        <>
          <LiveIndicator showTick />
          <Select
            size="sm"
            aria-label="Device"
            options={deviceOptions}
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            containerClassName="w-64"
          />
        </>
      }
    >
      {scope.length === 0 ? (
        <Card>
          <EmptyState
            icon={Radio}
            title="Nothing is reporting"
            description="No device in the current selection is publishing telemetry, so there is no channel to draw."
          />
        </Card>
      ) : (
        specs.map((spec) => {
          const { points, stats } = windows.get(spec.key) ?? { points: [], stats: null };

          const series: SeriesDef[] = [
            {
              key: 'value',
              name: aggregated ? `${spec.label} — mean across devices` : spec.label,
              color: spec.color,
              unit: spec.unit || undefined,
              decimals: spec.decimals,
            },
          ];

          return (
            <section key={spec.key} className="space-y-3">
              <SectionHeader
                title={spec.label}
                subtitle={`${spec.description}${
                  aggregated
                    ? ` Averaged across ${formatNumber(scope.length)} reporting devices.`
                    : scope.length === 1
                      ? ` ${scope[0].device.assetId} only.`
                      : ''
                }`}
              />

              <div
                className={
                  spec.statistics
                    ? 'grid gap-4 xl:grid-cols-[1.7fr_1fr_1fr]'
                    : 'grid gap-4 xl:grid-cols-[1.7fr_1fr]'
                }
              >
                {/* Time series — its own card, one channel, one series. */}
                <LineTrend
                  title={`${spec.label} time series`}
                  subtitle={`Retained window in ${spec.unit || 'ratio'}, at the published sample rate`}
                  eyebrow="Time series"
                  icon={spec.key === 'temperature' ? Activity : Waves}
                  data={points}
                  series={series}
                  height={300}
                  domain={['auto', 'auto']}
                  endLabels
                  footnote={`Plotted in ${spec.unit || 'its published ratio'} on its own axis. This channel is never drawn alongside another — a reading converted into per cent of a baseline so it can share an axis is no longer the reading.`}
                />

                <GaugeCard spec={spec} stats={stats} />

                {spec.statistics ? <StatisticsCard spec={spec} stats={stats} /> : null}
              </div>
            </section>
          );
        })
      )}

      <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-fg-faint">
        <Radio size={11} className="mt-[1px] shrink-0" aria-hidden />
        <span>
          Every value on this page is a reading the platform published, selected and — in the fleet
          view — averaged across the devices in scope. The window depth is the shortest history any
          device in scope holds, so each point averages the same number of devices.
        </span>
      </p>
    </DetailShell>
  );
};
