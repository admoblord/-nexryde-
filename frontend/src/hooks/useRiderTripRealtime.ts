import { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '@/src/services/api';

export function getBackendWsBaseUrl(): string {
  const url = BACKEND_URL.replace(/\/$/, '');
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  return `wss://${url}`;
}

export type RiderTripWsMessage = {
  type: string;
  trip_id?: string;
  status?: string;
  trip?: Record<string, unknown>;
  /** Present on some pushes when driver GPS was merged for the rider map. */
  driver_location?: { lat: number; lng: number; updated_at?: string } | null;
};

type Options = {
  riderId: string | undefined;
  token: string | null | undefined;
  /** When false, socket is closed and reconnect timers cleared. */
  enabled: boolean;
  /** If set, only `trip_update` messages for this trip id are delivered. */
  watchTripId?: string | null;
  onTripUpdate: (msg: RiderTripWsMessage) => void;
};

/**
 * Single WebSocket to `/api/ws/rider/trips/{riderId}` with JWT query param.
 * Exponential backoff reconnect while `enabled` stays true.
 */
export function useRiderTripRealtime({
  riderId,
  token,
  enabled,
  watchTripId,
  onTripUpdate,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const attemptRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const watchRef = useRef(watchTripId);
  const cbRef = useRef(onTripUpdate);
  enabledRef.current = enabled;
  watchRef.current = watchTripId;
  cbRef.current = onTripUpdate;

  useEffect(() => {
    if (!enabled || !riderId || !token) {
      setConnected(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const scheduleReconnect = () => {
      if (cancelled || !enabledRef.current) return;
      const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(attemptRef.current, 6)));
      attemptRef.current += 1;
      timerRef.current = setTimeout(() => connect(), delay);
    };

    const connect = () => {
      if (cancelled || !enabledRef.current || !riderId || !token) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }

      const base = getBackendWsBaseUrl();
      const wsUrl = `${base}/api/ws/rider/trips/${encodeURIComponent(riderId)}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attemptRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as RiderTripWsMessage;
          if (data.type !== 'trip_update') return;
          const w = watchRef.current;
          if (w != null && w !== '' && String(data.trip_id) !== String(w)) return;
          cbRef.current(data);
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      cancelled = true;
      setConnected(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [enabled, riderId, token]);

  return { connected };
}
