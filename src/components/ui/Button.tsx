import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-glow-sm hover:bg-brand-500 active:bg-brand-700 disabled:bg-brand-800/60',
  secondary:
    'bg-overlay/[0.06] text-fg ring-1 ring-inset ring-overlay/10 hover:bg-overlay/[0.1] hover:ring-overlay/[0.16]',
  ghost: 'text-fg-muted hover:bg-overlay/[0.06] hover:text-fg',
  outline: 'text-fg ring-1 ring-inset ring-overlay/[0.14] hover:bg-overlay/[0.05] hover:ring-overlay/25',
  danger: 'bg-rose-600/90 text-white hover:bg-rose-500 active:bg-rose-700',
  subtle: 'bg-brand-500/12 text-brand-200 ring-1 ring-inset ring-brand-400/25 hover:bg-brand-500/20',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1.5 px-2.5 text-[11.5px] rounded-lg',
  sm: 'h-8.5 gap-1.5 px-3 text-[12.5px] rounded-lg',
  md: 'h-10 gap-2 px-4 text-[13.5px] rounded-xl',
  lg: 'h-11.5 gap-2 px-5 text-sm rounded-xl',
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
        'inline-flex shrink-0 items-center justify-center rounded-xl transition-all duration-150 ease-enterprise',
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
