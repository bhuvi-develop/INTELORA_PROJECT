import type { LucideIcon } from 'lucide-react';
import type { TrendDirection } from '@/types';
import { SERIES } from '@/config/viz';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { Card } from '@/components/ui/Card';
import { Sparkline } from '@/components/charts/Sparkline';
import { TrendPill } from './TrendPill';

export interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  icon?: LucideIcon;
  /** Trail for the sparkline. Omit for a bare tile with no plot. */
  trail?: number[];
  /** Accent for the trail and the value emphasis. */
  accent?: string;
  delta?: { pct: number; direction: TrendDirection; goodDirection: 'up' | 'down' };
  target?: { value: number; unit?: string };
  className?: string;
  compact?: boolean;
}

/**
 * Stat tile. The number is the hero; the trail carries direction only and any
 * delta states its magnitude in text.
 */
export const StatTile = ({
  label,
  value,
  unit,
  caption,
  icon: Icon,
  trail,
  accent = SERIES[0],
  delta,
  target,
  className,
  compact = false,
}: StatTileProps) => (
  <Card className={cn('flex flex-col justify-between', compact ? 'p-3.5' : undefined, className)} interactive>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow truncate">{label}</p>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-semibold tracking-[-0.02em] text-fg',
              compact ? 'text-2xl leading-none' : 'metric-xl',
            )}
          >
            {value}
          </span>
          {unit ? <span className="text-[13px] font-medium text-fg-muted">{unit}</span> : null}
        </div>
      </div>

      {Icon ? (
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          <Icon size={16} aria-hidden />
        </span>
      ) : null}
    </div>

    {delta || target ? (
      <div className="mt-3 flex items-center gap-2">
        {delta ? (
          <TrendPill deltaPct={delta.pct} direction={delta.direction} goodDirection={delta.goodDirection} />
        ) : null}
        {target ? (
          <span className="truncate text-[10.5px] tabular-nums text-fg-faint">
            target {formatNumber(target.value, 0)}
            {target.unit ?? ''}
          </span>
        ) : null}
      </div>
    ) : null}

    {trail && trail.length > 1 ? (
      <div className={cn('-mx-1 mt-3', compact ? 'h-8' : 'h-11')}>
        <Sparkline data={trail} color={accent} height={compact ? 32 : 44} />
      </div>
    ) : null}

    {caption ? (
      <p className="mt-2.5 truncate text-[11px] leading-relaxed text-fg-dim" title={caption}>
        {caption}
      </p>
    ) : null}
  </Card>
);
