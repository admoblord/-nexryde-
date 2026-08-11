/**
 * Singleton user inbox WebSocket — badge updates without 30s HTTP polling.
 * Tab layouts and map chrome share one connection per user session.
 */
import { getBackendWsBaseUrl } from '@/src/services/riderTripTypes';
import { getValidToken } from '@/src/lib/tokenStore';
import { wsReconnectDelayMs } from '@/src/utils/fastConnection';

export type InboxBadgeMessage = {
  type: 'notification_badge';
  unread_count: number;
  unread_count_excl_engagement?: number;
};

type BadgeListener = (msg: InboxBadgeMessage) => void;

class InboxSocketManager {
  private ws: WebSocket | null = null;
  private userId: string | null = null;
  private shouldStayConnected = false;
  private subscriberCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private connectGeneration = 0;
  private badgeListeners = new Set<BadgeListener>();

  subscribeBadge(listener: BadgeListener): () => void {
    this.badgeListeners.add(listener);
    return () => this.badgeListeners.delete(listener);
  }

  acquire(userId: string): void {
    this.subscriberCount += 1;
    this.shouldStayConnected = true;
    const userChanged = this.userId !== userId;
    if (userChanged) {
      this.userId = userId;
      this.reconnectAttempts = 0;
    }
    void this.openSocket({ force: userChanged });
  }

  release(): void {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);
    if (this.subscriberCount === 0) {
      this.disconnect();
    }
  }

  nudgeReconnect(opts?: { force?: boolean }): void {
    if (!this.shouldStayConnected || !this.userId || this.subscriberCount === 0) return;
    const rs = this.ws?.readyState;
    if (!opts?.force && (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING)) return;
    this.reconnectAttempts = 0;
    void this.openSocket({ force: true });
  }

  private emitBadge(msg: InboxBadgeMessage) {
    for (const l of this.badgeListeners) l(msg);
  }

  disconnect() {
    this.shouldStayConnected = false;
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
  }

  private scheduleReconnect() {
    if (!this.shouldStayConnected || !this.userId || this.subscriberCount === 0) return;
    const delay = wsReconnectDelayMs(this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private async openSocket(opts?: { force?: boolean }) {
    if (!this.shouldStayConnected || !this.userId || this.subscriberCount === 0) return;
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
    if (!this.shouldStayConnected || !this.userId || gen !== this.connectGeneration) return;
    if (!token) {
      this.scheduleReconnect();
      return;
    }

    const wsUrl = `${getBackendWsBaseUrl()}/api/ws/user/${encodeURIComponent(this.userId)}/inbox?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.connectGeneration) return;
      this.reconnectAttempts = 0;
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
        const data = JSON.parse(event.data as string);
        if (data?.type === 'notification_badge') {
          this.emitBadge({
            type: 'notification_badge',
            unread_count: Number(data.unread_count) || 0,
            unread_count_excl_engagement:
              data.unread_count_excl_engagement != null
                ? Number(data.unread_count_excl_engagement) || 0
                : undefined,
          });
        }
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
      this.scheduleReconnect();
    };
  }
}

export const inboxSocket = new InboxSocketManager();
