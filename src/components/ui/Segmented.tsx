import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm';
  className?: string;
  layoutId?: string;
  ariaLabel?: string;
}

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
  layoutId = 'segmented',
  ariaLabel,
}: SegmentedProps<T>) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className={cn(
      'inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-ink-850/80 p-0.5 ring-1 ring-inset ring-overlay/[0.08]',
      className,
    )}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative rounded-[0.625rem] font-medium transition-colors duration-150',
            size === 'xs' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]',
            active ? 'text-fg' : 'text-fg-dim hover:text-fg-soft',
          )}
        >
          {active ? (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-[0.625rem] bg-overlay/[0.09] ring-1 ring-inset ring-overlay/[0.09]"
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null}
          <span className="relative">{option.label}</span>
        </button>
      );
    })}
  </div>
);
