import { decodePolyline, DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';

export type MapRouteCoord = { latitude: number; longitude: number };

/** Decode trip fare / booking route preview into map polyline coords. */
export function routePolylineFromTripRecord(
  trip: {
    route_preview_coordinates?: unknown;
    polyline?: unknown;
  } | null | undefined,
): MapRouteCoord[] {
  if (!trip) return [];

  const preview = parseRoutePreviewToMapCoords(trip.route_preview_coordinates);
  if (preview.length >= DIRECTIONS_ROUTE_MIN_POINTS) return preview;

  const encoded = trip.polyline;
  if (typeof encoded === 'string' && encoded.trim()) {
    try {
      const dec = decodePolyline(encoded);
      const pts = dec
        .map((c) => ({ latitude: c.lat, longitude: c.lng }))
        .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
      if (pts.length >= DIRECTIONS_ROUTE_MIN_POINTS) return pts;
    } catch {
      /* ignore */
    }
  }

  return [];
}

export function parseRoutePreviewToMapCoords(raw: unknown): MapRouteCoord[] {
  if (!Array.isArray(raw) || raw.length < DIRECTIONS_ROUTE_MIN_POINTS) return [];
  const out: MapRouteCoord[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ latitude: lat, longitude: lng });
  }
  return out.length >= DIRECTIONS_ROUTE_MIN_POINTS ? out : [];
}
