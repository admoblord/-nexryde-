/**
 * Last-known map/GPS — first frame from memory + disk, fresh fix in the background.
 *
 * Contract:
 * 1. First paint uses getWarmedLocation() / peekQuickLocationSync() — never GPS.
 * 2. hydrateLocationPersist() restores yesterday's pin from AsyncStorage (24h).
 * 3. startBackgroundGpsFix() / warmLocationOnLaunch() take a Balanced fix off the
 *    UI path and move the pin only if the rider/driver moved ~50m.
 * 4. Never await getCurrentPositionAsync before the first map frame.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_PERSIST_KEY = 'nexryde:last_known_location_v1';
export const LOCATION_PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const LOCATION_MEMORY_FRESH_MS = 5 * 60 * 1000;
export const GPS_MOVE_THRESHOLD_M = 50;
export const BACKGROUND_GPS_TIMEOUT_MS = 8000;

export type WarmedLocation = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: 'last_known' | 'gps' | 'warm' | 'persist';
  at: number;
};

type LocationListener = (loc: WarmedLocation | null) => void;

let warmed: WarmedLocation | null = null;
let persistHydrated = false;
let persistPromise: Promise<void> | null = null;
let warming = false;
let backgroundGpsInFlight = false;
const listeners = new Set<LocationListener>();

export function isValidCoords(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // Null-island / unset GPS — never treat as a real last-known pin.
  if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return false;
  return true;
}

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

export function isPersistFresh(at: number, now: number = Date.now()): boolean {
  return Number.isFinite(at) && now - at >= 0 && now - at < LOCATION_PERSIST_MAX_AGE_MS;
}

export function isMemoryFresh(at: number, now: number = Date.now()): boolean {
  return Number.isFinite(at) && now - at >= 0 && now - at < LOCATION_MEMORY_FRESH_MS;
}

/** Move the visible pin only when the fresh fix is meaningfully different. */
export function shouldAcceptGpsUpdate(
  prev: { lat: number; lng: number } | null | undefined,
  next: { lat: number; lng: number },
  thresholdM: number = GPS_MOVE_THRESHOLD_M,
): boolean {
  if (!prev || !isValidCoords(prev.lat, prev.lng)) return isValidCoords(next.lat, next.lng);
  if (!isValidCoords(next.lat, next.lng)) return false;
  return haversineMeters(prev.lat, prev.lng, next.lat, next.lng) >= thresholdM;
}

export function parsePersistedLocation(raw: unknown): WarmedLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!isValidCoords(lat, lng)) return null;
  const at = Number(row.at);
  if (!Number.isFinite(at)) return null;
  const accuracyRaw = row.accuracyM;
  const accuracyM =
    accuracyRaw == null || accuracyRaw === ''
      ? null
      : Number.isFinite(Number(accuracyRaw))
        ? Number(accuracyRaw)
        : null;
  const source =
    row.source === 'gps' || row.source === 'warm' || row.source === 'last_known' || row.source === 'persist'
      ? row.source
      : 'persist';
  return { lat, lng, accuracyM, source, at };
}

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn(warmed);
    } catch {
      /* listener must not break GPS */
    }
  }
}

function persistNow(loc: WarmedLocation): void {
  if (Platform.OS === 'web') return;
  void AsyncStorage.setItem(
    LOCATION_PERSIST_KEY,
    JSON.stringify({
      lat: loc.lat,
      lng: loc.lng,
      accuracyM: loc.accuracyM,
      source: loc.source,
      at: loc.at,
    }),
  ).catch(() => {
    /* disk full / private mode */
  });
}

