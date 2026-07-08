import { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '@/src/services/api';
import { managedFetch } from '@/src/services/networkManager';
import { riderTripSocket } from '@/src/services/riderTripSocket';

export { getBackendWsBaseUrl, type RiderTripWsMessage } from '@/src/services/riderTripTypes';

type Options = {
  riderId: string | undefined;
  /** @deprecated Token is resolved internally via getValidToken. */
  token?: string | null;
  enabled: boolean;
  watchTripId?: string | null;
  onTripUpdate: (msg: import('@/src/services/riderTripTypes').RiderTripWsMessage) => void;
};

/**
 * Subscribes to the singleton rider trip WebSocket.
 * Falls back to HTTP poll when WS is disconnected.
 */
export function useRiderTripRealtime({
  riderId,
  enabled,
  watchTripId,
  onTripUpdate,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const watchRef = useRef(watchTripId);
  const cbRef = useRef(onTripUpdate);
  const pollEtagRef = useRef('');
  watchRef.current = watchTripId;
  cbRef.current = onTripUpdate;

  useEffect(() => {
    if (!enabled || !riderId) {
      setConnected(false);
      return;
    }

    riderTripSocket.acquire(riderId);

    const unsubTrip = riderTripSocket.subscribeTrip((data) => {
      const w = watchRef.current;
      if (w != null && w !== '' && String(data.trip_id) !== String(w)) return;
      cbRef.current(data);
    });

    const unsubConn = riderTripSocket.subscribeConnection(setConnected);

    return () => {
      unsubTrip();
      unsubConn();
      riderTripSocket.release();
      setConnected(false);
    };
  }, [enabled, riderId]);

  // HTTP poll fallback while WS is down (backend caches last push per rider).
  useEffect(() => {
    if (!enabled || !riderId || connected) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await managedFetch(`${BACKEND_URL}/api/trips/poll/${encodeURIComponent(riderId)}`, {
          authed: true,
          timeoutMs: 8000,
          retries: 0,
          headers: pollEtagRef.current ? { 'If-None-Match': pollEtagRef.current } : undefined,
        });
        if (res.status === 304 || res.status === 204) return;
        if (!res.ok) return;
        const body = (await res.json()) as { payload?: import('@/src/services/riderTripTypes').RiderTripWsMessage; etag?: string };
        if (body.etag) pollEtagRef.current = body.etag;
        const data = body.payload;
        if (!data || data.type !== 'trip_update') return;
        const w = watchRef.current;
        if (w != null && w !== '' && String(data.trip_id) !== String(w)) return;
        cbRef.current(data);
      } catch {
        /* non-fatal */
      }
    };

    void poll();
    const id = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, riderId, connected]);

  return { connected };
}
