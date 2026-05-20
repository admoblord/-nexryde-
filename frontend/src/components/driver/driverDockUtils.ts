/** Shared copy + formatting for driver trip docks. */

export function driverFirstName(full: string): string {
  const t = full.trim();
  if (!t) return 'Rider';
  return t.split(/\s+/)[0] || t;
}

export function formatCountdownMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

/** Compact wait label for chips — caps hours for very long waits. */
export function formatPickupWaitLabel(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? `${m}m ${r}s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Peek bar on at-pickup sheet — prefers mm:ss for short waits. */
export function formatPickupWaitPeek(totalSec: number): string {
  const s = Math.max(0, Math.min(Math.floor(totalSec), 99 * 60));
  if (s < 10) return 'Just arrived';
  if (s < 600) return formatCountdownMmSs(s);
  return formatPickupWaitLabel(s);
}

export const DRIVER_CANCEL_TRIP_ALERT = {
  title: 'Cancel this trip?',
  message:
    'The rider will be notified. Only cancel if you cannot complete this pickup. This may affect your acceptance rate.',
  keep: 'Keep trip',
  confirm: 'Cancel trip',
} as const;
