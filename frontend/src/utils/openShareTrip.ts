import type { Router } from 'expo-router';

/** Navigate to Share Trip with trip id when available (store fallback on screen). */
export function openShareTrip(
  router: Pick<Router, 'push'>,
  tripId: string | null | undefined,
) {
  if (!tripId) {
    router.push('/rider/share-trip' as any);
    return;
  }
  router.push({ pathname: '/rider/share-trip', params: { tripId } } as any);
}
