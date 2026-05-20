import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

export type TripTrackingLocation = {
  lat: number;
  lng: number;
  heading?: number;
  speed_kmh?: number;
  updated_at?: string;
  eta_seconds?: number;
  distance_km?: number;
  status?: string;
};

export type PostTripLocationResult = {
  success?: boolean;
  eta_seconds?: number;
  distance_remaining?: number;
  status?: string;
  driver_location?: {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
  };
};

export async function postTripLocation(
  tripId: string,
  payload: {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    timestamp?: string;
  },
): Promise<PostTripLocationResult | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/trips/${tripId}/location`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as PostTripLocationResult;
    if (!res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export async function fetchTripEta(tripId: string): Promise<{
  eta_seconds: number;
  distance_km: number;
  average_speed: number;
  status: string;
} | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/trips/${tripId}/eta`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) return null;
    return {
      eta_seconds: Number(data.eta_seconds ?? 0),
      distance_km: Number(data.distance_km ?? 0),
      average_speed: Number(data.average_speed ?? 0),
      status: String(data.status || 'en_route'),
    };
  } catch {
    return null;
  }
}

export async function fetchTripRoute(tripId: string): Promise<{
  waypoints: Array<{ lat: number; lng: number }>;
  polyline?: string | null;
  segment_to_target?: Array<{ lat: number; lng: number }>;
} | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/trips/${tripId}/route`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) return null;
    const waypoints = Array.isArray(data.waypoints)
      ? data.waypoints
          .map((p: { lat?: number; lng?: number }) => ({
            lat: Number(p.lat),
            lng: Number(p.lng),
          }))
          .filter((p: { lat: number; lng: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      : [];
    return {
      waypoints,
      polyline: data.polyline ?? null,
      segment_to_target: data.segment_to_target,
    };
  } catch {
    return null;
  }
}
