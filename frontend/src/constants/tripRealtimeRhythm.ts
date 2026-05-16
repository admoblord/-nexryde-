/**
 * Shared intervals / status checks for rider tracking vs driver offer polling.
 * Keeps rider + driver screens aligned without copy-pasted magic numbers.
 */

/** Trip phases where rider map and safety treat the ride as "live" on the road. */
export const RIDER_MAP_LIVE_TRIP_STATUSES = ['accepted', 'arrived', 'ongoing'] as const;

export type RiderMapLiveTripStatus = (typeof RIDER_MAP_LIVE_TRIP_STATUSES)[number];

export function isRiderMapLiveTripStatus(tripStatus: string): boolean {
  return (RIDER_MAP_LIVE_TRIP_STATUSES as readonly string[]).includes(tripStatus);
}

/** Finding driver — same premium map-first shell as book overlay. */
export const RIDER_MAP_FINDING_STATUSES = ['pending', 'pending_driver_offers'] as const;

export function isRiderMapFindingStatus(tripStatus: string): boolean {
  return (RIDER_MAP_FINDING_STATUSES as readonly string[]).includes(tripStatus);
}

/** Native map-first tracking: finding → live trip → payment. */
export const RIDER_MAP_FIRST_TRIP_STATUSES = [
  ...RIDER_MAP_FINDING_STATUSES,
  ...RIDER_MAP_LIVE_TRIP_STATUSES,
  'pending_payment',
] as const;

export function isRiderMapFirstTripStatus(tripStatus: string): boolean {
  return (RIDER_MAP_FIRST_TRIP_STATUSES as readonly string[]).includes(tripStatus);
}

/** Rider `/trips/:id/status` poll: slower while WS is healthy; faster when live + no WS. */
export function riderTripStatusPollIntervalMs(wsConnected: boolean, tripStatus: string): number {
  if (wsConnected) return 18000;
  return isRiderMapLiveTripStatus(tripStatus) ? 2500 : 5000;
}

/** Driver home: fetch incoming offers when no modal; slower while offer WS is connected. */
export function driverOffersFallbackPollIntervalMs(wsConnected: boolean): number {
  return wsConnected ? 90000 : 8000;
}
