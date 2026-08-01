import { ArrowDownRight, ArrowUpRight, Clock3, Leaf, Minus, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SERIES } from '@/config/viz';
import { env } from '@/config/env';
import { useSnapshot } from '@/engine/store';
import { cn } from '@/lib/cn';
import { formatCurrency, formatNumber } from '@/utils/format';
import { deviceDetailPath } from '@/routes/paths';
import { Card, CardHeader } from '@/components/ui/Card';
import { BarTrend } from '@/components/charts';
import type { SeriesDef } from '@/components/charts';
import { GrafanaPanel } from '@/components/grafana';

/* ───────────────────────────────────────────────────────────────────────────
 * Energy intelligence.
 *
 * Answers one business question: how efficiently is energy being consumed. Cost
 * and carbon are projections from the current draw, and both state their basis
 * so nobody mistakes a projection for a meter reading.
 *
 * The native panel carries today's figures; the historical trend is rendered by
 * Grafana, which is the division of labour the brief specifies.
 * ─────────────────────────────────────────────────────────────────────────── */

/* Built per render so the series colour follows the active theme. */
const buildTrendSeries = (): SeriesDef[] => [
  { key: 'kwh', name: 'Daily energy', color: SERIES[1], unit: 'kWh', decimals: 2 },
];

const Figure = ({
  label,
  value,
  unit,
  caption,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit?: string;
  caption: string;
  accent: string;
  icon: typeof Zap;
}) => (
  <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
    <span className="flex items-center gap-1.5" style={{ color: accent }}>
      <Icon size={12} aria-hidden />
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]">{label}</span>
    </span>
    <p className="mt-1.5 flex items-baseline gap-1">
      <span className="text-[15px] font-semibold leading-none tabular-nums text-fg">{value}</span>
      {unit ? <span className="text-[10px] font-medium text-fg-muted">{unit}</span> : null}
    </p>
    <p className="mt-1 text-[9.5px] leading-snug text-fg-faint">{caption}</p>
  </div>
);

export const EnergyIntelligencePanel = ({ className }: { className?: string }) => {
  const { energy } = useSnapshot();
  const TREND_SERIES = buildTrendSeries();

  const flat = Math.abs(energy.changePct) < 0.5;
  const rising = energy.changePct > 0;
  const TrendIcon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={cn('grid gap-4 xl:grid-cols-[1fr_1fr]', className)}>
      <Card className="flex flex-col">
        <CardHeader
          title="Energy intelligence"
          subtitle="How efficiently the estate is consuming energy"
          eyebrow="Consumption"
          icon={Zap}
          actions={
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold ring-1 ring-inset',
                flat
                  ? 'bg-overlay/[0.05] text-fg-dim ring-overlay/10'
                  : rising
                    ? 'bg-rose-500/10 text-rose-300 ring-rose-400/25'
                    : 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25',
              )}
            >
              <TrendIcon size={11} aria-hidden />
              <span className="tabular-nums">
                {flat ? '0.0%' : `${rising ? '+' : '−'}${formatNumber(Math.abs(energy.changePct), 1)}%`}
              </span>
              <span className="font-normal opacity-75">vs yesterday</span>
            </span>
          }
        />

        {/* Headline consumption. */}
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="eyebrow">Today</p>
            <p className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-[2rem] font-semibold leading-none tracking-[-0.02em] text-fg">
                {formatNumber(energy.todayKwh, 3)}
              </span>
              <span className="text-[13px] font-medium text-fg-muted">kWh</span>
            </p>
          </div>
          <div>
            <p className="eyebrow">Yesterday</p>
            <p className="mt-1.5 text-[17px] font-semibold leading-none tabular-nums text-fg-muted">
              {formatNumber(energy.yesterdayKwh, 2)} <span className="text-[11px] font-normal">kWh</span>
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          <Figure
            label="This week"
            value={formatNumber(energy.weeklyKwh, 1)}
            unit="kWh"
            caption="Rolling seven days including today"
            accent={SERIES[0]}
            icon={TrendingUp}
          />
          <Figure
            label="This month"
            value={formatNumber(energy.monthlyKwh, 0)}
            unit="kWh"
            caption="Rolling thirty days"
            accent={SERIES[2]}
            icon={TrendingUp}
          />
          <Figure
            label="Peak draw"
            value={formatNumber(energy.peakKw, 3)}
            unit="kW"
            caption={`Observed at ${String(energy.peakHour).padStart(2, '0')}:00`}
            accent={SERIES[3]}
            icon={Clock3}
          />
          <Figure
            label="Monthly cost"
            value={formatCurrency(energy.estimatedMonthlyCost)}
            caption={`Projected at ${formatCurrency(energy.tariffPerKwh)}/kWh`}
            accent={SERIES[4]}
            icon={Zap}
          />
          <Figure
            label="Carbon"
            value={formatNumber(energy.carbonKgPerMonth, 0)}
            unit="kg CO₂"
            caption="Projected monthly at grid intensity"
            accent={SERIES[5]}
            icon={Leaf}
          />
          <Figure
            label="Tariff"
            value={formatCurrency(energy.tariffPerKwh)}
            unit="/kWh"
            caption="Blended commercial rate"
            accent={SERIES[6]}
            icon={Zap}
          />
        </div>

        {/* Highest and lowest consumers. */}
        <div className="mt-4 grid gap-2.5 border-t border-overlay/[0.06] pt-4 sm:grid-cols-2">
          {[
            { label: 'Highest consumer', entry: energy.highestConsumer, icon: TrendingUp, accent: SERIES[1] },
            { label: 'Lowest consumer', entry: energy.lowestConsumer, icon: TrendingDown, accent: SERIES[2] },
          ].map(({ label, entry, icon: Icon, accent }) => (
            <div key={label} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
              <span className="flex items-center gap-1.5" style={{ color: accent }}>
                <Icon size={12} aria-hidden />
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]">{label}</span>
              </span>
              {entry ? (
                <>
                  <Link
                    to={deviceDetailPath(entry.assetId)}
                    className="mt-1.5 block truncate text-[12.5px] font-semibold text-fg transition-colors hover:text-brand-200"
                  >
                    {entry.assetName}
                  </Link>
                  <p className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[9.5px] text-fg-muted">
                      {entry.assetId}
                    </span>
                    <span className="text-[10.5px] tabular-nums text-fg-dim">
                      {formatNumber(entry.kwh, 3)} kWh this session
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-[12px] text-fg-dim">No data</p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 text-[10.5px] leading-relaxed text-fg-dim">
          Today's figure is the live integral of measured power. Weekly and monthly totals come from the archived daily
          records; cost and carbon are projections from the current draw, not metered charges.
        </p>
      </Card>

      <div className="flex flex-col gap-4">
        <BarTrend
          title="Daily consumption"
          subtitle="Archived daily totals across the last fortnight"
          eyebrow="Trend"
          icon={Zap}
          data={energy.dailyTrend.map((point) => ({ t: point.t, label: point.label, kwh: point.kwh }))}
          series={TREND_SERIES}
          height={216}
          footnote="Native chart for the recent window; Grafana below carries the long-term analysis."
        />

        <GrafanaPanel
          dashboard={env.grafana.dashboards.telemetry}
          panelId={7}
          title="Long-term energy analysis"
          subtitle="Historical consumption served from Grafana"
          height={216}
          from="now-90d"
          refresh="5m"
          variables={{ metric: 'energy' }}
        />
      </div>
    </div>
  );
};
