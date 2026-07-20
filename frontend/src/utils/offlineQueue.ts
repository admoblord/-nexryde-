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
export async function flushOfflineQueue(): Promise<{
  flushed: number;
  failed: number;
  discarded: number;
  flushedLabels: string[];
}> {
  const queue = await _load();
  if (queue.length === 0) return { flushed: 0, failed: 0, discarded: 0, flushedLabels: [] };

  let flushed = 0;
  let failed = 0;
  let discarded = 0;
  const flushedLabels: string[] = [];
  const remaining: QueuedAction[] = [];

  for (const entry of queue) {
    // Discard entries older than 30 minutes
    const ageMs = Date.now() - entry.queuedAt;
    if (ageMs > 30 * 60 * 1000 || entry.retries >= entry.maxRetries) {
      discarded++;
      continue;
    }

    try {
      if (entry.label === 'driver_accept_trip') {
        const { ensureCriticalSessionReady } = await import('@/src/lib/sessionReadiness');
        const session = await ensureCriticalSessionReady();
        if (!session.ok) {
          remaining.push({ ...entry, retries: entry.retries + 1 });
          failed++;
          continue;
        }
      }

      const { BACKEND_URL } = await import('@/src/services/api');
      const { managedFetch } = await import('@/src/services/networkManager');
      const res = await managedFetch(`${BACKEND_URL}${entry.url}`, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: entry.body ? JSON.stringify(entry.body) : undefined,
        authed: true,
        timeoutMs: 12_000,
        retries: 0,
      });

      if (res.ok) {
        flushed++;
        flushedLabels.push(entry.label);
      } else if (entry.label === 'driver_accept_trip') {
        const tripId = entry.url.match(/\/trips\/([^/]+)\/accept/)?.[1] || '';
        const driverId = String(entry.body?.driver_id || '');
        if (res.status === 409 && tripId && driverId) {
          const { verifyDriverTripAssignment } = await import('@/src/utils/verifyDriverTripAssignment');
          const verified = await verifyDriverTripAssignment(driverId, decodeURIComponent(tripId));
          if (verified.assigned) {
            flushed++;
            flushedLabels.push(entry.label);
          } else {
            discarded++;
          }
        } else if ([400, 403, 404, 410].includes(res.status)) {
          // Expired/unavailable offers are terminal. Retrying would spam the
          // backend and could show a false "accepted" recovery alert later.
          discarded++;
        } else {
          remaining.push({ ...entry, retries: entry.retries + 1 });
          failed++;
        }
      } else if (res.status === 409) {
        // Non-driver actions use 409 as an idempotency/active-state signal.
        flushed++;
        flushedLabels.push(entry.label);
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
  return { flushed, failed, discarded, flushedLabels };
}

const LEGACY_QUEUE_KEY = '@offline_queue';

type LegacyQueuedRequest = {
  id: string;
  type: 'trip_request' | 'driver_accept_trip' | 'location_update' | 'profile_update';
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
};

/** One-time migration from legacy `@offline_queue` format. */
export async function migrateLegacyOfflineQueue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as LegacyQueuedRequest[];
    const { queueTripRequest, queueDriverAccept } = await import('@/src/utils/offlineQueueActions');

    for (const item of legacy) {
      if (item.type === 'trip_request') {
        const riderId = String(item.data.rider_id || '');
        if (riderId) await queueTripRequest(riderId, item.data);
      } else if (item.type === 'driver_accept_trip') {
        const tripId = String(item.data.trip_id || '');
        if (tripId) {
          await queueDriverAccept(tripId, {
            driver_id: String(item.data.driver_id || ''),
            offer_id: item.data.offer_id as string | undefined,
            proposed_fare: Number(item.data.proposed_fare || 0),
          });
        }
      }
    }
    await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    /* best-effort */
  }
}
