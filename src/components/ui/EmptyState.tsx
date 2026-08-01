import type { ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export const EmptyState = ({ icon: Icon, title, description, action, className, compact = false }: EmptyStateProps) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
      className,
    )}
  >
    <span
      className={cn(
        'flex items-center justify-center rounded-2xl bg-overlay/[0.04] text-fg-dim ring-1 ring-inset ring-overlay/[0.07]',
        compact ? 'h-9 w-9' : 'h-12 w-12',
      )}
    >
      <Icon size={compact ? 16 : 20} aria-hidden />
    </span>
    <div>
      <p className={cn('font-semibold text-fg-soft', compact ? 'text-[12.5px]' : 'text-sm')}>{title}</p>
      {description ? (
        <p className={cn('mx-auto mt-1 max-w-sm leading-relaxed text-fg-dim', compact ? 'text-[11.5px]' : 'text-xs')}>
          {description}
        </p>
      ) : null}
    </div>
    {action ? <div className="mt-1">{action}</div> : null}
  </div>
);
