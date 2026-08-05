import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { WorkspaceDef } from './navigation';

/* ───────────────────────────────────────────────────────────────────────────
 * Module launcher card.
 *
 * A compact, dense control that is 170px high maximum. 
 * Includes smooth hover animations (lift, blue glow, soft shadow, border animation).
 * ─────────────────────────────────────────────────────────────────────────── */

export type CardStatus = 'critical' | 'warning' | 'normal' | 'idle';

const STATUS_STYLE: Record<CardStatus, { chip: string; metric: string; glow: string }> = {
  critical: {
    chip: 'bg-rose-500/12 text-rose-300 ring-rose-400/30',
    metric: 'text-rose-300',
    glow: 'rgba(208,59,59,0.25)',
  },
  warning: {
    chip: 'bg-amber-500/12 text-amber-300 ring-amber-400/25',
    metric: 'text-amber-300',
    glow: 'rgba(250,178,25,0.20)',
  },
  normal: {
    chip: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/25',
    metric: 'text-fg',
    glow: 'rgba(61,142,240,0.25)',
  },
  idle: {
    chip: 'bg-overlay/[0.06] text-fg-dim ring-overlay/10',
    metric: 'text-fg-soft',
    glow: 'rgba(61,142,240,0.10)',
  },
};

export interface HubCardProps {
  workspace: WorkspaceDef;
  metric: string;
  metricUnit?: string;
  supportingMetrics?: { label: string; value: string }[];
  status: string;
  statusKind: CardStatus;
  onOpen: () => void;
}

export const HubCard = ({ workspace, metric, metricUnit, supportingMetrics = [], status, statusKind, onOpen }: HubCardProps) => {
  const Icon = workspace.icon;
  const style = STATUS_STYLE[statusKind];

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      aria-label={`${workspace.label} — ${workspace.question}`}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden text-left bg-card',
        'rounded-xl border border-overlay/[0.06] p-4 shadow-sm h-[170px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
        'transition-all duration-300 hover:shadow-lg hover:border-brand-500/40',
      )}
    >
      {/* Radial blue glow (or status specific glow) behind icon */}
      <span
        className="pointer-events-none absolute -left-12 -top-12 h-36 w-36 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: style.glow }}
        aria-hidden
      />
      
      {/* Top sheen */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-overlay/20 to-transparent"
        aria-hidden
      />

      {/* ── Header: Icon, Title & Badge ─────────────────────────────────── */}
      <div className="relative flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-400/20 transition-colors duration-300 group-hover:bg-brand-500/20">
            <Icon size={16} strokeWidth={2} aria-hidden />
          </span>
          <p className="text-[13px] font-semibold tracking-tight text-fg">{workspace.label}</p>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset',
            style.chip,
          )}
        >
          {status}
        </span>
      </div>

      {/* ── Body: KPIs ─────────────────────────────────────────────────── */}
      <div className="relative mt-auto mb-auto grid grid-cols-[1fr_auto] gap-4 items-end pt-3 pb-2">
        <div>
          <p className="flex items-baseline gap-1">
            <span
              className={cn(
                'text-[28px] font-bold tabular-nums leading-none tracking-tight',
                style.metric,
              )}
            >
              {metric}
            </span>
            {metricUnit ? (
              <span className="text-[11px] font-medium text-fg-dim uppercase tracking-wider">{metricUnit}</span>
            ) : null}
          </p>
        </div>
        
        {supportingMetrics.length > 0 && (
          <div className="flex flex-col gap-1 text-right border-l border-overlay/[0.06] pl-3">
            {supportingMetrics.map((m, idx) => (
              <div key={idx} className="flex items-baseline justify-end gap-2 text-[10px]">
                <span className="text-fg-faint">{m.label}</span>
                <span className="text-fg-soft font-semibold">{m.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer: Action ─────────────────────────────────────────────── */}
      <div className="relative mt-auto pt-2 border-t border-line/40 flex items-center justify-between">
         <p className="min-w-0 flex-1 truncate text-[10.5px] text-fg-dim pr-2">{workspace.discipline}</p>
         <span className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 opacity-70 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1">
           Open Workspace <ArrowRight size={12} />
         </span>
      </div>
    </motion.button>
  );
};
