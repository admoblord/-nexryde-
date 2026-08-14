import { getActiveTrip } from '@/src/services/api';
import { useAppStore, type Trip } from '@/src/store/appStore';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';
import { reportNetworkOpsSignal } from '@/src/services/platformConnectionManager';
import { apiFetch } from '@/src/utils/sessionRefresh';

export type ActiveTripPullResult = {
  found: boolean;
  trip: Trip | null;
};

/** Fetch server active trip and merge into global store when still live. */
export async function pullAndApplyActiveTrip(userId: string): Promise<ActiveTripPullResult> {
  try {
    const res = await getActiveTrip(userId);
    const payload = res?.data;

    if (payload?.active && payload?.trip) {
      const trip = payload.trip as Trip;
      const normalizedStatus = normalizeTripStatus(trip.status, trip.payment_status);
      if (isActiveTripStatus(normalizedStatus, trip.payment_status, trip.payment_method ?? null)) {
        const normalizedTrip = { ...trip, status: normalizedStatus } as Trip;
        useAppStore.getState().setCurrentTrip(normalizedTrip);
        reportNetworkOpsSignal('trip_sync', true);
        reportNetworkOpsSignal('active_trip', true);
        return { found: true, trip: normalizedTrip };
      }
      if (String(trip.status || '').toLowerCase() === 'completed') {
        useAppStore.getState().setCurrentTrip(null);
        reportNetworkOpsSignal('active_trip', false);
      }
    }

    reportNetworkOpsSignal('trip_sync', true);
    return { found: false, trip: null };
  } catch {
    reportNetworkOpsSignal('trip_sync', false);
    return { found: false, trip: null };
  }
}

/** True when persisted trip should be dropped after API reports no active trip. */
export function shouldClearTripAfterInactiveApi(): boolean {
  const existing = useAppStore.getState().currentTrip;
  if (!existing) return true;
  return !isActiveTripStatus(
    existing.status,
    existing.payment_status,
    existing.payment_method ?? null,
  );
}

/**
 * Resolve a persisted trip the active-trip API no longer returns.
 *
 * The guard above deliberately keeps a live-looking trip so a blipping API cannot
 * wipe a real ride. The cost was a ghost: once the server expired a search or the
 * trip ended while the app was closed, the rider was stuck holding a trip that no
 * longer exists and "you already have an active trip" blocked every new booking.
 *
 * So ask the server about that exact trip. Terminal answer clears it; anything
 * else (including a failed request) keeps it.
 */
export async function reconcileStaleActiveTrip(): Promise<'cleared' | 'kept' | 'unknown'> {
  const existing = useAppStore.getState().currentTrip;
  if (!existing) return 'cleared';
  if (shouldClearTripAfterInactiveApi()) {
    useAppStore.getState().setCurrentTrip(null);
    return 'cleared';
  }
  const tripId = String(existing.id || '').trim();
  if (!tripId) {
    useAppStore.getState().setCurrentTrip(null);
    return 'cleared';
  }
  try {
    const res = await apiFetch(`/trips/${encodeURIComponent(tripId)}/status`, { timeoutMs: 8000 });
    if (res.status === 404) {
      useAppStore.getState().setCurrentTrip(null);
      return 'cleared';
    }
    if (!res.ok) return 'unknown';
    const data = await res.json();
    if (!data?.success) return 'unknown';
    const stillActive = isActiveTripStatus(
      String(data.status || ''),
      String(data.payment_status || ''),
      (data.payment_method as string | null) ?? null,
    );
    if (stillActive) return 'kept';
    useAppStore.getState().setCurrentTrip(null);
    return 'cleared';
  } catch {
    return 'unknown';
  }
}
