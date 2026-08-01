import { SERIES } from '@/config/viz';
import { cn } from '@/lib/cn';
import { clamp } from '@/utils/format';

export interface ProgressProps {
  value: number;
  max?: number;
  /** Explicit bar colour — pass a status or ramp token, never a text colour. */
  color?: string;
  className?: string;
  trackClassName?: string;
  size?: 'xs' | 'sm' | 'md';
  /** Reference marker drawn on the track (target / threshold). */
  marker?: number;
  label?: string;
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' } as const;

export const Progress = ({
  value,
  max = 100,
  color = SERIES[0],
  className,
  trackClassName,
  size = 'sm',
  marker,
  label,
}: ProgressProps) => {
  const pct = clamp((value / max) * 100, 0, 100);
  const markerPct = marker === undefined ? undefined : clamp((marker / max) * 100, 0, 100);

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-full bg-overlay/[0.07]', HEIGHT[size], trackClassName, className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-enterprise"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      {markerPct !== undefined ? (
        <span
          aria-hidden
          className="absolute top-0 h-full w-0.5 bg-fg-muted/70"
          style={{ left: `calc(${markerPct}% - 1px)` }}
        />
      ) : null}
    </div>
  );
};

export interface StackedProgressProps {
  segments: Array<{ value: number; color: string; label: string }>;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

/** Segments carry a 2px surface gap so adjacent fills stay separable. */
export const StackedProgress = ({ segments, className, size = 'sm' }: StackedProgressProps) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div className={cn('flex w-full items-stretch gap-0.5', HEIGHT[size], className)}>
      {segments.map((segment) => (
        <span
          key={segment.label}
          title={`${segment.label}: ${segment.value}`}
          className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
        />
      ))}
    </div>
  );
};
