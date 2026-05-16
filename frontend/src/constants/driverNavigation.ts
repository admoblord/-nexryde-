/** Canonical live trip surface — map + phase docks on driver home tab. */
export const DRIVER_ACTIVE_TRIP_HREF = '/(driver-tabs)/driver-home' as const;

/**
 * @deprecated Use {@link DRIVER_ACTIVE_TRIP_HREF}. Kept so old links resolve via redirect screen.
 */
export const DRIVER_TRIPS_STACK_HREF = '/driver/trips' as const;

/** Tab entry for trip history list (not live map). */
export const DRIVER_TRIPS_TAB_HREF = '/(driver-tabs)/driver-trips' as const;
