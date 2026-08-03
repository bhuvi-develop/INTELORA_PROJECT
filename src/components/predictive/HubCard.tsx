import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { WorkspaceDef } from './navigation';

/* ───────────────────────────────────────────────────────────────────────────
 * Module launcher card.
 *
 * A control, not a tile. It carries the one figure that would make an operator
 * open the workspace behind it, so the choice of where to go is made from data
 * rather than from a menu of names.
 *
 * Depth is built from three layers that resolve together on hover: the surface
 * lifts, its border takes the accent, and a soft radial glow appears behind the
 * icon. Resting state stays quiet — eight cards all glowing at once would carry
 * no information at all.
 * ─────────────────────────────────────────────────────────────────────────── */

export type CardStatus = 'critical' | 'warning' | 'normal' | 'idle';

const STATUS_STYLE: Record<CardStatus, { chip: string; metric: string; glow: string }> = {
  critical: {
    chip: 'bg-rose-500/12 text-rose-300 ring-rose-400/30',
    metric: 'text-rose-300',
    glow: 'rgba(208,59,59,0.16)',
  },
  warning: {
    chip: 'bg-amber-500/12 text-amber-300 ring-amber-400/25',
    metric: 'text-amber-300',
    glow: 'rgba(250,178,25,0.14)',
  },
  normal: {
    chip: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/25',
    metric: 'text-fg',
    glow: 'rgba(61,142,240,0.16)',
  },
  idle: {
    chip: 'bg-overlay/[0.06] text-fg-dim ring-overlay/10',
    metric: 'text-fg-soft',
    glow: 'rgba(61,142,240,0.10)',
  },
};

export interface HubCardProps {
  workspace: WorkspaceDef;
  /** The headline figure — large, and the reason to open this workspace. */
  metric: string;
  /** Unit or qualifier printed beside the figure. */
  metricUnit?: string;
  /** Short state word: CRITICAL, 3 OVERDUE, NORMAL. */
  status: string;
  statusKind: CardStatus;
  onOpen: () => void;
}

export const HubCard = ({ workspace, metric, metricUnit, status, statusKind, onOpen }: HubCardProps) => {
  const Icon = workspace.icon;
  const style = STATUS_STYLE[statusKind];

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      aria-label={`${workspace.label} — ${workspace.question}`}
      className={cn(
        'panel panel-interactive',
        'group flex h-full w-full min-h-0 flex-col overflow-hidden p-4 text-left xl:p-5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
      )}
    >
      {/* Radial glow, resting at zero so the grid stays quiet until pointed at. */}
      <span
        className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: style.glow }}
        aria-hidden
      />
      {/* Top-edge sheen. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-overlay/25 to-transparent"
        aria-hidden
      />

      {/* ── Top: identity and state ─────────────────────────────────── */}
      <div className="relative flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300 ring-1 ring-inset ring-brand-400/20 transition-colors duration-300 group-hover:bg-brand-500/20">
          <Icon size={17} strokeWidth={1.75} aria-hidden />
        </span>

        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ring-1 ring-inset',
            style.chip,
          )}
        >
          {status}
        </span>
      </div>

      {/* ── Centre: name and the live figure ────────────────────────── */}
      <div className="relative mt-auto pt-5">
        <p className="text-[12.5px] font-semibold tracking-[-0.005em] text-fg-soft">{workspace.label}</p>
        <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.12em] text-fg-faint">{workspace.discipline}</p>

        <p className="mt-3 flex items-baseline gap-1.5">
          <span
            className={cn(
              'text-[26px] font-semibold tabular-nums leading-none tracking-[-0.02em] xl:text-[30px]',
              style.metric,
            )}
          >
            {metric}
          </span>
          {metricUnit ? (
            <span className="text-[12px] font-medium text-fg-dim">{metricUnit}</span>
          ) : null}
        </p>
      </div>

      {/* ── Bottom: context and the call to action ──────────────────── */}
      <div className="relative mt-3.5 flex items-end justify-between gap-3 border-t border-line/60 pt-3">
        <p className="min-w-0 flex-1 truncate text-[11px] leading-snug text-fg-dim">{workspace.summary}</p>
        <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-fg-faint opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-brand-300 group-hover:opacity-100 -translate-x-1">
          Launch
          <ArrowRight size={11} aria-hidden />
        </span>
      </div>
    </motion.button>
  );
};
