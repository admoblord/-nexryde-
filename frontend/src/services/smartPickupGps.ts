/**
 * Smart pickup GPS — Uber-style progressive precision.
 *
 * 1. Paint INSTANTLY from last-known position (any accuracy).
 * 2. Stream high-accuracy GPS fixes and converge: only an IMPROVING fix
 *    (better accuracy, or real movement) may replace the current one.
 * 3. Lock when accuracy <= targetAccuracyM (exact-spot grade) or on timeout,
 *    keeping the best fix seen.
 *
 * The caller decides how fixes are applied (e.g. never overwrite a pickup
 * the rider set manually).
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type SmartPickupFix = {
  lat: number;
  lng: number;
  /** Reported horizontal accuracy in meters (null = unknown). */
  accuracyM: number | null;
  source: 'last_known' | 'gps';
  /** True when converged (target accuracy reached or timeout with best fix). */
  final: boolean;
};

export type SmartPickupOptions = {
  onFix: (fix: SmartPickupFix) => void;
  onError?: (error: unknown) => void;
  /** Stop refining once a fix is at least this accurate. Default 15m. */
  targetAccuracyM?: number;
  /** Give up refining after this long and finalize the best fix. Default 12s. */
  timeoutMs?: number;
};

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** A new sample wins if meaningfully more accurate, or first live GPS after cached. */
function isImprovement(
  best: SmartPickupFix | null,
  accuracyM: number | null,
  lat: number,
  lng: number,
): boolean {
  if (!best) return true;
  // Cached fix is always beaten by the first live GPS sample.
  if (best.source === 'last_known') return true;
  if (accuracyM == null) return false;
  if (best.accuracyM == null) return true;
  if (accuracyM <= best.accuracyM - 5 || accuracyM <= best.accuracyM * 0.8) return true;
  // Rider actually moved (not noise): similar accuracy but a real displacement.
  const moved = haversineMeters(best.lat, best.lng, lat, lng);
  return moved > Math.max(30, (accuracyM ?? 30) * 1.5) && accuracyM <= best.accuracyM + 10;
}

/**
 * Start smart acquisition. Returns a cancel function — always call it on unmount.
 * Emits: last_known (instant) → improving gps fixes → one fix with final: true.
 */
export function startSmartPickupGps(options: SmartPickupOptions): () => void {
  const { onFix, onError, targetAccuracyM = 15, timeoutMs = 12000 } = options;

  let cancelled = false;
  let finalized = false;
  let best: SmartPickupFix | null = null;
  let watchSub: { remove: () => void } | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (watchSub) {
      watchSub.remove();
      watchSub = null;
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };

  const finalize = () => {
    if (cancelled || finalized) return;
    finalized = true;
    cleanup();
    if (best) onFix({ ...best, final: true });
    else onError?.(new Error('gps_timeout_no_fix'));
  };

  const emit = (fix: SmartPickupFix) => {
    if (cancelled || finalized) return;
    best = fix;
    onFix(fix);
    if (
      fix.source === 'gps' &&
      fix.accuracyM != null &&
      fix.accuracyM <= targetAccuracyM
    ) {
      finalize();
    }
  };

  void (async () => {
    if (Platform.OS === 'web') {
      onError?.(new Error('gps_unavailable_web'));
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        onError?.(new Error('gps_permission_denied'));
        return;
      }

      // 1) Instant paint — any cached position, no accuracy floor.
      void Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })
        .then((loc) => {
          if (cancelled || finalized || !loc?.coords) return;
          const lat = Number(loc.coords.latitude);
          const lng = Number(loc.coords.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          if (best) return; // live GPS already arrived — cached is stale
          emit({
            lat,
            lng,
            accuracyM: loc.coords.accuracy ?? null,
            source: 'last_known',
            final: false,
          });
        })
        .catch(() => {});

      // 2) High-accuracy convergence stream.
      timeoutTimer = setTimeout(finalize, timeoutMs);
      watchSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (loc) => {
          if (cancelled || finalized || !loc?.coords) return;
          const lat = Number(loc.coords.latitude);
          const lng = Number(loc.coords.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const accuracyM = loc.coords.accuracy ?? null;
          if (!isImprovement(best, accuracyM, lat, lng)) return;
          emit({ lat, lng, accuracyM, source: 'gps', final: false });
        },
      );
      if (cancelled || finalized) {
        cleanup();
        return;
      }

      // 3) Safety net — some OEMs never tick the watcher indoors; one direct fix.
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then((loc) => {
          if (cancelled || finalized || !loc?.coords) return;
          const lat = Number(loc.coords.latitude);
          const lng = Number(loc.coords.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const accuracyM = loc.coords.accuracy ?? null;
          if (!isImprovement(best, accuracyM, lat, lng)) return;
          emit({ lat, lng, accuracyM, source: 'gps', final: false });
        })
        .catch(() => {});
    } catch (e) {
      if (!cancelled) onError?.(e);
    }
  })();

  return () => {
    cancelled = true;
    cleanup();
  };
}
