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

/** Rider `/trips/:id/status` poll: faster while finding a driver; slower once live + WS healthy. */
export function riderTripStatusPollIntervalMs(wsConnected: boolean, tripStatus: string): number {
  if (isRiderMapFindingStatus(tripStatus)) return wsConnected ? 5_000 : 2_500;
  if (isRiderMapLiveTripStatus(tripStatus)) return wsConnected ? 10_000 : 3_000;
  if (wsConnected) return 16_000;
  return 4_000;
}

/** Backup ETA REST poll — primary path is WebSocket `eta_seconds`. */
export function riderTripEtaFallbackPollMs(wsConnected: boolean): number {
  return wsConnected ? 14_000 : 4_000;
}

// Driver offer fallback intervals: see `driverPollingProfiles.ts` (`driverOffersFallbackPollIntervalMs`).

// ── Rider live-tracking display throttle constants ────────────────────────────
// Consumed by LiveTrackingScreen and useRiderTrackingSession.

/** Throttle interval for updating displayed ETA / distance on the tracking UI (ms). */
export const RIDER_TRACKING_DISPLAY_THROTTLE_MS = 1500;

/** Throttle interval for committing rider location to backend during a trip (ms). */
export const RIDER_TRACKING_LOCATION_THROTTLE_MS = 3000;

/** Duration after which a GPS fix is considered stale and triggers a warning (ms). */
export const RIDER_TRACKING_GPS_STALE_MS = 15000;

/** Client-side ETA countdown tick interval (ms). */
export const RIDER_TRACKING_CLIENT_ETA_MS = 1000;
