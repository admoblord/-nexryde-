/**
 * Single source of truth for JWT lifecycle.
 * Only tokenStore + apiFetch/authedFetch may read or refresh tokens.
 */
import * as SecureStore from 'expo-secure-store';
import { publicFetch } from '@/src/utils/publicApi';

const ACCESS_KEY = 'auth_token';
const REFRESH_KEY = 'refresh_token';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

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

function tokenAgeSec(token: string): number | null {
  const exp = jwtExpSec(token);
  if (!exp) return null;
  return Math.max(0, exp - Math.floor(Date.now() / 1000));
}

/** Sync read of in-memory cache only — may be null until warmTokenCache/getValidToken. */
export function getCachedToken(): string | null {
  return accessToken;
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
  return forceRefresh();
}

export async function forceRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    console.log('[TOKEN_REFRESH_START]');
    try {
      const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!refresh) {
        console.log('[TOKEN_REFRESH_END]', { ok: false, reason: 'no_refresh_token' });
        return null;
      }

      try {
        const res = await publicFetch('/auth/refresh-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
          timeoutMs: 8000,
        }, 1);
        if (!res.ok) {
          console.log('[TOKEN_REFRESH_END]', { ok: false, status: res.status });
          return null;
        }
        const data = (await res.json()) as {
          access_token?: string;
          token?: string;
          refresh_token?: string;
        };
        const nextAccess = data.access_token || data.token;
        if (!nextAccess) {
          console.log('[TOKEN_REFRESH_END]', { ok: false, reason: 'empty_access' });
          return null;
        }
        await setTokens(nextAccess, data.refresh_token ?? refresh);
        console.log('[TOKEN_REFRESH_END]', {
          ok: true,
          ageSec: tokenAgeSec(nextAccess),
        });
        return nextAccess;
      } catch (e) {
        console.log('[TOKEN_REFRESH_END]', {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }
    } catch (e) {
      console.log('[TOKEN_REFRESH_END]', {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
