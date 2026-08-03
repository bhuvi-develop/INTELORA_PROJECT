import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { WorkspaceDef } from './navigation';

/* ───────────────────────────────────────────────────────────────────────────
 * Workspace frame.
 *
 * Every sub-workspace opens inside this. It supplies the one route out — the
 * breadcrumb back to the hub — and states the question the workspace exists to
 * answer, so the screen budget below it has something to be measured against.
 *
 * There is no tab bar. Moving between workspaces goes through the hub, which
 * means one context is on screen at a time and no horizontal overflow strip
 * competes with the content for the top of the page.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface WorkspaceFrameProps {
  workspace: WorkspaceDef;
  onBack: () => void;
  /** Controls placed opposite the title — selectors, exports, view switches. */
  actions?: ReactNode;
  children: ReactNode;
}

export const WorkspaceFrame = ({ workspace, onBack, actions, children }: WorkspaceFrameProps) => {
  const Icon = workspace.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-w-0 flex-col gap-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className={cn(
              'group -ml-1.5 mb-3 flex items-center gap-1.5 rounded-lg px-1.5 py-1',
              'text-[11.5px] font-medium text-fg-dim transition-colors duration-150',
              'hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
            )}
          >
            <ArrowLeft
              size={13}
              className="transition-transform duration-200 group-hover:-translate-x-0.5"
              aria-hidden
            />
            Back to Predictive Hub
          </button>

          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-400/20">
              <Icon size={16} strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold tracking-[-0.012em] text-fg">{workspace.label}</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-fg-dim">{workspace.question}</p>
            </div>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 pt-7">{actions}</div> : null}
      </div>

      {children}
    </motion.div>
  );
};

/* ─── Executive metric bar ───────────────────────────────────────────────── */

export interface Metric {
  label: string;
  value: string;
  caption?: string;
  color?: string;
}

/**
 * The summary strip every workspace opens with.
 *
 * Read before any chart: a workspace that answers its question in five figures
 * has earned the right to draw something.
 */
export const MetricBar = ({ metrics, className }: { metrics: Metric[]; className?: string }) => (
  <dl
    className={cn(
      'inset-well grid grid-cols-2 gap-px overflow-hidden bg-line/[0.08] sm:grid-cols-3 xl:grid-cols-5',
      className,
    )}
  >
    {metrics.map((metric) => (
      <div key={metric.label} className="bg-ink-900/70 bg-surface-1 px-4 py-3.5">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-faint">{metric.label}</dt>
        <dd
          className="mt-2 text-[19px] font-semibold tabular-nums leading-none tracking-[-0.015em]"
          style={{ color: metric.color ?? undefined }}
        >
          <span className={metric.color ? undefined : 'text-fg'}>{metric.value}</span>
        </dd>
        {metric.caption ? <p className="mt-2 text-[11px] leading-snug text-fg-dim">{metric.caption}</p> : null}
      </div>
    ))}
  </dl>
);

/* ─── Bounded table shell ────────────────────────────────────────────────── */

/**
 * A table that scrolls inside itself and never inside the page.
 *
 * The height cap is the point: a workspace is allowed one table, and that table
 * is not permitted to extend the document. Everything below the cap is reached
 * by scrolling the table, not the screen.
 */
export const BoundedTable = ({
  title,
  subtitle,
  actions,
  children,
  maxHeight = '26rem',
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}) => (
  <section className={cn('panel overflow-hidden p-0', className)}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3.5">
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[11.5px] leading-snug text-fg-dim">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
    <div className="scroll-thin overflow-auto" style={{ maxHeight }}>
      {children}
    </div>
  </section>
);
