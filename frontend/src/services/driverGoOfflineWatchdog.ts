/**
 * Go-offline watchdog — local OFFLINE must stick even if server sync stalls.
 * Mirror of go-online watchdog; safety: a driver must always be able to stop receiving trips.
 */
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';

export const GO_OFFLINE_TIMEOUT_MS = 10_000;

export type GoOfflineWatchdogEffects = {
  /** True while we still expect background offline sync to finish (busy / in-flight). */
  isOfflineSyncInFlight: () => boolean;
  /** Clear busy flags; must NOT restore online. */
  releaseBusy: () => void;
  onTimeout: () => void;
};

let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

export function clearGoOfflineWatchdog(): void {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  generation += 1;
}

/**
 * Arm 10s escape hatch after optimistic go-offline.
 * On timeout: stay OFFLINE locally, release UI lock, reconcile in background.
 */
export function armGoOfflineWatchdog(effects: GoOfflineWatchdogEffects): number {
  clearGoOfflineWatchdog();
  const gen = generation;
  watchdogTimer = setTimeout(() => {
    watchdogTimer = null;
    if (gen !== generation) return;
    if (!effects.isOfflineSyncInFlight()) return;
    driverFlowLog('STARTUP_TIMEOUT', {
      scope: 'go_offline',
      timeoutMs: GO_OFFLINE_TIMEOUT_MS,
    });
    effects.releaseBusy();
    effects.onTimeout();
  }, GO_OFFLINE_TIMEOUT_MS);
  return gen;
}
