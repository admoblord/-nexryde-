import { apiFetch } from '@/src/utils/sessionRefresh';

/** After accept timeout/error — confirm whether backend actually assigned the trip. */
export async function verifyDriverTripAssignment(
  driverId: string,
  tripId: string,
): Promise<{ assigned: boolean; trip: Record<string, unknown> | null }> {
  try {
    const res = await apiFetch(`/trips/active/${encodeURIComponent(driverId)}`, {
      timeoutMs: 12_000,
    } as RequestInit & { timeoutMs?: number });
    const data = await res.json();
    if (!res.ok || !data?.active) return { assigned: false, trip: null };
    const trip = (data.trip || {}) as Record<string, unknown>;
    const id = String(trip.id || '');
    const st = String(trip.status || '').toLowerCase();
    if (id === String(tripId) && ['accepted', 'arrived', 'ongoing'].includes(st)) {
      return { assigned: true, trip };
    }
    return { assigned: false, trip: null };
  } catch {
    return { assigned: false, trip: null };
  }
}
