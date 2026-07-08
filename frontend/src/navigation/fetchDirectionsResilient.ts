import {
  DIRECTIONS_ROUTE_MIN_POINTS,
  fetchDirections,
} from '@/src/navigation/navUtils';

export type ResilientRouteResult = {
  coords: Array<{ latitude: number; longitude: number }>;
  fromCache: boolean;
};

const routeCache = new Map<string, Array<{ latitude: number; longitude: number }>>();

const RETRY_DELAYS_MS = [0, 600, 1800];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRoadRoute(
  coords: Array<{ latitude: number; longitude: number }> | undefined | null,
): coords is Array<{ latitude: number; longitude: number }> {
  return Boolean(coords && coords.length >= DIRECTIONS_ROUTE_MIN_POINTS);
}

/**
 * Fetch a driving route with backoff retries, then last-good cache for the leg.
 * Never returns chord / fake geometry — null means show no line.
 */
export async function fetchDirectionsResilient(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string,
  cacheKey?: string,
): Promise<ResilientRouteResult | null> {
  for (const delayMs of RETRY_DELAYS_MS) {
    if (delayMs > 0) await sleep(delayMs);
    const dir = await fetchDirections(originLat, originLng, destLat, destLng, apiKey);
    if (isRoadRoute(dir?.overviewCoords)) {
      if (cacheKey) routeCache.set(cacheKey, dir!.overviewCoords);
      return { coords: dir!.overviewCoords, fromCache: false };
    }
  }

  if (cacheKey) {
    const cached = routeCache.get(cacheKey);
    if (isRoadRoute(cached)) {
      return { coords: cached, fromCache: true };
    }
  }

  return null;
}

/** Test helper — clear in-memory route cache between runs. */
export function clearDirectionsRouteCache(): void {
  routeCache.clear();
}
