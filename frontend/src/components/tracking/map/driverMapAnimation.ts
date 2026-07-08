import { haversineKm } from '@/src/components/tracking/map/mapUtils';

/** ~4–5 m — below this we treat the driver as stopped (no heading spin). */
export const DRIVER_STATIONARY_THRESHOLD = 0.00004;

export function driverMovedEnough(
  prev: { lat: number; lng: number } | null,
  lat: number,
  lng: number,
  threshold = DRIVER_STATIONARY_THRESHOLD,
): boolean {
  if (!prev) return true;
  return Math.abs(prev.lat - lat) > threshold || Math.abs(prev.lng - lng) > threshold;
}

/** Zoom level that keeps driver + target in frame for typical urban trips. */
export function zoomForDriverTargetSpanKm(spanKm: number): number {
  if (spanKm < 0.35) return 15.5;
  if (spanKm < 0.75) return 14.8;
  if (spanKm < 1.5) return 14;
  if (spanKm < 3) return 13;
  if (spanKm < 6) return 12;
  if (spanKm < 12) return 11;
  return 10;
}

export function cameraCenterForDriverAndTarget(
  driver: { lat: number; lng: number },
  target: { lat: number; lng: number },
): { latitude: number; longitude: number; zoom: number } {
  const spanKm = Math.max(haversineKm(driver.lat, driver.lng, target.lat, target.lng), 0.15);
  return {
    latitude: (driver.lat + target.lat) / 2,
    longitude: (driver.lng + target.lng) / 2,
    zoom: zoomForDriverTargetSpanKm(spanKm),
  };
}

/** Split a route into traveled vs remaining at the driver's closest point. */
export function splitRouteAtDriver<T extends { latitude: number; longitude: number }>(
  route: T[],
  driver: { lat: number; lng: number } | null,
): { traveled: T[]; remaining: T[] } {
  if (!driver || route.length < 2) {
    return { traveled: [], remaining: route };
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i += 1) {
    const dLat = route[i].latitude - driver.lat;
    const dLng = route[i].longitude - driver.lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const driverPt = { latitude: driver.lat, longitude: driver.lng } as T;
  return {
    traveled: best >= 1 ? [...route.slice(0, best + 1), driverPt] : [],
    remaining: [driverPt, ...route.slice(best)],
  };
}
