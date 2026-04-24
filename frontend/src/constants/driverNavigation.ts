/** Full trips experience (stack under `app/driver/trips.tsx`). */
export const DRIVER_TRIPS_STACK_HREF = '/driver/trips' as const;

/**
 * Tab entry for trips — redirects to {@link DRIVER_TRIPS_STACK_HREF}. Prefer this
 * href from the tab shell so the Trips tab stays selected in the tab bar.
 */
export const DRIVER_TRIPS_TAB_HREF = '/(driver-tabs)/driver-trips' as const;
