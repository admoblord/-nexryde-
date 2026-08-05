import { getActiveTrip } from '@/src/services/api';
import { useAppStore, type Trip } from '@/src/store/appStore';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';
import { reportNetworkOpsSignal } from '@/src/services/platformConnectionManager';

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
