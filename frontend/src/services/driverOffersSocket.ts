/**
 * Application-lifetime driver offers WebSocket — created once per online session,
 * not per component render. Listeners attach/detach without recreating the connection.
 */
import { BACKEND_URL } from '@/src/services/api';
import { getValidToken } from '@/src/lib/tokenStore';
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';
import { reportPlatformConnectionSignal } from '@/src/services/platformConnectionManager';

export type DriverOfferPayload = Record<string, unknown>;

type OfferListener = (offer: DriverOfferPayload) => void;
type ConnectionListener = (connected: boolean) => void;

function wsBaseUrl(): string {
  const url = BACKEND_URL.replace(/\/$/, '');
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  return `wss://${url}`;
}

class DriverOffersSocketManager {
  private ws: WebSocket | null = null;
  private driverId: string | null = null;
  private shouldStayConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private connectGeneration = 0;
  private offerListeners = new Set<OfferListener>();
  private connectionListeners = new Set<ConnectionListener>();

  subscribeOffers(listener: OfferListener): () => void {
    this.offerListeners.add(listener);
    return () => this.offerListeners.delete(listener);
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.ws?.readyState === WebSocket.OPEN);
    return () => this.connectionListeners.delete(listener);
  }

  private emitConnection(connected: boolean) {
    reportPlatformConnectionSignal('socket', connected);
    for (const l of this.connectionListeners) l(connected);
  }

  private emitOffer(offer: DriverOfferPayload) {
    for (const l of this.offerListeners) l(offer);
  }

  /** Start / resume offers channel for this driver. Idempotent for same driverId. */
  connect(driverId: string) {
    this.shouldStayConnected = true;
    if (this.driverId === driverId && this.ws?.readyState === WebSocket.OPEN) return;
    this.driverId = driverId;
    void this.openSocket();
  }

  /** Tear down socket when driver goes offline. */
  disconnect() {
    this.shouldStayConnected = false;
    this.driverId = null;
    this.connectGeneration += 1;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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
    driverFlowLog('SOCKET_DISCONNECTED', { reason: 'driver_offline' });
  }

  /** Force reconnect after foreground / network restore. */
  nudgeReconnect(): void {
    if (!this.shouldStayConnected || !this.driverId) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.reconnectAttempts = 0;
    void this.openSocket();
  }

  private scheduleReconnect() {
    if (!this.shouldStayConnected || !this.driverId) return;
    const attempt = this.reconnectAttempts;
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 6)));
    this.reconnectAttempts = attempt + 1;
    driverFlowLog('SOCKET_RECONNECT', { attempt: attempt + 1, delayMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private async openSocket() {
    if (!this.shouldStayConnected || !this.driverId) return;
    const gen = ++this.connectGeneration;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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
    if (!token || !this.shouldStayConnected || !this.driverId || gen !== this.connectGeneration) return;

    const wsUrl = `${wsBaseUrl()}/api/ws/driver/offers/${encodeURIComponent(this.driverId)}?token=${encodeURIComponent(token)}`;
    driverFlowLog('SOCKET_CONNECT_START', { driverId: this.driverId });

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.connectGeneration) return;
      this.reconnectAttempts = 0;
      this.emitConnection(true);
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {
            /* ignore */
          }
        }
      }, 30_000);
      (ws as WebSocket & { _pingInterval?: ReturnType<typeof setInterval> })._pingInterval = pingInterval;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        let offerPayload: DriverOfferPayload | null = null;
        if (data.type === 'new_offer' && data.offer && typeof data.offer === 'object') {
          offerPayload = data.offer as DriverOfferPayload;
        } else if (data.type === 'ride_offer') {
          offerPayload = data as DriverOfferPayload;
        }
        if (offerPayload) this.emitOffer(offerPayload);
      } catch {
        /* ignore malformed */
      }
    };

    ws.onerror = () => {
      /* onclose handles reconnect */
    };

    ws.onclose = () => {
      const ext = ws as WebSocket & { _pingInterval?: ReturnType<typeof setInterval> };
      if (ext._pingInterval) {
        clearInterval(ext._pingInterval);
        ext._pingInterval = undefined;
      }
      if (gen !== this.connectGeneration) return;
      this.ws = null;
      this.emitConnection(false);
      this.scheduleReconnect();
    };
  }
}

export const driverOffersSocket = new DriverOffersSocketManager();
