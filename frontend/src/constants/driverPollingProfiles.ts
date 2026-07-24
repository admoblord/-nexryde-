/**
 * Driver polling cadence — active trip vs idle (online, no live trip).
 * Active-trip values match pre-patch production intervals exactly.
 */

import { isDriverIncomingOfferActive } from '@/src/utils/driverPollingMode';

/** Live trip / offer acceptance — tighter GPS than idle (Uber-class map feel). */
export const DRIVER_POLL_ACTIVE = {
  locationPushMovingMs: 6_000,
  locationPushIdleMs: 12_000,
  tripCoordinatorMs: 18_000,
  tripDetailSyncMs: 12_000,
  offersFallbackWsDownMs: 5_000,
  offersFallbackWsUpMs: 60_000,
} as const;

/** Online without an active trip — keep Redis GEO fresh for matching (~BG 10s). */
export const DRIVER_POLL_IDLE = {
  locationPushMs: 12_000,
  tripCoordinatorMs: 30_000,
  offersFallbackWsDownMs: 12_000,
  offersFallbackWsUpMs: 45_000,
} as const;

const LIVE_TRIP_STATUSES = new Set([
  'accepted',
  'arrived',
  'ongoing',
  'pending_payment',
]);

export function isDriverHighPriorityPolling(activeTripStatus?: string | null): boolean {
  if (isDriverIncomingOfferActive()) return true;
  const s = String(activeTripStatus || '').toLowerCase();
  return LIVE_TRIP_STATUSES.has(s);
}

export function driverLocationPushMinIntervalMs(
  highPriority: boolean,
  movedKm: number,
): number {
  if (!highPriority) return DRIVER_POLL_IDLE.locationPushMs;
  const isIdle = movedKm < 0.03;
  return isIdle
    ? DRIVER_POLL_ACTIVE.locationPushIdleMs
    : DRIVER_POLL_ACTIVE.locationPushMovingMs;
}

export function driverTripCoordinatorPollMs(highPriority: boolean): number {
  return highPriority
    ? DRIVER_POLL_ACTIVE.tripCoordinatorMs
    : DRIVER_POLL_IDLE.tripCoordinatorMs;
}

export function driverOffersFallbackPollIntervalMs(
  wsConnected: boolean,
  highPriority: boolean,
): number {
  if (highPriority) {
    return wsConnected
      ? DRIVER_POLL_ACTIVE.offersFallbackWsUpMs
      : DRIVER_POLL_ACTIVE.offersFallbackWsDownMs;
  }
  return wsConnected
    ? DRIVER_POLL_IDLE.offersFallbackWsUpMs
    : DRIVER_POLL_IDLE.offersFallbackWsDownMs;
}
