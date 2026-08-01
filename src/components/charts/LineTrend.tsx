import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_MARK, SURFACE } from '@/config/viz';
import { formatNumber } from '@/utils/format';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import {
  axisDefaults,
  cursorDefaults,
  gridDefaults,
  margin,
  marginWithEndLabels,
  tickFormatter,
  type SeriesDef,
} from './chartTheme';

export interface LineTrendProps {
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
  domain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
  references?: Array<{ value: number; label: string; color?: string }>;
  /** Direct-label the final point of each series. Valid up to four series. */
  endLabels?: boolean;
  className?: string;
}

export const LineTrend = ({
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
  domain = ['auto', 'auto'],
  references = [],
  endLabels = false,
  className,
}: LineTrendProps) => {
  const plotted = series.filter((entry) => !entry.reference);
  const referenceSeries = series.filter((entry) => entry.reference);
  // Direct labels are only legible for a handful of series.
  const withEndLabels = endLabels && plotted.length <= 4 && data.length > 0;
  const last = data[data.length - 1];

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
          <LineChart data={data} margin={withEndLabels ? marginWithEndLabels : margin}>
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

            {referenceSeries.map((entry) => (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                name={entry.name}
                stroke={entry.color}
                strokeWidth={1.5}
                strokeDasharray="4 5"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}

            {plotted.map((entry) => (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                name={entry.name}
                stroke={entry.color}
                strokeWidth={CHART_MARK.strokeWidth}
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
          </LineChart>
        </ResponsiveContainer>
      </div>

      {withEndLabels && last ? (
        <ul className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {plotted.map((entry) => {
            const value = (last as Record<string, unknown>)[entry.key];
            if (typeof value !== 'number' || !Number.isFinite(value)) return null;
            return (
              <li key={entry.key} className="flex items-baseline gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: entry.color }} aria-hidden />
                <span className="text-[11px] text-fg-dim">{entry.name}</span>
                <span className="text-[12px] font-semibold tabular-nums text-fg">
                  {formatNumber(value, entry.decimals ?? 1)}
                  {entry.unit ? <span className="ml-0.5 text-[10.5px] font-normal text-fg-dim">{entry.unit}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </ChartFrame>
  );
};
