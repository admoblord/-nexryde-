/**
 * Instant Pickup Detection Engine
 *
 * - Never displays raw lat/lng to riders
 * - Session cache by rounded lat/lng (4 dp) — no re-geocode on every render
 * - Local + nearby-cell cache for <500ms warm hits
 * - Never keeps "Detecting…" when a GPS/last-known fix already exists
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from '@/src/services/api';
import { haversineMeters } from '@/src/services/smartPickupGps';
import { authedFetch } from '@/src/utils/sessionRefresh';

export const DETECTING_PICKUP = 'Detecting your pickup...';
export const SAFE_PICKUP_FALLBACK = 'Near your location';

const CACHE_KEY = 'nexryde:instant_pickup_v1';
const MAX_CACHE = 80;
/** Reuse cached labels within this radius (meters). */
export const PICKUP_REUSE_RADIUS_M = 30;
/** Refresh display when rider moves this far from last resolve. */
export const PICKUP_MOVE_THRESHOLD_M = 50;
/** ~40m grid cells for nearby reuse without h3-js. */
const CELL_METERS = 40;

export type PickupTier =
  | 'landmark'
  | 'building'
  | 'street'
  | 'estate'
  | 'area'
  | 'city'
  | 'fallback'
  | 'detecting';

export type InstantPickupResult = {
  label: string;
  tier: PickupTier;
  lat: number;
  lng: number;
  fromCache: boolean;
  latencyMs: number;
  status: string;
};

type CacheEntry = {
  lat: number;
  lng: number;
  label: string;
  tier: string;
  cell: string;
  at: number;
};

let memoryCache: CacheEntry[] = [];
/** Session geocode cache keyed by lat/lng rounded to 4 decimal places. */
const sessionRoundCache = new Map<string, InstantPickupResult>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let cacheLoaded = false;
let lastKnownGood: { lat: number; lng: number; label: string } | null = null;

function rememberGoodLabel(lat: number, lng: number, label: string): void {
  const t = String(label || '').trim();
  if (isBadPickupLabel(t) || isPlaceholderPickupLabel(t)) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  lastKnownGood = { lat, lng, label: t };
}

/** Last reverse-geocoded street/area near these coords — empty until a real hit. */
export function peekLastKnownPickupLabel(lat?: number, lng?: number): string {
  if (!lastKnownGood || isPlaceholderPickupLabel(lastKnownGood.label)) return '';
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (haversineMeters(lastKnownGood.lat, lastKnownGood.lng, lat as number, lng as number) > 250) {
      return '';
    }
  }
  return lastKnownGood.label;
}

export function roundCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function isRawLatLngLabel(s: string): boolean {
  return /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(String(s || '').trim());
}

export function isPlusCodeLabel(s: string): boolean {
  const head = String(s || '')
    .trim()
    .split(',')[0]
    .trim();
  if (!head || !head.includes('+')) return false;
  return /^[23456789CFGHJMPQRVWX]{4,11}\+[23456789CFGHJMPQRVWX]{2,6}$/i.test(head);
}

export function isBadPickupLabel(s: string): boolean {
  const t = String(s || '').trim();
  return !t || isRawLatLngLabel(t) || isPlusCodeLabel(t);
}

export function isDetectingPickupLabel(s: string): boolean {
  const t = String(s || '').trim();
  return t === DETECTING_PICKUP || t === 'Finding address…' || t === 'Finding address...';
}

/** Empty / detecting / legacy "Near your location" / raw coords / Plus Codes. */
export function isPlaceholderPickupLabel(s: string): boolean {
  const t = String(s || '').trim();
  if (!t || t === SAFE_PICKUP_FALLBACK || t === 'Current location') return true;
  if (isDetectingPickupLabel(t)) return true;
  return isRawLatLngLabel(t) || isPlusCodeLabel(t);
}

