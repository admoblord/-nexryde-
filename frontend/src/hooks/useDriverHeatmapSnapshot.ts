import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { MAP } from '@/src/constants/nexrydeMapBehavior';
import { normalizeHeatmapApiZones, type HeatZonePoint } from '@/src/utils/driverHeatmapZones';
import { notificationService } from '@/src/services/notifications';

type Coords = { lat: number; lng: number };

/** Minimum interval between heatmap notifications for the same zone (ms). */
const NOTIF_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/** Intensity threshold above which we fire a notification (≥ "High" demand). */
const NOTIF_INTENSITY_THRESHOLD = 0.65;

export function useDriverHeatmapSnapshot(
  coords: Coords | null,
  enabled: boolean,
  /** Pass true when the driver is offline so we notify them about hot zones. */
  driverOffline = false,
) {
  const [zones, setZones] = useState<HeatZonePoint[]>([]);
  const [loading, setLoading] = useState(false);
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
    try {
      const params = new URLSearchParams();
      if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
        params.set('lat', String(coords.lat));
        params.set('lng', String(coords.lng));
      }
      const qs = params.toString();
      const res = await fetch(`${BACKEND_URL}/api/driver/heatmap${qs ? `?${qs}` : ''}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const normalized = normalizeHeatmapApiZones(data?.zones);
      if (normalized.length) {
        setZones(normalized);
        setTopZone(typeof data?.top_zone === 'string' ? data.top_zone : (normalized[0]?.name ?? null));
        maybeNotifyHotZones(normalized);
      }
    } catch {
      /* keep last zones */
    } finally {
      setLoading(false);
    }
  }, [coords?.lat, coords?.lng, enabled, maybeNotifyHotZones]);

  useEffect(() => {
    if (!enabled) {
      setZones([]);
      setTopZone(null);
      return;
    }
    void refresh();
    const id = setInterval(() => void refresh(), MAP.update.heatmapSec * 1000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { zones, loading, topZone, refresh };
}
