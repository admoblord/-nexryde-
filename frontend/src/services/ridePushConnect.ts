/**
 * Uber RAMEN-lite Connect transport (SSE over HTTPS).
 * On Android + Cronet this can ride HTTP/3 (QUIC). WebSocket remains fallback.
 */
import { BACKEND_URL } from '@/src/services/api';
import { getValidToken } from '@/src/lib/tokenStore';
import { expandUberRealtimePayload } from '@/src/utils/uberRealtimePayload';

export type RidePushRole = 'driver' | 'rider';

type EventHandler = (payload: Record<string, unknown>) => void;
type ConnHandler = (connected: boolean) => void;

function subscribeUrl(role: RidePushRole, userId: string): string {
  const base = BACKEND_URL.replace(/\/$/, '');
  // Do NOT put the JWT in the query string — URLs are logged by proxies/CDN/
  // access logs. Auth travels in the Authorization header below.
  const q = new URLSearchParams({
    role,
    user_id: userId,
  });
  return `${base}/api/connect/nexryde.realtime.v1.RidePush/Subscribe?${q.toString()}`;
}

/**
 * Long-lived SSE subscribe using fetch streaming when available.
 * Returns a disposer. Falls back by throwing if streaming unsupported.
 */
export async function openRidePushConnect(opts: {
  role: RidePushRole;
  userId: string;
  onEvent: EventHandler;
  onConnection?: ConnHandler;
  signal?: AbortSignal;
}): Promise<void> {
  const token = await getValidToken();
  if (!token) throw new Error('no_token');
  const url = subscribeUrl(opts.role, opts.userId);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    opts.onConnection?.(false);
    throw new Error(`connect_sse_http_${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let connectedSignaled = false;
  const signalConnected = () => {
    if (connectedSignaled) return;
    connectedSignaled = true;
    // First real SSE frame proves the stream is open (a 200 with a dead body would
    // never reach here) — only now is it safe to skip the WS fallback.
    opts.onConnection?.(true);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const block of chunks) {
        const dataLine = block
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        signalConnected();
        try {
          const envelope = JSON.parse(dataLine.slice(5).trim()) as {
            type?: string;
            payload?: Record<string, unknown>;
            json_payload?: string;
          };
          if (envelope.type === 'ping' || envelope.type === 'hello') continue;
          let payload = envelope.payload;
          if (!payload && envelope.json_payload) {
            payload = JSON.parse(envelope.json_payload) as Record<string, unknown>;
          }
          if (!payload) continue;
          const expanded = expandUberRealtimePayload(payload);
          opts.onEvent((expanded as unknown as Record<string, unknown>) || payload);
        } catch {
          /* ignore bad frame */
        }
      }
    }
  } finally {
    opts.onConnection?.(false);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

export async function connectAckOffer(driverId: string, offerId: string): Promise<boolean> {
  const token = await getValidToken();
  if (!token || !offerId) return false;
  const base = BACKEND_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/connect/nexryde.realtime.v1.RidePush/AckOffer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        driver_id: driverId,
        offer_id: offerId,
        access_token: token,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
