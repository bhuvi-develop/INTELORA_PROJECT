import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

/*
 * Buttons are machined keys, not coloured rectangles.
 *
 * Each solid variant carries a top-edge highlight, a shallow surface gradient
 * and a contact shadow, so it sits proud of the panel. Pressing it swaps the
 * highlight for an inset shadow and drops it a pixel — the key travels, which
 * is the whole difference between a control that feels physical and one that
 * merely changes colour.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 bg-surface-raised text-white shadow-elev-2 ring-1 ring-inset ring-brand-400/50 ' +
    'hover:bg-brand-400 hover:shadow-glow-sm active:translate-y-px active:shadow-inset active:bg-brand-600 ' +
    'disabled:bg-brand-800/60 disabled:shadow-none',
  secondary:
    'bg-ink-750/80 bg-surface-1 text-fg ring-1 ring-inset ring-line/[0.12] shadow-elev-1 ' +
    'hover:bg-ink-700/80 hover:ring-line/[0.2] hover:shadow-elev-2 active:translate-y-px active:shadow-inset',
  ghost: 'text-fg-muted hover:bg-overlay/[0.06] hover:text-fg active:bg-overlay/[0.09]',
  outline:
    'text-fg ring-1 ring-inset ring-line/[0.18] hover:bg-overlay/[0.05] hover:ring-line/30 ' +
    'active:translate-y-px active:shadow-inset',
  danger:
    'bg-rose-600/90 bg-surface-raised text-white ring-1 ring-inset ring-white/15 shadow-elev-2 ' +
    'hover:bg-rose-500 hover:shadow-elev-3 active:translate-y-px active:shadow-inset active:bg-rose-700',
  subtle:
    'bg-brand-500/12 text-brand-200 ring-1 ring-inset ring-brand-400/25 ' +
    'hover:bg-brand-500/20 hover:ring-brand-400/40 active:translate-y-px',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 px-3 text-[11.5px] rounded-full',
  sm: 'h-8.5 gap-1.5 px-4 text-[12.5px] rounded-full',
  md: 'h-10 gap-2 px-5 text-[13.5px] rounded-full',
  lg: 'h-11.5 gap-2 px-6 text-sm rounded-full',
};

const ICON_SIZE: Record<ButtonSize, number> = { xs: 13, sm: 14, md: 16, lg: 17 };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      icon: Icon,
      iconRight: IconRight,
      loading = false,
      fullWidth = false,
      className,
      children,
      disabled,
      type = 'button',
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.005em]',
        'transition-all duration-150 ease-enterprise',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT[variant],
        SIZE[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={ICON_SIZE[size]} className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={ICON_SIZE[size]} aria-hidden />
      ) : null}
      {children}
      {IconRight && !loading ? <IconRight size={ICON_SIZE[size]} aria-hidden /> : null}
    </button>
  ),
);

Button.displayName = 'Button';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconRight'> {
  icon: LucideIcon;
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon: Icon, label, variant = 'ghost', size = 'md', className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-enterprise hover:shadow-glow-sm',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT[variant],
        size === 'xs' ? 'h-7 w-7' : size === 'sm' ? 'h-8.5 w-8.5' : size === 'lg' ? 'h-11.5 w-11.5' : 'h-10 w-10',
        className,
      )}
      {...rest}
    >
      <Icon size={ICON_SIZE[size]} aria-hidden />
    </button>
  ),
);

IconButton.displayName = 'IconButton';
