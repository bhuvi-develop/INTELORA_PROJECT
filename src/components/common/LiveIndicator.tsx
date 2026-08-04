import { Activity, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatClock } from '@/utils/format';
import { useEngineControl } from '@/engine/store';

export interface LiveIndicatorProps {
  /** Show the engine clock beside the state. */
  showClock?: boolean;
  /** Show the tick counter — useful on the settings and telemetry views. */
  showTick?: boolean;
  className?: string;
}

/**
 * Streaming state indicator and pause control.
 *
 * Reads the engine directly rather than a mirrored flag, so the badge cannot
 * claim the stream is live while the tick is stopped.
 */
export const LiveIndicator = ({ showClock = true, showTick = false, className }: LiveIndicatorProps) => {
  const { running, toggle, at, tick } = useEngineControl();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={running}
      title={running ? 'Pause the telemetry stream' : 'Resume the telemetry stream'}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 ring-1 ring-inset transition-all duration-300',
        running 
          ? 'bg-emerald-500/10 ring-emerald-500/30 shadow-[0_0_15px_rgba(52,211,153,0.2)] hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(52,211,153,0.35)]' 
          : 'bg-overlay/[0.04] ring-overlay/[0.08] hover:bg-overlay/[0.07]',
        className,
      )}
    >
      {running ? (
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
          <span className="absolute h-full w-full animate-pulse-ring rounded-full bg-emerald-400/70" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
      ) : (
        <PauseCircle size={12} className="shrink-0 text-fg-dim" aria-hidden />
      )}

      <span className={cn('text-[11.5px] font-bold tracking-wide uppercase', running ? 'text-emerald-400' : 'text-fg-dim')}>
        {running ? 'Live' : 'Paused'}
      </span>

      {showClock ? (
        <>
          <span className="h-3 w-px bg-overlay/10" aria-hidden />
          <Activity size={11} className="shrink-0 text-fg-faint" aria-hidden />
          <span className="text-[11px] tabular-nums text-fg-muted">{formatClock(at)}</span>
        </>
      ) : null}

      {showTick ? (
        <>
          <span className="h-3 w-px bg-overlay/10" aria-hidden />
          <span className="text-[10.5px] tabular-nums text-fg-faint">tick {tick}</span>
        </>
      ) : null}
    </button>
  );
};
