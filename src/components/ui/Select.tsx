import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SelectOption } from '@/types';
import { cn } from '@/lib/cn';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> {
  label?: string;
  options: ReadonlyArray<SelectOption>;
  size?: 'sm' | 'md';
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, size = 'md', className, containerClassName, id, ...rest }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className={cn('min-w-0', containerClassName)}>
        {label ? (
          <label htmlFor={selectId} className="mb-1.5 block text-[12px] font-medium text-fg-soft">
            {label}
          </label>
        ) : null}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full appearance-none rounded-xl bg-ink-850/80 pr-9 text-fg',
              'ring-1 ring-inset ring-overlay/[0.09] transition-all duration-150 ease-enterprise',
              'hover:ring-overlay/[0.14] focus:outline-none focus:ring-2 focus:ring-brand-500/70',
              'disabled:cursor-not-allowed disabled:opacity-55',
              size === 'sm' ? 'h-8.5 pl-3 text-[12.5px]' : 'h-10 pl-3.5 text-[13.5px]',
              className,
            )}
            {...rest}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value} className="bg-ink-850 text-fg">
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-dim"
            aria-hidden
          />
        </div>
      </div>
    );
  },
);

Select.displayName = 'Select';
