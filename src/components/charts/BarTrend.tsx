import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SURFACE } from '@/config/viz';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import {
  axisDefaults,
  barCursor,
  barRadius,
  gridDefaults,
  margin,
  tickFormatter,
  type SeriesDef,
} from './chartTheme';

export interface BarTrendProps {
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
  layout?: 'vertical' | 'horizontal';
  stacked?: boolean;
  references?: Array<{ value: number; label: string; color?: string }>;
  /** Per-bar colour override, used for single-series categorical bars. */
  colorFor?: (point: Record<string, unknown>, index: number) => string;
  className?: string;
  /** Category axis width when laid out horizontally. */
  categoryWidth?: number;
}

export const BarTrend = ({
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
  layout = 'vertical',
  stacked = false,
  references = [],
  colorFor,
  className,
  categoryWidth = 120,
}: BarTrendProps) => {
  const plotted = series.filter((entry) => !entry.reference);
  const isHorizontal = layout === 'horizontal';

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
          <BarChart
            data={data}
            layout={isHorizontal ? 'vertical' : 'horizontal'}
            margin={isHorizontal ? { top: 4, right: 20, bottom: 0, left: 0 } : margin}
            barCategoryGap={isHorizontal ? '22%' : '26%'}
            barGap={2}
          >
            <CartesianGrid {...gridDefaults} vertical={isHorizontal} horizontal={!isHorizontal} />

            {isHorizontal ? (
              <>
                <XAxis type="number" {...axisDefaults} tickFormatter={tickFormatter} />
                <YAxis
                  type="category"
                  dataKey={xKey}
                  {...axisDefaults}
                  width={categoryWidth}
                  tick={{ fill: SURFACE.inkSecondary, fontSize: 11 }}
                />
              </>
            ) : (
              <>
                <XAxis dataKey={xKey} {...axisDefaults} minTickGap={16} interval="preserveStartEnd" />
                <YAxis {...axisDefaults} tickFormatter={tickFormatter} width={46} />
              </>
            )}

            <Tooltip cursor={barCursor} content={<ChartTooltip series={series} />} isAnimationActive={false} />

            {references.map((reference) => (
              <ReferenceLine
                key={reference.label}
                {...(isHorizontal ? { x: reference.value } : { y: reference.value })}
                stroke={reference.color ?? SURFACE.inkMuted}
                strokeDasharray="4 5"
                strokeWidth={1.5}
                label={{
                  value: reference.label,
                  position: isHorizontal ? 'top' : 'insideTopRight',
                  fill: SURFACE.inkMuted,
                  fontSize: 10.5,
                  offset: 6,
                }}
              />
            ))}

            {plotted.map((entry) => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                name={entry.name}
                fill={entry.color}
                stackId={stacked ? 'stack' : undefined}
                radius={isHorizontal ? [0, 4, 4, 0] : barRadius}
                maxBarSize={isHorizontal ? 18 : 44}
                isAnimationActive={false}
              >
                {colorFor && plotted.length === 1
                  ? data.map((point, index) => (
                      <Cell
                        key={`${entry.key}-${index}`}
                        fill={colorFor(point as Record<string, unknown>, index)}
                      />
                    ))
                  : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};
