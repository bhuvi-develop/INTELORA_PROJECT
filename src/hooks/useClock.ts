import { useEffect, useState } from 'react';

/** Ticking wall clock for the topbar and live indicators. */
export const useClock = (intervalMs = 1_000): Date => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
};
