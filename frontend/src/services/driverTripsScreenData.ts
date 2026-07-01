import { apiFetch } from '@/src/utils/sessionRefresh';

export type DriverTripRecord = Record<string, unknown>;

export async function fetchDriverTripsScreenData(
  driverId: string,
  limit = 20,
): Promise<DriverTripRecord[]> {
  const res = await apiFetch(`/trips/user/${driverId}?role=driver&limit=${limit}`);
  if (!res.ok) {
    throw new Error(`trips_failed_${res.status}`);
  }
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}
