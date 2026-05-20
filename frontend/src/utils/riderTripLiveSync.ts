/** Small helpers for rider live-tracking state updates (avoid redundant re-renders). */

export type TrackingPingPayload = {
  driver_location?: {
    lat: number;
    lng: number;
    heading?: number;
    speed_kmh?: number;
    updated_at?: string;
    eta_seconds?: number;
    distance_km?: number;
    status?: string;
  } | null;
  eta_seconds?: number;
  distance_remaining_km?: number;
  speed_kmh?: number;
};

/** Normalize WS / status payload into one tracking snapshot. */
export function parseTrackingPing(msg: {
  driver_location?: unknown;
  eta_seconds?: number;
  distance_remaining_km?: number;
  distance_remaining?: number;
  speed_kmh?: number;
}): {
  location: DriverPing | null;
  etaSeconds: number | null;
  distanceKm: number | null;
  trackingStatus: string | null;
  speedKmh: number | null;
} {
  const raw =
    msg.driver_location && typeof msg.driver_location === 'object'
      ? (msg.driver_location as Record<string, unknown>)
      : null;

  const lat = raw?.lat ?? raw?.latitude;
  const lng = raw?.lng ?? raw?.longitude;
  let location: DriverPing | null = null;
  if (lat != null && lng != null) {
    const la = Number(lat);
    const ln = Number(lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      location = {
        lat: la,
        lng: ln,
        heading: raw?.heading != null ? Number(raw.heading) : undefined,
        speed_kmh:
          raw?.speed_kmh != null
            ? Number(raw.speed_kmh)
            : raw?.speed != null
              ? Number(raw.speed)
              : undefined,
        updated_at: typeof raw?.updated_at === 'string' ? raw.updated_at : undefined,
      };
    }
  }

  const etaSeconds =
    msg.eta_seconds != null
      ? Number(msg.eta_seconds)
      : raw?.eta_seconds != null
        ? Number(raw.eta_seconds)
        : null;

  const distanceKm =
    msg.distance_remaining_km != null
      ? Number(msg.distance_remaining_km)
      : msg.distance_remaining != null
        ? Number(msg.distance_remaining)
        : raw?.distance_km != null
          ? Number(raw.distance_km)
          : null;

  const trackingStatus =
    typeof raw?.status === 'string' ? String(raw.status) : null;

  const speedKmh =
    msg.speed_kmh != null
      ? Number(msg.speed_kmh)
      : location?.speed_kmh != null
        ? location.speed_kmh
        : raw?.speed_kmh != null
          ? Number(raw.speed_kmh)
          : null;

  return {
    location,
    etaSeconds: Number.isFinite(etaSeconds as number) ? (etaSeconds as number) : null,
    distanceKm: Number.isFinite(distanceKm as number) ? (distanceKm as number) : null,
    trackingStatus,
    speedKmh: Number.isFinite(speedKmh as number) ? (speedKmh as number) : null,
  };
}

export type DriverPing = {
  lat: number;
  lng: number;
  heading?: number;
  speed_kmh?: number;
  updated_at?: string;
};

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Skip map/state churn when driver barely moved (< 12 m). */
export function driverPingMovedEnough(
  prev: DriverPing | null | undefined,
  next: DriverPing,
  minMeters = 12,
): boolean {
  if (!prev) return true;
  return haversineMeters(prev, next) >= minMeters;
}

export function coordsChangedEnough(
  prev: { lat: number; lng: number } | null | undefined,
  next: { lat: number; lng: number },
  minMeters = 8,
): boolean {
  if (!prev) return true;
  return haversineMeters(prev, next) >= minMeters;
}
