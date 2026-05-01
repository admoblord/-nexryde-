import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import MapView, { Marker, Polyline, Circle, type LatLng } from 'react-native-maps';

const COLORS = {
  brandGreen: '#00D46A',
  brandBlue: '#0EA5E9',
  red: '#EF4444',
};

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1A2332' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0D1420' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d3a4f' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

function parseCoordPair(
  coords: { lat?: unknown; lng?: unknown } | null | undefined,
): { lat: number; lng: number } | null {
  if (!coords) return null;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function sanitizePolyline(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  const out: LatLng[] = [];
  for (const p of raw) {
    const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
    if (!o) continue;
    const lat = Number(o.latitude ?? o.lat);
    const lng = Number(o.longitude ?? o.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ latitude: lat, longitude: lng });
  }
  return out;
}

function PulseDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.35,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <Animated.View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: '#FFFFFF',
        transform: [{ scale }],
        shadowColor: color,
        shadowOpacity: 0.45,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        elevation: 6,
      }}
    />
  );
}

interface RideMapProps {
  /** Pass `null` if the parent does not need a ref to the map. */
  mapRef: React.RefObject<MapView | null> | null;
  pickupCoords: { lat: number; lng: number };
  /** When omitted, map shows pickup only (camera on rider) until a drop-off is set. */
  destinationCoords?: { lat: number; lng: number } | null;
  routePolyline: any[];
  pickup: string;
  destination: string;
  nearbyDrivers?: Array<{
    driver_id: string;
    name?: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
  }>;
  activeDriverLocation?: { lat: number; lng: number } | null;
  activeDriverMoving?: boolean;
  activeDriverMeta?: { name?: string; vehicle?: string; plate?: string } | null;
}

