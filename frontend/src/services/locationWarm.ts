/**
 * Warm rider location on home mount so booking can paint from last-known
 * (or a fresh Balanced fix) without waiting for a cold GPS acquire.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { haversineMeters } from '@/src/services/smartPickupGps';

export type WarmedLocation = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: 'last_known' | 'gps' | 'warm';
  at: number;
};

let warmed: WarmedLocation | null = null;
let warming = false;

export function getWarmedLocation(): WarmedLocation | null {
  return warmed;
}

export function setWarmedLocation(loc: WarmedLocation): void {
  warmed = loc;
}

/** Prefer in-memory warm, then OS last-known (maxAge 5 min). Never blocks long. */
export async function peekQuickLocation(): Promise<WarmedLocation | null> {
  if (warmed && Date.now() - warmed.at < 5 * 60 * 1000) {
    return warmed;
  }
  if (Platform.OS === 'web') return warmed;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return warmed;
    const loc = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    if (!loc?.coords) return warmed;
    const lat = Number(loc.coords.latitude);
    const lng = Number(loc.coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return warmed;
    const next: WarmedLocation = {
      lat,
      lng,
      accuracyM: loc.coords.accuracy ?? null,
      source: 'last_known',
      at: Date.now(),
    };
    warmed = next;
    return next;
  } catch {
    return warmed;
  }
}

/**
 * Call from rider home mount. Requests permission if needed, seeds last-known,
 * then refreshes with Balanced accuracy in the background.
 */
export function warmLocationOnLaunch(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let cancelled = false;
  if (warming) return () => {
    cancelled = true;
  };
  warming = true;

  void (async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;

      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
      if (!cancelled && last?.coords) {
        const lat = Number(last.coords.latitude);
        const lng = Number(last.coords.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          warmed = {
            lat,
            lng,
            accuracyM: last.coords.accuracy ?? null,
            source: 'last_known',
            at: Date.now(),
          };
        }
      }

      // Background refresh — Balanced returns in ~1–3s; do not use High/BestForNavigation.
      const current = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
      if (cancelled || !current?.coords) return;
      const lat = Number(current.coords.latitude);
      const lng = Number(current.coords.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (
        warmed &&
        haversineMeters(warmed.lat, warmed.lng, lat, lng) < 50 &&
        warmed.source !== 'last_known'
      ) {
        // Keep existing warm if already a fresh GPS within 50m
        warmed = { ...warmed, at: Date.now() };
        return;
      }
      warmed = {
        lat,
        lng,
        accuracyM: current.coords.accuracy ?? null,
        source: 'warm',
        at: Date.now(),
      };
    } catch {
      /* best-effort */
    } finally {
      warming = false;
    }
  })();

  return () => {
    cancelled = true;
  };
}
