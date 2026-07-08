/**
 * Uber/Bolt-style session readiness for critical driver actions (accept trip, go online).
 *
 * - Proactive refresh before access token gets too short (15 min JWT → refresh at 5 min left).
 * - Never send unauthenticated requests on critical paths when a still-valid JWT exists.
 * - Shift keeper runs while driver is online so accept never hits a dead session mid-offer.
 */
import {
  forceRefresh,
  getAccessTokenTtlSec,
  getCachedToken,
  getValidToken,
  hasStoredRefreshToken,
  warmTokenCache,
} from '@/src/lib/tokenStore';

/** Minimum access-token TTL before we proactively rotate (Bolt/Uber headroom on 15m tokens). */
export const CRITICAL_ACTION_MIN_TTL_SEC = 300;

/** Background refresh cadence while driver shift is active. */
export const SHIFT_SESSION_KEEPER_INTERVAL_MS = 60_000;

export type CriticalSessionFailureReason =
  | 'no_token'
  | 'no_refresh_token'
  | 'refresh_failed'
  | 'expired';

export type CriticalSessionResult =
  | { ok: true; token: string; refreshed: boolean; ttlSec: number | null }
  | { ok: false; reason: CriticalSessionFailureReason };

function serverValidToken(token: string | null): boolean {
  if (!token) return false;
  const ttl = getAccessTokenTtlSec(token);
  return ttl != null && ttl > 0;
}

/**
 * Ensure the session can survive a critical mutation (accept trip, go online).
 * Refreshes early when TTL is low — do not wait for 401 on accept.
 */
export async function ensureCriticalSessionReady(
  minTtlSec = CRITICAL_ACTION_MIN_TTL_SEC,
): Promise<CriticalSessionResult> {
  await warmTokenCache();
  let token = getCachedToken() ?? (await getValidToken());
  let ttl = token ? getAccessTokenTtlSec(token) : null;
  let refreshed = false;

  const needsRefresh = !token || ttl == null || ttl < minTtlSec;
  if (needsRefresh) {
    const next = await forceRefresh();
    if (next) {
      token = next;
      ttl = getAccessTokenTtlSec(next);
      refreshed = true;
    } else {
      token = (await getValidToken()) ?? getCachedToken();
      ttl = token ? getAccessTokenTtlSec(token) : null;
    }
  }

  if (token && serverValidToken(token)) {
    return { ok: true, token, refreshed, ttlSec: ttl };
  }

  const hasRefresh = await hasStoredRefreshToken();
  if (!token) {
    return { ok: false, reason: hasRefresh ? 'refresh_failed' : 'no_token' };
  }
  if (!hasRefresh) {
    return { ok: false, reason: 'no_refresh_token' };
  }
  return { ok: false, reason: 'expired' };
}

/** Human copy for driver-facing alerts. */
export function criticalSessionFailureMessage(reason: CriticalSessionFailureReason): string {
  switch (reason) {
    case 'no_refresh_token':
      return 'Your session needs a quick re-login to accept rides reliably. Please sign in again.';
    case 'refresh_failed':
      return 'Could not refresh your session. Check connection and sign in again if this continues.';
    case 'expired':
      return 'Session expired. Sign in again to accept rides.';
    default:
      return 'Please sign in again to continue.';
  }
}
