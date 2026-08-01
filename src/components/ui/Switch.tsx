import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  /** Hide the visible label, keeping it available to assistive technology. */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export const Switch = ({
  checked,
  onChange,
  label,
  description,
  hideLabel = false,
  disabled = false,
  className,
}: SwitchProps) => {
  const id = useId();

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-enterprise',
          'ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-brand-600 ring-brand-400/40' : 'bg-overlay/[0.08] ring-overlay/[0.12]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-enterprise',
            checked ? 'translate-x-4.5' : 'translate-x-0.5',
          )}
          aria-hidden
        />
      </button>
      {hideLabel ? null : (
        <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
          <span className="block text-[12.5px] font-medium text-fg">{label}</span>
          {description ? <span className="mt-0.5 block text-[11.5px] leading-relaxed text-fg-dim">{description}</span> : null}
        </label>
      )}
    </div>
  );
};
