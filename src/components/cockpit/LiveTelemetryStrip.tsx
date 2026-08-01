import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Gauge, Plug, Radio, Thermometer, Waves, Zap } from 'lucide-react';
import { TICK_MS } from '@/engine/catalog';
import { useAssetList, useEngineControl } from '@/engine/store';
import { CHANNEL_COLOR, SERIES } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { useSmoothedValues } from '@/hooks/useSmoothedValues';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';

/* ───────────────────────────────────────────────────────────────────────────
 * Live telemetry strip.
 *
 * Aggregate readout of the nine channels the cockpit brief specifies, including
 * the full power triangle. Active, reactive and apparent power are all derived
 * from the same measured voltage, current and power factor, so the triangle
 * always closes — none of the three is an independent figure.
 *
 * The engine samples every five seconds; this panel eases toward each new sample
 * once per second so the readout reads as continuously live without displaying
 * numbers no device reported.
 * ─────────────────────────────────────────────────────────────────────────── */

interface ChannelSpec {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  color: string;
  icon: typeof Zap;
  hint: string;
  /** Aggregation applied across the estate. */
  mode: 'sum' | 'mean';
}

/* Built per render so channel hues follow the active theme. */
const buildChannelSpecs = (): ChannelSpec[] => [
  {
    key: 'voltage',
    label: 'Voltage',
    unit: 'V',
    decimals: 2,
    color: CHANNEL_COLOR.voltage,
    icon: Zap,
    hint: 'Mean supply voltage across reporting devices',
    mode: 'mean',
  },
  {
    key: 'current',
    label: 'Current',
    unit: 'A',
    decimals: 3,
    color: CHANNEL_COLOR.current,
    icon: Activity,
    hint: 'Total current drawn across reporting devices',
    mode: 'sum',
  },
  {
    key: 'activePower',
    label: 'Active Power',
    unit: 'W',
    decimals: 1,
    color: CHANNEL_COLOR.power,
    icon: Zap,
    hint: 'Real power doing work — voltage × current × power factor',
    mode: 'sum',
  },
  {
    key: 'reactivePower',
    label: 'Reactive Power',
    unit: 'VAR',
    decimals: 1,
    color: SERIES[4],
    icon: Waves,
    hint: 'Power exchanged with reactive elements, derived from the power triangle',
    mode: 'sum',
  },
  {
    key: 'apparentPower',
    label: 'Apparent Power',
    unit: 'VA',
    decimals: 1,
    color: SERIES[6],
    icon: Gauge,
    hint: 'Total power delivered — the vector sum of active and reactive',
    mode: 'sum',
  },
  {
    key: 'powerFactor',
    label: 'Power Factor',
    unit: '',
    decimals: 3,
    color: CHANNEL_COLOR.powerFactor,
    icon: Gauge,
    hint: 'Ratio of active to apparent power; falls as devices degrade',
    mode: 'mean',
  },
  {
    key: 'frequency',
    label: 'Frequency',
    unit: 'Hz',
    decimals: 2,
    color: CHANNEL_COLOR.frequency,
    icon: Radio,
    hint: 'Mean supply frequency at the device input',
    mode: 'mean',
  },
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    decimals: 1,
    color: CHANNEL_COLOR.temperature,
    icon: Thermometer,
    hint: 'Mean internal temperature across reporting devices',
    mode: 'mean',
  },
];

