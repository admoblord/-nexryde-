/**
 * When to fire the fare fan-out after the route changes.
 *
 * A flat debounce made every destination feel slow: picking a place from
 * autocomplete produces final coordinates, so there is nothing to wait for. The
 * delay only exists to absorb coordinate churn — dragging the map pin, GPS
 * settling, a stop being edited — where firing on every frame would spam the
 * pricing fan-out.
 */

/** Immediate in practice — one tick so React can flush the coordinate state. */
export const FARE_ESTIMATE_INSTANT_MS = 0;
/** Coordinates are still moving (pin drag / GPS drift). */
export const FARE_ESTIMATE_SETTLE_MS = 350;
/** Below this, a coordinate change is drift rather than a new destination. */
export const FARE_ROUTE_CHURN_DEGREES = 0.0004; // ~45 m

export type RoutePoint = { lat?: number | null; lng?: number | null } | null | undefined;

function finite(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** True when the two points are far enough apart to be a different place. */
export function isDistinctRoutePoint(a: RoutePoint, b: RoutePoint): boolean {
  const aLat = finite(a?.lat);
  const aLng = finite(a?.lng);
  const bLat = finite(b?.lat);
  const bLng = finite(b?.lng);
  if (aLat == null || aLng == null || bLat == null || bLng == null) return true;
  return (
    Math.abs(aLat - bLat) > FARE_ROUTE_CHURN_DEGREES ||
    Math.abs(aLng - bLng) > FARE_ROUTE_CHURN_DEGREES
  );
}

/**
 * Delay before requesting prices.
 *
 * `0` when the rider has just committed to a different pickup or destination —
 * they are looking at the screen waiting for a price. The settle delay applies
 * only when the same route is nudged by small coordinate movement.
 */
export function fareEstimateDelayMs(args: {
  previousPickup: RoutePoint;
  previousDestination: RoutePoint;
  nextPickup: RoutePoint;
  nextDestination: RoutePoint;
  /** First price for this screen — never make the rider wait for it. */
  isFirstEstimate?: boolean;
}): number {
  if (args.isFirstEstimate) return FARE_ESTIMATE_INSTANT_MS;
  const destinationChanged = isDistinctRoutePoint(args.previousDestination, args.nextDestination);
  const pickupChanged = isDistinctRoutePoint(args.previousPickup, args.nextPickup);
  if (destinationChanged || pickupChanged) return FARE_ESTIMATE_INSTANT_MS;
  return FARE_ESTIMATE_SETTLE_MS;
}
