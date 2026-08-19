/**
 * Shared pickup/destination place search.
 * Always authenticated. Google rank first — never "nearby landmarks only".
 */
import { BACKEND_URL } from '@/src/services/api';
import { ApiTimeoutError, authedFetch } from '@/src/utils/sessionRefresh';
import {
  getPlatformConnectionSnapshot,
  isHardOffline,
} from '@/src/services/platformConnectionManager';
import {
  hydratePlacesCache,
  readPlacesCache,
  readPlacesCachePrefix,
  writePlacesCache,
} from '@/src/services/placesCache';

/**
 * One request's cap. A cold Google lookup behind our cache is ~1.5s, so 9s is
 * generous; 20s just meant the rider stared at a spinner.
 */
export const PLACES_SEARCH_TIMEOUT_MS = 9000;

/**
 * Hard ceiling for the whole search, including the token step.
 *
 * authedFetch awaits getValidToken() *before* it arms its own timer, and an
 * expired token sends that through forceRefresh() → publicFetch(8s, 1 retry).
 * A stalled network could therefore burn ~17s on the token, ~20s on the request,
 * and the same again on retry — around 37s per keystroke — before the rider was
 * told their internet was down. Nothing may exceed this deadline.
 */
export const PLACES_TOTAL_DEADLINE_MS = 12000;

/** Why a search produced nothing, in words a bug report can use. */
export type PlacesFailureKind =
  | 'timeout'
  | 'no_network'
  | 'unreachable'
  | 'dns'
  | 'tls'
  | 'http'
  | 'auth'
  | 'unknown';

export type PlacesFailure = {
  kind: PlacesFailureKind;
  /** Verbatim error name/message or HTTP status — safe to show and to screenshot. */
  detail: string;
};

class PlacesDeadlineError extends Error {
  constructor() {
    super('places_deadline');
    this.name = 'PlacesDeadlineError';
  }
}

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PlacesDeadlineError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Name the real failure. "No internet connection" is only correct when the
 * device actually reports no connectivity — never as a catch-all.
 */
export function classifyPlacesFailure(err: unknown): PlacesFailure {
  const name = (err as { name?: string } | null)?.name || '';
  const raw = String((err as { message?: string } | null)?.message || err || '').trim();
  const lower = raw.toLowerCase();

  if (getPlatformConnectionSnapshot().internetReachable === false) {
    return { kind: 'no_network', detail: raw || 'device reports no connectivity' };
  }
  if (name === 'ApiTimeoutError' || name === 'PlacesDeadlineError' || lower.includes('timeout')
    || lower.includes('timed out') || name === 'AbortError') {
    return { kind: 'timeout', detail: raw || name || 'request timed out' };
  }
  if (lower.includes('getaddrinfo') || lower.includes('enotfound') || lower.includes('dns')
    || lower.includes('hostname')) {
    return { kind: 'dns', detail: raw };
  }
  if (lower.includes('ssl') || lower.includes('tls') || lower.includes('certificate')
    || lower.includes('trust anchor')) {
    return { kind: 'tls', detail: raw };
  }
  if (lower.includes('network request failed') || lower.includes('econnrefused')
    || lower.includes('econnreset') || lower.includes('unreachable')
    || lower.includes('connection') || lower.includes('socket')) {
    return { kind: 'unreachable', detail: raw || 'connection failed' };
  }
  return { kind: 'unknown', detail: raw || name || 'unknown error' };
}

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
  /** Rows came from the on-device last-good cache, not this request. */
  fromCache?: boolean;
  /** Backend confirmed Google genuinely has no match for this query. */
  emptyConfirmed?: boolean;
  /** The request never reached the backend (dead Wi-Fi, no data, timeout). */
  offline?: boolean;
  /** What actually went wrong, for the UI and for a bug report. */
  failure?: PlacesFailure;
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

