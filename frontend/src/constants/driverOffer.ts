/**
 * Seconds a driver gets to answer a ride offer.
 *
 * Must match the native countdown (RideAlertManager.OFFER_COUNTDOWN_SECONDS) and
 * stay under the backend offer TTL (RT_OFFER_TTL_SEC, default 45s) so the driver
 * can never accept an offer the server has already expired. 20s was too tight —
 * drivers in traffic could not read the pickup and decide in time.
 */
export const DRIVER_OFFER_COUNTDOWN_SECONDS = 30;

/** Backend RT_OFFER_TTL_SEC default. The countdown must stay below it. */
export const BACKEND_OFFER_TTL_SECONDS = 45;
