/**
 * Local ETA and remaining distance, computed against the stored polyline.
 *
 * The server only refreshes ETA on its own cadence, and sends nothing at all on
 * some legs. A number that never moves reads as a broken screen even when it is
 * accurate, so the rider map recomputes between updates instead of waiting.
 *
 * This never calls Directions — it measures the polyline the app already has,
 * which keeps the trip inside the 3-Maps-calls budget.
 */
import { haversineMeters } from '@/src/services/smartPickupGps';

export type Pt = { latitude: number; longitude: number };

/** Typical Lagos city speed when we have no better signal. */
const DEFAULT_SPEED_KMH = 22;
const MIN_SPEED_KMH = 8;
const MAX_SPEED_KMH = 80;

function metres(a: Pt, b: Pt): number {
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

/** Index of the polyline vertex closest to `at`. */
export function nearestIndex(route: Pt[], at: Pt): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i += 1) {
    const d = metres(route[i], at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Metres left along `route` from the driver's position to the end. */
export function remainingRouteMeters(route: Pt[] | null | undefined, driver: Pt | null): number | null {
  if (!route || route.length < 2 || !driver) return null;
  const start = nearestIndex(route, driver);
  let total = metres(driver, route[start]);
  for (let i = start; i < route.length - 1; i += 1) {
    total += metres(route[i], route[i + 1]);
  }
  return Number.isFinite(total) ? total : null;
}

/** Straight-line metres — the honest fallback when there is no polyline for this leg. */
export function directMeters(from: Pt | null, to: Pt | null): number | null {
  if (!from || !to) return null;
  const d = metres(from, to);
  return Number.isFinite(d) ? d : null;
}

function clampSpeed(kmh?: number | null): number {
  const v = Number(kmh);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_SPEED_KMH;
  return Math.min(MAX_SPEED_KMH, Math.max(MIN_SPEED_KMH, v));
}

/** Seconds to cover `meters` at the driver's observed speed, or a city default. */
export function etaSecondsFor(meters: number | null, speedKmh?: number | null): number | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  const mps = (clampSpeed(speedKmh) * 1000) / 3600;
  return Math.max(0, Math.round(meters / mps));
}

/**
 * Best available ETA for the current leg.
 *
 * Prefers the server value; falls back to the polyline, then to a straight line
 * so the rider always sees a number that moves.
 */
export function resolveLegEta(opts: {
  serverEtaSeconds?: number | null;
  route?: Pt[] | null;
  driver?: Pt | null;
  target?: Pt | null;
  speedKmh?: number | null;
}): { etaSeconds: number | null; distanceMeters: number | null; source: 'server' | 'polyline' | 'direct' | 'none' } {
  const { serverEtaSeconds, route, driver, target, speedKmh } = opts;

  const alongRoute = remainingRouteMeters(route ?? null, driver ?? null);
  const straight = directMeters(driver ?? null, target ?? null);
  const distanceMeters = alongRoute ?? straight;

  if (serverEtaSeconds != null && Number.isFinite(serverEtaSeconds) && serverEtaSeconds > 0) {
    return { etaSeconds: Math.round(serverEtaSeconds), distanceMeters, source: 'server' };
  }
  if (alongRoute != null) {
    return { etaSeconds: etaSecondsFor(alongRoute, speedKmh), distanceMeters: alongRoute, source: 'polyline' };
  }
  if (straight != null) {
    // Straight line under-reads real driving distance; pad it rather than promise too much.
    const padded = straight * 1.3;
    return { etaSeconds: etaSecondsFor(padded, speedKmh), distanceMeters: straight, source: 'direct' };
  }
  return { etaSeconds: null, distanceMeters: null, source: 'none' };
}
