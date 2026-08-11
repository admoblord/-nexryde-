/**
 * Smart pickup GPS — last-known first, Balanced refresh, hard timeout.
 *
 * Spec:
 * 1. getLastKnownPositionAsync({ maxAge: 300000 }) → pin + reverse-geocode immediately
 * 2. getCurrentPositionAsync(Balanced) in background; update only if >50m
 * 3. Hard 8s timeout on current position — never leave UI stuck
 * 4. Never use Highest / BestForNavigation for pickup (driver trip tracking only)
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { getWarmedLocation, setWarmedLocation } from '@/src/services/locationWarm';

export type SmartPickupFix = {
  lat: number;
  lng: number;
  /** Reported horizontal accuracy in meters (null = unknown). */
  accuracyM: number | null;
  source: 'last_known' | 'gps' | 'map_center';
  /** True when converged (background refresh done or timeout). */
  final: boolean;
};

export type SmartPickupOptions = {
  onFix: (fix: SmartPickupFix) => void;
  onError?: (error: unknown) => void;
  /** Meaningful move before replacing last-known with fresh GPS. Default 50m. */
  updateThresholdM?: number;
  /** Hard timeout for getCurrentPositionAsync. Default 8s. */
  timeoutMs?: number;
  /** Optional map-centre fallback if no last-known and GPS times out. */
  mapCenterFallback?: { lat: number; lng: number } | null;
  /** @deprecated Ignored — pickup uses Balanced, not target accuracy chasing. */
  targetAccuracyM?: number;
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

/**
 * Start smart acquisition. Returns a cancel function — always call it on unmount.
 * Emits: last_known (instant) → optional gps if >threshold → final: true.
 */
export function startSmartPickupGps(options: SmartPickupOptions): () => void {
  const {
    onFix,
    onError,
    updateThresholdM = 50,
    timeoutMs = 8000,
    mapCenterFallback = null,
  } = options;

  let cancelled = false;
  let finalized = false;
  const state: { best: SmartPickupFix | null } = { best: null };

  const finalize = (fix?: SmartPickupFix | null) => {
    if (cancelled || finalized) return;
    finalized = true;
    const chosen = fix ?? state.best;
    if (chosen) {
      onFix({ ...chosen, final: true });
    } else if (mapCenterFallback) {
      onFix({
        lat: mapCenterFallback.lat,
        lng: mapCenterFallback.lng,
        accuracyM: null,
        source: 'map_center',
        final: true,
      });
    } else {
      onError?.(new Error('gps_timeout_no_fix'));
    }
  };

  const emit = (fix: SmartPickupFix) => {
    if (cancelled || finalized) return;
    state.best = fix;
    onFix(fix);
    setWarmedLocation({
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      source: fix.source === 'gps' ? 'gps' : 'last_known',
      at: Date.now(),
    });
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

      // 0) In-memory warm from home launch — paint before OS last-known round-trip.
      const warm = getWarmedLocation();
      if (warm && Date.now() - warm.at < 5 * 60 * 1000) {
        emit({
          lat: warm.lat,
          lng: warm.lng,
          accuracyM: warm.accuracyM,
          source: warm.source === 'gps' || warm.source === 'warm' ? 'gps' : 'last_known',
          final: false,
        });
      }

      // 1) OS last-known — under 1s path for address resolve.
      try {
        const loc = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
        if (!cancelled && loc?.coords) {
          const lat = Number(loc.coords.latitude);
          const lng = Number(loc.coords.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const prev = state.best;
            const shouldReplace =
              !prev || haversineMeters(prev.lat, prev.lng, lat, lng) > 5;
            if (shouldReplace) {
              emit({
                lat,
                lng,
                accuracyM: loc.coords.accuracy ?? null,
                source: 'last_known',
                final: false,
              });
            }
          }
        }
      } catch {
        /* ignore */
      }

      if (cancelled || finalized) return;

      // 2) Background Balanced refresh with hard 8s timeout.
      let current: Location.LocationObject | null = null;
      try {
        current = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);
      } catch {
        current = null;
      }

      if (cancelled || finalized) return;

      if (current?.coords) {
        const lat = Number(current.coords.latitude);
        const lng = Number(current.coords.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const prev = state.best;
          const moved =
            !prev || haversineMeters(prev.lat, prev.lng, lat, lng) >= updateThresholdM;
          if (moved || !prev) {
            emit({
              lat,
              lng,
              accuracyM: current.coords.accuracy ?? null,
              source: 'gps',
              final: false,
            });
          } else {
            // Quietly keep last-known coords but mark GPS freshness on warm store
            setWarmedLocation({
              lat: prev.lat,
              lng: prev.lng,
              accuracyM: current.coords.accuracy ?? prev.accuracyM,
              source: 'gps',
              at: Date.now(),
            });
          }
        }
      }

      finalize(state.best);
    } catch (e) {
      if (!cancelled) {
        if (state.best) finalize(state.best);
        else onError?.(e);
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}
