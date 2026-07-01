/**
 * Rider tracking route — delegates entirely to the optimised LiveTrackingScreen stack.
 *
 * LiveTrackingScreen provides:
 *   - AnimatedRegion driver marker (no animateCamera hammering)
 *   - TripMapErrorBoundary with retry
 *   - LiveTrackingSkeleton on first load
 *   - useRiderTrackingSession (WS + HTTP poll fallback, stale-GPS banner)
 *   - FindingDriverScreenV2 for the searching phase
 *   - TrackingPaymentView for the post-trip payment phase
 *   - useThrottledValue for ETA/distance display (no churn)
 *   - InteractionManager deferred map mount
 *
 * The legacy 3.9 k-line implementation has been retired in favour of this stack.
 */
export { default } from '@/src/components/tracking/live/LiveTrackingScreen';
