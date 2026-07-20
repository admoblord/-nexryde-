import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { MAP } from '@/src/constants/nexrydeMapBehavior';
import { normalizeHeatmapApiZones, type HeatZonePoint } from '@/src/utils/driverHeatmapZones';
import { notificationService } from '@/src/services/notifications';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';

type Coords = { lat: number; lng: number };

/** Minimum interval between heatmap notifications for the same zone (ms). */
const NOTIF_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/** Intensity threshold above which we fire a notification (≥ "High" demand). */
const NOTIF_INTENSITY_THRESHOLD = 0.65;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logHeatmapSnapshotFailure(reason: string, meta?: Record<string, unknown>) {
  const payload = { reason, ...(meta || {}) };
  console.warn('[NEXRYDE_HEATMAP_SNAPSHOT]', payload);
  try {
    const { sentryWarn } = require('@/src/utils/sentryBreadcrumbs');
    sentryWarn('Driver heatmap snapshot failure', payload);
  } catch {
    /* diagnostics only */
  }
}

export function useDriverHeatmapSnapshot(
  coords: Coords | null,
  enabled: boolean,
  /** Pass true when the driver is offline so we notify them about hot zones. */
  driverOffline = false,
) {
  const [zones, setZones] = useState<HeatZonePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topZone, setTopZone] = useState<string | null>(null);

  /** Tracks when we last sent a notification per zone name. */
  const lastNotifAt = useRef<Record<string, number>>({});

  const maybeNotifyHotZones = useCallback(
    (hotZones: HeatZonePoint[]) => {
      // Only notify when driver is offline and the app is not in the foreground
      // so we don't spam drivers who are actively staring at the map.
      if (!driverOffline) return;
      if (AppState.currentState === 'active') return;

      const now = Date.now();
      for (const zone of hotZones.slice(0, 3)) {
        if (zone.intensity < NOTIF_INTENSITY_THRESHOLD) continue;
        const lastSent = lastNotifAt.current[zone.name] ?? 0;
        if (now - lastSent < NOTIF_COOLDOWN_MS) continue;

        lastNotifAt.current[zone.name] = now;

        // Rough rides-waiting from intensity (backend may give a real count)
        const ridesWaiting = Math.round(zone.intensity * 40);
        void notificationService.notifyHeatmapHotZone(zone.name, ridesWaiting);
      }
    },
    [driverOffline],
  );

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
      }
      const qs = params.toString();
      const url = `${BACKEND_URL}/api/driver/heatmap${qs ? `?${qs}` : ''}`;
      let data: Record<string, unknown> = {};
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) await sleep([800, 1800, 3600][attempt - 1] ?? 3600);
        try {
          const res = await fetchWithTimeout(url, {
            headers: getAuthHeaders(),
            timeoutMs: 12000,
          });
          data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          logHeatmapSnapshotFailure('request_failed', {
            attempt: attempt + 1,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (lastErr) throw lastErr;
      const rawZones = Array.isArray(data?.zones)
        ? data.zones.filter((z): z is Record<string, unknown> => Boolean(z) && typeof z === 'object')
        : undefined;
      const normalized = normalizeHeatmapApiZones(rawZones);
      setZones(normalized);
      setTopZone(typeof data?.top_zone === 'string' ? data.top_zone : (normalized[0]?.name ?? null));
      if (normalized.length) {
        maybeNotifyHotZones(normalized);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Heatmap snapshot failed';
      setError(message);
      logHeatmapSnapshotFailure('refresh_failed', { message });
    } finally {
      setLoading(false);
    }
  }, [coords?.lat, coords?.lng, enabled, maybeNotifyHotZones]);

  useEffect(() => {
    if (!enabled) {
      setZones([]);
      setTopZone(null);
      setError(null);
      return;
    }
    void refresh();
    const id = setInterval(() => void refresh(), MAP.update.heatmapSec * 1000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { zones, loading, error, topZone, refresh };
}
