/** Last normalized driver info from live tracking — enriches share-trip offline fallback. */
let cached: Record<string, unknown> | null = null;

export function setTripDriverCache(info: Record<string, unknown> | null | undefined) {
  cached = info && Object.keys(info).length > 0 ? info : null;
}

export function getTripDriverCache(): Record<string, unknown> | null {
  return cached;
}

export function clearTripDriverCache() {
  cached = null;
}
