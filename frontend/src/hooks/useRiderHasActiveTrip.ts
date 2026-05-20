import { useMemo } from 'react';
import { useAppStore } from '@/src/store/appStore';
import { isActiveTripStatus, normalizeTripStatus, type NormalizedTripStatus } from '@/src/utils/tripStatus';

/** True when rider has a live trip that should block booking UI. */
export function useRiderHasActiveTrip(): boolean {
  const currentTrip = useAppStore((s) => s.currentTrip);
  return useMemo(() => {
    if (!currentTrip?.id) return false;
    return isActiveTripStatus(currentTrip.status, currentTrip.payment_status);
  }, [currentTrip?.id, currentTrip?.status, currentTrip?.payment_status]);
}

export function useRiderActiveTripPhase(): NormalizedTripStatus | null {
  const currentTrip = useAppStore((s) => s.currentTrip);
  return useMemo(() => {
    if (!currentTrip?.id) return null;
    if (!isActiveTripStatus(currentTrip.status, currentTrip.payment_status)) return null;
    return normalizeTripStatus(currentTrip.status, currentTrip.payment_status);
  }, [currentTrip?.id, currentTrip?.status, currentTrip?.payment_status]);
}
