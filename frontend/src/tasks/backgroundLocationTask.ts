/**
 * Background GPS task for drivers.
 *
 * MUST be imported in the app entry point (app/index.tsx or _layout.tsx) so the
 * task is registered before Expo TaskManager tries to execute it.
 *
 * Uses expo-task-manager + expo-location background mode.
 */
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { getAuthHeaders, BACKEND_URL } from '@/src/services/api';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import { updateDriverHeartbeatCoords } from '@/src/services/driverHeartbeat';

export const DRIVER_LOCATION_TASK = 'DRIVER_BACKGROUND_LOCATION';

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
  if (error) {
    console.warn('[BG Location]', error.message);
    return;
  }
  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  if (!locations?.length) return;

  const { latitude, longitude, heading, speed } = locations[locations.length - 1].coords;

  try {
    const headers = getAuthHeaders();
    if (!headers?.Authorization) return;

    // Extract user id from auth store via a light import
    const { useAppStore } = await import('@/src/store/appStore');
    const state = useAppStore.getState();
    const userId = state.user?.id;
    if (!userId) return;

    updateDriverHeartbeatCoords(latitude, longitude);

    await fetchWithTimeout(`${BACKEND_URL}/api/drivers/${userId}/location`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude,
        longitude,
        heading: heading ?? null,
        speed_kmh: speed != null ? speed * 3.6 : null,
      }),
      timeoutMs: 10_000,
    });
  } catch {
    // Background task — never crash the app
  }
});

/**
 * Start background GPS tracking. Call when driver goes online during an active trip.
 * Safe to call multiple times — checks if already started.
 */
export async function startDriverBackgroundLocation(): Promise<void> {
  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return;

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== 'granted') {
      console.warn('[BG Location] Background permission not granted; foreground GPS only');
      return;
    }

    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
    if (alreadyRunning) return;

    // Idle background ping (driver online, no active trip): 10 s / 20 m
    // During an active trip DriverTripLocationBridge takes over with a tighter
    // adaptive interval (3–10 s depending on phase) via watchPositionAsync.
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10000,   // 10 s — saves battery + API writes when idle
      distanceInterval: 20,  // 20 m — ignore GPS jitter while parked
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'NexRyde — online',
        notificationBody: 'Waiting for ride requests near you.',
        notificationColor: '#1a1a2e',
      },
    });
  } catch (err) {
    console.warn('[BG Location] start failed:', err);
  }
}

/**
 * Stop background GPS tracking. Call when trip completes or driver goes offline.
 */
export async function stopDriverBackgroundLocation(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
    if (running) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch {
    // Already stopped or not available
  }
}
