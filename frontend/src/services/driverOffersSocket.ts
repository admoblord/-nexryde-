/**
 * Application-lifetime driver offers WebSocket — created once per online session,
 * not per component render. Listeners attach/detach without recreating the connection.
 */
import { BACKEND_URL } from '@/src/services/api';
import { getValidToken } from '@/src/lib/tokenStore';
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';
import { reportPlatformConnectionSignal, reportNetworkOpsSignal } from '@/src/services/platformConnectionManager';
import { wsReconnectDelayMs } from '@/src/utils/fastConnection';
import { connectAckOffer, openRidePushConnect } from '@/src/services/ridePushConnect';
import { Platform } from 'react-native';

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
  private connectAbort: AbortController | null = null;
  private connectTransport: 'ws' | 'connect-sse' | null = null;
  /** After first Connect-SSE failure on this device, prefer WS for the session. */
  private connectSseUnsupported = false;

  subscribeOffers(listener: OfferListener): () => void {
    this.offerListeners.add(listener);
    return () => this.offerListeners.delete(listener);
  }

  /** True when WS or Connect-SSE is live (or handshaking). */
  private isOffersChannelLive(): boolean {
    const rs = this.ws?.readyState;
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return true;
    if (this.connectTransport === 'connect-sse' && this.connectAbort != null) return true;
    return false;
  }

  private isOffersChannelOpen(): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) return true;
    if (this.connectTransport === 'connect-sse' && this.connectAbort != null) return true;
    return false;
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.isOffersChannelOpen());
    return () => this.connectionListeners.delete(listener);
  }

  private emitConnection(connected: boolean) {
    reportPlatformConnectionSignal('socket', connected);
    for (const l of this.connectionListeners) l(connected);
  }

  private emitOffer(offer: DriverOfferPayload) {
    reportNetworkOpsSignal('ride_offer', true);
    for (const l of this.offerListeners) l(offer);
  }

  /** Start / resume offers channel for this driver. Idempotent for same driverId. */
  connect(driverId: string) {
    this.shouldStayConnected = true;
    if (this.driverId === driverId && this.isOffersChannelLive()) {
      return;
    }
    this.driverId = driverId;
    void this.openSocket();
  }

  /** Tear down socket when driver goes offline. */
  disconnect() {
    this.shouldStayConnected = false;
    this.driverId = null;
    this.connectGeneration += 1;
    if (this.connectAbort) {
      this.connectAbort.abort();
      this.connectAbort = null;
    }
    this.connectTransport = null;
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

  /**
   * Force reconnect after foreground / network restore.
   * Never cancels an in-flight CONNECTING handshake (that caused go-online races).
   */
  nudgeReconnect(opts?: { force?: boolean }): void {
    if (!this.shouldStayConnected || !this.driverId) return;
    // A single SSE blip shouldn't disable the better transport for the whole
    // shift — re-probe Connect-SSE after a foreground / network restore.
    this.connectSseUnsupported = false;
    // force=true after a long background: a half-open socket still reads OPEN but is
    // dead (mobile NAT/idle timeout). openSocket() tears down + reopens from scratch.
    if (!opts?.force && this.isOffersChannelLive()) return;
    this.reconnectAttempts = 0;
    void this.openSocket();
  }

  private scheduleReconnect() {
    if (!this.shouldStayConnected || !this.driverId) return;
    const attempt = this.reconnectAttempts;
    const delay = wsReconnectDelayMs(attempt);
    this.reconnectAttempts = attempt + 1;
    driverFlowLog('SOCKET_RECONNECT', { attempt: attempt + 1, delayMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private handleOfferPayload(offerPayload: DriverOfferPayload, offerId: string) {
    // Paint the offer first — ACK / audit must never delay the incoming-trip UI.
    this.emitOffer(offerPayload);
    if (offerId && this.driverId) {
      // Dual ACK: WS frame (low latency) + Connect unary (QUIC/HTTP3 path).
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(
            JSON.stringify({
              type: 'ack',
              offer_id: offerId,
              event_id: (offerPayload as { event_id?: string }).event_id || '',
            }),
          );
        } catch {
          /* ignore */
        }
      }
      void connectAckOffer(this.driverId, offerId);
      const eventId = (offerPayload as { event_id?: string }).event_id;
      void import('@/src/realtime/criticalActions').then(({ recordOfferAck }) =>
        recordOfferAck(this.driverId!, offerId, eventId),
      );
    }
  }

  private async openConnectSse(gen: number): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    if (!this.driverId || !this.shouldStayConnected) return false;
    // Probe Connect-SSE briefly; hung fetch must not block WS offer path.
    const CONNECT_SSE_READY_MS = 2_000;
    const abort = new AbortController();
    this.connectAbort = abort;
    driverFlowLog('SOCKET_CONNECT_START', {
      driverId: this.driverId,
      transport: 'connect-sse',
    });

    let connected = false;
    const ready = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        try {
          abort.abort();
        } catch {
          /* ignore */
        }
        finish(false);
      }, CONNECT_SSE_READY_MS);

      void openRidePushConnect({
        role: 'driver',
        userId: this.driverId!,
        signal: abort.signal,
        onConnection: (ok) => {
          if (gen !== this.connectGeneration) return;
          if (ok) {
            connected = true;
            this.connectTransport = 'connect-sse';
            this.reconnectAttempts = 0;
            this.emitConnection(true);
            finish(true);
          } else if (connected) {
            this.emitConnection(false);
          }
        },
        onEvent: (payload) => {
          if (gen !== this.connectGeneration) return;
          const data = payload as {
            type?: string;
            offer?: DriverOfferPayload;
          };
          let offerPayload: DriverOfferPayload | null = null;
          if (data.type === 'new_offer' && data.offer && typeof data.offer === 'object') {
            offerPayload = data.offer;
          } else if (data.type === 'ride_offer') {
            offerPayload = data as DriverOfferPayload;
          }
          if (!offerPayload) return;
          const offerId = String((offerPayload as { id?: string }).id || '').trim();
          this.handleOfferPayload(offerPayload, offerId);
        },
      })
        .then(() => {
          this.connectAbort = null;
          if (!connected) {
            finish(false);
            return;
          }
          // Stream ended after a healthy connect — reconnect unless torn down.
          if (gen === this.connectGeneration && this.shouldStayConnected) {
            this.emitConnection(false);
            this.scheduleReconnect();
          }
        })
        .catch(() => {
          this.connectAbort = null;
          finish(false);
        });
    });

    return ready;
  }

  private async openSocket() {
    if (!this.shouldStayConnected || !this.driverId) return;
    const gen = ++this.connectGeneration;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectAbort) {
      this.connectAbort.abort();
      this.connectAbort = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }

    // Prefer Connect-SSE (HTTP/2 over TCP). QUIC is off — UDP 443 black-holes.
    if (!this.connectSseUnsupported) {
      const usedConnect = await this.openConnectSse(gen);
      if (usedConnect || gen !== this.connectGeneration || !this.shouldStayConnected) {
        return;
      }
      this.connectSseUnsupported = true;
      driverFlowLog('SOCKET_CONNECT_START', {
        driverId: this.driverId,
        transport: 'ws_fallback',
      });
    }

    const token = await getValidToken();
    if (!this.shouldStayConnected || !this.driverId || gen !== this.connectGeneration) return;
    if (!token) {
      // Transient token miss (refresh blip / brief offline) — don't die silently.
      // Schedule a backoff retry so the offers channel returns without a manual nudge.
      this.scheduleReconnect();
      return;
    }

    const wsUrl = `${wsBaseUrl()}/api/ws/driver/offers/${encodeURIComponent(this.driverId)}?token=${encodeURIComponent(token)}`;
    driverFlowLog('SOCKET_CONNECT_START', { driverId: this.driverId, transport: 'ws' });

    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.connectTransport = 'ws';

    ws.onopen = () => {
      if (gen !== this.connectGeneration) return;
      this.reconnectAttempts = 0;
      this.emitConnection(true);
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send('ping');
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
        if (offerPayload) {
          const offerId = String(
            (offerPayload as { id?: string }).id ||
              (data.offer as { id?: string } | undefined)?.id ||
              '',
          ).trim();
          this.handleOfferPayload(offerPayload, offerId);
        }
      } catch {
        /* ignore malformed */
      }
    };

    ws.onerror = () => {
      driverFlowLog('SOCKET_DISCONNECTED', { reason: 'error', driverId: this.driverId });
    };

    ws.onclose = (ev) => {
      const ext = ws as WebSocket & { _pingInterval?: ReturnType<typeof setInterval> };
      if (ext._pingInterval) {
        clearInterval(ext._pingInterval);
        ext._pingInterval = undefined;
      }
      if (gen !== this.connectGeneration) return;
      this.ws = null;
      this.emitConnection(false);
      driverFlowLog('SOCKET_DISCONNECTED', {
        reason: 'close',
        code: ev.code,
        wasClean: ev.wasClean,
        closeReason: typeof ev.reason === 'string' ? ev.reason.slice(0, 80) : '',
      });
      this.scheduleReconnect();
    };
  }
}

export const driverOffersSocket = new DriverOffersSocketManager();
