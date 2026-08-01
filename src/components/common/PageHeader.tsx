import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Compact metric strip rendered under the title. */
  meta?: ReactNode;
  className?: string;
}

export const PageHeader = ({ title, subtitle, eyebrow, actions, meta, className }: PageHeaderProps) => (
  <motion.header
    initial={{ opacity: 0, y: -6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    className={cn('flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between', className)}
  >
    <div className="min-w-0">
      {eyebrow ? <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
      <h1 className="text-balance text-[1.375rem] font-semibold tracking-[-0.02em] text-fg sm:text-[1.625rem]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1.5 max-w-3xl text-balance text-[12.5px] leading-relaxed text-fg-muted sm:text-[13px]">
          {subtitle}
        </p>
      ) : null}
      {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{meta}</div> : null}
    </div>

    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
  </motion.header>
);

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export const SectionHeader = ({ title, subtitle, actions, className }: SectionHeaderProps) => (
  <div className={cn('flex items-end justify-between gap-4', className)}>
    <div className="min-w-0">
      <h2 className="text-[14px] font-semibold tracking-[-0.005em] text-fg">{title}</h2>
      {subtitle ? <p className="mt-1 text-[12px] leading-relaxed text-fg-dim">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);

export interface MetaStatProps {
  label: string;
  value: ReactNode;
  className?: string;
}

/** Inline label/value pair for the page-header metric strip. */
export const MetaStat = ({ label, value, className }: MetaStatProps) => (
  <div className={cn('min-w-0', className)}>
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">{label}</p>
    <p className="mt-1 text-[13px] font-semibold tabular-nums text-fg">{value}</p>
  </div>
);
