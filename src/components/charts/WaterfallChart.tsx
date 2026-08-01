import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ORDINAL_BLUE, SERIES, SURFACE } from '@/config/viz';
import { formatNumber, formatPercent } from '@/utils/format';
import { ChartFrame } from './ChartFrame';
import { axisDefaults, barCursor, gridDefaults, tickFormatter } from './chartTheme';

export interface WaterfallStep {
  key: string;
  label: string;
  /** Magnitude of the decline at this step, in the same units as the total. */
  loss: number;
  detail?: string;
}

export interface WaterfallChartProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  steps: WaterfallStep[];
  /** Starting value of the cascade (100 for a percentage decomposition). */
  start: number;
  /** Label for the opening and closing columns. */
  startLabel: string;
  endLabel: string;
  unit?: string;
  height?: number;
  className?: string;
}

interface WaterfallRow {
  label: string;
  base: number;
  delta: number;
  cumulative: number;
  kind: 'total' | 'loss';
  detail?: string;
}

interface WaterfallTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: WaterfallRow }>;
  unit?: string;
}

const WaterfallTooltip = ({ active, payload, unit }: WaterfallTooltipProps) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="min-w-[11rem] rounded-xl border border-overlay/10 bg-ink-750/97 px-3 py-2.5 shadow-raised backdrop-blur-xl">
      <p className="text-[12px] font-semibold text-fg">{row.label}</p>
      {row.detail ? <p className="mt-0.5 text-[11px] leading-relaxed text-fg-dim">{row.detail}</p> : null}
      <dl className="mt-2 space-y-1">
        {row.kind === 'loss' ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[11px] text-fg-muted">Loss</dt>
            <dd className="text-[12px] font-semibold tabular-nums text-fg">
              −{formatNumber(row.delta, 2)}
              {unit ?? ''}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[11px] text-fg-muted">Running total</dt>
          <dd className="text-[12px] font-semibold tabular-nums text-fg">
            {formatNumber(row.cumulative, 2)}
            {unit ?? ''}
          </dd>
        </div>
      </dl>
    </div>
  );
};

/**
 * Cascade from an opening total through each loss to the closing value. The
 * transparent `base` segment positions each floating bar; only the `delta`
 * segment is inked, so one y-scale carries the whole decomposition.
 */
export const WaterfallChart = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  steps,
  start,
  startLabel,
  endLabel,
  unit = '%',
  height = 300,
  className,
}: WaterfallChartProps) => {
  const rows: WaterfallRow[] = [];
  rows.push({ label: startLabel, base: 0, delta: start, cumulative: start, kind: 'total' });

  let running = start;
  steps.forEach((step) => {
    const next = running - step.loss;
    rows.push({
      label: step.label,
      base: Math.max(0, next),
      delta: step.loss,
      cumulative: next,
      kind: 'loss',
      detail: step.detail,
    });
    running = next;
  });

  rows.push({ label: endLabel, base: 0, delta: Math.max(0, running), cumulative: running, kind: 'total' });

  const lossColor = (index: number): string =>
    ORDINAL_BLUE[Math.min(ORDINAL_BLUE.length - 1, ORDINAL_BLUE.length - 1 - (index % ORDINAL_BLUE.length))];

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      icon={icon}
      actions={actions}
      footnote={footnote}
      className={className}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 24, left: -14 }} barCategoryGap="24%">
            <CartesianGrid {...gridDefaults} />
            <XAxis
              dataKey="label"
              {...axisDefaults}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={54}
              tick={{ fill: SURFACE.inkMuted, fontSize: 10 }}
            />
            <YAxis {...axisDefaults} domain={[0, Math.ceil(start / 10) * 10]} tickFormatter={tickFormatter} width={46} />
            <Tooltip cursor={barCursor} content={<WaterfallTooltip unit={unit} />} isAnimationActive={false} />

            <Bar dataKey="base" stackId="cascade" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="delta" stackId="cascade" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
              {rows.map((row, index) => (
                <Cell
                  key={row.label}
                  fill={row.kind === 'total' ? SERIES[0] : lossColor(index)}
                  stroke={SURFACE.chart}
                  strokeWidth={2}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 grid gap-x-5 gap-y-1.5 border-t border-overlay/[0.06] pt-3 sm:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: lossColor(index + 1) }}
                aria-hidden
              />
              <span className="truncate text-[11.5px] text-fg-muted">{step.label}</span>
            </span>
            <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-fg">
              −{formatPercent(step.loss, 2)}
            </span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
};
