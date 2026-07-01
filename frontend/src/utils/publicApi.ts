import { BACKEND_URL } from '@/src/services/api';
import { warmBackendWhileWaiting } from '@/src/utils/warmBackend';
import { ApiTimeoutError } from '@/src/utils/sessionRefresh';

/** Default auth cap for OTP/verify flows. */
export const AUTH_REQUEST_TIMEOUT_MS = 20000;
/** Login Continue — one cold-start window, then strategic retry. */
export const LOGIN_TIMEOUT_MS = 12000;
const AUTH_MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [500, 1500];

function buildUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.startsWith('/api')
    ? `${BACKEND_URL}${normalized}`
    : `${BACKEND_URL}/api${normalized}`;
}

function isRetryableError(e: unknown): boolean {
  if (e instanceof ApiTimeoutError) return true;
  if (e instanceof TypeError) return true;
  if (e instanceof Error && e.name === 'AbortError') return true;
  return false;
}

export function publicFetchErrorMessage(e: unknown): string {
  if (e instanceof ApiTimeoutError) {
    return 'Connection timed out. Check your network and try again.';
  }
  if (e instanceof TypeError) {
    return 'Unable to reach NexRyde servers. Check your connection.';
  }
  return 'Unable to sign you in right now. Please try again.';
}

/**
 * Unauthenticated fetch with timeout + retry on transient failures only.
 * Never triggers token refresh (no auth header required).
 */
export async function publicFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
  retries = AUTH_MAX_RETRIES,
): Promise<Response> {
  const url = buildUrl(path);
  const timeoutMs = init.timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS;
  const { timeoutMs: _omit, ...fetchInit } = init;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...fetchInit, signal: controller.signal });
      return res;
    } catch (e) {
      lastError = e instanceof Error && e.name === 'AbortError' ? new ApiTimeoutError() : e;
      if (attempt < retries && isRetryableError(lastError)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 1500));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export async function postPublicJson<T extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<{ res: Response; data: T }> {
  const res = await publicFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: opts.timeoutMs,
  }, opts.retries ?? AUTH_MAX_RETRIES);
  let data: T = {} as T;
  try {
    data = (await res.json()) as T;
  } catch {
    /* empty body */
  }
  return { res, data };
}

/**
 * Email login — retry on timeout OR server 5xx (Mongo wake / stale pool).
 */
export async function initiateEmailLogin(
  body: Record<string, unknown>,
): Promise<{ res: Response; data: Record<string, unknown> }> {
  const doCall = () =>
    publicFetch('/auth/email-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: LOGIN_TIMEOUT_MS,
    }, 0);

  const parse = async (res: Response) => {
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* empty body */
    }
    return { res, data };
  };

  let res: Response;
  try {
    res = await doCall();
  } catch (e) {
    if (!isRetryableError(e)) throw e;
    if (__DEV__) console.log('[LOGIN_TIMEOUT_RETRY]');
    warmBackendWhileWaiting();
    res = await doCall();
  }

  if (res.status >= 500) {
    if (__DEV__) console.log('[LOGIN_SERVER_RETRY]', res.status);
    warmBackendWhileWaiting();
    res = await doCall();
  }
  return parse(res);
}