export function typedQueryTokens(input: string): string[] {
  return String(input || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** True when at least one prediction mentions a typed token (Peace / garden / Estate). */
export function predictionsMatchTypedQuery(
  predictions: PlacesPrediction[],
  input: string,
): boolean {
  const tokens = typedQueryTokens(input);
  if (!tokens.length) return predictions.length > 0;
  return predictions.some((p) => {
    const hay = `${p.description} ${p.main_text || ''} ${p.secondary_text || ''}`.toLowerCase();
    return tokens.some((t) => hay.includes(t));
  });
}

type RawAutocomplete = PlacesSearchResult & { biasRetried: boolean };

async function fetchAutocomplete(url: string): Promise<RawAutocomplete> {
  const res = await authedFetch(url, {
    method: 'GET',
    preserveSessionOn401: true,
    timeoutMs: PLACES_SEARCH_TIMEOUT_MS,
  });
  const data = await res.json().catch(() => ({}));
  const predictions = normalizePredictions((data as { predictions?: unknown }).predictions);
  const status = String((data as { status?: string }).status || (res.ok ? 'OK' : 'ERROR'));
  const error = String((data as { error_message?: string; detail?: string }).error_message
    || (data as { detail?: string }).detail
    || (!res.ok ? `http_${res.status}` : '') || '');
  return {
    predictions,
    status: predictions.length ? 'OK' : status,
    httpStatus: res.status,
    error,
    biasRetried: (data as { bias_retried?: boolean }).bias_retried === true,
    // Only a clean 200/OK with no rows means Google really has no match.
    emptyConfirmed: res.ok && status === 'OK' && predictions.length === 0,
  };
}

const RETRY_DELAY_MS = 500;

/**
 * One quick retry for a dropped request.
 *
 * A single lost packet on a Lagos network used to end the search: the screen
 * said "Could not reach address search" and nothing tried again until the rider
 * typed another character. A timeout is not retried — 9s of waiting is already
 * more than enough, and the 12s ceiling around the whole search would just fire.
 */
async function fetchAutocompleteWithRetry(url: string): Promise<RawAutocomplete> {
  try {
    return await fetchAutocomplete(url);
  } catch (err) {
    if (
      err instanceof ApiTimeoutError
      || err instanceof PlacesDeadlineError
      || isHardOffline()
    ) {
      throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchAutocomplete(url);
  }
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

  void hydratePlacesCache();

  let result: RawAutocomplete | null = null;
  let failure: PlacesFailure | undefined;
  try {
    result = await withDeadline(fetchAutocompleteWithRetry(biased), PLACES_TOTAL_DEADLINE_MS);
    // Bias / wrong GPS must never hide a real Nigerian address. Newer backends
    // already retry unbiased and say so, which saves a round trip.
    const needUnbiased =
      hasOrigin &&
      !result.biasRetried &&
      (result.predictions.length === 0 || !predictionsMatchTypedQuery(result.predictions, q));
    if (needUnbiased) {
      try {
        const unbiased = await fetchAutocomplete(base);
        if (
          unbiased.predictions.length &&
          (result.predictions.length === 0 || predictionsMatchTypedQuery(unbiased.predictions, q))
        ) {
          result = unbiased;
        }
      } catch {
        // A failed second opinion must not throw away the first one.
      }
    }
  } catch (err) {
    result = null;
    // Read-only with respect to the connectivity FSM on purpose — search must
    // not be able to push the whole app into a degraded state.
    failure = classifyPlacesFailure(err);
    console.log('[places] search failed', failure.kind, failure.detail);
  }

  if (result?.predictions.length) {
    writePlacesCache(q, country, result.predictions);
    return result;
  }

  // The request failed or came back degraded. Show the last good answer for this
  // query (or the longest prefix already answered) instead of an empty state.
  if (!result?.emptyConfirmed) {
    await hydratePlacesCache();
    const cached = readPlacesCache(q, country) || readPlacesCachePrefix(q, country);
    if (cached?.length) {
      return {
        predictions: cached,
        status: 'OK',
        httpStatus: result?.httpStatus ?? 0,
        error: result?.error,
        fromCache: true,
        // Cache is not proof the device is offline — only NetInfo saying so is.
        offline: failure?.kind === 'no_network',
        failure,
      };
    }
  }

  if (result) {
    // Reached the backend but got nothing usable — report the HTTP truth.
    return {
      ...result,
      failure:
        result.httpStatus === 401
          ? { kind: 'auth', detail: 'HTTP 401 from /api/places/autocomplete' }
          : result.emptyConfirmed
            ? undefined
            : {
                kind: 'http',
                detail: `HTTP ${result.httpStatus} ${result.status}${result.error ? ` — ${result.error}` : ''}`,
              },
    };
  }

  const resolved = failure ?? { kind: 'unknown' as PlacesFailureKind, detail: 'no response' };
  return {
    predictions: [],
    status: 'UNAVAILABLE',
    httpStatus: 0,
    error: resolved.detail,
    // Only a device that reports no connectivity is "offline".
    offline: resolved.kind === 'no_network',
    failure: resolved,
  };
}
