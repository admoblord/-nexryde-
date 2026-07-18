/**
 * Go-online startup watchdog — CONNECTING must resolve within GO_ONLINE_TIMEOUT_MS.
 * Does not own button UI; forces OFFLINE via abortConnecting on timeout.
 */
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';

export const GO_ONLINE_TIMEOUT_MS = 10_000;

export type GoOnlineWatchdogEffects = {
  /** True if still in connecting (or reconnecting-from-connect) and not confirmed. */
  isStillConnecting: () => boolean;
  abortConnecting: () => void;
  onTimeout: () => void;
};

let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

export function clearGoOnlineWatchdog(): void {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  generation += 1;
}

/**
 * Arm 10s escape hatch from GO_ONLINE_START.
 * Success path must call clearGoOnlineWatchdog() inside confirmOnline / abortConnecting.
 */
export function armGoOnlineWatchdog(effects: GoOnlineWatchdogEffects): number {
  clearGoOnlineWatchdog();
  const gen = generation;
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null;
    if (gen !== generation) return;
    if (!effects.isStillConnecting()) return;
    driverFlowLog('STARTUP_TIMEOUT', {
      scope: 'go_online',
      timeoutMs: GO_ONLINE_TIMEOUT_MS,
    });
    effects.abortConnecting();
    effects.onTimeout();
  }, GO_ONLINE_TIMEOUT_MS);
  return gen;
}
