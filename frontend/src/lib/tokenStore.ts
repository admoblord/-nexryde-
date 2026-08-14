/**
 * Single source of truth for JWT lifecycle.
 * Only tokenStore + apiFetch/authedFetch may read or refresh tokens.
 */
import * as SecureStore from 'expo-secure-store';
import { publicFetch } from '@/src/utils/publicApi';

const ACCESS_KEY = 'auth_token';
const REFRESH_KEY = 'refresh_token';

let accessToken: string | null = null;
let refreshPromise: Promise<RefreshResult> | null = null;

/**
 * Why a refresh did not produce a token.
 *
 * `rejected` — the server actively refused the refresh token (401/403). The session
 * is genuinely dead and the user must sign in again.
 * `unavailable` — we never got an answer (offline, timeout, DNS, 5xx). The session
 * may be perfectly valid. Callers must NOT log the user out on this.
 */
export type RefreshOutcome = 'ok' | 'rejected' | 'unavailable';

export type RefreshResult = {
  token: string | null;
  outcome: RefreshOutcome;
};

function jwtExpSec(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = atob(padded + '='.repeat(padLen));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isExpired(token: string, skewSec = 30): boolean {
  const exp = jwtExpSec(token);
  if (!exp) return true;
  return Date.now() / 1000 >= exp - skewSec;
}

/** True when a non-empty JWT is present and not within expiry skew. */
export function isAccessTokenValid(token: string | null | undefined, skewSec = 30): boolean {
  return !!token && !isExpired(token, skewSec);
}

function tokenAgeSec(token: string): number | null {
  const exp = jwtExpSec(token);
  if (!exp) return null;
  return Math.max(0, exp - Math.floor(Date.now() / 1000));
}

/** Seconds until JWT exp (0 if expired/missing). */
export function getAccessTokenTtlSec(token?: string | null): number | null {
  const t = token ?? accessToken;
  if (!t) return null;
  const exp = jwtExpSec(t);
  if (!exp) return null;
  return Math.max(0, exp - Math.floor(Date.now() / 1000));
}

/** Sync read of in-memory cache only — may be null until warmTokenCache/getValidToken. */
export function getCachedToken(): string | null {
  return accessToken;
}

export async function hasStoredRefreshToken(): Promise<boolean> {
  try {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    return Boolean(refresh?.trim());
  } catch {
    return false;
  }
}

/** Read refresh token for native FGS (Android accept without JS). */
export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    return refresh?.trim() || null;
  } catch {
    return null;
  }
}

export async function setTokens(access: string, refresh?: string | null): Promise<void> {
  accessToken = access;
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  try {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Fire-and-forget at launch — never blocks UI. */
export async function warmTokenCache(): Promise<string | null> {
  console.log('[TOKEN_WARM_START]');
  try {
    accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
    console.log('[TOKEN_WARM_END]', { cached: !!accessToken });
  } catch {
    accessToken = null;
    console.log('[TOKEN_WARM_END]', { cached: false, error: true });
  }
  return accessToken;
}

export async function getValidToken(): Promise<string | null> {
  if (!accessToken) {
    try {
      accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
    } catch {
      accessToken = null;
    }
  }
  if (accessToken && !isExpired(accessToken)) return accessToken;

  const { token: refreshed } = await forceRefreshDetailed();
  if (refreshed) return refreshed;

  // Refresh can fail (no refresh token, offline) while the access JWT is still valid
  // on the server — client expiry skew is 30s ahead of real exp. Keep accepting rides
  // instead of sending unauthenticated PUTs that always 401.
  if (accessToken) {
    const exp = jwtExpSec(accessToken);
    if (exp && Date.now() / 1000 < exp) return accessToken;
  }
  return null;
}

/**
 * Refresh the access token and report WHY it failed.
 *
 * Drivers on weak Lagos data were being signed out mid-shift: a timed-out refresh
 * looked exactly like a revoked refresh token, so the 401 handlers wiped the
 * session. Only `rejected` may end a session.
 */
export async function forceRefreshDetailed(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<RefreshResult> => {
    console.log('[TOKEN_REFRESH_START]');
    try {
      let refresh: string | null = null;
      try {
        refresh = await SecureStore.getItemAsync(REFRESH_KEY);
      } catch (e) {
        // Keystore hiccup is not proof the session is gone.
        console.log('[TOKEN_REFRESH_END]', {
          ok: false,
          reason: 'refresh_read_failed',
          error: e instanceof Error ? e.message : String(e),
        });
        return { token: null, outcome: 'unavailable' };
      }
      if (!refresh) {
        console.log('[TOKEN_REFRESH_END]', { ok: false, reason: 'no_refresh_token' });
        return { token: null, outcome: 'rejected' };
      }

      try {
        const res = await publicFetch('/auth/refresh-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
          timeoutMs: 15000,
        }, 2);
        if (!res.ok) {
          const rejected = res.status === 401 || res.status === 403;
          console.log('[TOKEN_REFRESH_END]', {
            ok: false,
            status: res.status,
            outcome: rejected ? 'rejected' : 'unavailable',
          });
          return { token: null, outcome: rejected ? 'rejected' : 'unavailable' };
        }
        const data = (await res.json()) as {
          access_token?: string;
          token?: string;
          refresh_token?: string;
        };
        const nextAccess = data.access_token || data.token;
        if (!nextAccess) {
          console.log('[TOKEN_REFRESH_END]', { ok: false, reason: 'empty_access' });
          return { token: null, outcome: 'unavailable' };
        }
        await setTokens(nextAccess, data.refresh_token ?? refresh);
        console.log('[TOKEN_REFRESH_END]', {
          ok: true,
          ageSec: tokenAgeSec(nextAccess),
        });
        return { token: nextAccess, outcome: 'ok' };
      } catch (e) {
        console.log('[TOKEN_REFRESH_END]', {
          ok: false,
          outcome: 'unavailable',
          error: e instanceof Error ? e.message : String(e),
        });
        return { token: null, outcome: 'unavailable' };
      }
    } catch (e) {
      console.log('[TOKEN_REFRESH_END]', {
        ok: false,
        outcome: 'unavailable',
        error: e instanceof Error ? e.message : String(e),
      });
      return { token: null, outcome: 'unavailable' };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function forceRefresh(): Promise<string | null> {
  const { token } = await forceRefreshDetailed();
  return token;
}
