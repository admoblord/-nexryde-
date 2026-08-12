/**
 * Shared map treatment for every trip screen.
 *
 * The map is the background of every trip screen, so the same rules apply on
 * all of them: pale Bolt style, traffic layer off, one high-contrast route line
 * over a white casing, and a camera fitted to the points that matter right now
 * rather than the whole city.
 */
import { colors, map } from '@/src/theme/tokens';

export type LatLng = { latitude: number; longitude: number };
export type Coord = { lat: number; lng: number };

/** Props every trip `MapView` should spread, so treatment cannot drift per screen. */
export const tripMapViewProps = {
  showsTraffic: map.showsTraffic,
  showsPointsOfInterest: false,
  showsBuildings: false,
  showsIndoors: false,
  showsCompass: false,
  toolbarEnabled: false,
  pitchEnabled: false,
  rotateEnabled: false,
} as const;

/** White casing under the green line keeps the route readable on pale landscape. */
export const routeCasingProps = {
  strokeColor: map.routeCasingColor,
  strokeWidth: map.routeCasingWidth,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
  zIndex: 2,
};

export const routeLineProps = {
  strokeColor: map.routeColor,
  strokeWidth: map.routeWidth,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
  zIndex: 3,
};

export type VehicleStatus = 'available' | 'onTrip' | 'offline';

export function vehicleAccent(status: VehicleStatus): string {
  return map.markerStatus[status] ?? colors.grey;
}

export function vehicleOpacity(status: VehicleStatus): number {
  return status === 'offline' ? map.offlineMarkerOpacity : 1;
}

function isFiniteCoord(c?: Partial<Coord> | null): c is Coord {
  return Boolean(c) && Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng));
}

export function toLatLng(c?: Partial<Coord> | null): LatLng | null {
  return isFiniteCoord(c) ? { latitude: Number(c.lat), longitude: Number(c.lng) } : null;
}

/**
 * Region that contains every point with breathing room.
 *
 * Trip screens fit to the pair that matters for the current phase — driver and
 * pickup while arriving, pickup and destination in trip — never to a bounding
 * box of everything, which is how a live trip ends up showing half of Lagos.
 */
export function regionForPoints(
  points: Array<Coord | LatLng | null | undefined>,
  opts?: { minDeltaDeg?: number; paddingFactor?: number },
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  const pts: LatLng[] = [];
  for (const p of points) {
    if (!p) continue;
    const lat = Number((p as LatLng).latitude ?? (p as Coord).lat);
    const lng = Number((p as LatLng).longitude ?? (p as Coord).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ latitude: lat, longitude: lng });
  }
  if (!pts.length) return null;

  const lats = pts.map((p) => p.latitude);
  const lngs = pts.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Street-level floor so a single point does not zoom to the whole country.
  const minDelta = opts?.minDeltaDeg ?? 0.008;
  const pad = opts?.paddingFactor ?? 1.6;

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(minDelta, (maxLat - minLat) * pad),
    longitudeDelta: Math.max(minDelta, (maxLng - minLng) * pad),
  };
}

/** True when the subject has left the visible region — the only time we recentre. */
export function isOutsideRegion(
  point: LatLng | null,
  region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null,
): boolean {
  if (!point || !region) return false;
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return (
    Math.abs(point.latitude - region.latitude) > halfLat ||
    Math.abs(point.longitude - region.longitude) > halfLng
  );
}

export const MAP_FIT_PADDING = map.fitPadding;
