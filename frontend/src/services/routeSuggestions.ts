/**
 * Bolt-style Route suggestions: saved → recent → Google Places,
 * distance-sorted within each group.
 */
import { haversineMeters } from '@/src/services/smartPickupGps';
import {
  loadRiderSavedPlaces,
  RIDER_SAVED_SLOT_META,
  type RiderSavedPlace,
  type RiderSavedSlot,
} from '@/src/services/riderSavedPlaces';
import { getRecentLocations } from '@/src/services/offlineMode';
import { queryClient } from '@/src/providers/QueryProvider';
import { qk } from '@/src/services/queryKeys';
import { tabCacheGet } from '@/src/services/tabDataCache';

function peekSavedPlaces(userId: string): RiderSavedPlace[] {
  const fromQ = queryClient.getQueryData<RiderSavedPlace[]>(qk.riderSavedPlaces(userId));
  if (Array.isArray(fromQ) && fromQ.length) return fromQ;
  const fromTab = tabCacheGet<RiderSavedPlace[]>(`rider-saved:${userId}`);
  return Array.isArray(fromTab) ? fromTab : [];
}

export type RouteSuggestionKind = 'saved' | 'recent' | 'places';

export type RouteSuggestion = {
  id: string;
  kind: RouteSuggestionKind;
  title: string;
  subtitle: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  distanceLabel?: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  slot?: RiderSavedSlot;
  sessionToken?: string;
};

export function formatDistanceKm(meters: number | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  const km = meters / 1000;
  if (km < 1) return '<1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function distanceFromOrigin(
  origin: { lat: number; lng: number } | null | undefined,
  lat?: number,
  lng?: number,
): { meters?: number; label?: string } {
  if (
    !origin ||
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return {};
  }
  const meters = haversineMeters(origin.lat, origin.lng, lat, lng);
  return { meters, label: formatDistanceKm(meters) };
}

/** Highlight matched query substring in green segments. */
export function splitHighlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const q = query.trim();
  if (!q || !text) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const qi = lower.indexOf(q.toLowerCase());
  if (qi < 0) return [{ text, hit: false }];
  const parts: Array<{ text: string; hit: boolean }> = [];
  if (qi > 0) parts.push({ text: text.slice(0, qi), hit: false });
  parts.push({ text: text.slice(qi, qi + q.length), hit: true });
  if (qi + q.length < text.length) parts.push({ text: text.slice(qi + q.length), hit: false });
  return parts;
}

function iconForPlace(title: string, subtitle: string): RouteSuggestion['icon'] {
  const hay = `${title} ${subtitle}`.toLowerCase();
  if (hay.includes('airport') || hay.includes('murtala')) return 'airplane';
  if (hay.includes('hospital') || hay.includes('clinic')) return 'medkit';
  if (hay.includes('school') || hay.includes('university') || hay.includes('college')) return 'school';
  if (hay.includes('bus') || hay.includes('park') || hay.includes('terminal')) return 'bus';
  if (hay.includes('mall') || hay.includes('shop') || hay.includes('market') || hay.includes('store'))
    return 'storefront';
  if (hay.includes('church') || hay.includes('mosque')) return 'business';
  if (hay.includes('hotel') || hay.includes('resort')) return 'bed';
  return 'location';
}

export async function loadIdleRouteSuggestions(
  userId: string | undefined,
  origin: { lat: number; lng: number } | null,
): Promise<RouteSuggestion[]> {
  const out: RouteSuggestion[] = [];

  if (userId) {
    const saved = peekSavedPlaces(userId);
    const fresh = saved.length ? saved : await loadRiderSavedPlaces(userId);
    const mapped = fresh
      .map((p: RiderSavedPlace) => {
        const meta = RIDER_SAVED_SLOT_META[p.slot];
        const d = distanceFromOrigin(origin, p.lat, p.lng);
        return {
          id: `saved:${p.slot}`,
          kind: 'saved' as const,
          title: meta.label,
          subtitle: p.address,
          lat: p.lat,
          lng: p.lng,
          distanceKm: d.meters != null ? d.meters / 1000 : undefined,
          distanceLabel: d.label,
          icon: meta.icon,
          slot: p.slot,
        };
      })
      .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    out.push(...mapped);
  }

  const recentRaw = await getRecentLocations();
  const recent: RouteSuggestion[] = [];
  const seen = new Set(out.map((s) => s.subtitle.toLowerCase()));
  for (const row of recentRaw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const title = String(o.description || o.address || o.name || '').trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    const d = distanceFromOrigin(
      origin,
      Number.isFinite(lat) ? lat : undefined,
      Number.isFinite(lng) ? lng : undefined,
    );
    recent.push({
      id: `recent:${key}`,
      kind: 'recent',
      title: title.split(',')[0]?.trim() || title,
      subtitle: title,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      distanceKm: d.meters != null ? d.meters / 1000 : undefined,
      distanceLabel: d.label,
      icon: 'time',
    });
  }
  recent.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  out.push(...recent.slice(0, 12));
  return out;
}

export function mapPlacesPredictions(
  predictions: Array<Record<string, unknown>>,
  query: string,
  origin: { lat: number; lng: number } | null,
  sessionToken?: string,
): RouteSuggestion[] {
  const rows = predictions.map((p, index) => {
    const title = String(
      (p.structured_formatting as { main_text?: string } | undefined)?.main_text ||
        p.main_text ||
        p.description ||
        'Place',
    ).trim();
    const subtitle = String(
      (p.structured_formatting as { secondary_text?: string } | undefined)?.secondary_text ||
        p.secondary_text ||
        p.description ||
        '',
    ).trim();
    const lat = Number(p.lat ?? p.latitude);
    const lng = Number(p.lng ?? p.longitude);
    const d = distanceFromOrigin(
      origin,
      Number.isFinite(lat) ? lat : undefined,
      Number.isFinite(lng) ? lng : undefined,
    );
    return {
      id: String(p.place_id || `places-${index}`),
      kind: 'places' as const,
      title,
      subtitle: subtitle || title,
      placeId: typeof p.place_id === 'string' ? p.place_id : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      distanceKm: d.meters != null ? d.meters / 1000 : undefined,
      distanceLabel: d.label,
      icon: iconForPlace(title, subtitle),
      sessionToken,
      _q: query,
    };
  });
  // Keep Google rank. Sorting by missing GPS distance buried real addresses
  // under "near you" landmarks that happened to include lat/lng.
  return rows.map(({ _q: _omit, ...rest }) => rest);
}

export function mergeRouteSuggestions(
  idle: RouteSuggestion[],
  places: RouteSuggestion[],
  query: string,
): RouteSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return idle;
  const filterIdle = idle.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.subtitle.toLowerCase().includes(q),
  );
  // Ordering: saved → recent → places (already distance-sorted within groups)
  const saved = filterIdle.filter((s) => s.kind === 'saved');
  const recent = filterIdle.filter((s) => s.kind === 'recent');
  const seen = new Set([...saved, ...recent].map((s) => s.subtitle.toLowerCase()));
  const placesDedup = places.filter((s) => !seen.has(s.subtitle.toLowerCase()));
  // Typed query → real Places first, then matching saved/recent.
  return [...placesDedup, ...saved, ...recent];
}
