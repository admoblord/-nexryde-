/**
 * Central routing when the user taps a push notification (`content.data`).
 *
 * Keep in sync with backend `notification_catalog.py` (`data.type` strings).
 */

export type PushTapTarget = { pathname: string; params?: Record<string, string> };

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/** Types that should use sound + strong foreground treatment (ride/safety). */
export const URGENT_PUSH_TYPES = new Set<string>([
  'ride_request',
  'trip_accepted',
  'driver_arrived',
  'geo_fence_trip_lock_armed',
  'geo_fence_deviation',
  'geo_fence_deviation_driver',
  'speed_spike_alert',
  'speed_spike_driver',
  'gps_spoofing_alert',
  'gps_spoofing_driver',
  'abnormal_stop',
  'trial_ended',
]);

const DRIVER_HOME = '/(driver-tabs)/driver-home';
const RIDER_HOME = '/(rider-tabs)/rider-home';
const DRIVER_EARNINGS = '/(driver-tabs)/driver-earnings';

/** Resolve Expo Router target from push data. Returns null when no specific screen. */
export function resolvePushNotificationRoute(
  raw: Record<string, unknown> | undefined | null,
  opts: { role?: string }
): PushTapTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = str(raw.type) ?? '';
  const tripId = str(raw.trip_id);
  const role = opts.role ?? '';
  const action = str(raw.action);
  const milestone = str(raw.milestone);

  // Deeplink actions (campaigns, daily slots, favourites)
  if (action === 'open_booking') {
    if (role === 'rider') return { pathname: '/rider/book' };
    return { pathname: DRIVER_HOME };
  }
  if (action === 'open_favorites') {
    if (role === 'rider') return { pathname: '/rider/favorite-drivers' };
    return { pathname: DRIVER_HOME };
  }
  if (action === 'open_driver_home') {
    return { pathname: DRIVER_HOME };
  }

  if (type === 'favorite_driver_nudge') {
    if (role === 'rider') return { pathname: '/rider/favorite-drivers' };
    return { pathname: DRIVER_HOME };
  }

  if (type === 'admin_broadcast') {
    if (role === 'driver') return { pathname: DRIVER_HOME };
    return { pathname: RIDER_HOME };
  }

  const riderTripExtras = new Set([
    'geo_fence_explained',
    'driver_stop_reason',
    'safe_arrival_checkin',
    'route_updated',
    'rider_route_updated',
  ]);

  // Trip-scoped
  if (tripId) {
    if (type === 'trip_completed' && role === 'rider') {
      return { pathname: '/rider/trip-receipt', params: { tripId } };
    }
    if (type === 'trip_completed' && role === 'driver') {
      if (milestone === 'first_driver_trip' || milestone === 'three_driver_trips') {
        return { pathname: DRIVER_EARNINGS, params: { tripId } };
      }
      return { pathname: '/driver/trips', params: { tripId } };
    }
    if (type === 'trip_accepted' && role === 'rider') {
      return { pathname: '/rider/tracking', params: { tripId } };
    }
    if (type === 'ride_request' && role === 'driver') {
      return { pathname: DRIVER_HOME };
    }
    if (
      type.endsWith('_driver') ||
      type === 'ride_request' ||
      type === 'gps_spoofing_driver' ||
      type === 'speed_spike_driver' ||
      type === 'geo_fence_deviation_driver'
    ) {
      if (role === 'driver') {
        return { pathname: DRIVER_HOME, params: { tripId } };
      }
    }
    if (
      role === 'rider' &&
      (type.startsWith('trip_') ||
        riderTripExtras.has(type) ||
        type.includes('geo_fence') ||
        type.includes('speed_spike') ||
        type.includes('gps_spoofing') ||
        type === 'abnormal_stop')
    ) {
      return { pathname: '/rider/tracking', params: { tripId } };
    }
    if (role === 'rider') {
      return { pathname: '/rider/tracking', params: { tripId } };
    }
    if (role === 'driver') {
      return { pathname: DRIVER_HOME, params: { tripId } };
    }
  }

  // Non-trip
  if (type === 'ride_request' && role === 'driver') {
    return { pathname: DRIVER_HOME };
  }
  if (type === 'trial_ended' && role === 'driver') {
    return { pathname: '/driver/subscription' };
  }
  if (type === 'go_online' && role === 'driver') {
    return { pathname: DRIVER_HOME, params: { action: 'go_online' } };
  }
  if (type === 'feature_update') {
    const route =
      typeof raw.route === 'string' && raw.route.startsWith('/') ? raw.route : RIDER_HOME;
    if (role === 'driver' && (route.includes('rider-tabs') || route.startsWith('/rider'))) {
      return { pathname: DRIVER_HOME };
    }
    return { pathname: route };
  }
  if (type.startsWith('daily_slot_')) {
    if (role === 'driver') return { pathname: DRIVER_HOME };
    return { pathname: RIDER_HOME };
  }
  if (type === 'subscription_expiring' && role === 'driver') {
    return { pathname: '/driver/subscription' };
  }
  if (type === 'earnings_update' && role === 'driver') {
    return { pathname: '/driver/withdrawal' };
  }
  if ((type === 'destination_limit_reached' || type === 'destination_trip_counted') && role === 'driver') {
    return { pathname: DRIVER_HOME };
  }

  return null;
}
