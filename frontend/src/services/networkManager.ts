/**
 * Unified HTTP layer — mandatory timeout, exponential backoff retry, offline awareness.
 * Prefer this over bare fetch() for all new code; migrate hot paths incrementally.
 */
import NetInfo from '@react-native-community/netinfo';
import { getAuthHeaders } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
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
};

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;

function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * Math.pow(2, attempt));
}

export async function isNetworkReachable(): Promise<boolean> {
  const platform = getPlatformConnectionSnapshot();
  if (platform.state !== 'OFFLINE') return true;
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

function shouldRetry(status: number, attempt: number, max: number): boolean {
  if (attempt >= max) return false;
  if (status === 408 || status === 429 || status >= 500) return true;
  return false;
}

/**
 * Fetch with timeout + exponential backoff. Never hangs indefinitely.
 */
export async function managedFetch(
  url: string,
  options: ManagedFetchOptions = {},
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = MAX_RETRIES,
    authed = false,
    retryOnClientError = false,
    ...init
  } = options;

  const reachable = await isNetworkReachable();
  if (!reachable) {
    throw new Error('OFFLINE');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = authed
        ? await authedFetch(url, { ...init, timeoutMs } as RequestInit & { timeoutMs?: number })
        : await fetchWithTimeout(url, {
            ...init,
            timeoutMs,
            headers: { ...getAuthHeaders(), ...(init.headers as Record<string, string>) },
          });

      if (!res.ok) {
        reportPlatformConnectionSignal('backend', res.status < 500);
        if (!retryOnClientError && res.status >= 400 && res.status < 500) {
          if (!shouldRetry(res.status, attempt, retries)) return res;
        } else if (!shouldRetry(res.status, attempt, retries)) {
          return res;
        }
        lastError = new Error(`HTTP ${res.status}`);
        await sleep(backoffMs(attempt));
        continue;
      }
      reportPlatformConnectionSignal('backend', true);
      return res;
    } catch (err) {
      lastError = err;
      reportPlatformConnectionSignal('backend', false);
      if (attempt >= retries) break;
      await sleep(backoffMs(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
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
