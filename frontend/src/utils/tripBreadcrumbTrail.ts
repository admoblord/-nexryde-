/**
 * In-memory breadcrumb trail per trip (traveled path).
 */
export type MapCoord = { latitude: number; longitude: number };

const trails = new Map<string, MapCoord[]>();
const MIN_STEP_M = 12;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function appendTripBreadcrumb(tripId: string, lat: number, lng: number): MapCoord[] {
  if (!tripId || !Number.isFinite(lat) || !Number.isFinite(lng)) return trails.get(tripId) ?? [];
  const prev = trails.get(tripId) ?? [];
  const last = prev[prev.length - 1];
  if (last) {
    const d = haversineM(last.latitude, last.longitude, lat, lng);
    if (d < MIN_STEP_M) return prev;
  }
  const next = [...prev, { latitude: lat, longitude: lng }];
  if (next.length > 800) next.splice(0, next.length - 800);
  trails.set(tripId, next);
  return next;
}

export function getTripBreadcrumb(tripId: string): MapCoord[] {
  return tripId ? [...(trails.get(tripId) ?? [])] : [];
}

export function clearTripBreadcrumb(tripId: string): void {
  if (tripId) trails.delete(tripId);
}
