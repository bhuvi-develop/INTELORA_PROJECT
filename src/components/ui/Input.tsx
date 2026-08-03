import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: LucideIcon;
  trailing?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, icon: Icon, trailing, className, containerClassName, id, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className={cn('w-full', containerClassName)}>
        {label ? (
          <label htmlFor={inputId} className="mb-1.5 block text-[12px] font-medium text-fg-soft">
            {label}
          </label>
        ) : null}

        <div className="relative">
          {Icon ? (
            <Icon
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-dim"
              aria-hidden
            />
          ) : null}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-10 w-full rounded-xl bg-ink-850/80 text-[13.5px] text-fg placeholder:text-fg-faint',
              'shadow-inset ring-1 ring-inset ring-line/[0.1] transition-all duration-150 ease-enterprise',
              'hover:ring-line/[0.16] focus:outline-none focus:ring-2 focus:ring-brand-500/70',
              'disabled:cursor-not-allowed disabled:opacity-55',
              Icon ? 'pl-9.5' : 'pl-3.5',
              trailing ? 'pr-11' : 'pr-3.5',
              error && 'ring-rose-500/50 focus:ring-rose-500/70',
              className,
            )}
            {...rest}
          />
          {trailing ? (
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">{trailing}</div>
          ) : null}
        </div>

        {error ? (
          <p id={`${inputId}-error`} className="mt-1.5 text-[11.5px] text-rose-300">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="mt-1.5 text-[11.5px] text-fg-dim">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