/** Safe UI string — never raw coordinates, Plus Codes, or fake "Near your location". */
export function safePickupDisplay(label: string | null | undefined, detecting = false): string {
  if (detecting) return '';
  const t = String(label || '').trim();
  if (isPlaceholderPickupLabel(t)) return '';
  return t;
}

/** Drop a leading Plus Code so "H97R+34P, Oladunni St, Lagos" reads as a street. */
export function stripPlusCodeHead(address: string | null | undefined): string {
  const t = String(address || '').trim();
  if (!isPlusCodeLabel(t)) return t;
  const rest = t.split(',').slice(1).join(',').trim();
  return rest || t;
}

/**
 * Keep the name the rider tapped when Place Details answers with a Plus Code.
 *
 * Google returns "H97R+34P, Oladunni St, Gbagada" as the formatted address for
 * Peace Garden Estate. Overwriting the tapped suggestion with that turned the
 * destination field into a code, and pickup into the generic fallback because
 * safePickupDisplay rejects Plus Codes outright.
 */
export function preferReadableAddress(
  tapped: string | null | undefined,
  resolved: string | null | undefined,
): string {
  const tappedText = String(tapped || '').trim();
  const resolvedText = String(resolved || '').trim();
  if (!resolvedText) return tappedText;
  if (!isPlusCodeLabel(resolvedText)) return resolvedText;
  if (tappedText && !isBadPickupLabel(tappedText)) return tappedText;
  return stripPlusCodeHead(resolvedText) || tappedText;
}

export function geoCellKey(lat: number, lng: number, meters = CELL_METERS): string {
  const dLat = meters / 111_320;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = meters / (111_320 * Math.max(0.2, cos));
  return `${Math.round(lat / dLat)}:${Math.round(lng / dLng)}`;
}

async function ensureCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CacheEntry[];
    if (Array.isArray(parsed)) {
      memoryCache = parsed.filter(
        (e) =>
          e &&
          typeof e.label === 'string' &&
          !isBadPickupLabel(e.label) &&
          !isPlaceholderPickupLabel(e.label) &&
          Number.isFinite(e.lat) &&
          Number.isFinite(e.lng),
      );
      if (memoryCache[0]) {
        rememberGoodLabel(memoryCache[0].lat, memoryCache[0].lng, memoryCache[0].label);
      }
    }
  } catch {
    /* ignore */
  }
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memoryCache.slice(0, MAX_CACHE))).catch(
      () => undefined,
    );
  }, 400);
}

function remember(entry: CacheEntry): void {
  memoryCache = [
    entry,
    ...memoryCache.filter(
      (e) => e.cell !== entry.cell && haversineMeters(e.lat, e.lng, entry.lat, entry.lng) > 8,
    ),
  ].slice(0, MAX_CACHE);
  schedulePersist();
  if (!isBadPickupLabel(entry.label) && !isPlaceholderPickupLabel(entry.label)) {
    rememberGoodLabel(entry.lat, entry.lng, entry.label);
    sessionRoundCache.set(roundCoordKey(entry.lat, entry.lng), {
      label: entry.label,
      tier: (entry.tier as PickupTier) || 'area',
      lat: entry.lat,
      lng: entry.lng,
      fromCache: true,
      latencyMs: 0,
      status: 'CACHE',
    });
  }
}

function lookupSessionRound(lat: number, lng: number): InstantPickupResult | null {
  const hit = sessionRoundCache.get(roundCoordKey(lat, lng));
  if (!hit || isBadPickupLabel(hit.label) || isPlaceholderPickupLabel(hit.label)) return null;
  return { ...hit, lat, lng, fromCache: true };
}