export default function RideMap({
  mapRef,
  pickupCoords,
  destinationCoords,
  routePolyline,
  pickup,
  destination,
  nearbyDrivers = [],
  activeDriverLocation = null,
  activeDriverMoving = false,
  activeDriverMeta = null,
}: RideMapProps) {
  const internalRef = useRef<MapView>(null);
  const mapViewRef = mapRef != null ? mapRef : internalRef;

  const pickupLL = parseCoordPair(pickupCoords);
  const destLL = parseCoordPair(destinationCoords ?? undefined);
  const lineCoords = useMemo(() => sanitizePolyline(routePolyline), [routePolyline]);
  const activeLL = parseCoordPair(activeDriverLocation ?? undefined);

  const pickupLabel = String(pickup ?? '');
  const destLabel = String(destination ?? '');

  const fitCoords = useMemo(() => {
    if (!pickupLL) return [];
    if (!destLL) return [{ latitude: pickupLL.lat, longitude: pickupLL.lng }];
    const pts: LatLng[] =
      lineCoords.length >= 2
        ? lineCoords
        : [
            { latitude: pickupLL.lat, longitude: pickupLL.lng },
            { latitude: destLL.lat, longitude: destLL.lng },
          ];
    return pts;
  }, [pickupLL, destLL, lineCoords]);

  useEffect(() => {
    const m = mapViewRef.current;
    if (!m || !pickupLL) return;
    const t = setTimeout(() => {
      try {
        if (destLL && fitCoords.length >= 2) {
          m.fitToCoordinates(fitCoords, {
            edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
            animated: true,
          });
        } else {
          m.animateToRegion(
            {
              latitude: pickupLL.lat,
              longitude: pickupLL.lng,
              latitudeDelta: 0.06,
              longitudeDelta: 0.06,
            },
            350,
          );
        }
      } catch {
        try {
          if (destLL) {
            const midLat = (pickupLL.lat + destLL.lat) / 2;
            const midLng = (pickupLL.lng + destLL.lng) / 2;
            m.animateToRegion(
              {
                latitude: midLat,
                longitude: midLng,
                latitudeDelta: Math.max(0.02, Math.abs(pickupLL.lat - destLL.lat) * 2.2),
                longitudeDelta: Math.max(0.02, Math.abs(pickupLL.lng - destLL.lng) * 2.2),
              },
              450,
            );
          } else {
            m.animateToRegion(
              {
                latitude: pickupLL.lat,
                longitude: pickupLL.lng,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              },
              350,
            );
          }
        } catch {
          /* ignore */
        }
      }
    }, 120);
    return () => clearTimeout(t);
  }, [fitCoords, mapViewRef, pickupLL?.lat, pickupLL?.lng, destLL?.lat, destLL?.lng]);

  if (!pickupLL) {
    return (
      <View style={[styles.mapContainer, styles.fallback]}>
        <Text style={styles.fallbackText}>Map needs a valid pickup location.</Text>
      </View>
    );
  }

  /** Avoid remounting MapView on every coord change — Android often crashes on rapid destroy/recreate. */
  return (
    <View style={styles.mapContainer} collapsable={false}>
      <MapView
        ref={mapViewRef as React.RefObject<MapView>}
        style={styles.map}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={{
          latitude: pickupLL.lat,
          longitude: pickupLL.lng,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        loadingEnabled
        showsTraffic={false}
        showsBuildings={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        showsIndoors={false}
        toolbarEnabled={false}
      >
        <Marker
          coordinate={{ latitude: pickupLL.lat, longitude: pickupLL.lng }}
          title="Pickup"
          description={pickupLabel}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <PulseDot color={COLORS.brandGreen} />
        </Marker>

        {destLL ? (
          <Marker
            coordinate={{ latitude: destLL.lat, longitude: destLL.lng }}
            title="Destination"
            description={destLabel}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <PulseDot color={COLORS.red} />
          </Marker>
        ) : null}

        {destLL && lineCoords.length >= 2 ? (
          <Polyline coordinates={lineCoords} strokeColor={COLORS.brandGreen} strokeWidth={4} />
        ) : null}

        {nearbyDrivers.map((driver, index) => {
          const d = parseCoordPair({ lat: driver.lat, lng: driver.lng });
          if (!d) return null;
          const keyId = driver.driver_id ? String(driver.driver_id) : `idx-${index}`;
          return (
            <Marker
              key={`nearby-${keyId}`}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              title={
                driver.name
                  ? `${String(driver.name)} • ${String(driver.vehicle || 'Car')}`
                  : String(driver.vehicle || 'Available driver')
              }
              description={String(driver.status || 'available nearby')}
              pinColor={driver.status === 'on_trip' ? '#9CA3AF' : COLORS.brandBlue}
            />
          );
        })}

        {activeLL ? (
          <Marker
            coordinate={{
              latitude: activeLL.lat,
              longitude: activeLL.lng,
            }}
            title={
              activeDriverMeta?.name
                ? `${String(activeDriverMeta.name)} • ${String(activeDriverMeta.vehicle || 'Car')}`
                : 'Your driver'
            }
            description={`${activeDriverMoving ? 'Moving' : 'Paused'}${
              activeDriverMeta?.plate ? ` • ${String(activeDriverMeta.plate)}` : ''
            }`}
            pinColor={activeDriverMoving ? COLORS.brandGreen : '#F59E0B'}
          />
        ) : null}
      </MapView>
    </View>
  );
}

export function RideMapDangerCircles({
  center,
  zones,
}: {
  center: { lat: number; lng: number };
  zones: Array<{ area: string; lat: number; lng: number }>;
}) {
  const M = MapView;
  return (
    <View style={styles.mapContainer}>
      <M
        style={styles.map}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: 0.12,
          longitudeDelta: 0.12,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {zones.slice(0, 8).map((z) => (
          <Circle
            key={z.area}
            center={{ latitude: z.lat, longitude: z.lng }}
            radius={750}
            strokeColor="rgba(239, 68, 68, 0.95)"
            fillColor="rgba(239, 68, 68, 0.18)"
            strokeWidth={2}
          />
        ))}
      </M>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    minHeight: 160,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2332',
  },
  fallbackText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
