/**
 * Unified HTTP layer — mandatory timeout, exponential backoff retry, offline awareness.
 * Prefer this over bare fetch() for all new code; migrate hot paths incrementally.
 */
import { getAuthHeaders } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import {
  adaptiveTimeoutMs,
  coalesceGetKey,
  httpRetryBackoffMs,
  withGetCoalescing,
} from '@/src/utils/fastConnection';
import {
  getPlatformConnectionSnapshot,
  reportPlatformConnectionSignal,
} from '@/src/services/platformConnectionManager';

export type NetworkRequestState = 'idle' | 'loading' | 'success' | 'error' | 'offline';

export type ManagedFetchOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  /** Use authedFetch (token refresh) instead of fetchWithTimeout + getAuthHeaders */
  authed?: boolean;
  /** Skip retry on 4xx (except 408/429) */
  retryOnClientError?: boolean;
  /** Disable GET in-flight coalescing (default: coalesce safe GETs) */
  coalesce?: boolean;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;

export async function isNetworkReachable(): Promise<boolean> {
  // Only hard OFFLINE blocks ride ops — DEGRADED / RECONNECTING stay operational.
  return getPlatformConnectionSnapshot().state !== 'OFFLINE';
}

function shouldRetry(status: number, attempt: number, max: number): boolean {
  if (attempt >= max) return false;
  if (status === 408 || status === 429 || status >= 500) return true;
  return false;
}

/**
 * Fetch with adaptive timeout + fast backoff + GET coalescing. Never hangs indefinitely.
 */
export async function managedFetch(
  url: string,
  options: ManagedFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs,
    retries = MAX_RETRIES,
    authed = false,
    retryOnClientError = false,
    coalesce = true,
    ...init
  } = options;

  const reachable = await isNetworkReachable();
  if (!reachable) {
    throw new Error('OFFLINE');
  }

  const effectiveTimeout = timeoutMs ?? adaptiveTimeoutMs(DEFAULT_TIMEOUT_MS);
  const coalesceKey =
    coalesce && !authed ? coalesceGetKey(init.method, url) : null;

  return withGetCoalescing(coalesceKey, async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = authed
          ? await authedFetch(url, {
              ...init,
              timeoutMs: effectiveTimeout,
            } as RequestInit & { timeoutMs?: number })
          : await fetchWithTimeout(url, {
              ...init,
              timeoutMs: effectiveTimeout,
              headers: { ...getAuthHeaders(), ...(init.headers as Record<string, string>) },
            });

        if (!res.ok) {
          const clientErr =
            res.status >= 400 &&
            res.status < 500 &&
            res.status !== 408 &&
            res.status !== 429;
          if (clientErr && !retryOnClientError) {
            return res;
          }
          if (!shouldRetry(res.status, attempt, retries)) {
            reportPlatformConnectionSignal('backend', false);
            return res;
          }
          lastError = new Error(`HTTP ${res.status}`);
          await sleep(httpRetryBackoffMs(attempt));
          continue;
        }
        reportPlatformConnectionSignal('backend', true);
        return res;
      } catch (err) {
        lastError = err;
        if (attempt >= retries) break;
        await sleep(httpRetryBackoffMs(attempt));
      }
    }
    reportPlatformConnectionSignal('backend', false);
    throw lastError instanceof Error ? lastError : new Error('Request failed');
  });
}

export async function managedJson<T>(
  url: string,
  options: ManagedFetchOptions = {},
): Promise<T> {
  const res = await managedFetch(url, options);
  return (await res.json()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
