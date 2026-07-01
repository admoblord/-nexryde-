import { BACKEND_URL } from '@/src/services/api';
import { forceRefresh, getValidToken } from '@/src/lib/tokenStore';
import { useAppStore } from '@/src/store/appStore';

/** Default API cap — fail fast; warm Cloud Run should respond well under this. */
export const API_REQUEST_TIMEOUT_MS = 10000;

export type AuthedFetchOptions = RequestInit & {
  /** Override default timeout (e.g. trip request). */
  timeoutMs?: number;
};

export class ApiTimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'ApiTimeoutError';
  }
}

let _navigateToLogin: (() => void) | null = null;

export function registerLoginNavigator(fn: () => void) {
  _navigateToLogin = fn;
}

function forceNavigateToLogin() {
  try {
    _navigateToLogin?.();
  } catch {
    /* silent */
  }
}

export function isAuthTokenFailure(detail: unknown): boolean {
  const text = String(detail ?? '').toLowerCase();
  return (
    text.includes('token expired') ||
    text.includes('invalid token') ||
    text.includes('token expired or invalid') ||
    text.includes('authentication required') ||
    text.includes('session expired')
  );
}

/** @deprecated Use getValidToken from tokenStore */
export function tokenNeedsRefresh(_token: string | null | undefined): boolean {
  return false;
}

/** @deprecated Use forceRefresh from tokenStore */
export async function refreshAuthToken(): Promise<boolean> {
  const token = await forceRefresh();
  return !!token;
}

/** Fire-and-forget on foreground — warms cache via first api call path. */
export async function proactiveTokenRefresh(): Promise<void> {
  await getValidToken();
}

export async function ensureFreshAuthSession(): Promise<void> {
  await getValidToken();
}

/**
 * Authenticated fetch — token loaded/refreshed transparently by tokenStore.
 * 401 retries once after refresh; timeouts/network errors fail immediately (no retry).
 */
export async function authedFetch(
  url: string,
  options: AuthedFetchOptions = {},
  retry = true,
): Promise<Response> {
  const { timeoutMs = API_REQUEST_TIMEOUT_MS, ...fetchInit } = options;
  const token = await getValidToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const mergedSignal = fetchInit.signal;
  if (mergedSignal) {
    mergedSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchInit.headers as Record<string, string> | undefined),
      },
    });

    if (res.status === 401 && retry) {
      const path = url.replace(BACKEND_URL, '');
      console.log('[API_401_RETRY]', { path });
      const fresh = await forceRefresh();
      if (fresh) return authedFetch(url, options, false);
      try {
        await useAppStore.getState().logout();
      } catch {
        /* silent */
      }
      forceNavigateToLogin();
    }

    return res;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiTimeoutError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated Use authedFetch */
export const fetchAuthed = authedFetch;

/** Path-relative authenticated fetch against Cloud Run API. */
export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = normalized.startsWith('/api')
    ? `${BACKEND_URL}${normalized}`
    : `${BACKEND_URL}/api${normalized}`;
  return authedFetch(url, init, retry);
}
