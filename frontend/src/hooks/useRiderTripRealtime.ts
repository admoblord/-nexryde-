import { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '@/src/services/api';
import { getValidToken } from '@/src/lib/tokenStore';

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
  driver_location?: {
    lat: number;
    lng: number;
    updated_at?: string;
    heading?: number;
    speed_kmh?: number;
    eta_seconds?: number;
    distance_km?: number;
    status?: string;
  } | null;
  eta_seconds?: number;
  distance_remaining_km?: number;
  distance_remaining?: number;
  speed_kmh?: number;
  timestamp?: string;
};

type Options = {
  riderId: string | undefined;
  /** @deprecated Token is resolved internally via getValidToken. */
  token?: string | null;
  enabled: boolean;
  watchTripId?: string | null;
  onTripUpdate: (msg: RiderTripWsMessage) => void;
};

/**
 * WebSocket to `/api/ws/rider/trips/{riderId}` — token fetched lazily on connect.
 */
export function useRiderTripRealtime({
  riderId,
  enabled,
  watchTripId,
  onTripUpdate,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const attemptRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enabledRef = useRef(enabled);
  const watchRef = useRef(watchTripId);
  const cbRef = useRef(onTripUpdate);
  enabledRef.current = enabled;
  watchRef.current = watchTripId;
  cbRef.current = onTripUpdate;

  useEffect(() => {
    if (!enabled || !riderId) {
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
      timerRef.current = setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
      if (cancelled || !enabledRef.current || !riderId) return;
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

      const liveToken = await getValidToken();
      if (!liveToken || cancelled || !enabledRef.current) return;

      const base = getBackendWsBaseUrl();
      const wsUrl = `${base}/api/ws/rider/trips/${encodeURIComponent(riderId)}?token=${encodeURIComponent(liveToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attemptRef.current = 0;
        setConnected(true);
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              /* ignore */
            }
          }
        }, 30_000);
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
        if (pingRef.current) {
          clearInterval(pingRef.current);
          pingRef.current = null;
        }
        if (cancelled) return;
        setConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, riderId]);

  return { connected };
}
