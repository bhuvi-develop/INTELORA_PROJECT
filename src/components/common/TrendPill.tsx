import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { TrendDirection } from '@/types';
import { cn } from '@/lib/cn';
import { formatSignedPercent } from '@/utils/format';

export interface TrendPillProps {
  deltaPct: number;
  direction: TrendDirection;
  /** Which direction counts as improvement for this metric. */
  goodDirection: 'up' | 'down';
  size?: 'xs' | 'sm';
  className?: string;
  /** Suffix describing the comparison window. */
  suffix?: string;
}

/**
 * Delta indicator. The arrow states the direction and the sign states the
 * magnitude, so the colour is reinforcement rather than the only channel.
 */
export const TrendPill = ({
  deltaPct,
  direction,
  goodDirection,
  size = 'xs',
  className,
  suffix,
}: TrendPillProps) => {
  const flat = direction === 'flat' || Math.abs(deltaPct) < 0.05;
  const improving = flat ? null : (direction === 'up') === (goodDirection === 'up');

  const Icon = flat ? Minus : direction === 'up' ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md font-semibold ring-1 ring-inset',
        size === 'xs' ? 'h-5 px-1.5 text-[10.5px]' : 'h-6 px-2 text-[11.5px]',
        flat
          ? 'bg-overlay/[0.05] text-fg-dim ring-overlay/10'
          : improving
            ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25'
            : 'bg-rose-500/10 text-rose-300 ring-rose-400/25',
        className,
      )}
    >
      <Icon size={size === 'xs' ? 10 : 12} aria-hidden />
      <span className="tabular-nums">{flat ? '0.0%' : formatSignedPercent(deltaPct)}</span>
      {suffix ? <span className="font-normal opacity-70">{suffix}</span> : null}
    </span>
  );
};
