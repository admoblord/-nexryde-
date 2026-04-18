import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const COLORS = {
  brandGreen: '#00D46A',
  brandBlue: '#0EA5E9',
  red: '#EF4444',
};

function parseCoordPair(
  coords: { lat?: unknown; lng?: unknown } | null | undefined
): { lat: number; lng: number } | null {
  if (!coords) return null;
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function sanitizePolyline(raw: unknown): { latitude: number; longitude: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { latitude: number; longitude: number }[] = [];
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

interface RideMapProps {
  mapRef: any;
  pickupCoords: { lat: number; lng: number };
  destinationCoords: { lat: number; lng: number };
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
  const pickupLL = parseCoordPair(pickupCoords);
  const destLL = parseCoordPair(destinationCoords);
  const lineCoords = useMemo(() => sanitizePolyline(routePolyline), [routePolyline]);
  const activeLL = parseCoordPair(activeDriverLocation ?? undefined);

  const pickupLabel = String(pickup ?? '');
  const destLabel = String(destination ?? '');

  if (!pickupLL || !destLL) {
    return (
      <View style={[styles.mapContainer, styles.fallback]}>
        <Text style={styles.fallbackText}>Map needs valid pickup and destination.</Text>
      </View>
    );
  }

  const mapKey = `booking-map-${pickupLL.lat}-${pickupLL.lng}-${destLL.lat}-${destLL.lng}`;

  // #region agent log
  fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'RideMap.native.tsx:MapView',message:'RideMap mounting MapView',data:{linePts:lineCoords.length,drivers:nearbyDrivers.length,mapKeyLen:mapKey.length},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion

  return (
    <View style={styles.mapContainer}>
      <MapView
        key={mapKey}
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: pickupLL.lat,
          longitude: pickupLL.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        loadingEnabled={true}
      >
        {/* Pickup Marker */}
        <Marker
          coordinate={{
            latitude: pickupLL.lat,
            longitude: pickupLL.lng,
          }}
          title="Pickup"
          description={pickupLabel}
          pinColor={COLORS.brandGreen}
        />

        {/* Destination Marker */}
        <Marker
          coordinate={{
            latitude: destLL.lat,
            longitude: destLL.lng,
          }}
          title="Destination"
          description={destLabel}
          pinColor={COLORS.red}
        />

        {/* Route Polyline */}
        {lineCoords.length > 0 && (
          <Polyline
            coordinates={lineCoords}
            strokeColor={COLORS.brandBlue}
            strokeWidth={4}
          />
        )}

        {/* Nearby available drivers */}
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

        {/* Assigned driver marker */}
        {activeLL && (
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
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  fallbackText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
