/** Demand zone styling — shared by full heatmap screen and live-map overlay. */

export type HeatZonePoint = {
  lat: number;
  lng: number;
  intensity: number;
  name: string;
  surge: number;
  demand_level?: string;
};

export function getDemandZoneStyle(intensity: number) {
  if (intensity >= 0.85) {
    return {
      label: 'Very High',
      color: '#EF4444',
      mapColor: 'rgba(239,68,68,0.22)',
      ring: 'rgba(239,68,68,0.5)',
      radius: 900,
    };
  }
  if (intensity >= 0.65) {
    return {
      label: 'High',
      color: '#F97316',
      mapColor: 'rgba(249,115,22,0.20)',
      ring: 'rgba(249,115,22,0.45)',
      radius: 700,
    };
  }
  if (intensity >= 0.45) {
    return {
      label: 'Medium',
      color: '#FBBF24',
      mapColor: 'rgba(251,191,36,0.18)',
      ring: 'rgba(251,191,36,0.4)',
      radius: 550,
    };
  }
  return {
    label: 'Low',
    color: '#22C55E',
    mapColor: 'rgba(34,197,94,0.14)',
    ring: 'rgba(34,197,94,0.35)',
    radius: 400,
  };
}

export function normalizeHeatmapApiZones(
  raw: Array<Record<string, unknown>> | undefined,
): HeatZonePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: HeatZonePoint[] = [];
  for (const z of raw) {
    const lat = Number(z.lat);
    const lng = Number(z.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const intensity = Number(z.intensity);
    out.push({
      lat,
      lng,
      intensity: Number.isFinite(intensity) ? intensity : 0.6,
      name: String(z.zone_name ?? z.name ?? 'Zone'),
      surge: Number(z.surge_multiplier ?? z.surge ?? 1) || 1,
      demand_level: z.demand_level != null ? String(z.demand_level) : undefined,
    });
  }
  return out.sort((a, b) => b.intensity - a.intensity);
}
