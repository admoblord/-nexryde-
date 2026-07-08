/** Dev-only route/fare recalc tracing for booking stop flows. */
export function logBookingRoute(
  tag:
    | 'ROUTE_RECALC_START'
    | 'ROUTE_RECALC_CANCEL_PREVIOUS'
    | 'ROUTE_RECALC_SUCCESS'
    | 'ROUTE_RECALC_IGNORED_STALE_RESPONSE'
    | 'FULL_DISTANCE'
    | 'FULL_DURATION'
    | 'FULL_FARE',
  payload?: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  if (payload && Object.keys(payload).length > 0) {
    console.log(`[${tag}]`, payload);
  } else {
    console.log(`[${tag}]`);
  }
}
