import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { fetchAuthed } from '@/src/utils/sessionRefresh';
import { debugSessionLog } from '@/src/utils/debugSessionLog';

export type RideRequestPayload = Record<string, unknown>;

export type RideRequestResult = {
  tripId: string | null;
  trip: Record<string, unknown> | null;
  eligibleDrivers: number;
};

/** Single attempt — server should respond quickly; rider sees inline error + Try Again. */
const TRIP_REQUEST_TIMEOUT_MS = 12_000;
const MAX_AUTO_RETRIES = 0;

function isTransientRequestError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('network') ||
    msg.includes('abort') ||
    msg.includes('failed to fetch')
  );
}

/** POST /trips/request with generous timeout for dispatch + fare lock. */
export async function postTripRequest(
  riderId: string,
  body: RideRequestPayload,
): Promise<{ response: Response; result: Record<string, unknown> }> {
  const res = await fetchAuthed(`${BACKEND_URL}/api/trips/request?rider_id=${riderId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
    timeoutMs: TRIP_REQUEST_TIMEOUT_MS,
  });
  const result = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { response: res, result };
}

export function parseTripRequestResult(result: Record<string, unknown>): RideRequestResult {
  const trip = (result.trip as Record<string, unknown> | undefined) ?? null;
  const tripId =
    (trip?.id as string | undefined) ||
    (result.trip_id as string | undefined) ||
    null;
  const eligible = Number(result.eligible_drivers ?? 0);
  return {
    tripId: tripId ? String(tripId) : null,
    trip,
    eligibleDrivers: Number.isFinite(eligible) ? eligible : 0,
  };
}

export async function requestRideWithRetry(
  riderId: string,
  body: RideRequestPayload,
  opts?: {
    maxRetries?: number;
    onRetry?: (attempt: number, message: string) => void;
  },
): Promise<RideRequestResult> {
  const maxRetries = opts?.maxRetries ?? MAX_AUTO_RETRIES;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = Date.now();
    debugSessionLog('rideRequestService.ts:attempt', 'trip_request_attempt', { attempt, maxRetries }, 'H-A');
    try {
      const { response, result } = await postTripRequest(riderId, body);
      if (response.ok && (result.trip || result.success)) {
        const parsed = parseTripRequestResult(result);
        debugSessionLog(
          'rideRequestService.ts:success',
          'trip_request_ok',
          {
            attempt,
            ms: Date.now() - t0,
            tripId: parsed.tripId,
            eligibleDrivers: parsed.eligibleDrivers,
            status: response.status,
          },
          'H-A',
        );
        return parsed;
      }
      const detail = String(result.detail || result.message || `HTTP ${response.status}`);
      debugSessionLog(
        'rideRequestService.ts:http_fail',
        'trip_request_http_error',
        { attempt, ms: Date.now() - t0, status: response.status, detail: detail.slice(0, 120) },
        'H-A',
      );
      throw new Error(detail);
    } catch (err) {
      lastError = err;
      const msg = String((err as Error)?.message || err || '');
      const transient = isTransientRequestError(err);
      debugSessionLog(
        'rideRequestService.ts:catch',
        'trip_request_catch',
        { attempt, ms: Date.now() - t0, transient, err: msg.slice(0, 120) },
        transient ? 'H-A' : 'H-B',
      );
      if (attempt >= maxRetries || !isTransientRequestError(err)) {
        throw err;
      }
      const delayMs = 2000 * (attempt + 1);
      opts?.onRetry?.(attempt + 1, `Reconnecting… (${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Ride request failed');
}
