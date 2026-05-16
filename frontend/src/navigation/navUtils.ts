/**
 * navUtils.ts
 * Pure utilities for turn-by-turn navigation.
 * No external deps — just Google Directions API (called once per segment).
 */

export interface NavStep {
  instruction: string;   // cleaned plain text
  maneuver: string;      // e.g. "turn-left", "straight", "roundabout-right"
  distanceM: number;     // metres to end of this step
  durationSec: number;
  endLat: number;
  endLng: number;
  /** Polyline of just this step for off-route checks */
  stepCoords: Array<{ lat: number; lng: number }>;
}

export interface DirectionsResult {
  steps: NavStep[];
  /** Full overview polyline for the MapView */
  overviewCoords: Array<{ latitude: number; longitude: number }>;
  totalDistanceM: number;
  totalDurationSec: number;
  /** Present when `departure_time=now` returns traffic-aware leg duration (Google billing dependent). */
  totalDurationInTrafficSec?: number;
}

// ── Google polyline decoder ────────────────────────────────────────────────
export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  if (!encoded || typeof encoded !== 'string') return [];
  const coords: Array<{ lat: number; lng: number }> = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coords;
}

/** Minimum points to treat as a road path (Google never returns 2 for a real drive; 2 = chord). */
export const DIRECTIONS_ROUTE_MIN_POINTS = 3;

/**
 * Prefer merging per-step polylines (full road geometry); fall back to overview_polyline.
 */
export function directionsRouteToMapCoordinates(route: {
  legs?: Array<{ steps?: Array<{ polyline?: { points?: string } }> }>;
  overview_polyline?: { points?: string };
}): Array<{ latitude: number; longitude: number }> {
  const leg = route.legs?.[0];
  const merged: Array<{ lat: number; lng: number }> = [];
  if (leg?.steps && Array.isArray(leg.steps)) {
    for (const step of leg.steps) {
      const enc = step.polyline?.points;
      if (!enc) continue;
      const chunk = decodePolyline(enc);
      for (const c of chunk) {
        const prev = merged[merged.length - 1];
        if (!prev || prev.lat !== c.lat || prev.lng !== c.lng) merged.push(c);
      }
    }
  }
  if (merged.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
    return merged.map((c) => ({ latitude: c.lat, longitude: c.lng }));
  }
  const ov = route.overview_polyline?.points;
  if (ov) {
    const pts = decodePolyline(ov).map((c) => ({ latitude: c.lat, longitude: c.lng }));
    if (pts.length >= DIRECTIONS_ROUTE_MIN_POINTS) return pts;
  }
  return [];
}

// ── HTML instruction cleaner ───────────────────────────────────────────────
export function stripHtml(html: string): string {
  return html
    .replace(/<div[^>]*>/gi, '. ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')   // collapse double periods from div replacement
    .trim();
}

/**
 * Convert a Google Directions instruction to natural Nigerian-English voice text.
 * Handles roundabouts, U-turns, highway exits, and clean direction phrasing.
 */
