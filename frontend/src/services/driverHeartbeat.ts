/**
 * Driver presence heartbeat — prevents server watchdog from ghost-offlining drivers.
 * POST /api/driver/heartbeat every 60s while confirmed online.
 * Also piggybacks session refresh when the server recommends it (Bolt/Uber pattern).
 * FORCE_OFFLINE from server reconciles client when Redis/Mongo session expired.
 *
 * Must NOT run during CONNECTING — server returns FORCE_OFFLINE until PUT /online commits.
 */
import { BACKEND_URL } from '@/src/services/api';
import { managedFetch } from '@/src/services/networkManager';
import { ensureCriticalSessionReady } from '@/src/lib/sessionReadiness';
import { forceRefresh } from '@/src/lib/tokenStore';
import { reportPlatformConnectionSignal } from '@/src/services/platformConnectionManager';
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

let interval: ReturnType<typeof setInterval> | null = null;
let lastCoords: { lat: number; lng: number } | null = null;
let onForceOffline: ((meta?: { source?: string; status?: number }) => void) | null = null;

export function updateDriverHeartbeatCoords(lat: number, lng: number): void {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    lastCoords = { lat, lng };
  }
}

/** Register reconcile hook — typically confirmOffline + socket disconnect. */
export function setDriverHeartbeatForceOfflineHandler(
  handler: ((meta?: { source?: string; status?: number }) => void) | null,
): void {
  onForceOffline = handler;
}

/** Invoke the registered FORCE_OFFLINE reconcile (JS heartbeat or native FGS). */
export function invokeDriverHeartbeatForceOffline(
  meta?: { source?: string; status?: number },
): void {
  onForceOffline?.(meta);
}

async function sendHeartbeat(): Promise<void> {
  try {
    await ensureCriticalSessionReady();
    const body: Record<string, number> = {};
    if (lastCoords) {
      body.lat = lastCoords.lat;
      body.lng = lastCoords.lng;
    }
    const res = await managedFetch(`${BACKEND_URL}/api/driver/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      authed: true,
      timeoutMs: 8000,
      retries: 1,
    });
    if (res.status === 401) {
      reportPlatformConnectionSignal('heartbeat', false);
      driverFlowLog('HEARTBEAT_FORCE_OFFLINE', { source: 'js', status: 401 });
      onForceOffline?.({ source: 'js_401', status: 401 });
      return;
    }
    if (res.ok) {
      reportPlatformConnectionSignal('heartbeat', true);
      try {
        const payload = (await res.json()) as {
          session_refresh_recommended?: boolean;
          server_online?: boolean;
          action?: string | null;
        };
        if (payload.session_refresh_recommended) {
          await forceRefresh();
        }
        if (payload.action === 'FORCE_OFFLINE' || payload.server_online === false) {
          driverFlowLog('HEARTBEAT_FORCE_OFFLINE', {
            source: 'js',
            action: payload.action ?? null,
            server_online: payload.server_online ?? false,
          });
          onForceOffline?.({ source: 'js_force_offline' });
        }
      } catch {
        /* non-fatal */
      }
    }
  } catch {
    reportPlatformConnectionSignal('heartbeat', false);
    /* non-fatal — next interval retries */
  }
}

export function startDriverHeartbeat(): void {
  if (interval) return;
  void sendHeartbeat();
  interval = setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
}

export function stopDriverHeartbeat(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  lastCoords = null;
}
