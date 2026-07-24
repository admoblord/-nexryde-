/**
 * Singleton rider trip WebSocket — one connection per rider session.
 * Multiple screens subscribe without opening duplicate sockets.
 */
import { getBackendWsBaseUrl, type RiderTripWsMessage } from '@/src/services/riderTripTypes';
import { getValidToken } from '@/src/lib/tokenStore';
import { reportPlatformConnectionSignal } from '@/src/services/platformConnectionManager';
import { wsReconnectDelayMs } from '@/src/utils/fastConnection';
import { expandUberRealtimePayload } from '@/src/utils/uberRealtimePayload';

export { getBackendWsBaseUrl, type RiderTripWsMessage } from '@/src/services/riderTripTypes';

type TripListener = (msg: RiderTripWsMessage) => void;
type ConnectionListener = (connected: boolean) => void;

class RiderTripSocketManager {
  private ws: WebSocket | null = null;
  private riderId: string | null = null;
  private shouldStayConnected = false;
  private subscriberCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private connectGeneration = 0;
  private tripListeners = new Set<TripListener>();
  private connectionListeners = new Set<ConnectionListener>();

  subscribeTrip(listener: TripListener): () => void {
    this.tripListeners.add(listener);
    return () => this.tripListeners.delete(listener);
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.ws?.readyState === WebSocket.OPEN);
    return () => this.connectionListeners.delete(listener);
  }

  acquire(riderId: string): void {
    this.subscriberCount += 1;
    this.shouldStayConnected = true;
    const riderChanged = this.riderId !== riderId;
    if (riderChanged) {
      this.riderId = riderId;
      this.reconnectAttempts = 0;
    }
    // Idempotent: second subscriber (home + tracking) must not tear down a healthy socket.
    void this.openSocket({ force: riderChanged });
  }

  release(): void {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);
    if (this.subscriberCount === 0) {
      this.disconnect();
    }
  }

  /** Force reconnect after foreground / network restore. */
  nudgeReconnect(opts?: { force?: boolean }): void {
    if (!this.shouldStayConnected || !this.riderId || this.subscriberCount === 0) return;
    const rs = this.ws?.readyState;
    // force=true (long background) reopens even a socket that still reads OPEN — it
    // is often a dead half-open link after mobile NAT/idle timeout.
    if (!opts?.force && (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING)) return;
    this.reconnectAttempts = 0;
    void this.openSocket({ force: true });
  }

  private emitConnection(connected: boolean) {
    reportPlatformConnectionSignal('socket', connected);
    for (const l of this.connectionListeners) l(connected);
  }

  private emitTrip(msg: RiderTripWsMessage) {
    for (const l of this.tripListeners) l(msg);
  }

  disconnect() {
    this.shouldStayConnected = false;
    this.riderId = null;
    this.connectGeneration += 1;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    this.emitConnection(false);
  }

  private scheduleReconnect() {
    if (!this.shouldStayConnected || !this.riderId || this.subscriberCount === 0) return;
    const delay = wsReconnectDelayMs(this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private async openSocket(opts?: { force?: boolean }) {
    if (!this.shouldStayConnected || !this.riderId || this.subscriberCount === 0) return;
    const rs = this.ws?.readyState;
    if (!opts?.force && (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING)) {
      return;
    }
    const gen = ++this.connectGeneration;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }

    const token = await getValidToken();
    if (!this.shouldStayConnected || !this.riderId || gen !== this.connectGeneration) return;
    if (!token) {
      // Transient token miss — schedule a backoff retry instead of dying silently.
      this.scheduleReconnect();
      return;
    }

    const wsUrl = `${getBackendWsBaseUrl()}/api/ws/rider/trips/${encodeURIComponent(this.riderId)}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.connectGeneration) return;
      this.reconnectAttempts = 0;
      this.emitConnection(true);
      this.pingTimer = setInterval(() => {
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
        const data = expandUberRealtimePayload(JSON.parse(event.data as string));
        if (data?.type === 'trip_update') this.emitTrip(data);
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => {
      /* onclose handles reconnect */
    };

    ws.onclose = () => {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (gen !== this.connectGeneration) return;
      this.ws = null;
      this.emitConnection(false);
      this.scheduleReconnect();
    };
  }
}

export const riderTripSocket = new RiderTripSocketManager();
