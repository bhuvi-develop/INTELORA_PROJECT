import { useCallback, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { getPlatformStore } from '@/services/platformStore';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/utils/format';

/* ───────────────────────────────────────────────────────────────────────────
 * Backend connection state.
 *
 * Shows only while the platform is being reached for the first time, or after
 * it has stopped answering — and says which of those it is. A stale dashboard
 * that admits it is stale is more useful than a blank one, so the last good
 * snapshot stays on screen underneath and this strip explains why it has
 * stopped moving.
 *
 * Fixed to the bottom so nothing on any page moves when the connection drops.
 *
 * It subscribes to the store directly rather than through the engine hooks, so
 * this file and `engine/store` do not import each other.
 * ─────────────────────────────────────────────────────────────────────────── */

const store = getPlatformStore();

export const ConnectionBanner = () => {
  const connection = useSyncExternalStore(
    store.subscribeConnection,
    store.getConnection,
    store.getConnection,
  );
  const retry = useCallback(() => store.refreshNow(), []);

  const { status, error, lastUpdatedAt, consecutiveFailures } = connection;
  const connecting = status === 'connecting' && lastUpdatedAt === 0;
  const offline = status === 'offline';
  const visible = connecting || offline || status === 'reconnecting';

  const tone = offline ? 'critical' : connecting ? 'brand' : 'warning';

  const TONE_SHELL: Record<string, string> = {
    critical: 'bg-rose-500/[0.12] ring-rose-400/30',
    warning: 'bg-amber-500/[0.12] ring-amber-400/25',
    brand: 'bg-brand-500/[0.12] ring-brand-400/25',
  };

  const TONE_ICON: Record<string, string> = {
    critical: 'bg-rose-500/15 text-rose-300',
    warning: 'bg-amber-500/15 text-amber-300',
    brand: 'bg-brand-500/15 text-brand-300',
  };

  const TONE_BUTTON: Record<string, string> = {
    critical: 'bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 focus-visible:ring-rose-400/50',
    warning: 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 focus-visible:ring-amber-400/50',
    brand: 'bg-brand-500/15 text-brand-200 hover:bg-brand-500/25 focus-visible:ring-brand-400/50',
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
        >
          <div
            className={cn(
              'pointer-events-auto flex max-w-2xl items-start gap-3 rounded-xl px-4 py-3 shadow-raised backdrop-blur',
              'ring-1 ring-inset',
              TONE_SHELL[tone],
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                TONE_ICON[tone],
              )}
              aria-hidden
            >
              {offline ? <CloudOff size={14} /> : <Loader2 size={14} className="animate-spin" />}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-fg">
                {offline
                  ? 'Backend unreachable'
                  : connecting
                    ? 'Connecting to the platform'
                    : 'Reconnecting to the platform'}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-fg-muted">
                {connecting
                  ? 'Loading the estate from the INTELORA backend.'
                  : (error ?? 'The platform stopped responding.')}
              </p>
              {lastUpdatedAt > 0 ? (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-faint">
                  <WifiOff size={11} aria-hidden />
                  Showing the last reading received {formatRelative(lastUpdatedAt)}
                  {consecutiveFailures > 1 ? ` · ${consecutiveFailures} failed attempts` : ''}
                </p>
              ) : null}
            </div>

            {connecting ? null : (
              <button
                type="button"
                onClick={retry}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium',
                  'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
                  TONE_BUTTON[tone],
                )}
              >
                <RefreshCw size={12} aria-hidden />
                Retry
              </button>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
