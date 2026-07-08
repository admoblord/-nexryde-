import { logBookingRoute } from '@/src/utils/bookingRouteLogger';

export type TripDraftLocation = {
  address: string;
  lat: number;
  lng: number;
};

/** Canonical booking route — pickup → stops[] → destination. */
export type TripDraft = {
  pickup: TripDraftLocation | null;
  stops: TripDraftLocation[];
  destination: TripDraftLocation | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  estimatedFare: number | null;
  polyline: Array<{ latitude: number; longitude: number }>;
};

export const EMPTY_TRIP_DRAFT: TripDraft = {
  pickup: null,
  stops: [],
  destination: null,
  distanceKm: null,
  durationMinutes: null,
  estimatedFare: null,
  polyline: [],
};

/** Stable signature for pickup + ordered stops + destination (for stale checks). */
export function tripDraftRouteSignature(draft: {
  pickup: TripDraftLocation | null;
  stops: TripDraftLocation[];
  destination: TripDraftLocation | null;
}): string {
  const p = draft.pickup
    ? `${draft.pickup.lat.toFixed(5)},${draft.pickup.lng.toFixed(5)}`
    : '';
  const stops = draft.stops
    .map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`)
    .join('|');
  const d = draft.destination
    ? `${draft.destination.lat.toFixed(5)},${draft.destination.lng.toFixed(5)}`
    : '';
  return `${p}::${stops}::${d}`;
}

export type RouteRecalcController = {
  /** Monotonic id — only matching responses may commit UI. */
  requestId: number;
  abortSignal: AbortSignal;
};

let globalRouteRequestId = 0;
let routeAbortController: AbortController | null = null;

/** Cancel in-flight route work and return a fresh controller. */
export function beginRouteRecalc(reason: string): RouteRecalcController {
  if (routeAbortController) {
    logBookingRoute('ROUTE_RECALC_CANCEL_PREVIOUS', { reason, previousId: globalRouteRequestId });
    routeAbortController.abort();
  }
  globalRouteRequestId += 1;
  routeAbortController = new AbortController();
  const requestId = globalRouteRequestId;
  logBookingRoute('ROUTE_RECALC_START', { requestId, reason });
  return { requestId, abortSignal: routeAbortController.signal };
}

export function isRouteRecalcStale(requestId: number): boolean {
  return requestId !== globalRouteRequestId;
}

export function getCurrentRouteRequestId(): number {
  return globalRouteRequestId;
}

export function ignoreStaleRouteResponse(requestId: number, phase: string): boolean {
  if (!isRouteRecalcStale(requestId)) return false;
  logBookingRoute('ROUTE_RECALC_IGNORED_STALE_RESPONSE', { requestId, currentId: globalRouteRequestId, phase });
  return true;
}

export function commitRouteMetrics(
  requestId: number,
  distanceMeters: number,
  durationSeconds: number,
  durationInTrafficSeconds?: number,
): { distanceKm: number; durationMinutes: number } | null {
  if (ignoreStaleRouteResponse(requestId, 'commitRouteMetrics')) return null;
  const sec = Math.max(
    durationSeconds || 0,
    typeof durationInTrafficSeconds === 'number' && durationInTrafficSeconds > 0
      ? durationInTrafficSeconds
      : durationSeconds || 0,
  );
  const distanceKm = distanceMeters / 1000;
  const durationMinutes = sec >= 60 ? Math.max(1, Math.ceil(sec / 60)) : sec > 0 ? 1 : 0;
  logBookingRoute('FULL_DISTANCE', { requestId, distanceKm: Number(distanceKm.toFixed(3)), distanceMeters });
  logBookingRoute('FULL_DURATION', { requestId, durationMinutes, durationSeconds: sec });
  logBookingRoute('ROUTE_RECALC_SUCCESS', { requestId, distanceKm, durationMinutes });
  return { distanceKm, durationMinutes };
}

export function commitFare(
  requestId: number,
  fare: number,
  meta?: { vehicleId?: string; distanceKm?: number; durationMinutes?: number },
): number | null {
  if (ignoreStaleRouteResponse(requestId, 'commitFare')) return null;
  logBookingRoute('FULL_FARE', { requestId, fare, ...meta });
  return fare;
}
