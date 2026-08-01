import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui/Card';
import type { SeriesDef } from './chartTheme';

export interface ChartFrameProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Rendered as the legend. A legend is always shown for two or more series. */
  series?: ReadonlyArray<SeriesDef>;
  footnote?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export const ChartLegend = ({ series, className }: { series: ReadonlyArray<SeriesDef>; className?: string }) => (
  <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
    {series.map((entry) => (
      <li key={entry.key} className="flex items-center gap-1.5">
        {entry.reference ? (
          <span
            className="h-0.5 w-3 shrink-0 rounded-full"
            style={{
              backgroundImage: `repeating-linear-gradient(to right, ${entry.color} 0 3px, transparent 3px 6px)`,
            }}
            aria-hidden
          />
        ) : (
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
        )}
        <span className="text-[11.5px] leading-none text-fg-muted">{entry.name}</span>
        {entry.unit ? <span className="text-[11px] leading-none text-fg-faint">({entry.unit})</span> : null}
      </li>
    ))}
  </ul>
);

export const ChartFrame = ({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  series,
  footnote,
  className,
  bodyClassName,
  children,
}: ChartFrameProps) => (
  <Card className={cn('flex flex-col', className)}>
    <CardHeader title={title} subtitle={subtitle} eyebrow={eyebrow} icon={icon} actions={actions} />

    {series && series.length >= 2 ? <ChartLegend series={series} className="mt-3.5" /> : null}

    <div className={cn('mt-3 min-w-0 flex-1', bodyClassName)}>{children}</div>

    {footnote ? (
      <p className="mt-3 border-t border-overlay/[0.06] pt-3 text-[11.5px] leading-relaxed text-fg-dim">{footnote}</p>
    ) : null}
  </Card>
);
