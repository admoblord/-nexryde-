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
    stop_location: (() => {
      if (data.stop_location != null) {
        return tripLocationRecord(data.stop_location, prev?.stop_location, prev?.stop_location?.address || 'Stop');
      }
      return prev?.stop_location ?? null;
    })(),
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
    driver_rating:
      Number.isFinite(Number(data.driver_rating ?? data.rating))
        ? Number(data.driver_rating ?? data.rating)
        : prev?.driver_rating ?? null,
    created_at: prev?.created_at || new Date().toISOString(),
    accepted_at: (data.accepted_at as string | null | undefined) ?? prev?.accepted_at ?? null,
    arrived_at: (data.arrived_at as string | null | undefined) ?? prev?.arrived_at ?? null,
    started_at: (data.started_at as string | null | undefined) ?? prev?.started_at ?? null,
    completed_at: (data.completed_at as string | null | undefined) ?? prev?.completed_at ?? null,
    // Strict true only — missing/false must never force verify-before-start.
    pickup_code_required:
      data.pickup_code_required !== undefined
        ? data.pickup_code_required === true
        : prev?.pickup_code_required === true,
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
    ride_version: (() => {
      const raw = data.ride_version;
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : undefined;
      return Number.isFinite(n) ? n : prev?.ride_version;
    })(),
    state_sequence: (() => {
      const raw = data.state_sequence ?? data.ride_sequence;
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : undefined;
      return Number.isFinite(n) ? n : prev?.state_sequence;
    })(),
    state_updated_at:
      (typeof data.state_updated_at === 'string' && data.state_updated_at.trim())
        ? data.state_updated_at
        : prev?.state_updated_at,
    updated_at:
      (typeof data.updated_at === 'string' && data.updated_at.trim())
        ? data.updated_at
        : prev?.updated_at,
    driver_name:
      (typeof data.driver_name === 'string' && data.driver_name.trim())
        ? data.driver_name
        : (prev as { driver_name?: string | null } | null)?.driver_name ?? null,
    driver_profile_image:
      (typeof data.driver_profile_image === 'string' && data.driver_profile_image.trim())
        ? data.driver_profile_image
        : (typeof data.profile_image === 'string' && data.profile_image.trim())
          ? data.profile_image
          : (prev as { driver_profile_image?: string | null } | null)?.driver_profile_image ?? null,
    driver_face_image:
      (typeof data.driver_face_image === 'string' && data.driver_face_image.trim())
        ? data.driver_face_image
        : (typeof data.face_image === 'string' && data.face_image.trim())
          ? data.face_image
          : (prev as { driver_face_image?: string | null } | null)?.driver_face_image ?? null,
    driver_total_trips:
      Number.isFinite(Number(data.driver_total_trips ?? data.driver_trips_completed ?? data.total_trips))
        ? Number(data.driver_total_trips ?? data.driver_trips_completed ?? data.total_trips)
        : (prev as { driver_total_trips?: number | null } | null)?.driver_total_trips ?? null,
    driver_verified:
      data.driver_verified !== undefined
        ? Boolean(data.driver_verified)
        : (prev as { driver_verified?: boolean } | null)?.driver_verified,
    vehicle_type:
      (typeof data.vehicle_type === 'string' && data.vehicle_type.trim())
        ? data.vehicle_type
        : (prev as { vehicle_type?: string | null } | null)?.vehicle_type ?? null,
    vehicle_model:
      (typeof data.vehicle_model === 'string' && data.vehicle_model.trim())
        ? data.vehicle_model
        : (prev as { vehicle_model?: string | null } | null)?.vehicle_model ?? null,
    vehicle_plate:
      (typeof data.vehicle_plate === 'string' && data.vehicle_plate.trim())
        ? data.vehicle_plate
        : (prev as { vehicle_plate?: string | null } | null)?.vehicle_plate ?? null,
    vehicle_color:
      (typeof data.vehicle_color === 'string' && data.vehicle_color.trim())
        ? data.vehicle_color
        : (prev as { vehicle_color?: string | null } | null)?.vehicle_color ?? null,
    driver_finishing_prior_trip:
      data.driver_finishing_prior_trip !== undefined
        ? Boolean(data.driver_finishing_prior_trip)
        : Boolean((prev as { driver_finishing_prior_trip?: boolean } | null)?.driver_finishing_prior_trip),
    prior_trip_id:
      (typeof data.prior_trip_id === 'string' && data.prior_trip_id.trim())
        ? data.prior_trip_id
        : (prev as { prior_trip_id?: string | null } | null)?.prior_trip_id ?? null,
    finishing_eta_sec:
      Number.isFinite(Number(data.finishing_eta_sec))
        ? Number(data.finishing_eta_sec)
        : (prev as { finishing_eta_sec?: number | null } | null)?.finishing_eta_sec ?? null,
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
