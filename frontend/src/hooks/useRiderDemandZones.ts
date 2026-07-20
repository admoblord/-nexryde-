/**
 * Rider-facing demand zones for booking map overlay.
 * Prefers shared heatmap snapshot; falls back to fare surge around pickup.
 */
import { useCallback, useEffect, useState } from 'react';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { normalizeHeatmapApiZones, type HeatZonePoint } from '@/src/utils/driverHeatmapZones';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';

type Coords = { lat: number; lng: number };

function synthesizeFromFare(
  center: Coords | null,
  demandRatio?: number | null,
  surgeMultiplier?: number | null,
): HeatZonePoint[] {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return [];
  const surge = Number(surgeMultiplier);
  const ratio = Number(demandRatio);
  const elevated =
    (Number.isFinite(surge) && surge >= 1.15) || (Number.isFinite(ratio) && ratio >= 1.2);
  if (!elevated) return [];
  const intensity = Math.min(
    0.95,
    Math.max(
      0.45,
      Number.isFinite(surge) ? (surge - 1) / 0.8 : 0.5,
      Number.isFinite(ratio) ? Math.min(1, (ratio - 1) / 1.5 + 0.45) : 0.45,
    ),
  );
  return [
    {
      lat: center.lat,
      lng: center.lng,
      intensity,
      name: 'Busy near you',
      surge: Number.isFinite(surge) && surge > 1 ? surge : 1 + intensity * 0.4,
      demand_level: intensity >= 0.7 ? 'high' : 'medium',
    },
  ];
}

export function useRiderDemandZones(
  center: Coords | null,
  enabled: boolean,
  opts?: { demandRatio?: number | null; surgeMultiplier?: number | null },
) {
  const [zones, setZones] = useState<HeatZonePoint[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setZones([]);
      return;
    }
    const fallback = synthesizeFromFare(center, opts?.demandRatio, opts?.surgeMultiplier);
    try {
      const params = new URLSearchParams();
      if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        params.set('lat', String(center.lat));
        params.set('lng', String(center.lng));
      }
      const qs = params.toString();
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/driver/heatmap${qs ? `?${qs}` : ''}`,
        { headers: getAuthHeaders(), timeoutMs: 8000 },
      );
      if (!res.ok) {
        setZones(fallback);
        return;
      }
      const data = await res.json();
      const parsed = normalizeHeatmapApiZones(data?.zones);
      setZones(parsed.length ? parsed.slice(0, 5) : fallback);
    } catch {
      setZones(fallback);
    }
  }, [center?.lat, center?.lng, enabled, opts?.demandRatio, opts?.surgeMultiplier]);

  useEffect(() => {
    void refresh();
    if (!enabled) return;
    const t = setInterval(() => void refresh(), 45000);
    return () => clearInterval(t);
  }, [refresh, enabled]);

  return zones;
}
