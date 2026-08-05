import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

export interface KpiCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: number;
  trendLabel?: string;
  intent?: 'success' | 'warning' | 'danger' | 'neutral' | 'primary';
  className?: string;
}

export const KpiCard = ({ title, value, icon, trend, trendLabel, intent = 'neutral', className }: KpiCardProps) => {
  return (
    <Card className={cn("p-5 flex flex-col justify-between h-32 relative overflow-hidden", className)}>
      <div className="flex items-center justify-between z-10">
        <span className="text-sm font-semibold tracking-wide text-fg-soft">{title}</span>
        {icon && <div className="text-fg-soft">{icon}</div>}
      </div>
      <div className="z-10 mt-2">
        <div className="text-3xl font-light tabular-nums text-fg">{value}</div>
        {trendLabel && (
          <div className={cn("text-xs font-medium mt-1", {
            'text-emerald-400': intent === 'success',
            'text-amber-400': intent === 'warning',
            'text-rose-400': intent === 'danger',
            'text-brand-400': intent === 'primary',
            'text-fg-soft': intent === 'neutral',
          })}>
            {trend !== undefined && trend !== null ? `${trend} ` : ''}{trendLabel}
          </div>
        )}
      </div>
    </Card>
  );
};
