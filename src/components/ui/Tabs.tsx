import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export interface TabsProps<T extends string = string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Unique id so multiple tab strips can animate independently. */
  layoutId?: string;
}

export const Tabs = <T extends string>({ items, value, onChange, className, layoutId = 'tabs' }: TabsProps<T>) => (
  <div role="tablist" className={cn('no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-overlay/[0.07]', className)}>
    {items.map((item) => {
      const active = item.value === value;
      const Icon = item.icon;
      return (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(item.value)}
          className={cn(
            'relative flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-medium transition-colors duration-150',
            active ? 'text-fg' : 'text-fg-dim hover:text-fg-soft',
          )}
        >
          {Icon ? <Icon size={14} aria-hidden /> : null}
          {item.label}
          {item.count !== undefined ? (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10.5px] tabular-nums',
                active ? 'bg-brand-500/18 text-brand-200' : 'bg-overlay/[0.05] text-fg-dim',
              )}
            >
              {item.count}
            </span>
          ) : null}
          {active ? (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-500"
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null}
        </button>
      );
    })}
  </div>
);
