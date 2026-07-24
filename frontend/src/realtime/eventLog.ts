/**
 * Local realtime event log — survives offline / process death (AsyncStorage).
 * Syncs to /api/realtime/events/sync after reconnect.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

const STORAGE_KEY = '@nexryde_rt_event_log_v1';
const MAX_EVENTS = 200;

export type LocalRealtimeEvent = {
  event_id: string;
  event_type: string;
  actor_id: string;
  trip_id?: string;
  offer_id?: string;
  payload?: Record<string, unknown>;
  status: 'pending' | 'sent' | 'acked' | 'failed' | 'expired';
  ack: boolean;
  retry_count: number;
  created_at_ms: number;
  expires_at_ms: number;
  sync_status: 'local' | 'syncing' | 'synced';
  idempotency_key?: string;
};

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readAll(): Promise<LocalRealtimeEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalRealtimeEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(events: LocalRealtimeEvent[]): Promise<void> {
  const trimmed = events.slice(-MAX_EVENTS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export async function appendLocalEvent(
  partial: Omit<LocalRealtimeEvent, 'event_id' | 'created_at_ms' | 'expires_at_ms' | 'retry_count' | 'sync_status' | 'ack' | 'status'> & {
    status?: LocalRealtimeEvent['status'];
    ttlSec?: number;
  },
): Promise<LocalRealtimeEvent> {
  const now = Date.now();
  const ev: LocalRealtimeEvent = {
    event_id: uuid(),
    event_type: partial.event_type,
    actor_id: partial.actor_id,
    trip_id: partial.trip_id,
    offer_id: partial.offer_id,
    payload: partial.payload,
    status: partial.status || 'pending',
    ack: false,
    retry_count: 0,
    created_at_ms: now,
    expires_at_ms: now + (partial.ttlSec || 120) * 1000,
    sync_status: 'local',
    idempotency_key: partial.idempotency_key || undefined,
  };
  const all = await readAll();
  all.push(ev);
  await writeAll(all);
  return ev;
}

export async function markLocalAcked(eventId: string): Promise<void> {
  const all = await readAll();
  const next = all.map((e) =>
    e.event_id === eventId ? { ...e, ack: true, status: 'acked' as const } : e,
  );
  await writeAll(next);
}

export async function pendingUnsynced(): Promise<LocalRealtimeEvent[]> {
  const now = Date.now();
  const all = await readAll();
  return all.filter(
    (e) => e.sync_status !== 'synced' && (!e.expires_at_ms || e.expires_at_ms >= now),
  );
}

export async function syncLocalEvents(): Promise<number> {
  const pending = await pendingUnsynced();
  if (!pending.length) return 0;
  try {
    const res = await fetch(`${BACKEND_URL}/api/realtime/events/sync`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: pending }),
    });
    if (!res.ok) return 0;
    const ids = new Set(pending.map((e) => e.event_id));
    const all = await readAll();
    await writeAll(
      all.map((e) => (ids.has(e.event_id) ? { ...e, sync_status: 'synced' as const } : e)),
    );
    return pending.length;
  } catch {
    return 0;
  }
}

export async function ackToServer(eventId: string, extra?: { event_type?: string; offer_id?: string }) {
  try {
    await fetch(`${BACKEND_URL}/api/realtime/ack`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        event_type: extra?.event_type || '',
        offer_id: extra?.offer_id || '',
      }),
    });
    await markLocalAcked(eventId);
  } catch {
    /* queued via sync later */
  }
}

export async function healRealtimeSession(role: 'driver' | 'rider' = 'driver'): Promise<void> {
  try {
    if (role === 'driver') {
      await fetch(`${BACKEND_URL}/api/realtime/session/recover`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_online: true,
          network_quality: 'unknown',
          client_event_id: `heal:${Date.now()}`,
        }),
      });
    } else {
      await fetch(`${BACKEND_URL}/api/realtime/session/heal`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
    }
  } catch {
    /* ignore */
  }
  await syncLocalEvents();
}
