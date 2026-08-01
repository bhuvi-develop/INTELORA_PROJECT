import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SURFACE } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber, formatPercent } from '@/utils/format';
import { ChartFrame } from './ChartFrame';
import { ChartTooltip } from './ChartTooltip';
import type { SeriesDef } from './chartTheme';

export interface DonutDatum {
  key: string;
  name: string;
  value: number;
  color: string;
}

export interface DonutSplitProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  footnote?: ReactNode;
  data: DonutDatum[];
  height?: number;
  /** Hero figure rendered in the hole. */
  centerValue?: string;
  centerLabel?: string;
  className?: string;
}

export const DonutSplit = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  footnote,
  data,
  height = 220,
  centerValue,
  centerLabel,
  className,
}: DonutSplitProps) => {
  const total = data.reduce((sum, datum) => sum + datum.value, 0) || 1;
  const series: SeriesDef[] = data.map((datum) => ({ key: datum.key, name: datum.name, color: datum.color, decimals: 0 }));

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
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="relative shrink-0" style={{ height, width: height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={
                  <ChartTooltip
                    series={series}
                    labelFormatter={() => ''}
                  />
                }
                isAnimationActive={false}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="64%"
                outerRadius="94%"
                paddingAngle={2}
                stroke={SURFACE.chart}
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((datum) => (
                  <Cell key={datum.key} fill={datum.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {centerValue ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[1.5rem] font-semibold leading-none tracking-[-0.02em] text-fg">{centerValue}</span>
              {centerLabel ? (
                <span className="mt-1 max-w-[7rem] text-center text-[10.5px] leading-tight text-fg-dim">
                  {centerLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <ul className="min-w-0 flex-1 space-y-2">
          {data.map((datum) => (
            <li key={datum.key} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: datum.color }}
                  aria-hidden
                />
                <span className="truncate text-[12px] text-fg-soft">{datum.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className="text-[12.5px] font-semibold tabular-nums text-fg">{formatNumber(datum.value)}</span>
                <span className={cn('text-[10.5px] tabular-nums text-fg-faint')}>
                  {formatPercent((datum.value / total) * 100, 1)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
};
