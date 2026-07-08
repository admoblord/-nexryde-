import type { Trip } from '@/src/store/appStore';
import type { NormalizedTripStatus } from '@/src/utils/tripStatus';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';

/** Normalized { lat, lng } for trip pickup/dropoff/driver pings. */
export type TripLatLng = { lat: number; lng: number };

/**
 * Parse API / store location objects. Rejects null island, NaN, and out-of-range values.
 */
export function parseTripCoords(value: unknown): TripLatLng | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const latRaw = record.lat ?? record.latitude;
  const lngRaw = record.lng ?? record.longitude;
  const lat =
    typeof latRaw === 'number'
      ? latRaw
      : typeof latRaw === 'string'
        ? Number(latRaw.trim())
        : NaN;
  const lng =
    typeof lngRaw === 'number'
      ? lngRaw
      : typeof lngRaw === 'string'
        ? Number(lngRaw.trim())
        : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null;
  return { lat, lng };
}

/** Safe string for driver vehicle / plate / color in Text nodes. */
export function formatDriverDisplayField(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const parts = [o.make, o.model, o.name, o.label, o.vehicle_model]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return '';
}

/** Build store/API trip location with coordinate fallbacks. */
export function tripLocationRecord(
  apiLoc: unknown,
  fallback: unknown,
  address: string,
): { lat: number; lng: number; address: string } {
  const coords = parseTripCoords(apiLoc) ?? parseTripCoords(fallback);
  const addr =
    apiLoc && typeof apiLoc === 'object' && typeof (apiLoc as Record<string, unknown>).address === 'string'
      ? String((apiLoc as Record<string, unknown>).address)
      : address;
  return {
    lat: coords?.lat ?? 0,
    lng: coords?.lng ?? 0,
    address: addr,
  };
}

/** Merge `/trips/:id/status` (or WS trip blob) into store — works when `currentTrip` was cleared mid-flow. */
export function mergeTripFromStatusPayload(
  prev: Trip | null,
  tripId: string,
  riderId: string,
  data: Record<string, unknown>,
  screenStatus: NormalizedTripStatus,
): Trip {
  const pickupFallback = prev?.pickup_location?.address || '';
  const dropFallback = prev?.dropoff_location?.address || '';
  return {
    id: tripId,
    rider_id: riderId,
    driver_id: (() => {
      if (typeof data.driver_id === 'string' && data.driver_id) return data.driver_id;
      if (
        typeof data.driver_info === 'object' &&
        data.driver_info &&
        typeof (data.driver_info as Record<string, unknown>).driver_id === 'string'
      ) {
        return (data.driver_info as Record<string, unknown>).driver_id as string;
      }
      return prev?.driver_id ?? null;
    })(),
    pickup_location: tripLocationRecord(data.pickup_location, prev?.pickup_location, pickupFallback),
    dropoff_location: tripLocationRecord(data.dropoff_location, prev?.dropoff_location, dropFallback),
    distance_km: Number(data.distance_km ?? prev?.distance_km ?? 0),
    duration_mins: Number(
      data.duration_mins ?? data.duration_minutes ?? prev?.duration_mins ?? 0,
    ),
    fare: data.fare != null ? Number(data.fare) : Number(prev?.fare ?? 0),
    surge_multiplier: Number(prev?.surge_multiplier ?? 1),
    status: screenStatus as Trip['status'],
    payment_method: String(data.payment_method || prev?.payment_method || 'cash'),
    payment_status: String(data.payment_status || prev?.payment_status || 'pending'),
    rider_rating: prev?.rider_rating ?? null,
    driver_rating: prev?.driver_rating ?? null,
    created_at: prev?.created_at || new Date().toISOString(),
    accepted_at: (data.accepted_at as string | null | undefined) ?? prev?.accepted_at ?? null,
    arrived_at: (data.arrived_at as string | null | undefined) ?? prev?.arrived_at ?? null,
    started_at: (data.started_at as string | null | undefined) ?? prev?.started_at ?? null,
    completed_at: (data.completed_at as string | null | undefined) ?? prev?.completed_at ?? null,
    pickup_code_required:
      data.pickup_code_required !== undefined
        ? Boolean(data.pickup_code_required)
        : prev?.pickup_code_required,
    pickup_code_verified: Boolean(
      data.pickup_code_verified || data.security_code_verified || prev?.pickup_code_verified,
    ),
    security_code_verified: Boolean(
      data.security_code_verified || data.pickup_code_verified || prev?.security_code_verified,
    ),
    geo_fence_trip_lock:
      (data.geo_fence_trip_lock as Trip['geo_fence_trip_lock']) ?? prev?.geo_fence_trip_lock ?? null,
    speed_spike_alert:
      (data.speed_spike_alert as Trip['speed_spike_alert']) ?? prev?.speed_spike_alert ?? null,
    gps_spoofing_alert:
      (data.gps_spoofing_alert as Trip['gps_spoofing_alert']) ?? prev?.gps_spoofing_alert ?? null,
    invisible_shield_mode:
      (data.invisible_shield_mode as Trip['invisible_shield_mode']) ??
      prev?.invisible_shield_mode ??
      null,
    safe_arrival_check:
      (data.safe_arrival_check as Trip['safe_arrival_check']) ?? prev?.safe_arrival_check ?? null,
    route_preview_coordinates: (() => {
      const raw = data.route_preview_coordinates ?? prev?.route_preview_coordinates;
      return Array.isArray(raw) ? (raw as Trip['route_preview_coordinates']) : prev?.route_preview_coordinates;
    })(),
    polyline: (() => {
      const raw = data.polyline ?? prev?.polyline;
      return typeof raw === 'string' && raw.trim() ? raw : prev?.polyline;
    })(),
  };
}

export function normalizeDriverInfo(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const faceRaw = typeof d.face_image === 'string' ? d.face_image : null;
  const profileRaw = typeof d.profile_image === 'string' ? d.profile_image : null;
  const faceResolved = resolvePublicMediaUri(faceRaw);
  const profileResolved = resolvePublicMediaUri(profileRaw) || faceResolved;
  return {
    ...d,
    name: formatDriverDisplayField(d.name) || 'Driver',
    vehicle:
      formatDriverDisplayField(d.vehicle) ||
      formatDriverDisplayField(d.vehicle_model) ||
      'Vehicle',
    plate: formatDriverDisplayField(d.plate) || formatDriverDisplayField(d.vehicle_plate),
    color: formatDriverDisplayField(d.color) || formatDriverDisplayField(d.vehicle_color),
    phone:
      (typeof d.phone === 'string' && d.phone.trim()) ||
      (typeof d.phone_number === 'string' && d.phone_number.trim()) ||
      null,
    face_image: faceResolved || faceRaw,
    profile_image: profileResolved || profileRaw,
  };
}
