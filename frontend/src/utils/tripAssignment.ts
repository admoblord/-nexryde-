import { isRiderMapLiveTripStatus, isRiderMapFindingStatus } from '@/src/constants/tripRealtimeRhythm';

/** Backend-confirmed driver assignment — never infer from navigation alone. */
export function resolveAssignedDriverId(
  trip: { driver_id?: unknown } | null | undefined,
  driverInfo: { driver_id?: unknown } | null | undefined,
): string | null {
  const fromTrip = trip?.driver_id != null ? String(trip.driver_id).trim() : '';
  if (fromTrip) return fromTrip;
  const fromInfo = driverInfo?.driver_id != null ? String(driverInfo.driver_id).trim() : '';
  return fromInfo || null;
}

export function resolveAssignmentAcceptedAt(
  trip: { accepted_at?: unknown } | null | undefined,
): string | null {
  const raw = trip?.accepted_at;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

/** Read accepted_at from /status or nested trip payloads (handles pre-deploy API shape). */
export function resolveStatusPayloadAcceptedAt(
  data: { accepted_at?: unknown; trip?: { accepted_at?: unknown } | null } | null | undefined,
): string | null {
  const top = resolveAssignmentAcceptedAt(data);
  if (top) return top;
  const nested = data?.trip;
  if (nested && typeof nested === 'object') {
    return resolveAssignmentAcceptedAt(nested as { accepted_at?: unknown });
  }
  return null;
}

/**
 * True when backend has committed driver assignment.
 * `driver_id` on accepted/arrived/ongoing is enough — do not stall finding UI
 * waiting for `accepted_at` if the status payload omits it.
 */
export function isTripAssignmentConfirmed(
  tripStatus: string,
  driverId: string | null | undefined,
  _acceptedAt?: string | null | undefined,
): boolean {
  if (!isRiderMapLiveTripStatus(tripStatus)) return false;
  if (!driverId || !String(driverId).trim()) return false;
  // accepted_at is diagnostic only; assignment is confirmed by status + driver_id.
  return true;
}

export function isTripDriverAssigned(
  tripStatus: string,
  driverId: string | null | undefined,
  acceptedAt?: string | null,
): boolean {
  return isTripAssignmentConfirmed(tripStatus, driverId, acceptedAt ?? null);
}

/** Finding UI until backend assigns a driver. */
export function isTripFindingPhase(
  tripStatus: string,
  driverId: string | null | undefined,
  acceptedAt?: string | null,
): boolean {
  if (isRiderMapFindingStatus(tripStatus)) return true;
  if (isRiderMapLiveTripStatus(tripStatus) && !isTripAssignmentConfirmed(tripStatus, driverId, acceptedAt ?? null)) {
    return true;
  }
  return false;
}

export function mapAcceptErrorMessage(detail: unknown, status?: number): string {
  if (status === 401) {
    return 'Session expired — sign in again to accept rides';
  }
  const msg = String(detail || '').trim();
  if (/already accepted by another driver/i.test(msg)) {
    return 'Trip already accepted by another driver';
  }
  if (/offer expired|unavailable for this driver/i.test(msg)) {
    return 'This offer expired — check for a newer request';
  }
  if (/already have an active trip/i.test(msg)) {
    return 'You already have an active trip. Complete it before accepting another.';
  }
  if (/cancelled/i.test(msg)) {
    return 'This trip was cancelled';
  }
  if (/not available/i.test(msg)) {
    return 'Trip no longer available';
  }
  if (status === 408 || /timeout|network/i.test(msg)) {
    return 'Connection slow — checking assignment…';
  }
  return msg || 'Could not accept trip';
}
