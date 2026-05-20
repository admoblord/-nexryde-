/** Time to show "Driver found" before auto-opening live tracking (ms). */
export const RIDER_DRIVER_FOUND_HANDOFF_MS = 3200;

export function riderHandoffCountdownSec(ms: number = RIDER_DRIVER_FOUND_HANDOFF_MS): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** 0–1 progress for handoff UI (countdown ticks down from totalSec). */
export function riderHandoffProgress(
  countdownSec: number | null | undefined,
  ms: number = RIDER_DRIVER_FOUND_HANDOFF_MS,
): number {
  const total = riderHandoffCountdownSec(ms);
  if (countdownSec == null || countdownSec < 0) return 0;
  return Math.min(1, Math.max(0, (total - countdownSec) / total));
}
