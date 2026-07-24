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

async function refreshShiftSessionAndNative(): Promise<void> {
  const result = await ensureCriticalSessionReady(CRITICAL_ACTION_MIN_TTL_SEC);
  // Always push JWT into Android FGS so native accept has a usable bearer
  // (not only when a refresh just occurred).
  if (result.ok && result.token) {
    const { refreshNativeDriverSession } = await import('@/src/services/driverNativeExperience');
    void refreshNativeDriverSession();
  }
}

export function startDriverShiftSessionKeeper(): void {
  if (keeperRunning) return;
  keeperRunning = true;
  void refreshShiftSessionAndNative();
  keeperInterval = setInterval(() => {
    void refreshShiftSessionAndNative();
  }, SHIFT_SESSION_KEEPER_INTERVAL_MS);
}

export function stopDriverShiftSessionKeeper(): void {
  keeperRunning = false;
  if (keeperInterval) {
    clearInterval(keeperInterval);
    keeperInterval = null;
  }
}
