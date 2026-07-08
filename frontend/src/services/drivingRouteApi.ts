import { BACKEND_URL } from '@/src/services/api';
import { decodePolylineToMapCoords } from '@/src/utils/polylineDecoder';

export type DrivingRouteStep = {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  polyline: string;
  maneuver: string;
};

export type DrivingRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds?: number;
  polylineEncoded: string;
  /** Decoded overview for MapView.Polyline (curved road). */
  overviewMapCoords: { latitude: number; longitude: number }[];
  steps: DrivingRouteStep[];
  source: string;
  status: string;
};

/**
 * Server-side Google Directions (uses `GOOGLE_MAPS_API_KEY` on Cloud Run).
 * Use this when the app’s Maps key is Android/iOS-restricted and cannot call Directions REST from JS.
 */
export async function fetchDrivingRoute(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  stop?: { lat: number; lng: number } | null,
  options?: {
    /** Ordered intermediate waypoints (preferred over single `stop`). */
    stops?: Array<{ lat: number; lng: number }>;
    signal?: AbortSignal;
  },
): Promise<DrivingRouteResult | null> {
  const base = String(BACKEND_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (!base || !Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) return null;

  const q = new URLSearchParams({
    pickup_lat: String(pickupLat),
    pickup_lng: String(pickupLng),
    dropoff_lat: String(dropoffLat),
    dropoff_lng: String(dropoffLng),
  });
  const waypoints =
    options?.stops?.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)) ??
    (stop && Number.isFinite(stop.lat) && Number.isFinite(stop.lng) ? [stop] : []);
  if (waypoints.length === 1) {
    q.set('stop_lat', String(waypoints[0]!.lat));
    q.set('stop_lng', String(waypoints[0]!.lng));
  } else if (waypoints.length > 1) {
    // Backend currently accepts one stop; pass first for API compat (multi-stop via repeated calls later).
    q.set('stop_lat', String(waypoints[0]!.lat));
    q.set('stop_lng', String(waypoints[0]!.lng));
  }

  try {
    const res = await fetch(`${base}/api/places/driving-route?${q.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: options?.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    const dm = Number(data.distance_meters);
    const ds = Number(data.duration_seconds);
    if (!Number.isFinite(dm) || dm < 80 || !Number.isFinite(ds) || ds < 10) return null;

    const dit = Number(data.duration_in_traffic_seconds);
    const enc = typeof data.polyline === 'string' ? data.polyline : '';
    const overviewMapCoords = enc.length >= 8 ? decodePolylineToMapCoords(enc) : [];

    const rawSteps = Array.isArray(data.steps) ? data.steps : [];
    const steps: DrivingRouteStep[] = [];
    for (const s of rawSteps) {
      if (!s || typeof s !== 'object') continue;
      const o = s as Record<string, unknown>;
      const sl = o.start_location as Record<string, unknown> | undefined;
      const el = o.end_location as Record<string, unknown> | undefined;
      if (!sl || !el) continue;
      steps.push({
        instruction: String(o.instruction ?? ''),
        distance_meters: Number(o.distance_meters ?? 0),
        duration_seconds: Number(o.duration_seconds ?? 0),
        start_location: { lat: Number(sl.lat), lng: Number(sl.lng) },
        end_location: { lat: Number(el.lat), lng: Number(el.lng) },
        polyline: String(o.polyline ?? ''),
        maneuver: String(o.maneuver ?? ''),
      });
    }

    return {
      distanceMeters: dm,
      durationSeconds: ds,
      ...(Number.isFinite(dit) && dit > 0 ? { durationInTrafficSeconds: dit } : {}),
      polylineEncoded: enc,
      overviewMapCoords,
      steps,
      source: String(data.source ?? 'google_directions_api'),
      status: String(data.status ?? 'OK'),
    };
  } catch {
    return null;
  }
}
