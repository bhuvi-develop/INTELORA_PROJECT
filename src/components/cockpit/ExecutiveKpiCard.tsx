import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { Sparkline } from '@/components/charts/Sparkline';
import { Tooltip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';

/* ───────────────────────────────────────────────────────────────────────────
 * Executive KPI card.
 *
 * Carries the six things the cockpit brief asks of every KPI: current value,
 * the comparison against yesterday, a trend indicator, a mini sparkline, a
 * status colour and a hover tooltip explaining what the number means and where
 * it came from.
 *
 * The delta is drawn from the archived prior-day baseline, so the comparison is
 * a stored fact rather than a figure invented at render time.
 * ─────────────────────────────────────────────────────────────────────────── */

export type KpiStatus = 'good' | 'warning' | 'critical' | 'neutral';

/* Status accents come from the reserved status palette, which is deliberately
 * not themed. Only the neutral slot follows the categorical palette, so it is
 * read at render time rather than captured here. */
const STATUS_ACCENT: Record<Exclude<KpiStatus, 'neutral'>, string> = {
  good: STATUS_COLOR.good,
  warning: STATUS_COLOR.warning,
  critical: STATUS_COLOR.critical,
};

const accentFor = (status: KpiStatus): string =>
  status === 'neutral' ? SERIES[0] : STATUS_ACCENT[status];

export interface ExecutiveKpiCardProps {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  status?: KpiStatus;
  /** Yesterday's value for the comparison line. */
  yesterday?: number;
  /** Today's value, in the same units as `yesterday`. */
  current?: number;
  /** Which direction is an improvement for this metric. */
  goodDirection?: 'up' | 'down';
  /** Decimals used when rendering the comparison figure. */
  decimals?: number;
  trail?: number[];
  /** Explains the metric and its provenance. */
  tooltip: string;
  onClick?: () => void;
  loading?: boolean;
  className?: string;
}

export const ExecutiveKpiCard = ({
  label,
  value,
  unit,
  icon: Icon,
  status = 'neutral',
  yesterday,
  current,
  goodDirection = 'up',
  decimals = 1,
  trail,
  tooltip,
  onClick,
  loading = false,
  className,
}: ExecutiveKpiCardProps) => {
  const accent = accentFor(status);

  const hasComparison =
    yesterday !== undefined && current !== undefined && Number.isFinite(yesterday) && Number.isFinite(current);

  const absoluteDelta = hasComparison ? current - yesterday : 0;
  const relativeDelta = hasComparison && yesterday !== 0 ? (absoluteDelta / Math.abs(yesterday)) * 100 : 0;

  const flat = !hasComparison || Math.abs(relativeDelta) < 0.15;
  const rising = absoluteDelta > 0;
  const improving = flat ? null : rising === (goodDirection === 'up');

  const TrendIcon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight;

  if (loading) {
    return (
      <div className={cn('panel p-4', className)}>
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="mt-3 h-8 w-28" />
        <Skeleton className="mt-3 h-2.5 w-32" />
        <Skeleton className="mt-3 h-9 w-full" />
      </div>
    );
  }

  const body = (
    <>
      {/* Status rail — the card's condition read at a glance. */}
      <span
        className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl"
        style={{ backgroundColor: accent }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow min-w-0 truncate">{label}</p>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-overlay/[0.07]"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={14} aria-hidden />
        </span>
      </div>

      <div className="mt-2.5 flex items-baseline gap-1">
        <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-fg">{value}</span>
        {unit ? <span className="text-[12.5px] font-medium text-fg-muted">{unit}</span> : null}
      </div>

      {/* Yesterday comparison and trend indicator. */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-grow">
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset',
            flat
              ? 'bg-overlay/[0.05] text-fg-dim ring-overlay/10'
              : improving
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25'
                : 'bg-rose-500/10 text-rose-300 ring-rose-400/25',
          )}
        >
          <TrendIcon size={10} aria-hidden />
          <span className="tabular-nums">
            {flat ? '0.0%' : `${relativeDelta > 0 ? '+' : '−'}${formatNumber(Math.abs(relativeDelta), 1)}%`}
          </span>
        </span>
        <span className="truncate text-[10px] text-fg-faint">
          {hasComparison ? `vs ${formatNumber(yesterday, decimals)} yesterday` : 'no prior-day baseline'}
        </span>
      </div>

      {trail && trail.length > 1 ? (
        <div className="-mx-0.5 mt-auto pt-2.5 h-[42px]">
          <Sparkline data={trail} color={accent} height={32} endDot={false} />
        </div>
      ) : (
        <div className="mt-auto h-[42px]" aria-hidden />
      )}
    </>
  );

  const shell = cn(
    'relative w-full h-full flex flex-col overflow-hidden p-4 text-left transition-all duration-300 ease-out rounded-2xl',
    'bg-ink-900/60 backdrop-blur-xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
    onClick && 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(59,130,246,0.25)] hover:border-brand-400/40 active:scale-[0.98]',
    className,
  );

  return (
    <Tooltip content={<span className="block leading-relaxed">{tooltip}</span>} wrapperClassName="w-full h-full flex">
      {onClick ? (
        <button type="button" onClick={onClick} className={shell}>
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </Tooltip>
  );
};
