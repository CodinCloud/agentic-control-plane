import { useEffect, useState } from 'react';

const DEFAULT_TICK_INTERVAL_MS = 3000;

/**
 * Local clock, re-rendering consumers every `intervalMs` while mounted. The
 * only reason this exists: an ongoing bar's right edge must visibly advance
 * between data refetches, not just when new data lands (plan §"Temps réel",
 * decision #4) — see TimelineDomain.extendWindowToNow, which consumes this.
 */
export function useNowTick(intervalMs: number = DEFAULT_TICK_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
