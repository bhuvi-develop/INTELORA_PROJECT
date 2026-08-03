import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  /** Retained for the call sites; the workspace header renders it. */
  title: string;
  /** Retained for the call sites; the workspace header renders it. */
  subtitle?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Compact metric strip. */
  meta?: ReactNode;
  className?: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Page header.
 *
 * The module's title and description now live in the workspace header, where
 * they are the same on every screen of the module and cannot drift from the
 * navigation label. This component keeps its `title` and `subtitle` props so no
 * page had to change, and deliberately does not render them — a module stating
 * its own name directly beneath a header that already states it was the single
 * largest source of duplication in the interface.
 *
 * What it still owns is the page's own furniture: status chips, the metric
 * strip and the actions. When a page passes none of those it renders nothing at
 * all, which is how most pages now open straight into their content.
 * ─────────────────────────────────────────────────────────────────────────── */

export const PageHeader = ({ eyebrow, actions, meta, className }: PageHeaderProps) => {
  if (!eyebrow && !actions && !meta) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between', className)}
    >
      <div className="min-w-0 space-y-3">
        {eyebrow ? <div className="flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
        {meta ? <div className="flex flex-wrap items-center gap-x-7 gap-y-2">{meta}</div> : null}
      </div>

      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.div>
  );
};

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export const SectionHeader = ({ title, subtitle, actions, className }: SectionHeaderProps) => (
  <div className={cn('flex items-end justify-between gap-4', className)}>
    <div className="min-w-0">
      <h2 className="text-[15px] font-semibold tracking-[-0.008em] text-fg">{title}</h2>
      {subtitle ? <p className="mt-1 text-[12.5px] leading-relaxed text-fg-dim">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);

export interface MetaStatProps {
  label: string;
  value: ReactNode;
  className?: string;
}

/** Inline label/value pair for the page metric strip. */
export const MetaStat = ({ label, value, className }: MetaStatProps) => (
  <div className={cn('min-w-0', className)}>
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">{label}</p>
    <p className="mt-1 text-[13.5px] font-semibold tabular-nums text-fg">{value}</p>
  </div>
);
