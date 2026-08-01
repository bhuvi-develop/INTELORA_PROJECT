import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
  className?: string;
}

export const Dropdown = ({ trigger, children, align = 'right', width = 'w-72', className }: DropdownProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((prev) => !prev) })}
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute z-50 mt-2 overflow-hidden rounded-xl border border-overlay/10 bg-ink-800/97 shadow-raised backdrop-blur-2xl',
              align === 'right' ? 'right-0' : 'left-0',
              width,
            )}
          >
            {children({ close: () => setOpen(false) })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export const DropdownItem = ({
  children,
  onClick,
  danger = false,
  icon: Icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: LucideIcon;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] transition-colors duration-150',
      danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-fg-soft hover:bg-overlay/[0.05] hover:text-fg',
    )}
  >
    {Icon ? <Icon size={14} /> : null}
    {children}
  </button>
);

export const DropdownSeparator = () => <div className="my-0.5 h-px bg-overlay/[0.07]" />;

export const DropdownLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-3.5 pb-1.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
    {children}
  </div>
);