export function subscribeWarmedLocation(fn: LocationListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getWarmedLocation(): WarmedLocation | null {
  return warmed;
}

/** Sync first-paint pin. Same as getWarmedLocation — name makes the contract obvious. */
export function peekQuickLocationSync(): WarmedLocation | null {
  return warmed;
}

export function lastKnownLatLng(): { lat: number; lng: number } | null {
  return warmed ? { lat: warmed.lat, lng: warmed.lng } : null;
}

export function setWarmedLocation(loc: WarmedLocation, opts?: { persist?: boolean }): void {
  if (!isValidCoords(loc.lat, loc.lng)) return;
  warmed = {
    lat: loc.lat,
    lng: loc.lng,
    accuracyM: loc.accuracyM ?? null,
    source: loc.source,
    at: loc.at || Date.now(),
  };
  notifyListeners();
  if (opts?.persist !== false) persistNow(warmed);
}

export function hydrateLocationPersist(): Promise<void> {
  if (persistHydrated) return Promise.resolve();
  if (persistPromise) return persistPromise;
  persistPromise = (async () => {
    try {
      if (Platform.OS === 'web') return;
      const raw = await AsyncStorage.getItem(LOCATION_PERSIST_KEY);
      if (!raw) return;
      const parsed = parsePersistedLocation(JSON.parse(raw));
      if (!parsed || !isPersistFresh(parsed.at)) return;
      if (!warmed || warmed.at < parsed.at) {
        warmed = { ...parsed, source: 'persist' };
        notifyListeners();
      }
    } catch {
      /* corrupt persist — ignore */
    } finally {
      persistHydrated = true;
    }
  })();
  return persistPromise;
}

// Start disk hydrate the moment any screen imports this module.
void hydrateLocationPersist();

/**
 * Last-known only. Awaits persist hydrate (usually already done), never GPS.
 * OS last-known is a fallback when disk is empty — still not a cold acquire.
 */
export async function peekQuickLocation(): Promise<WarmedLocation | null> {
  await hydrateLocationPersist();
  if (warmed && isPersistFresh(warmed.at)) return warmed;
  if (Platform.OS === 'web') return warmed;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return warmed;
    const loc = await Location.getLastKnownPositionAsync({
      maxAge: LOCATION_PERSIST_MAX_AGE_MS,
    });
    if (!loc?.coords) return warmed;
    const lat = Number(loc.coords.latitude);
    const lng = Number(loc.coords.longitude);
    if (!isValidCoords(lat, lng)) return warmed;
    const next: WarmedLocation = {
      lat,
      lng,
      accuracyM: loc.coords.accuracy ?? null,
      source: 'last_known',
      at: Date.now(),
    };
    setWarmedLocation(next);
    return next;
  } catch {
    return warmed;
  }
}

function applyOsFix(
  coords: { latitude: number; longitude: number; accuracy?: number | null },
  source: WarmedLocation['source'],
): WarmedLocation | null {
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  if (!isValidCoords(lat, lng)) return null;
  const next: WarmedLocation = {
    lat,
    lng,
    accuracyM: coords.accuracy ?? null,
    source,
    at: Date.now(),
  };
  if (!shouldAcceptGpsUpdate(warmed, next) && warmed) {
    // Same place — refresh freshness / accuracy, do not jump the pin.
    setWarmedLocation({
      ...warmed,
      accuracyM: next.accuracyM ?? warmed.accuracyM,
      source: source === 'gps' || source === 'warm' ? source : warmed.source,
      at: next.at,
    });
    return warmed;
  }
  setWarmedLocation(next);
  return next;
}

/**
 * Fresh Balanced GPS off the UI thread. Never call this before first paint.
 * Returns a cancel function.
 */
export function startBackgroundGpsFix(opts?: {
  timeoutMs?: number;
  requestPermission?: boolean;
}): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let cancelled = false;
  const timeoutMs = opts?.timeoutMs ?? BACKGROUND_GPS_TIMEOUT_MS;
  if (backgroundGpsInFlight) return () => {
    cancelled = true;
  };
  backgroundGpsInFlight = true;

  void (async () => {
    try {
      const perm = opts?.requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (cancelled || perm.status !== 'granted') return;

      const current = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      if (cancelled || !current?.coords) return;
      applyOsFix(current.coords, 'gps');
    } catch {
      /* best-effort */
    } finally {
      backgroundGpsInFlight = false;
    }
  })();

  return () => {
    cancelled = true;
  };
}

/**
 * Call from rider/driver home mount. Seeds last-known (memory → disk → OS),
 * then refreshes with Balanced accuracy in the background.
 */
export function warmLocationOnLaunch(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  let cancelled = false;
  if (warming) {
    return () => {
      cancelled = true;
    };
  }
  warming = true;

  void (async () => {
    try {
      await hydrateLocationPersist();
      if (cancelled) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;

      if (!warmed) {
        const last = await Location.getLastKnownPositionAsync({
          maxAge: LOCATION_PERSIST_MAX_AGE_MS,
        });
        if (!cancelled && last?.coords) {
          applyOsFix(last.coords, 'last_known');
        }
      }

      if (cancelled) return;
      const current = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), BACKGROUND_GPS_TIMEOUT_MS)),
      ]);
      if (cancelled || !current?.coords) return;
      applyOsFix(current.coords, 'warm');
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

/** Test-only: wipe in-memory state. Persist on disk is left alone. */
export function resetLocationWarmForTests(): void {
  warmed = null;
  persistHydrated = false;
  persistPromise = null;
  warming = false;
  backgroundGpsInFlight = false;
  listeners.clear();
}
