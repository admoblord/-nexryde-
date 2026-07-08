/**
 * Work Zone session cache + deactivate helper.
 */
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import { useDriverSessionStore } from '@/src/store/driverSessionStore';

export function setWorkZoneFromApi(active: boolean, label: string): void {
  useDriverSessionStore.getState().setWorkZone(active, label);
}

export async function refreshWorkZone(driverId: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/api/drivers/${driverId}/work-zone`, {
      headers: getAuthHeaders(),
      timeoutMs: 5000,
    });
    if (res.ok) {
      const data = await res.json();
      setWorkZoneFromApi(!!data.active, data.label || '');
    }
  } catch {
    /* non-fatal */
  }
}

export async function loadWorkZoneOnce(driverId: string): Promise<void> {
  const store = useDriverSessionStore.getState();
  if (!store.markWorkZoneLoadStarted()) return;
  await refreshWorkZone(driverId);
  store.markWorkZoneLoaded();
}

export async function deactivateWorkZone(driverId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/work-zone`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      setWorkZoneFromApi(false, '');
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Minutes with zero zone-eligible offers before suggesting zone changes. */
export const WORK_ZONE_IDLE_SUGGESTION_MINUTES = 30;
