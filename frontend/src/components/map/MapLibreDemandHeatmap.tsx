/**
 * GPU heatmap via MapLibre (vector engine) — replaces Circle overlays.
 * Style URL can point at MapLibre demotiles, MapTiler, or Mapbox Studio.
 */
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMapLibreStyleUrl, isMapLibreEnabled } from '@/src/constants/mapEngines';
import { BRAND } from '@/src/constants/designSystem';

export type DemandHeatPoint = {
  lat: number;
  lng: number;
  intensity: number;
  name?: string;
};

type Props = {
  zones: DemandHeatPoint[];
  height: number;
  center?: { lat: number; lng: number } | null;
  onZonePress?: (index: number) => void;
};

type MapLibreMod = typeof import('@maplibre/maplibre-react-native');

function loadMapLibre(): MapLibreMod | null {
  if (Platform.OS === 'web' || !isMapLibreEnabled()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@maplibre/maplibre-react-native') as MapLibreMod;
  } catch {
    return null;
  }
}

export function MapLibreDemandHeatmap({ zones, height, center, onZonePress }: Props) {
  const ml = loadMapLibre();
  const styleUrl = getMapLibreStyleUrl();

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: zones
        .filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lng))
        .map((z, i) => ({
          type: 'Feature' as const,
          id: i,
          properties: {
            weight: Math.max(0.05, Math.min(1, Number(z.intensity) || 0.5)),
            name: z.name || `Zone ${i + 1}`,
            index: i,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [z.lng, z.lat] as [number, number],
          },
        })),
    }),
    [zones],
  );

  const seed = center && Number.isFinite(center.lat) ? center : zones[0]
    ? { lat: zones[0].lat, lng: zones[0].lng }
    : { lat: 6.5244, lng: 3.3792 };

  if (!ml?.Map || !ml?.Camera || !ml?.GeoJSONSource || !ml?.Layer) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Ionicons name="flame-outline" size={28} color={BRAND.textMuted} />
        <Text style={styles.fallbackTxt}>
          MapLibre GPU heatmap needs a native rebuild (EAS). Circles remain as fallback on the classic map.
        </Text>
      </View>
    );
  }

  const { Map, Camera, GeoJSONSource, Layer, Marker } = ml;

  return (
    <View style={[styles.wrap, { height }]}>
      <Map style={StyleSheet.absoluteFillObject} mapStyle={styleUrl} attribution logo={false}>
        <Camera
          initialViewState={{
            center: [seed.lng, seed.lat],
            zoom: zones.length > 1 ? 11.2 : 12.4,
            pitch: 45,
            bearing: 0,
          }}
        />

        <GeoJSONSource id="nexryde-demand" data={geojson as any}>
          <Layer
            id="nexryde-demand-heat"
            type="heatmap"
            style={{
              heatmapWeight: ['get', 'weight'],
              heatmapIntensity: 0.85,
              heatmapRadius: 28,
              heatmapOpacity: 0.78,
              heatmapColor: [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(34,197,94,0)',
                0.25,
                'rgba(34,197,94,0.45)',
                0.5,
                'rgba(251,191,36,0.7)',
                0.75,
                'rgba(249,115,22,0.85)',
                1,
                'rgba(239,68,68,0.95)',
              ],
            }}
          />
        </GeoJSONSource>

        {zones.slice(0, 8).map((z, i) => (
          <Marker key={`hz-${i}`} id={`hz-${i}`} lngLat={[z.lng, z.lat]}>
            <TouchableOpacity
              style={styles.pin}
              onPress={() => onZonePress?.(i)}
              activeOpacity={0.85}
            >
              <Text style={styles.pinTxt} numberOfLines={1}>
                {(z.name || 'Hot').split(' ')[0]}
              </Text>
            </TouchableOpacity>
          </Marker>
        ))}
      </Map>

      <View style={styles.chip} pointerEvents="none">
        <View style={styles.dot} />
        <Text style={styles.chipTxt}>GPU HEATMAP · MapLibre</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.22)',
    backgroundColor: '#0c1220',
  },
  fallback: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: '#0c1220',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  fallbackTxt: {
    color: BRAND.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  pin: {
    backgroundColor: 'rgba(8,13,24,0.92)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.45)',
  },
  pinTxt: { color: '#E2E8F0', fontSize: 10, fontWeight: '800' },
  chip: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(8,13,24,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F97316' },
  chipTxt: { color: '#E2E8F0', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
});