export function toVoiceText(instruction: string): string {
  if (!instruction) return '';
  let t = instruction;
  // Normalize slash-separated road names: "A/B Road" → "A B Road"
  t = t.replace(/\//g, ' ');
  // Expand abbreviations common in Nigerian maps
  t = t.replace(/\bSt\b/g, 'Street');
  t = t.replace(/\bAve\b/g, 'Avenue');
  t = t.replace(/\bRd\b/g, 'Road');
  t = t.replace(/\bBlvd\b/g, 'Boulevard');
  t = t.replace(/\bJct\b/g, 'Junction');
  return t.trim();
}

// ── Haversine distance in metres ───────────────────────────────────────────
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Minimum distance from a point to any segment in a polyline ─────────────
export function minDistToPolylineM(
  lat: number, lng: number,
  coords: Array<{ lat: number; lng: number }>,
): number {
  if (coords.length === 0) return Infinity;
  if (coords.length === 1) return haversineM(lat, lng, coords[0].lat, coords[0].lng);
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = pointToSegmentM(lat, lng, coords[i], coords[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function pointToSegmentM(
  pLat: number, pLng: number,
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const ax = a.lng, ay = a.lat, bx = b.lng, by = b.lat, px = pLng, py = pLat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineM(pLat, pLng, a.lat, a.lng);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return haversineM(pLat, pLng, ay + t * dy, ax + t * dx);
}

// ── Format distance for voice & display ───────────────────────────────────
export function fmtDistanceVoice(m: number): string {
  if (m < 50) return `about ${Math.round(m / 10) * 10} meters`;
  if (m < 100) return `${Math.round(m / 10) * 10} meters`;
  if (m < 950) return `${Math.round(m / 50) * 50} meters`;
  const km = m / 1000;
  if (km < 1.1) return 'about 1 kilometer';
  return km < 2 ? `${km.toFixed(1)} kilometers` : `${Math.round(km)} kilometers`;
}

export function fmtDistanceDisplay(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ── Maneuver → rotation angle (degrees from up = 0) ───────────────────────
export function maneuverToRotation(maneuver: string): number {
  const map: Record<string, number> = {
    'straight': 0,
    'keep-straight': 0,
    'merge': 0,
    'continue': 0,
    'turn-slight-right': 35,
    'turn-right': 90,
    'turn-sharp-right': 140,
    'ramp-right': 50,
    'fork-right': 45,
    'roundabout-right': 90,
    'u-turn-right': 180,
    'turn-slight-left': -35,
    'turn-left': -90,
    'turn-sharp-left': -140,
    'ramp-left': -50,
    'fork-left': -45,
    'roundabout-left': -90,
    'u-turn-left': 180,
  };
  return map[maneuver] ?? 0;
}

// ── Maneuver → accent colour ───────────────────────────────────────────────
export function maneuverToColor(maneuver: string): string {
  if (maneuver.includes('left')) return '#34D399'; // mint / emerald — Nexryde lane cue
  if (maneuver.includes('right')) return '#f59e0b'; // amber
  if (maneuver.includes('u-turn')) return '#f87171'; // red
  if (maneuver.includes('roundabout')) return '#a78bfa'; // violet
  return '#22c55e'; // green straight / merge / continue
}

// ── Fetch one segment from Google Directions (called ONCE per segment) ─────
export async function fetchDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string,
): Promise<DirectionsResult | null> {
  try {
    const base =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${originLat},${originLng}` +
      `&destination=${destLat},${destLng}` +
      `&mode=driving` +
      `&key=${apiKey}`;

    const parse = (data: any): DirectionsResult | null => {
      if (data.status !== 'OK' || !data.routes?.[0]) return null;
      const route = data.routes[0];
      const leg = route.legs[0];

      const steps: NavStep[] = leg.steps.map((s: any) => ({
        instruction: toVoiceText(stripHtml(s.html_instructions)),
        maneuver: s.maneuver ?? 'straight',
        distanceM: s.distance?.value ?? 0,
        durationSec: s.duration?.value ?? 0,
        endLat: s.end_location.lat,
        endLng: s.end_location.lng,
        stepCoords: s.polyline?.points
          ? decodePolyline(s.polyline.points)
          : [
              { lat: s.start_location.lat, lng: s.start_location.lng },
              { lat: s.end_location.lat, lng: s.end_location.lng },
            ],
      }));

      const overviewCoords = decodePolyline(route.overview_polyline.points).map(
        (c) => ({ latitude: c.lat, longitude: c.lng }),
      );

      const dit = leg.duration_in_traffic?.value;
      return {
        steps,
        overviewCoords,
        totalDistanceM: leg.distance?.value ?? 0,
        totalDurationSec: leg.duration?.value ?? 0,
        ...(typeof dit === 'number' && dit > 0 ? { totalDurationInTrafficSec: dit } : {}),
      };
    };

    let res = await fetch(`${base}&departure_time=now`);
    let data = await res.json();
    let out = parse(data);
    if (!out && data?.status && data.status !== 'OK') {
      res = await fetch(base);
      data = await res.json();
      out = parse(data);
    }
    return out;
  } catch {
    return null;
  }
}

/** One overview polyline per returned route (primary + alternatives when requested). */
export type GoogleDrivingRouteOverview = {
  overview: Array<{ latitude: number; longitude: number }>;
  distanceM: number;
  /** Best-effort driving time from Directions (static duration). */
  durationSec: number;
  /** Present when `departure_time=now` returns traffic-aware leg duration. */
  durationInTrafficSec?: number;
};

/**
 * Google Directions API — returns road-snapped overview polylines.
 * Use `alternatives: true` for alternate paths (when supported).
 */
export async function fetchGoogleDrivingRoutes(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string,
  options?: { alternatives?: boolean },
): Promise<{ routes: GoogleDrivingRouteOverview[] } | null> {
  if (!apiKey) return null;

  const alt = options?.alternatives ? '&alternatives=true' : '';
  const base =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${originLat},${originLng}` +
    `&destination=${destLat},${destLng}` +
    `&mode=driving` +
    alt +
    `&key=${apiKey}`;

  const parse = (data: any): GoogleDrivingRouteOverview[] | null => {
    if (data.status !== 'OK' || !Array.isArray(data.routes) || data.routes.length === 0) {
      return null;
    }
    const routes: GoogleDrivingRouteOverview[] = data.routes.map((route: any) => {
      const leg = route.legs?.[0];
      const pts = directionsRouteToMapCoordinates(route);
      const dur = leg?.duration?.value ?? 0;
      const dit = leg?.duration_in_traffic?.value;
      return {
        overview: pts,
        distanceM: leg?.distance?.value ?? 0,
        durationSec: dur,
        ...(typeof dit === 'number' && dit > 0 ? { durationInTrafficSec: dit } : {}),
      };
    });
    return routes.filter((r) => r.overview.length >= 2);
  };

  try {
    // Prefer traffic-aware ETA when the key/billing supports it.
    let res = await fetch(`${base}&departure_time=now`);
    let data = await res.json();
    let parsed = parse(data);

    // Some keys reject departure_time=now (billing/restrictions) — retry without it; geometry is unchanged.
    if (!parsed && data?.status && data.status !== 'OK') {
      res = await fetch(base);
      data = await res.json();
      parsed = parse(data);
    }

    if (!parsed || parsed.length === 0) return null;
    const viable = parsed.filter((r) => r.overview.length >= DIRECTIONS_ROUTE_MIN_POINTS);
    if (viable.length > 0) return { routes: viable };
    // Sparse overview polyline still has valid leg distance/duration — needed for fare API.
    const r0 = parsed[0];
    if (
      typeof r0.distanceM === 'number' &&
      r0.distanceM >= 80 &&
      typeof r0.durationSec === 'number' &&
      r0.durationSec >= 10
    ) {
      return { routes: [r0] };
    }
    return null;
  } catch {
    return null;
  }
}
