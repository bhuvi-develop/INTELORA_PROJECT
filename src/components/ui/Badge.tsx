import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'good' | 'warning' | 'serious' | 'critical';
export type BadgeSize = 'xs' | 'sm';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-overlay/[0.05] text-fg-muted ring-overlay/10',
  brand: 'bg-brand-500/12 text-brand-200 ring-brand-400/25',
  good: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/25',
  warning: 'bg-amber-500/10 text-amber-300 ring-amber-400/25',
  serious: 'bg-orange-500/10 text-orange-300 ring-orange-400/25',
  critical: 'bg-rose-500/10 text-rose-300 ring-rose-400/30',
};

const SIZE: Record<BadgeSize, string> = {
  xs: 'h-5 gap-1 px-1.5 text-[10.5px]',
  sm: 'h-6 gap-1.5 px-2 text-[11.5px]',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: LucideIcon;
  /** Renders a solid dot in the tone colour — used where colour alone must not carry meaning. */
  dot?: boolean;
  className?: string;
}

export const Badge = ({ children, tone = 'neutral', size = 'sm', icon: Icon, dot = false, className }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center rounded-md font-medium ring-1 ring-inset shadow-elev-1',
      TONE[tone],
      SIZE[size],
      className,
    )}
  >
    {dot ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden /> : null}
    {Icon ? <Icon size={size === 'xs' ? 10 : 12} aria-hidden /> : null}
    <span className="truncate">{children}</span>
  </span>
);
