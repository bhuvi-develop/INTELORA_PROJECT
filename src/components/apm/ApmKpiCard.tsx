import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';

/* ───────────────────────────────────────────────────────────────────────────
 * The APM KPI tile.
 *
 * One component behind every headline figure in the module — health index,
 * availability, MTBF, MTTR, failure rate, downtime, cost, effective age — so
 * that a figure looks the same wherever it is quoted and a change to the form
 * happens once.
 *
 * Three things it deliberately does that a plain stat card does not:
 *
 *   · it distinguishes "not loaded" from "zero". A KPI that renders 0 while its
 *     request is still in flight is worse than one that renders nothing,
 *     because an operator cannot tell the two apart.
 *   · it distinguishes "no denominator" from "zero". APM quotes ratios over
 *     small samples — a fleet with no closed failures has no MTBF, and saying
 *     0 h would be a claim the data does not support. Pass `value={null}`.
 *   · it carries the target beside the reading where one exists, because an
 *     availability of 96% means nothing until you know whether the target was
 *     95 or 99.
 * ─────────────────────────────────────────────────────────────────────────── */

export type KpiTone = 'good' | 'warn' | 'bad' | 'neutral';

const TONE_INK: Record<KpiTone, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  neutral: 'text-fg',
};

export interface ApmKpiCardProps {
  label: string;
  /**
   * The reading, already formatted. `null` renders an em dash — use it when the
   * figure has no denominator rather than passing a zero.
   */
  value: string | null;
  unit?: string;
  /** One line under the figure: what it is measured over, or what drives it. */
  caption?: string;
  icon?: LucideIcon;
  /** Identity colour for the rail and the icon chip. */
  accent?: string;
  tone?: KpiTone;
  /** Draws a bar under the figure. Give `max` when the scale is not 0–100. */
  meter?: { value: number; max?: number; target?: number };
  /** Shown on the info affordance — what the metric is and where it stops being trustworthy. */
  explainer?: string;
  /** Target the reading is judged against, already formatted. */
  target?: string;
  loading?: boolean;
  className?: string;
}

export const ApmKpiCard = ({
  label,
  value,
  unit,
  caption,
  icon: Icon,
  accent,
  tone = 'neutral',
  meter,
  explainer,
  target,
  loading = false,
  className,
}: ApmKpiCardProps) => (
  <Card className={cn('relative flex flex-col pl-5', className)} interactive>
    {accent ? (
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
        style={{ backgroundColor: accent }}
      />
    ) : null}

    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="eyebrow truncate">{label}</p>
        {explainer ? (
          <span className="relative z-10 shrink-0">
            <Tooltip content={explainer} side="top">
              <span
                tabIndex={0}
                role="note"
                aria-label={`${label} — ${explainer}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-fg-faint transition-colors hover:text-fg-muted focus:text-fg-muted focus:outline-none"
              >
                <Info size={11} aria-hidden />
              </span>
            </Tooltip>
          </span>
        ) : null}
      </div>

      {Icon ? (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-overlay/[0.07]"
          style={accent ? { backgroundColor: `${accent}1A`, color: accent } : undefined}
        >
          <Icon size={14} aria-hidden />
        </span>
      ) : null}
    </div>

    {loading ? (
      <Skeleton className="mt-3 h-7 w-24" />
    ) : (
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-[1.5rem] font-semibold leading-none tracking-[-0.02em]',
            value === null ? 'text-fg-faint' : TONE_INK[tone],
          )}
        >
          {value ?? '—'}
        </span>
        {unit && value !== null ? (
          <span className="text-[12px] font-medium text-fg-muted">{unit}</span>
        ) : null}
        {target ? (
          <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-fg-faint">
            target {target}
          </span>
        ) : null}
      </div>
    )}

    {meter && !loading ? (
      <Progress
        value={meter.value}
        max={meter.max ?? 100}
        marker={meter.target}
        color={accent}
        size="xs"
        className="mt-2.5"
        label={label}
      />
    ) : null}

    {caption ? (
      <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">{caption}</p>
    ) : null}
  </Card>
);

/* ─── Grid ───────────────────────────────────────────────────────────────── */

export interface ApmKpiGridProps {
  items: ApmKpiCardProps[];
  /** Columns at the widest breakpoint. Defaults to four across. */
  columns?: 3 | 4 | 6;
  className?: string;
}

const COLUMNS: Record<3 | 4 | 6, string> = {
  3: 'sm:grid-cols-2 xl:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  6: 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6',
};

/** Lays a set of KPI tiles out on the module's standard rhythm. */
export const ApmKpiGrid = ({ items, columns = 4, className }: ApmKpiGridProps) => (
  <div className={cn('grid gap-4', COLUMNS[columns], className)}>
    {items.map((item) => (
      <ApmKpiCard key={item.label} {...item} />
    ))}
  </div>
);
