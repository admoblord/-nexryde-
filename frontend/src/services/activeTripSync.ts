import { confirmTripPayment, getActiveTrip } from '@/src/services/api';
import { useAppStore, type Trip } from '@/src/store/appStore';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';
import { isCashPaymentMethod } from '@/src/utils/tripPaymentMethod';

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
      let trip = payload.trip as Trip;
      const pm = (trip as { payment_method?: string }).payment_method;
      if (
        String(trip.status || '').toLowerCase() === 'completed' &&
        String(trip.payment_status || '').toLowerCase() === 'pending' &&
        isCashPaymentMethod(pm)
      ) {
        try {
          await confirmTripPayment(trip.id);
          trip = { ...trip, payment_status: 'completed' };
        } catch {
          /* server heal on next poll */
        }
      }
      const normalizedStatus = normalizeTripStatus(trip.status, trip.payment_status);
      if (isActiveTripStatus(normalizedStatus, trip.payment_status)) {
        const normalizedTrip = { ...trip, status: normalizedStatus } as Trip;
        useAppStore.getState().setCurrentTrip(normalizedTrip);
        return { found: true, trip: normalizedTrip };
      }
      if (String(trip.status || '').toLowerCase() === 'completed') {
        useAppStore.getState().setCurrentTrip(null);
      }
    }

    return { found: false, trip: null };
  } catch {
    return { found: false, trip: null };
  }
}

/** True when persisted trip should be dropped after API reports no active trip. */
export function shouldClearTripAfterInactiveApi(): boolean {
  const existing = useAppStore.getState().currentTrip;
  if (!existing) return true;
  return !isActiveTripStatus(existing.status, existing.payment_status);
}
