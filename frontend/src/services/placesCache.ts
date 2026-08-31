/**
 * Last-good pickup/destination predictions, kept on disk.
 *
 * Lagos networks drop mid-keystroke and a cold API adds seconds.
 * Without this, one failed request turns a search the rider has already done
 * into "No places found". Reads are served from memory; disk is the backup that
 * survives an app restart.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PlacesPrediction } from '@/src/services/placesSearch';

const STORAGE_KEY = '@nexryde_places_predictions_v1';
const MAX_ENTRIES = 150;
const ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PREFIX_CHARS = 3;

type CacheEntry = {
  predictions: PlacesPrediction[];
  savedAt: number;
};

const memory = new Map<string, CacheEntry>();
let hydrated = false;
let hydrating: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function placesCacheKey(query: string, countryCode = 'ng'): string {
  return `${countryCode.toLowerCase()}|${query.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function isFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && entry.predictions.length > 0 && Date.now() - entry.savedAt < ENTRY_TTL_MS;
}

export async function hydratePlacesCache(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
      for (const [key, entry] of Object.entries(parsed || {})) {
        if (isFresh(entry)) memory.set(key, entry);
      }
    } catch {
      /* a corrupt cache must never block a search */
    } finally {
      hydrated = true;
      hydrating = null;
    }
  })();
  return hydrating;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void (async () => {
      try {
        const out: Record<string, CacheEntry> = {};
        for (const [key, entry] of memory) out[key] = entry;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(out));
      } catch {
        /* best effort — memory copy still serves this session */
      }
    })();
  }, 1200);
}

export function writePlacesCache(
  query: string,
  countryCode: string,
  predictions: PlacesPrediction[],
): void {
  if (!predictions.length) return;
  const key = placesCacheKey(query, countryCode);
  if (memory.has(key)) memory.delete(key);
  memory.set(key, { predictions, savedAt: Date.now() });
  while (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest == null) break;
    memory.delete(oldest);
  }
  scheduleFlush();
}

/** Exact previous answer for this query. */
export function readPlacesCache(query: string, countryCode = 'ng'): PlacesPrediction[] | null {
  const entry = memory.get(placesCacheKey(query, countryCode));
  return isFresh(entry) ? entry.predictions : null;
}

/**
 * Longest already-answered prefix of what the rider is typing.
 * Typing one more character during an outage keeps the visible list instead of
 * replacing good suggestions with an empty state.
 */
export function readPlacesCachePrefix(
  query: string,
  countryCode = 'ng',
): PlacesPrediction[] | null {
  const target = placesCacheKey(query, countryCode);
  let best: { key: string; entry: CacheEntry } | null = null;
  for (const [key, entry] of memory) {
    if (!isFresh(entry)) continue;
    if (!target.startsWith(key)) continue;
    if (key.length < `${countryCode.toLowerCase()}|`.length + MIN_PREFIX_CHARS) continue;
    if (!best || key.length > best.key.length) best = { key, entry };
  }
  return best ? best.entry.predictions : null;
}

/** Test-only reset. */
export function __resetPlacesCache(): void {
  memory.clear();
  hydrated = false;
  hydrating = null;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}
