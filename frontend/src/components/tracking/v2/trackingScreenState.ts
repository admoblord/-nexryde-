/**
 * Tracking screen state machine — each phase uses a predefined stable layout.
 */
export type TrackingScreenPhase =
  | 'SEARCHING_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'TRIP_STARTED'
  | 'TRIP_COMPLETED'
  | 'PAYMENT'
  | 'EMPTY';

export function resolveTrackingScreenPhase(
  tripStatus: string,
  hasTripId: boolean,
  driverId?: string | null,
): TrackingScreenPhase {
  if (!hasTripId) return 'EMPTY';
  if (tripStatus === 'pending_payment') return 'PAYMENT';
  if (tripStatus === 'completed') return 'TRIP_COMPLETED';
  if (tripStatus === 'pending' || tripStatus === 'pending_driver_offers') return 'SEARCHING_DRIVER';

  const assigned = Boolean(driverId && String(driverId).trim());
  if (['accepted', 'arrived', 'ongoing'].includes(tripStatus) && !assigned) {
    return 'SEARCHING_DRIVER';
  }
  if (tripStatus === 'accepted') return 'DRIVER_ASSIGNED';
  if (tripStatus === 'arrived') return 'DRIVER_ARRIVED';
  if (tripStatus === 'ongoing') return 'TRIP_STARTED';
  return assigned ? 'DRIVER_ASSIGNED' : 'SEARCHING_DRIVER';
}

export function isTrackingLiveLayoutPhase(phase: TrackingScreenPhase): boolean {
  return (
    phase === 'DRIVER_ASSIGNED' ||
    phase === 'DRIVER_EN_ROUTE' ||
    phase === 'DRIVER_ARRIVED' ||
    phase === 'TRIP_STARTED'
  );
}