export async function lookupPickupCache(
  lat: number,
  lng: number,
  radiusM = PICKUP_REUSE_RADIUS_M,
): Promise<InstantPickupResult | null> {
  const session = lookupSessionRound(lat, lng);
  if (session) {
    rememberGoodLabel(session.lat, session.lng, session.label);
    return session;
  }

  await ensureCacheLoaded();
  const cell = geoCellKey(lat, lng);
  let best: CacheEntry | null = null;
  let bestDist = Infinity;
  for (const e of memoryCache) {
    if (e.cell === cell || haversineMeters(e.lat, e.lng, lat, lng) <= radiusM) {
      const d = haversineMeters(e.lat, e.lng, lat, lng);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
  }
  if (!best || isBadPickupLabel(best.label) || isPlaceholderPickupLabel(best.label)) return null;
  rememberGoodLabel(best.lat, best.lng, best.label);
  return {
    label: best.label,
    tier: (best.tier as PickupTier) || 'area',
    lat,
    lng,
    fromCache: true,
    latencyMs: 0,
    status: 'CACHE',
  };
}

async function fetchReverse(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<{
  label: string;
  tier: PickupTier;
  status: string;
} | null> {
  const origin = String(BACKEND_URL || '').replace(/\/$/, '');
  if (!origin) return null;
  const q = `lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
  const url = `${origin}/api/places/reverse-geocode?${q}`;
  const res = await authedFetch(url, {
    method: 'GET',
    signal,
    timeoutMs: 8_000,
    preserveSessionOn401: true,
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const label = String(
    data.pickup_label || data.short_label || data.formatted_address || data.address || '',
  ).trim();
  if (!label || isBadPickupLabel(label)) return null;
  const tier = String(data.tier || 'area') as PickupTier;
  return { label, tier, status: String(data.status || 'OK') };
}

/**
 * Resolve pickup label with session/round cache → disk cache → network → fallback.
 * Never returns coordinates.
 */
export async function resolveInstantPickup(
  lat: number,
  lng: number,
  opts?: { forceNetwork?: boolean; signal?: AbortSignal },
): Promise<InstantPickupResult> {
  const t0 = Date.now();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      label: '',
      tier: 'fallback',
      lat: 0,
      lng: 0,
      fromCache: false,
      latencyMs: 0,
      status: 'INVALID',
    };
  }

  if (!opts?.forceNetwork) {
    const hit = await lookupPickupCache(lat, lng);
    if (hit) {
      return { ...hit, latencyMs: Date.now() - t0 };
    }
  } else {
    // Still honor exact 4-dp session hits unless forceNetwork — no, force skips
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (opts?.signal?.aborted) break;
    try {
      const remote = await fetchReverse(lat, lng, opts?.signal);
      if (remote) {
        remember({
          lat,
          lng,
          label: remote.label,
          tier: remote.tier,
          cell: geoCellKey(lat, lng),
          at: Date.now(),
        });
        return {
          label: remote.label,
          tier: remote.tier,
          lat,
          lng,
          fromCache: false,
          latencyMs: Date.now() - t0,
          status: remote.status,
        };
      }
    } catch (e) {
      lastErr = e;
    }
    if (opts?.signal?.aborted) break;
    await new Promise((r) => setTimeout(r, 120 + attempt * 120));
  }

  void lastErr;
  return {
    label: '',
    tier: 'fallback',
    lat,
    lng,
    fromCache: false,
    latencyMs: Date.now() - t0,
    status: 'FALLBACK',
  };
}

export type InstantPickupController = {
  onGpsFix: (lat: number, lng: number, opts?: { final?: boolean }) => void;
  refresh: () => void;
  preload: () => void;
  stop: () => void;
  getSnapshot: () => {
    label: string;
    detecting: boolean;
    lat: number | null;
    lng: number | null;
    tier: PickupTier;
  };
};

/**
 * Continuous pickup detection — call from booking screen.
 * With a GPS/last-known fix: emit a cached street/area instantly, otherwise
 * an empty label (never "Near your location" / "Detecting…") while reverse-geocode runs.
 */
export function startInstantPickupEngine(handlers: {
  onUpdate: (state: {
    label: string;
    detecting: boolean;
    lat: number;
    lng: number;
    tier: PickupTier;
    fromCache: boolean;
  }) => void;
  moveThresholdM?: number;
  isManualPickup?: () => boolean;
}): InstantPickupController {
  const moveThreshold = handlers.moveThresholdM ?? PICKUP_MOVE_THRESHOLD_M;
  let stopped = false;
  let lastResolved: { lat: number; lng: number } | null = null;
  let lastLabel = '';
  let lastTier: PickupTier = 'detecting';
  let current: { lat: number; lng: number } | null = null;
  let seq = 0;
  let abort: AbortController | null = null;
  let lastPropagated: { lat: number; lng: number } | null = null;
  let hasGpsFix = false;

  const emitPlaceholder = (lat: number, lng: number) => {
    const label = isPlaceholderPickupLabel(lastLabel) ? '' : lastLabel;
    const detecting = !hasGpsFix;
    handlers.onUpdate({
      label,
      detecting,
      lat,
      lng,
      tier: detecting ? 'detecting' : lastTier === 'detecting' ? 'area' : lastTier,
      fromCache: false,
    });
  };

  const runResolve = (lat: number, lng: number, forceNetwork: boolean) => {
    if (stopped || handlers.isManualPickup?.()) return;
    const my = ++seq;
    abort?.abort();
    abort = new AbortController();
    void (async () => {
      if (!forceNetwork) {
        const hit = await lookupPickupCache(lat, lng);
        if (stopped || my !== seq) return;
        if (hit) {
          lastResolved = { lat, lng };
          lastLabel = hit.label;
          lastTier = hit.tier;
          handlers.onUpdate({
            label: hit.label,
            detecting: false,
            lat,
            lng,
            tier: hit.tier,
            fromCache: true,
          });
        } else {
          emitPlaceholder(lat, lng);
        }
      } else if (!hasGpsFix) {
        emitPlaceholder(lat, lng);
      }

      const result = await resolveInstantPickup(lat, lng, {
        forceNetwork,
        signal: abort?.signal,
      });
      if (stopped || my !== seq || handlers.isManualPickup?.()) return;
      lastResolved = { lat, lng };
      lastLabel = safePickupDisplay(result.label);
      lastTier = result.tier;
      handlers.onUpdate({
        label: lastLabel,
        detecting: false,
        lat,
        lng,
        tier: result.tier,
        fromCache: result.fromCache,
      });
    })();
  };

  return {
    onGpsFix(lat, lng, opts) {
      if (stopped || handlers.isManualPickup?.()) return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      hasGpsFix = true;
      current = { lat, lng };
      const moved =
        !lastResolved ||
        haversineMeters(lastResolved.lat, lastResolved.lng, lat, lng) >= moveThreshold;
      if (!moved && !opts?.final) {
        if (
          lastResolved &&
          (!lastPropagated ||
            haversineMeters(lastPropagated.lat, lastPropagated.lng, lat, lng) >= 5)
        ) {
          lastPropagated = { lat, lng };
          handlers.onUpdate({
            label: isPlaceholderPickupLabel(lastLabel) ? '' : safePickupDisplay(lastLabel),
            detecting: false,
            lat,
            lng,
            tier: lastTier === 'detecting' ? 'area' : lastTier,
            fromCache: true,
          });
        }
        return;
      }
      runResolve(lat, lng, false);
    },
    refresh() {
      if (!current) return;
      runResolve(current.lat, current.lng, true);
    },
    preload() {
      if (!current) return;
      void resolveInstantPickup(current.lat, current.lng);
    },
    stop() {
      stopped = true;
      abort?.abort();
    },
    getSnapshot() {
      return {
        label: lastLabel,
        detecting: !hasGpsFix,
        lat: current?.lat ?? null,
        lng: current?.lng ?? null,
        tier: lastTier,
      };
    },
  };
}

/** Warm GPS + reverse-geocode before rider focuses destination. */
export async function preloadPickupAt(lat: number, lng: number): Promise<void> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  await resolveInstantPickup(lat, lng);
}
