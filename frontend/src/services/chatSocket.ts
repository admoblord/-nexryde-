/**
 * Singleton trip chat WebSocket — one connection per trip+user session.
 */
import { getBackendWsBaseUrl } from '@/src/services/riderTripTypes';
import { getValidToken } from '@/src/lib/tokenStore';

export type ChatWsMessage = Record<string, unknown>;

type MessageListener = (data: ChatWsMessage) => void;
type ConnectionListener = (connected: boolean) => void;

function sessionKey(tripId: string, userId: string): string {
  return `${tripId}:${userId}`;
}

class ChatSocketManager {
  private ws: WebSocket | null = null;
  private activeKey: string | null = null;
  private tripId: string | null = null;
  private userId: string | null = null;
  private shouldStayConnected = false;
  private subscriberCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private connectGeneration = 0;
  private messageListeners = new Set<MessageListener>();
  private connectionListeners = new Set<ConnectionListener>();

  subscribeMessages(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.ws?.readyState === WebSocket.OPEN);
    return () => this.connectionListeners.delete(listener);
  }

  acquire(tripId: string, userId: string): void {
    this.subscriberCount += 1;
    this.shouldStayConnected = true;
    const key = sessionKey(tripId, userId);
    const sessionChanged = this.activeKey !== key;
    if (sessionChanged) {
      this.tripId = tripId;
      this.userId = userId;
      this.activeKey = key;
      this.reconnectAttempts = 0;
    }
    // Idempotent: overlapping chat subscribers must not churn a healthy socket.
    void this.openSocket({ force: sessionChanged });
  }

  release(): void {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);
    if (this.subscriberCount === 0) this.disconnect();
  }

  nudgeReconnect(): void {
    if (!this.shouldStayConnected || !this.tripId || !this.userId) return;
    const rs = this.ws?.readyState;
    if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;
    this.reconnectAttempts = 0;
    void this.openSocket({ force: true });
  }

  send(payload: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    this.shouldStayConnected = false;
    this.activeKey = null;
    this.tripId = null;
    this.userId = null;
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

  private emitConnection(connected: boolean) {
    for (const l of this.connectionListeners) l(connected);
  }

  private emitMessage(data: ChatWsMessage) {
    for (const l of this.messageListeners) l(data);
  }

  private scheduleReconnect() {
    if (!this.shouldStayConnected || !this.tripId || !this.userId || this.subscriberCount === 0) return;
    const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts, 6)));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private async openSocket(opts?: { force?: boolean }) {
    if (!this.shouldStayConnected || !this.tripId || !this.userId || this.subscriberCount === 0) return;
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
    if (!token || gen !== this.connectGeneration || !this.tripId || !this.userId) return;

    const base = getBackendWsBaseUrl();
    const wsUrl = `${base}/api/ws/chat/${encodeURIComponent(this.tripId)}/${encodeURIComponent(this.userId)}?token=${encodeURIComponent(token)}`;
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
        this.emitMessage(JSON.parse(event.data as string) as ChatWsMessage);
      } catch {
        /* ignore */
      }
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

export const chatSocket = new ChatSocketManager();
