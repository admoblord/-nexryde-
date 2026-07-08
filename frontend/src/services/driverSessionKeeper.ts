/**
 * Keeps JWT fresh for the full driver shift (Uber/Bolt pattern).
 * Started when driver goes online; stopped when offline.
 */
import {
  CRITICAL_ACTION_MIN_TTL_SEC,
  ensureCriticalSessionReady,
  SHIFT_SESSION_KEEPER_INTERVAL_MS,
} from '@/src/lib/sessionReadiness';

let keeperInterval: ReturnType<typeof setInterval> | null = null;
let keeperRunning = false;

export function isDriverShiftSessionKeeperActive(): boolean {
  return keeperRunning;
}

export function startDriverShiftSessionKeeper(): void {
  if (keeperRunning) return;
  keeperRunning = true;
  void ensureCriticalSessionReady(CRITICAL_ACTION_MIN_TTL_SEC);
  keeperInterval = setInterval(() => {
    void ensureCriticalSessionReady(CRITICAL_ACTION_MIN_TTL_SEC);
  }, SHIFT_SESSION_KEEPER_INTERVAL_MS);
}

export function stopDriverShiftSessionKeeper(): void {
  keeperRunning = false;
  if (keeperInterval) {
    clearInterval(keeperInterval);
    keeperInterval = null;
  }
}
