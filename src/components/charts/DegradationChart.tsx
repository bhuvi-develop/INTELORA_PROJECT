import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SERIES, STATUS_COLOR, SURFACE } from '@/config/viz';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import { axisDefaults, cursorDefaults, gridDefaults, tickFormatter, type SeriesDef } from './chartTheme';

export interface DegradationChartProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  /** Points carrying `label`, `actual`, `forecast`, `upper`, `lower` and `threshold`. */
  data: object[];
  height?: number;
  /** Label placed on the "now" divider. */
  nowLabel?: string;
  className?: string;
}

/* Built per render, not captured at module scope, so the series colours follow
 * the active theme. */
const buildSeriesDefs = (): SeriesDef[] => [
  { key: 'actual', name: 'Observed health', color: SERIES[0], decimals: 1 },
  { key: 'forecast', name: 'Projected health', color: SERIES[3], decimals: 1 },
  { key: 'threshold', name: 'Failure threshold', color: STATUS_COLOR.critical, decimals: 0, reference: true },
];

/**
 * Observed history joined to a projected decay curve with its confidence band.
 * One y-scale only — the band and both curves share the health axis.
 */
export const DegradationChart = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  data,
  height = 300,
  nowLabel = 'Now',
  className,
}: DegradationChartProps) => {
  const SERIES_DEFS = buildSeriesDefs();

  // The divider sits at the last point that still carries an observed value.
  const nowIndex = data.reduce((last, point, index) => {
    const actual = (point as Record<string, unknown>).actual;
    return typeof actual === 'number' && Number.isFinite(actual) ? index : last;
  }, 0);
  const nowTick = (data[nowIndex] as Record<string, unknown> | undefined)?.label as string | undefined;

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      icon={icon}
      actions={actions}
      series={SERIES_DEFS}
      footnote={footnote}
      className={className}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 14, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="grad-degradation-band" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[3]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES[3]} stopOpacity={0.04} />
              </linearGradient>
            </defs>

            <CartesianGrid {...gridDefaults} />
            <XAxis dataKey="label" {...axisDefaults} minTickGap={30} interval="preserveStartEnd" />
            <YAxis {...axisDefaults} domain={[0, 100]} tickFormatter={tickFormatter} width={46} />
            <Tooltip
              cursor={cursorDefaults}
              content={<ChartTooltip series={SERIES_DEFS} />}
              isAnimationActive={false}
            />

            <Area
              dataKey="upper"
              stroke="none"
              fill="url(#grad-degradation-band)"
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
              name="Upper bound"
            />
            <Area
              dataKey="lower"
              stroke="none"
              fill={SURFACE.chart}
              fillOpacity={1}
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
              name="Lower bound"
            />

            <ReferenceLine
              y={40}
              stroke={STATUS_COLOR.critical}
              strokeDasharray="4 5"
              strokeWidth={1.5}
              label={{
                value: 'Failure threshold',
                position: 'insideBottomRight',
                fill: STATUS_COLOR.critical,
                fontSize: 10.5,
                offset: 6,
              }}
            />

            {nowTick ? (
              <ReferenceLine
                x={nowTick}
                stroke={SURFACE.marker}
                strokeDasharray="2 4"
                strokeWidth={1.5}
                label={{
                  value: nowLabel,
                  position: 'insideTop',
                  fill: SURFACE.inkSecondary,
                  fontSize: 10.5,
                  offset: 8,
                }}
              />
            ) : null}

            <Line
              type="monotone"
              dataKey="forecast"
              name="Projected health"
              stroke={SERIES[3]}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 5, fill: SERIES[3], stroke: SURFACE.chart, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Observed health"
              stroke={SERIES[0]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: SERIES[0], stroke: SURFACE.chart, strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
