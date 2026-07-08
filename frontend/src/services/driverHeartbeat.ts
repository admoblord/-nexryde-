/**
 * Driver presence heartbeat — prevents server watchdog from ghost-offlining drivers.
 * POST /api/driver/heartbeat every 4 minutes while online.
 * Also piggybacks session refresh when the server recommends it (Bolt/Uber pattern).
 */
import { BACKEND_URL } from '@/src/services/api';
import { managedFetch } from '@/src/services/networkManager';
import { ensureCriticalSessionReady } from '@/src/lib/sessionReadiness';
import { forceRefresh } from '@/src/lib/tokenStore';
import { reportPlatformConnectionSignal } from '@/src/services/platformConnectionManager';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

let interval: ReturnType<typeof setInterval> | null = null;
let lastCoords: { lat: number; lng: number } | null = null;

export function updateDriverHeartbeatCoords(lat: number, lng: number): void {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    lastCoords = { lat, lng };
  }
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
    if (res.ok) {
      reportPlatformConnectionSignal('heartbeat', true);
      try {
        const payload = (await res.json()) as { session_refresh_recommended?: boolean };
        if (payload.session_refresh_recommended) {
          await forceRefresh();
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
