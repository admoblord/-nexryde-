/**
 * Mid-trip pause meter.
 *
 * The driver taps Pause trip when the rider asks to stop somewhere on the way.
 * Waiting is billed from the tap — ₦80/min in Lagos, capped at 30 billable
 * minutes — and the amount lands on the fare at completion. Resume banks the
 * waited seconds and stops the meter.
 */
import { BACKEND_URL } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';

export type MidTripWait = {
  paused: boolean;
  paused_at: string | null;
  pause_count: number;
  current_pause_sec: number;
  total_wait_sec: number;
  billable_wait_sec: number;
  billable_wait_min: number;
  wait_per_min_ngn: number;
  estimated_wait_fee_ngn: number;
  cap_min: number;
  cap_reached: boolean;
};

async function post(tripId: string, action: 'pause' | 'resume'): Promise<MidTripWait | null> {
  try {
    const res = await authedFetch(`${BACKEND_URL}/api/trips/${tripId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      timeoutMs: 12_000,
      // A live trip must never be signed out from under the driver mid-wait.
      preserveSessionOn401: true,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { mid_trip_wait?: MidTripWait } | null;
    return data?.mid_trip_wait ?? null;
  } catch {
    return null;
  }
}

/** Start the waiting meter. Idempotent: a second tap returns the running meter. */
export function pauseTripForRider(tripId: string): Promise<MidTripWait | null> {
  return post(tripId, 'pause');
}

/** Stop the meter and bank the waited seconds onto the trip. */
export function resumeTripAfterWait(tripId: string): Promise<MidTripWait | null> {
  return post(tripId, 'resume');
}

/** "2:35 waiting · ₦240" for the dock, without a second source of truth for the rate. */
export function formatWaitMeter(wait: MidTripWait | null): string {
  if (!wait) return '';
  const sec = wait.paused ? wait.total_wait_sec : wait.billable_wait_sec;
  const mm = Math.floor(sec / 60);
  const ss = String(sec % 60).padStart(2, '0');
  const fee = Math.round(wait.estimated_wait_fee_ngn || 0);
  return `${mm}:${ss} waiting · ₦${fee.toLocaleString()}`;
}