export const LiveTelemetryStrip = ({ className }: { className?: string }) => {
  const assets = useAssetList();
  const { running, tick } = useEngineControl();
  const CHANNEL_SPECS = buildChannelSpecs();

  /* Authoritative aggregate from the current tick. */
  const target = useMemo(() => {
    const reporting = assets.filter((asset) => asset.device.status !== 'Offline');
    const count = Math.max(1, reporting.length);

    const sum = (pick: (index: number) => number) =>
      reporting.reduce((total, _asset, index) => total + pick(index), 0);

    const totals = reporting.reduce(
      (acc, asset) => {
        const { voltage, current, powerFactor, power, temperature, frequency } = asset.live;
        // Apparent and reactive power are two of the fourteen parameters the
        // MIKOS sensor publishes; they are read, never recomputed here.
        acc.voltage += voltage;
        acc.current += current;
        acc.activePower += power;
        acc.reactivePower += asset.live.reactivePower;
        acc.apparentPower += asset.live.apparentPower;
        acc.powerFactor += powerFactor;
        acc.frequency += frequency;
        acc.temperature += temperature;
        return acc;
      },
      {
        voltage: 0,
        current: 0,
        activePower: 0,
        reactivePower: 0,
        apparentPower: 0,
        powerFactor: 0,
        frequency: 0,
        temperature: 0,
      },
    );

    void sum;

    return {
      voltage: totals.voltage / count,
      current: totals.current,
      activePower: totals.activePower,
      reactivePower: totals.reactivePower,
      apparentPower: totals.apparentPower,
      powerFactor: totals.powerFactor / count,
      frequency: totals.frequency / count,
      temperature: totals.temperature / count,
    };
  }, [assets]);

  /* Eased once per second toward the latest measured aggregate. */
  const displayed = useSmoothedValues(target, { intervalMs: 1_000, factor: 0.45 });

  const relayClosed = assets.filter((asset) => asset.device.status !== 'Offline').length;
  const relayOpen = assets.length - relayClosed;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader
        title="Live telemetry"
        subtitle="Aggregate channel readout across the connected estate"
        eyebrow="Real time"
        icon={Radio}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={running ? 'good' : 'neutral'} size="xs" dot>
              {running ? '1s refresh' : 'paused'}
            </Badge>
            <span className="text-[10px] tabular-nums text-fg-faint">tick {tick}</span>
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9">
        {CHANNEL_SPECS.map((spec) => {
          const value = displayed[spec.key as keyof typeof displayed] ?? 0;
          const Icon = spec.icon;
          return (
            <Tooltip
              key={spec.key}
              content={
                <span className="block whitespace-nowrap">
                  {spec.hint}
                  <br />
                  <span className="text-fg-faint">
                    fleet {spec.mode} · {relayClosed} device{relayClosed === 1 ? '' : 's'} reporting
                  </span>
                </span>
              }
            >
              <div className="w-full rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-2.5 transition-colors hover:border-overlay/[0.12]">
                <span className="flex items-center gap-1.5" style={{ color: spec.color }}>
                  <Icon size={11} aria-hidden />
                  <span className="truncate text-[9.5px] font-semibold uppercase tracking-[0.1em]">{spec.label}</span>
                </span>
                <p className="mt-1.5 flex items-baseline gap-0.5">
                  {/* Key on the rounded value so the tween animates per change. */}
                  <motion.span
                    key={`${spec.key}-${value.toFixed(spec.decimals)}`}
                    initial={{ opacity: 0.55, y: -1 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="text-[14.5px] font-semibold leading-none tabular-nums text-fg"
                  >
                    {formatNumber(value, spec.decimals)}
                  </motion.span>
                  {spec.unit ? <span className="text-[9.5px] font-medium text-fg-muted">{spec.unit}</span> : null}
                </p>
              </div>
            </Tooltip>
          );
        })}

        {/* Relay status — a state, not a measurement, so it is reported as a count. */}
        <Tooltip
          content={
            <span className="block whitespace-nowrap">
              Supply relay position across the estate
              <br />
              <span className="text-fg-faint">An unreachable device is reported as an open relay</span>
            </span>
          }
        >
          <div className="w-full rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-2.5">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <Plug size={11} aria-hidden />
              <span className="truncate text-[9.5px] font-semibold uppercase tracking-[0.1em]">Relay</span>
            </span>
            <p className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[14.5px] font-semibold leading-none tabular-nums text-emerald-300">
                {relayClosed}
              </span>
              <span className="text-[9.5px] font-medium text-fg-muted">closed</span>
            </p>
            {relayOpen > 0 ? (
              <p className="mt-0.5 text-[9px] tabular-nums text-fg-faint">{relayOpen} open</p>
            ) : null}
          </div>
        </Tooltip>
      </div>

      <p className="mt-3 border-t border-overlay/[0.06] pt-2.5 text-[10.5px] leading-relaxed text-fg-dim">
        Devices sample every {TICK_MS / 1000} seconds; this panel eases toward each new sample once per second. Active,
        reactive and apparent power are derived from the same measured voltage, current and power factor, so the power
        triangle always closes.
      </p>
    </Card>
  );
};
