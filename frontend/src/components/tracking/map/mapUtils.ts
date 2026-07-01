import type { TrackingRoutePoint } from '@/src/components/tracking/types';

/** Reject null island / NaN — native MapView crashes on invalid marker coords. */
export function isValidMapCoord(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) return false;
  return true;
}

export function sanitizeMapCoords<T extends { latitude: number; longitude: number }>(
  coords: T[],
): T[] {
  return coords.filter(
    (c) => isValidMapCoord(c.latitude, c.longitude),
  );
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function buildFallbackPolyline(
  pickup: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
  driver?: { lat: number; lng: number } | null,
): TrackingRoutePoint[] {
  const pts: TrackingRoutePoint[] = [
    { latitude: pickup.lat, longitude: pickup.lng },
  ];
  if (driver) {
    pts.push({ latitude: driver.lat, longitude: driver.lng });
  }
  const midLat = (pickup.lat + dropoff.lat) / 2 + 0.008;
  const midLng = (pickup.lng + dropoff.lng) / 2 - 0.012;
  pts.push({ latitude: midLat, longitude: midLng });
  pts.push({ latitude: dropoff.lat, longitude: dropoff.lng });
  return pts;
}

/** Place "5 km" labels along the polyline at 5 km intervals. */
export function distanceMarkersAlongRoute(
  coords: TrackingRoutePoint[],
  stepKm = 5,
): Array<{ km: number; latitude: number; longitude: number }> {
  if (coords.length < 2) return [];
  const out: Array<{ km: number; latitude: number; longitude: number }> = [];
  let acc = 0;
  let nextMark = stepKm;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
    const startAcc = acc;
    acc += seg;
    while (nextMark <= acc) {
      const t = seg > 0 ? (nextMark - startAcc) / seg : 0;
      const clamped = Math.min(1, Math.max(0, t));
      out.push({
        km: nextMark,
        latitude: a.latitude + (b.latitude - a.latitude) * clamped,
        longitude: a.longitude + (b.longitude - a.longitude) * clamped,
      });
      nextMark += stepKm;
    }
  }
  return out;
}

export type TrafficSeverity = 'clear' | 'moderate' | 'heavy';

export function splitRouteTraffic(
  coords: TrackingRoutePoint[],
  level: TrafficSeverity = 'moderate',
): Array<{ coords: TrackingRoutePoint[]; severity: TrafficSeverity }> {
  if (coords.length < 4) {
    return [{ coords, severity: 'clear' }];
  }
  const third = Math.floor(coords.length / 3);
  return [
    { coords: coords.slice(0, third), severity: 'clear' },
    { coords: coords.slice(third, third * 2), severity: 'moderate' },
    { coords: coords.slice(third * 2), severity: 'heavy' },
  ];
}
