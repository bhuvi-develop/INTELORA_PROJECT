import { useEffect, useRef, useState } from 'react';

/* ───────────────────────────────────────────────────────────────────────────
 * Display-rate smoothing.
 *
 * The engine produces authoritative samples every five seconds. The cockpit's
 * live panel is asked to refresh every second, so rather than inventing readings
 * the engine never measured, the displayed number eases toward the latest real
 * sample once per second. Nothing is fabricated: the target is always the last
 * measured value, and the readout converges on it well inside the tick window.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface SmoothingOptions {
  /** Display refresh interval in milliseconds. */
  intervalMs?: number;
  /** Fraction of the remaining gap closed on each step, 0–1. */
  factor?: number;
  /** Below this absolute gap the value snaps, avoiding an asymptotic tail. */
  epsilon?: number;
}

export const useSmoothedValues = <K extends string>(
  target: Record<K, number>,
  options: SmoothingOptions = {},
): Record<K, number> => {
  const { intervalMs = 1_000, factor = 0.45, epsilon = 0.005 } = options;

  const targetRef = useRef(target);
  targetRef.current = target;

  const [displayed, setDisplayed] = useState<Record<K, number>>(target);
  const initialised = useRef(false);

  // The first real payload seeds the display directly — no easing up from zero.
  useEffect(() => {
    if (initialised.current) return;
    if ((Object.keys(target) as K[]).length === 0) return;
    initialised.current = true;
    setDisplayed(target);
  }, [target]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayed((previous) => {
        const next = { ...previous } as Record<K, number>;
        let changed = false;

        for (const key of Object.keys(targetRef.current) as K[]) {
          const goal = targetRef.current[key];
          const current = previous[key];

          if (current === undefined || !Number.isFinite(current)) {
            next[key] = goal;
            changed = true;
            continue;
          }

          const gap = goal - current;
          if (Math.abs(gap) <= epsilon) {
            if (current !== goal) {
              next[key] = goal;
              changed = true;
            }
            continue;
          }

          next[key] = current + gap * factor;
          changed = true;
        }

        return changed ? next : previous;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, factor, epsilon]);

  return displayed;
};
