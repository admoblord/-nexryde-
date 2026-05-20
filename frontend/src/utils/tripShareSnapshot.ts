import type { Trip } from '@/src/store/appStore';
import type { TripShareData } from '@/src/services/api';
import { normalizeDriverInfo, formatDriverDisplayField } from '@/src/utils/tripCoords';
import { driverAvatarSources } from '@/src/utils/tripProfilePhotos';

/** Offline / bootstrap snapshot from store when share-data API is slow or unavailable. */
export function buildLocalShareSnapshot(
  trip: Trip | null | undefined,
  driverInfo?: Record<string, unknown> | null,
): Partial<TripShareData> | null {
  if (!trip?.id) return null;
  const d = normalizeDriverInfo(driverInfo) ?? {};
  const photos = driverAvatarSources(d);
  const pickup = trip.pickup_location;
  const dropoff = trip.dropoff_location;
  return {
    trip_id: trip.id,
    status: trip.status,
    driver: {
      name: formatDriverDisplayField(d.name) || 'Your driver',
      image_url: photos.face || photos.profile || null,
      face_image: photos.face,
      profile_image: photos.profile,
      rating:
        d.rating != null && Number.isFinite(Number(d.rating)) ? Number(d.rating) : null,
    },
    vehicle: {
      make: formatDriverDisplayField(d.vehicle) || 'Vehicle',
      color: formatDriverDisplayField(d.color) || '',
      license_plate: formatDriverDisplayField(d.plate) || '',
    },
    pickup_address: pickup?.address || '',
    destination_address: dropoff?.address || '',
    distance_km: trip.distance_km ?? null,
    started_at: trip.started_at || trip.accepted_at || trip.created_at || null,
  };
}
