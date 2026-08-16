/**
 * Shared pickup/destination place search.
 * Always authenticated. Google rank first — never "nearby landmarks only".
 */
import { BACKEND_URL } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';

export type PlacesPrediction = {
  place_id: string;
  description: string;
  main_text?: string;
  secondary_text?: string;
  lat?: number;
  lng?: number;
  source?: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};

export type PlacesSearchResult = {
  predictions: PlacesPrediction[];
  status: string;
  httpStatus: number;
  error?: string;
};

function normalizePredictions(raw: unknown): PlacesPrediction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p, index) => {
      const row = (p || {}) as Record<string, unknown>;
      const sf = (row.structured_formatting || {}) as Record<string, unknown>;
      const main = String(sf.main_text || row.main_text || row.description || '').trim();
      const secondary = String(sf.secondary_text || row.secondary_text || '').trim();
      const description = String(row.description || [main, secondary].filter(Boolean).join(', ')).trim();
      const placeId = String(row.place_id || row.placeId || `pred-${index}`).trim();
      const lat = Number(row.lat ?? row.latitude);
      const lng = Number(row.lng ?? row.longitude);
      return {
        place_id: placeId,
        description: description || main || 'Place',
        main_text: main || description || 'Place',
        secondary_text: secondary,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        source: typeof row.source === 'string' ? row.source : undefined,
        structured_formatting: {
          main_text: main || description || 'Place',
          secondary_text: secondary,
        },
      };
    })
    .filter((p) => p.description);
}

async function fetchAutocomplete(url: string): Promise<PlacesSearchResult> {
  const res = await authedFetch(url, { method: 'GET', preserveSessionOn401: true });
  const data = await res.json().catch(() => ({}));
  const predictions = normalizePredictions((data as { predictions?: unknown }).predictions);
  const status = String((data as { status?: string }).status || (res.ok ? 'OK' : 'ERROR'));
  const error = String((data as { error_message?: string; detail?: string }).error_message
    || (data as { detail?: string }).detail
    || (!res.ok ? `http_${res.status}` : '') || '');
  return { predictions, status: predictions.length ? 'OK' : status, httpStatus: res.status, error };
}

export async function searchPlacesAutocomplete(
  input: string,
  opts?: {
    origin?: { lat: number; lng: number } | null;
    sessionToken?: string;
    countryCode?: string;
  },
): Promise<PlacesSearchResult> {
  const q = input.trim();
  if (q.length < 3) {
    return { predictions: [], status: 'OK', httpStatus: 200 };
  }
  const country = (opts?.countryCode || 'ng').toLowerCase();
  const session = opts?.sessionToken ? `&sessiontoken=${encodeURIComponent(opts.sessionToken)}` : '';
  const origin = opts?.origin;
  const hasOrigin =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
    && !(Math.abs(origin.lat) < 1e-5 && Math.abs(origin.lng) < 1e-5);

  const base = `${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(q)}&components=country:${country}${session}`;
  const biased = hasOrigin
    ? `${base}&location_bias=${encodeURIComponent(`${origin!.lat},${origin!.lng}`)}&radius=45000`
    : base;

  let result = await fetchAutocomplete(biased);
  // Bias must never hide a real Nigerian address (Sangotedo estate from a VI pin).
  if (result.predictions.length === 0 && hasOrigin) {
    const unbiased = await fetchAutocomplete(base);
    if (unbiased.predictions.length) result = unbiased;
  }
  return result;
}
