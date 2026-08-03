import { useEffect, useRef } from 'react';
import type { AnomalyRecord } from '@/engine/types';
import { useToast } from '@/hooks';

/* ───────────────────────────────────────────────────────────────────────────
 * Live predictive-signal notifications.
 *
 * The workspace already re-renders whenever the platform store publishes a new
 * snapshot, so every figure, chart, table and queue updates on its own. What
 * that does not do is tell an operator who is looking at another workspace that
 * something arrived.
 *
 * This raises a toast for each newly-attributed signal. It deliberately does
 * not notify on the first population: arriving at a screen is not an event, and
 * a burst of toasts on page load teaches people to dismiss them without
 * reading.
 * ─────────────────────────────────────────────────────────────────────────── */

/** At most this many toasts per update, so a reconnect cannot flood the screen. */
const MAX_PER_CYCLE = 3;

export const usePredictiveAlerts = (signals: readonly AnomalyRecord[]): void => {
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    // First pass — record what already existed and stay silent.
    if (seen.current === null) {
      if (signals.length === 0) return;
      seen.current = new Set(signals.map((signal) => signal.id));
      return;
    }

    const known = seen.current;
    const arrivals = signals.filter((signal) => !known.has(signal.id));
    if (arrivals.length === 0) return;

    for (const signal of arrivals) known.add(signal.id);

    for (const signal of arrivals.slice(0, MAX_PER_CYCLE)) {
      const title = `${signal.component ?? 'Component'} signal on ${signal.assetId}`;
      const detail = `${signal.code} · ${signal.title} — prediction for this device will be re-scored on the next pass.`;

      if (signal.severity === 'Critical' || signal.severity === 'Major') {
        toast.warning(title, detail);
      } else {
        toast.info(title, detail);
      }
    }

    const overflow = arrivals.length - MAX_PER_CYCLE;
    if (overflow > 0) {
      toast.info(
        `${overflow} further signal${overflow === 1 ? '' : 's'} received`,
        'Open the overview to see every signal currently affecting prediction.',
      );
    }
  }, [signals, toast]);
};
