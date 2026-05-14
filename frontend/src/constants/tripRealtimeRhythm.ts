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

/** Rider `/trips/:id/status` poll: slower while WS is healthy; faster when live + no WS. */
export function riderTripStatusPollIntervalMs(wsConnected: boolean, tripStatus: string): number {
  if (wsConnected) return 18000;
  return isRiderMapLiveTripStatus(tripStatus) ? 2500 : 5000;
}

/** Driver home: fetch incoming offers when no modal; slower while offer WS is connected. */
export function driverOffersFallbackPollIntervalMs(wsConnected: boolean): number {
  return wsConnected ? 90000 : 8000;
}
