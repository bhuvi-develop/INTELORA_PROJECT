import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the top-light sheen used on elevated panels. */
  sheen?: boolean;
  /** Removes internal padding so the card can host a table edge-to-edge. */
  flush?: boolean;
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ sheen = false, flush = false, interactive = false, className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        'panel overflow-hidden',
        sheen && 'panel-sheen',
        !flush && 'p-4 sm:p-5',
        interactive && 'panel-interactive',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);

Card.displayName = 'Card';

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

export const CardHeader = ({ title, subtitle, eyebrow, icon: Icon, actions, className }: CardHeaderProps) => (
  <div className={cn('flex items-start justify-between gap-4', className)}>
    <div className="flex min-w-0 items-start gap-3">
      {Icon ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-400/20">
          <Icon size={15} aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h3 className="truncate text-[13.5px] font-semibold tracking-[-0.005em] text-fg">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-fg-dim">{subtitle}</p> : null}
      </div>
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);

export const CardBody = ({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-4', className)} {...rest}>
    {children}
  </div>
);

export const CardFooter = ({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-4 flex items-center justify-between gap-3 border-t border-overlay/[0.06] pt-3.5', className)} {...rest}>
    {children}
  </div>
);
