/**
 * Work Zone screen data — fetch once, cache in Zustand, silent refresh on revisit.
 */
import { useEffect, useRef } from 'react';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import { workZoneScreenLog } from '@/src/utils/workZoneScreenLog';
import {
  getWorkZoneScreenFetchPromise,
  markWorkZoneScreenFetchStarted,
  resetWorkZoneScreenFetchGuard,
  useWorkZoneScreenStore,
  workZoneScreenFetchAlreadyStarted,
  type WorkZoneArea,
  type WorkZoneDriverState,
} from '@/src/store/workZoneScreenStore';

async function fetchWorkZoneScreenData(
  driverId: string,
  opts: { silent: boolean },
): Promise<void> {
  const store = useWorkZoneScreenStore.getState();
  if (!opts.silent && !store.initialLoadDone) {
    store.setFetchInFlight(true);
  }
  workZoneScreenLog('WORKZONE_FETCH_START', { driverId, silent: opts.silent });

  try {
    const [configRes, stateRes] = await Promise.all([
      fetchWithTimeout(`${BACKEND_URL}/api/work-zone/config`, {
        headers: getAuthHeaders(),
        timeoutMs: 8000,
      }),
      fetchWithTimeout(`${BACKEND_URL}/api/drivers/${driverId}/work-zone`, {
        headers: getAuthHeaders(),
        timeoutMs: 8000,
      }),
    ]);

    let areas: WorkZoneArea[] = store.areas;
    let driverState: WorkZoneDriverState | null = store.driverState;

    if (configRes.ok) {
      await configRes.json().catch(() => ({}));
      areas = [];
    }
    if (stateRes.ok) {
      driverState = (await stateRes.json()) as WorkZoneDriverState;
    }

    useWorkZoneScreenStore.getState().hydrate(areas, driverState, driverId);
    useWorkZoneScreenStore.getState().setLastError(null);
    workZoneScreenLog('WORKZONE_FETCH_SUCCESS', {
      areas: areas.length,
      entitled: driverState?.entitled,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    useWorkZoneScreenStore.getState().setLastError(msg);
    workZoneScreenLog('WORKZONE_FETCH_ERROR', { message: msg });
  } finally {
    const s = useWorkZoneScreenStore.getState();
    s.setFetchInFlight(false);
    s.markInitialLoadDone();
  }
}

function ensureWorkZoneScreenLoaded(driverId: string): Promise<void> {
  if (workZoneScreenFetchAlreadyStarted(driverId)) {
    return getWorkZoneScreenFetchPromise() ?? Promise.resolve();
  }

  const store = useWorkZoneScreenStore.getState();
  const silent = store.initialLoadDone && store.hydratedDriverId === driverId;
  const promise = fetchWorkZoneScreenData(driverId, { silent }).finally(() => {
    resetWorkZoneScreenFetchGuard();
  });
  markWorkZoneScreenFetchStarted(driverId, promise);
  return promise;
}

/** Mount-once fetch + lifecycle logs. */
export function useWorkZoneScreen(driverId: string | undefined) {
  const mountLogged = useRef(false);
  const fetchBound = useRef(false);

  useEffect(() => {
    if (!mountLogged.current) {
      mountLogged.current = true;
      workZoneScreenLog('WORKZONE_SCREEN_MOUNT');
    }
    return () => {
      workZoneScreenLog('WORKZONE_UNMOUNT');
      mountLogged.current = false;
      fetchBound.current = false;
    };
  }, []);

  useEffect(() => {
    if (!driverId || fetchBound.current) return;
    fetchBound.current = true;
    void ensureWorkZoneScreenLoaded(driverId);
  }, [driverId]);
}
