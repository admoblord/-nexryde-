/**
 * Driver presence heartbeat — prevents server watchdog from ghost-offlining drivers.
 * POST /api/driver/heartbeat every ~20s while confirmed online.
 * Piggybacks Device Health Engine signals for dispatch eligibility.
 * Also piggybacks session refresh when the server recommends it (Bolt/Uber pattern).
 * FORCE_OFFLINE from server reconciles client when Redis/Mongo session expired.
 *
 * Must NOT run during CONNECTING — server returns FORCE_OFFLINE until PUT /online commits.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { BACKEND_URL } from '@/src/services/api';
import { managedFetch } from '@/src/services/networkManager';
import { ensureCriticalSessionReady } from '@/src/lib/sessionReadiness';
import { forceRefresh } from '@/src/lib/tokenStore';
import {
  getPlatformConnectionSnapshot,
  reportPlatformConnectionSignal,
} from '@/src/services/platformConnectionManager';
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';
import {
  hasNativeBatteryOptimizationExempt,
  hasNativeFullScreenIntentPermission,
  isDriverNativeExperienceAvailable,
} from '@/src/services/driverNativeExperience';

/** Default 20s — matches RT_HEARTBEAT_INTERVAL_SEC; server may override via response. */
let heartbeatIntervalMs = 20 * 1000;

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

function networkQualityFromNetInfo(type: string | null | undefined, isConnected: boolean | null): string {
  if (isConnected === false) return 'offline';
  const t = (type || '').toLowerCase();
  if (t === 'wifi') return 'excellent';
  if (t === 'cellular' || t === '4g' || t === '5g') return 'good';
  if (t === '3g' || t === '2g') return 'fair';
  if (t === 'none') return 'offline';
  return 'unknown';
}

async function buildDeviceHealthPayload(): Promise<Record<string, unknown>> {
  const snap = getPlatformConnectionSnapshot();
  const net = await NetInfo.fetch().catch(() => null);
  const quality = networkQualityFromNetInfo(net?.type ?? null, net?.isConnected ?? null);
  const appVersion = String(Constants.expoConfig?.version || '1.0.0');

  let fullscreen = true;
  let batteryOk = true;
  let fgsRunning = Platform.OS !== 'android';
  if (Platform.OS === 'android' && isDriverNativeExperienceAvailable()) {
    fullscreen = await hasNativeFullScreenIntentPermission().catch(() => false);
    batteryOk = await hasNativeBatteryOptimizationExempt().catch(() => true);
    // Native FGS is started with go-online; treat native module presence + online intent as running.
    fgsRunning = true;
  }

  return {
    socket_connected:
      snap.socketAlive === true ||
      snap.state === 'CONNECTED' ||
      snap.heartbeatAlive === true,
    fgs_running: fgsRunning,
    fullscreen_notif_enabled: fullscreen,
    battery_optimization_ok: batteryOk,
    network_quality: quality,
    app_version: appVersion,
  };
}

async function sendHeartbeat(): Promise<void> {
  try {
    await ensureCriticalSessionReady();
    const body: Record<string, unknown> = {};
    if (lastCoords) {
      body.lat = lastCoords.lat;
      body.lng = lastCoords.lng;
    }
    try {
      const dh = await buildDeviceHealthPayload();
      body.device_health = dh;
      body.network_quality = dh.network_quality;
    } catch {
      /* non-fatal — soft mode on server if omitted */
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
          heartbeat_interval_sec?: number;
          dispatch_eligible?: boolean | null;
        };
        if (
          typeof payload.heartbeat_interval_sec === 'number' &&
          payload.heartbeat_interval_sec >= 10 &&
          payload.heartbeat_interval_sec <= 120
        ) {
          const next = Math.round(payload.heartbeat_interval_sec * 1000);
          if (next !== heartbeatIntervalMs) {
            heartbeatIntervalMs = next;
            if (interval) {
              clearInterval(interval);
              interval = setInterval(() => void sendHeartbeat(), heartbeatIntervalMs);
            }
          }
        }
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
  interval = setInterval(() => void sendHeartbeat(), heartbeatIntervalMs);
}

export function stopDriverHeartbeat(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  lastCoords = null;
}
