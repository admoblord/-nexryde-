/**
 * Offline action queue.
 *
 * Stores failed API requests to persistent storage and replays them in order
 * when connectivity is restored. Used for ride requests and trip status updates
 * so no action is silently dropped during a network blip.
 *
 * Design:
 *  - Entries written to AsyncStorage as a JSON array under QUEUE_KEY.
 *  - `enqueue(entry)` appends; `flush()` replays oldest-first with retry.
 *  - Max 20 queued entries to prevent runaway growth (oldest dropped on overflow).
 *  - Each entry has a `maxRetries` field; stale entries are discarded.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@nexryde_offline_queue';
const MAX_QUEUE_SIZE = 20;

export type QueuedAction = {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  /** Epoch ms when the action was queued */
  queuedAt: number;
  /** Max total retries before discarding */
  maxRetries: number;
  /** Retry count so far */
  retries: number;
  /** Human-readable label for debugging */
  label: string;
};

async function _load(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

async function _save(queue: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* best-effort */
  }
}

/** Add a queued action. Trims oldest entries if queue exceeds MAX_QUEUE_SIZE. */
export async function enqueue(entry: Omit<QueuedAction, 'retries'>): Promise<void> {
  const queue = await _load();
  queue.push({ ...entry, retries: 0 });
  // Keep most recent MAX_QUEUE_SIZE entries
  const trimmed = queue.slice(-MAX_QUEUE_SIZE);
  await _save(trimmed);
}

/** Discard all queued actions (call after successful flush or on logout). */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

/** How many actions are pending. */
export async function queueLength(): Promise<number> {
  return (await _load()).length;
}

/**
 * Flush the queue.  Replays each action against the backend.
 * Successful replays are removed; failed ones increment `retries`.
 * Entries that exceed `maxRetries` are discarded.
 *
 * Call this:
 *  - When the app detects a network state change from offline → online
 *  - On app foreground
 *  - After login
 */
export async function flushOfflineQueue(): Promise<{ flushed: number; failed: number; discarded: number }> {
  const queue = await _load();
  if (queue.length === 0) return { flushed: 0, failed: 0, discarded: 0 };

  let flushed = 0;
  let failed = 0;
  let discarded = 0;
  const remaining: QueuedAction[] = [];

  for (const entry of queue) {
    // Discard entries older than 30 minutes
    const ageMs = Date.now() - entry.queuedAt;
    if (ageMs > 30 * 60 * 1000 || entry.retries >= entry.maxRetries) {
      discarded++;
      continue;
    }

    try {
      // Lazy-import api module at flush time to avoid circular dep at startup
      const { BACKEND_URL, getAuthHeaders } = await import('@/src/services/api');
      const res = await fetch(`${BACKEND_URL}${entry.url}`, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: entry.body ? JSON.stringify(entry.body) : undefined,
      });

      if (res.ok || res.status === 409) {
        // 409 Conflict = idempotency hit (already processed) → treat as success
        flushed++;
      } else {
        remaining.push({ ...entry, retries: entry.retries + 1 });
        failed++;
      }
    } catch {
      remaining.push({ ...entry, retries: entry.retries + 1 });
      failed++;
    }
  }

  await _save(remaining);
  return { flushed, failed, discarded };
}
