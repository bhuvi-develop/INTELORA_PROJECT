import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_MARK, SURFACE } from '@/config/viz';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import {
  axisDefaults,
  cursorDefaults,
  gradientId,
  gridDefaults,
  margin,
  tickFormatter,
  type SeriesDef,
} from './chartTheme';

export interface AreaTrendProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  /** Any array of objects carrying the series keys plus the category key. */
  data: object[];
  series: ReadonlyArray<SeriesDef>;
  xKey?: string;
  height?: number;
  /** Fixed y-domain. Defaults to Recharts auto-scaling with a zero floor. */
  domain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
  /** Horizontal reference marks (targets, thresholds, world-class lines). */
  references?: Array<{ value: number; label: string; color?: string }>;
  stacked?: boolean;
  className?: string;
}

export const AreaTrend = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  data,
  series,
  xKey = 'label',
  height = 280,
  domain = [0, 'auto'],
  references = [],
  stacked = false,
  className,
}: AreaTrendProps) => {
  const plotted = series.filter((entry) => !entry.reference);

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      icon={icon}
      actions={actions}
      series={series}
      footnote={footnote}
      className={className}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={margin}>
            <defs>
              {plotted.map((entry) => (
                <linearGradient key={entry.key} id={gradientId(entry.key)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={entry.color} stopOpacity={stacked ? 0.55 : 0.32} />
                  <stop offset="100%" stopColor={entry.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid {...gridDefaults} />
            <XAxis dataKey={xKey} {...axisDefaults} minTickGap={28} interval="preserveStartEnd" />
            <YAxis {...axisDefaults} domain={domain} tickFormatter={tickFormatter} width={46} />
            <Tooltip
              cursor={cursorDefaults}
              content={<ChartTooltip series={series} />}
              isAnimationActive={false}
            />

            {references.map((reference) => (
              <ReferenceLine
                key={reference.label}
                y={reference.value}
                stroke={reference.color ?? SURFACE.inkMuted}
                strokeDasharray="4 5"
                strokeWidth={1.5}
                label={{
                  value: reference.label,
                  position: 'insideTopRight',
                  fill: SURFACE.inkMuted,
                  fontSize: 10.5,
                  offset: 6,
                }}
              />
            ))}

            {plotted.map((entry) => (
              <Area
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                name={entry.name}
                stroke={entry.color}
                strokeWidth={CHART_MARK.strokeWidth}
                fill={`url(#${gradientId(entry.key)})`}
                stackId={stacked ? 'stack' : undefined}
                dot={false}
                activeDot={{
                  r: CHART_MARK.activeDotRadius,
                  fill: entry.color,
                  stroke: SURFACE.chart,
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
