/**
 * Work Zone territory map — night cartography, radius circles, focus + recenter.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { NEXRYDE_MAP_STYLE } from '@/src/constants/nexrydeMapBehavior';
import { BRAND } from '@/src/constants/designSystem';
import type { WorkZonePlace } from '@/src/store/workZoneScreenStore';

const ZONE_COLORS = ['#22E5A0', '#38BDF8', '#FBBF24', '#F472B6'] as const;

type Props = {
  zones: WorkZonePlace[];
  height?: number;
  focusedZoneId?: string | null;
  onZonePress?: (zoneId: string) => void;
};

function radiusToLatDelta(radiusM: number): number {
  return Math.max(0.04, (radiusM / 111_000) * 2.6);
}

function fitCoordsForZones(zones: WorkZonePlace[]) {
  return zones.flatMap((z) => {
    const dLat = (z.radius_m || 5000) / 111_000;
    const dLng = dLat / Math.max(0.2, Math.cos((z.lat * Math.PI) / 180));
    return [
      { latitude: z.lat, longitude: z.lng },
      { latitude: z.lat + dLat, longitude: z.lng },
      { latitude: z.lat - dLat, longitude: z.lng },
      { latitude: z.lat, longitude: z.lng + dLng },
      { latitude: z.lat, longitude: z.lng - dLng },
    ];
  });
}

export function WorkZoneMapPreview({
  zones,
  height = 228,
  focusedZoneId = null,
  onZonePress,
}: Props) {
  const mapRef = useRef<MapView>(null);

  const validZones = useMemo(
    () =>
      zones.filter(
        (z) =>
          Number.isFinite(z.lat) &&
          Number.isFinite(z.lng) &&
          Math.abs(z.lat) <= 90 &&
          Math.abs(z.lng) <= 180,
      ),
    [zones],
  );

  const initialRegion = useMemo(() => {
    if (!validZones.length) {
      return {
        latitude: 6.5244,
        longitude: 3.3792,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      };
    }
    const lat = validZones.reduce((s, z) => s + z.lat, 0) / validZones.length;
    const lng = validZones.reduce((s, z) => s + z.lng, 0) / validZones.length;
    const maxR = Math.max(...validZones.map((z) => z.radius_m || 5000));
    const delta = radiusToLatDelta(maxR) * (validZones.length > 1 ? 1.35 : 1);
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: delta,
      longitudeDelta: delta,
    };
  }, [validZones]);

  const fitAll = useCallback(() => {
    if (!mapRef.current || validZones.length === 0) return;
    try {
      mapRef.current.fitToCoordinates(fitCoordsForZones(validZones), {
        edgePadding: { top: 40, right: 30, bottom: 40, left: 30 },
        animated: true,
      });
    } catch {
      /* map may be unmounted */
    }
  }, [validZones]);

  useEffect(() => {
    if (Platform.OS === 'web' || validZones.length === 0) return;
    const focused = focusedZoneId
      ? validZones.find((z) => z.id === focusedZoneId)
      : null;
    const t = setTimeout(() => {
      try {
        if (focused && mapRef.current) {
          const delta = radiusToLatDelta(focused.radius_m || 5000);
          mapRef.current.animateToRegion(
            {
              latitude: focused.lat,
              longitude: focused.lng,
              latitudeDelta: delta,
              longitudeDelta: delta,
            },
            380,
          );
          return;
        }
        fitAll();
      } catch {
        /* map may be unmounted */
      }
    }, 220);
    return () => clearTimeout(t);
  }, [validZones, focusedZoneId, fitAll]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.wrap, { height }]}>
        <View style={styles.webFallback}>
          <Ionicons name="map-outline" size={28} color={BRAND.textMuted} />
          <Text style={styles.webTxt}>Map preview on device</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={NEXRYDE_MAP_STYLE}
        initialRegion={initialRegion}
        scrollEnabled={validZones.length > 0}
        zoomEnabled={validZones.length > 0}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
      >
        {validZones.map((zone, i) => {
          const color = ZONE_COLORS[i % ZONE_COLORS.length];
          const radius = Math.max(1000, zone.radius_m || 5000);
          const focused = focusedZoneId === zone.id;
          return (
            <React.Fragment key={zone.id}>
              <Circle
                center={{ latitude: zone.lat, longitude: zone.lng }}
                radius={radius}
                fillColor={focused ? `${color}33` : `${color}22`}
                strokeColor={focused ? color : `${color}AA`}
                strokeWidth={focused ? 3 : 2}
              />
              <Marker
                coordinate={{ latitude: zone.lat, longitude: zone.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                onPress={() => onZonePress?.(zone.id)}
              >
                <View
                  style={[
                    styles.pin,
                    {
                      backgroundColor: color,
                      borderColor: focused ? '#fff' : 'rgba(255,255,255,0.85)',
                      transform: [{ scale: focused ? 1.08 : 1 }],
                    },
                  ]}
                >
                  <Text style={styles.pinTxt} numberOfLines={1}>
                    {zone.label.split(' ')[0] || 'Zone'}
                  </Text>
                </View>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapView>

      {validZones.length === 0 ? (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <Ionicons name="locate-outline" size={22} color={BRAND.primary} />
          <Text style={styles.emptyTxt}>Add a place to preview your territory</Text>
        </View>
      ) : (
        <>
          <View style={styles.liveChip} pointerEvents="none">
            <View style={styles.liveDot} />
            <Text style={styles.liveTxt}>
              {validZones.length} zone{validZones.length === 1 ? '' : 's'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.recenterBtn}
            onPress={fitAll}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Recenter work zones on map"
          >
            <Ionicons name="scan-outline" size={18} color={BRAND.primary} />
          </TouchableOpacity>
        </>
      )}
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
    marginBottom: 14,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0c1220',
  },
  webTxt: { color: BRAND.textMuted, fontSize: 12, fontWeight: '600' },
  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(6,11,24,0.45)',
    paddingHorizontal: 24,
  },
  emptyTxt: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  pin: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: 110,
  },
  pinTxt: { color: '#041016', fontSize: 10, fontWeight: '900' },
  liveChip: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(8,13,24,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND.primary,
  },
  liveTxt: { color: '#E2E8F0', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  recenterBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,13,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
  },
});
