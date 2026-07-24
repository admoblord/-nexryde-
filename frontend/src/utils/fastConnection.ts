/**
 * Fast-connection helpers for Lagos mobile networks.
 * Tuned for: quick WS recovery, adaptive HTTP timeouts, GET coalescing.
 */
import { getPlatformConnectionSnapshot } from '@/src/services/platformConnectionManager';

/** Aggressive first reconnects, then exponential (Uber-style push recovery). */
export function wsReconnectDelayMs(attempt: number): number {
  const fast = [200, 400, 800, 1_600];
  if (attempt < fast.length) return fast[attempt];
  return Math.min(30_000, 1_000 * Math.pow(2, Math.min(attempt, 6)));
}

/** Shorter first retries when the link is already degraded. */
export function httpRetryBackoffMs(attempt: number): number {
  const snap = getPlatformConnectionSnapshot();
  const base =
    snap.state === 'DEGRADED' || snap.state === 'RECONNECTING' ? 250 : 400;
  return Math.min(12_000, base * Math.pow(2, attempt));
}

/**
 * Adaptive request timeout from recent latency / connection FSM.
 * Ride ops stay snappy when healthy; give more budget on slow links.
 */
export function adaptiveTimeoutMs(baseMs: number = 12_000): number {
  const snap = getPlatformConnectionSnapshot();
  if (snap.state === 'OFFLINE') return Math.min(baseMs, 4_000);
  if (snap.state === 'RECONNECTING') return Math.min(baseMs, 7_000);
  if (snap.state === 'DEGRADED') return Math.min(baseMs, 9_000);
  const latency = snap.lastLatencyMs;
  if (latency != null && latency > 2_000) {
    return Math.min(20_000, Math.max(baseMs, latency * 4));
  }
  return baseMs;
}

/** Coalesce identical in-flight GETs so screens don't stampede the API. */
const inflightGets = new Map<string, Promise<Response>>();

export function coalesceGetKey(method: string | undefined, url: string): string | null {
  const m = (method || 'GET').toUpperCase();
  if (m !== 'GET') return null;
  return `GET:${url}`;
}

export async function withGetCoalescing(
  key: string | null,
  run: () => Promise<Response>,
): Promise<Response> {
  if (!key) return run();
  const existing = inflightGets.get(key);
  if (existing) {
    const shared = await existing;
    return shared.clone();
  }
  const pending = run().finally(() => {
    inflightGets.delete(key);
  });
  inflightGets.set(key, pending);
  return pending;
}

/** Test helper */
export function __resetGetCoalescingForTests(): void {
  inflightGets.clear();
}
