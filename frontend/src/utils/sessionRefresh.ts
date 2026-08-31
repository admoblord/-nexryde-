import { BACKEND_URL } from '@/src/services/api';
import { forceRefresh, getCachedToken, getValidToken } from '@/src/lib/tokenStore';
import { useAppStore } from '@/src/store/appStore';

/** Default API cap — fail fast; a warm API should respond well under this. */
export const API_REQUEST_TIMEOUT_MS = 10000;

export type AuthedFetchOptions = RequestInit & {
  /** Override default timeout (e.g. trip request). */
  timeoutMs?: number;
  /**
   * InDrive/Uber pattern: return 401 to caller without logging out.
   * Use on driver accept/bid and other in-progress critical actions.
   */
  preserveSessionOn401?: boolean;
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
  const { ensureCriticalSessionReady } = await import('@/src/lib/sessionReadiness');
  await ensureCriticalSessionReady();
}

export async function ensureFreshAuthSession(): Promise<void> {
  const { ensureCriticalSessionReady } = await import('@/src/lib/sessionReadiness');
  await ensureCriticalSessionReady();
}

function callerAborted(signal: AbortSignal | null | undefined): boolean {
  return !!signal && signal.aborted;
}

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function requestHeaders(
  token: string | null,
  fetchInit: RequestInit,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(fetchInit.headers as Record<string, string> | undefined),
  };
  const method = String(fetchInit.method || 'GET').toUpperCase();
  const hasBody = fetchInit.body != null && fetchInit.body !== '';
  // GET/HEAD with Content-Type: application/json and no body makes some
  // intermediaries wait for a payload that never comes.
  if (
    hasBody &&
    method !== 'GET' &&
    method !== 'HEAD' &&
    !headers['Content-Type'] &&
    !headers['content-type']
  ) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
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
  const { timeoutMs = API_REQUEST_TIMEOUT_MS, preserveSessionOn401 = false, ...fetchInit } = options;
  const token = (await getValidToken()) ?? getCachedToken();
  if (callerAborted(fetchInit.signal)) throw abortError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const mergedSignal = fetchInit.signal;
  if (mergedSignal) {
    if (mergedSignal.aborted) controller.abort();
    else mergedSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
      headers: requestHeaders(token, fetchInit),
    });

    if (res.status === 401 && retry) {
      const path = url.replace(BACKEND_URL, '');
      console.log('[API_401_RETRY]', { path });
      const fresh = await forceRefresh();
      if (fresh) return authedFetch(url, options, false);
      if (!preserveSessionOn401) {
        try {
          await useAppStore.getState().logout();
        } catch {
          /* silent */
        }
        forceNavigateToLogin();
      }
    }

    return res;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      // Rider typed another character — not a 9s backend hang.
      if (callerAborted(mergedSignal)) throw abortError();
      throw new ApiTimeoutError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated Use authedFetch */
export const fetchAuthed = authedFetch;

/** Path-relative authenticated fetch against the configured API origin. */
export async function apiFetch(
  path: string,
  init: AuthedFetchOptions = {},
  retry = true,
): Promise<Response> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = normalized.startsWith('/api')
    ? `${BACKEND_URL}${normalized}`
    : `${BACKEND_URL}/api${normalized}`;
  return authedFetch(url, init, retry);
}
