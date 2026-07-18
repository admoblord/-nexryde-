/**
 * Uber-style online/offline coordinator helpers for NexRyde.
 *
 * Extends the existing driverSessionStore + PUT /api/drivers/{id}/online —
 * does NOT introduce a second DriverStatusContext or /api/v1 surface.
 */
export const GO_ONLINE_MAX_ATTEMPTS = 2;
export const GO_ONLINE_BASE_BACKOFF_MS = 400;
export const GO_ONLINE_MAX_BACKOFF_MS = 1_200;
/** Per-attempt HTTP timeout — keep wall-clock under GO_ONLINE_TIMEOUT_MS (10s). */
export const GO_ONLINE_ATTEMPT_TIMEOUT_MS = 4_000;

/** Idempotency key for a single user-initiated status change. */
export function createStatusRequestId(intent: 'online' | 'offline'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${intent}_${Date.now()}_${rand}`;
}

/** Exponential backoff with ±10% jitter (industry standard). */
export function statusBackoffMs(attemptIndex: number): number {
  const exp = Math.min(
    GO_ONLINE_MAX_BACKOFF_MS,
    GO_ONLINE_BASE_BACKOFF_MS * 2 ** Math.max(0, attemptIndex),
  );
  const jitter = exp * 0.1 * (Math.random() * 2 - 1);
  return Math.max(200, Math.round(exp + jitter));
}

export function isRetryableOnlineStatus(status: number | null): boolean {
  if (status == null) return true; // network / abort
  return status === 408 || status === 429 || status >= 500;
}

export type OnlineToggleQuery = {
  driverId: string;
  isOnline: boolean;
  lat?: number | null;
  lng?: number | null;
  requestId: string;
};

export function buildOnlineToggleUrl(baseUrl: string, q: OnlineToggleQuery): string {
  const qs = new URLSearchParams({
    is_online: String(q.isOnline),
    request_id: q.requestId,
  });
  if (q.lat != null && q.lng != null && Number.isFinite(q.lat) && Number.isFinite(q.lng)) {
    qs.set('lat', String(q.lat));
    qs.set('lng', String(q.lng));
  }
  return `${baseUrl.replace(/\/$/, '')}/api/drivers/${encodeURIComponent(q.driverId)}/online?${qs}`;
}

/** Map proposal labels → existing NexRyde session phases (documentation + tests). */
export const PROPOSAL_TO_NEXRYDE_STATE = {
  OFFLINE: 'offline',
  TRANSITIONING_ONLINE: 'connecting',
  ONLINE: 'confirmed',
  TRANSITIONING_OFFLINE: 'confirmed+optimisticOffline',
  RECONNECTING: 'reconnecting',
  ERROR: 'connecting(retries)',
  CRITICAL_ERROR: 'offline+toast(tap GO)',
} as const;
