import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  wrapperClassName?: string;
}

const POSITION = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
} as const;

export const Tooltip = ({ content, children, side = 'top', className, wrapperClassName }: TooltipProps) => {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn("relative inline-flex", wrapperClassName)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'pointer-events-none absolute z-50 w-max max-w-[15rem] rounded-lg border border-overlay/10',
              'bg-ink-750/95 px-2.5 py-1.5 text-[11.5px] leading-snug text-fg-soft shadow-raised backdrop-blur-xl',
              POSITION[side],
              className,
            )}
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
};
