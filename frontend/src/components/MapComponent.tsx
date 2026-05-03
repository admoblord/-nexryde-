import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '../constants/theme';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

interface MapComponentProps {
  pickup?: Location;
  dropoff?: Location;
  driverLocation?: Location;
  routeCoordinates?: { latitude: number; longitude: number }[];
  showTraffic?: boolean;
  onMapReady?: () => void;
  style?: any;
}

/* ─── Web / non-native fallback ───────────────────────────────── */
const WebPlaceholder: React.FC<MapComponentProps> = ({ pickup, dropoff, style }) => (
  <View style={[styles.placeholder, style]}>
    <View style={styles.placeholderContent}>
      <Ionicons name="map" size={60} color={COLORS.accent} />
      <Text style={styles.placeholderText}>Live Map View</Text>
      <Text style={styles.placeholderSubtext}>Available on mobile app</Text>

      {pickup && (
        <View style={styles.locationInfo}>
          <View style={styles.locationRow}>
            <View style={styles.pickupDot} />
            <Text style={styles.locationText} numberOfLines={1}>
              {pickup.address ||
                (Number.isFinite(pickup.latitude) && Number.isFinite(pickup.longitude)
                  ? `${pickup.latitude.toFixed(4)}, ${pickup.longitude.toFixed(4)}`
                  : 'Pickup')}
            </Text>
          </View>
        </View>
      )}

      {dropoff && (
        <View style={styles.locationInfo}>
          <View style={styles.locationRow}>
            <View style={styles.destDot} />
            <Text style={styles.locationText} numberOfLines={1}>
              {dropoff.address ||
                (Number.isFinite(dropoff.latitude) && Number.isFinite(dropoff.longitude)
                  ? `${dropoff.latitude.toFixed(4)}, ${dropoff.longitude.toFixed(4)}`
                  : 'Destination')}
            </Text>
          </View>
        </View>
      )}
    </View>
  </View>
);

/* ─── Dark map style ──────────────────────────────────────────── */
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0D1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8B9EB7' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0D1117' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1E2D3D' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#131C24' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2C3E50' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060E18' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/* ─── Native map component ────────────────────────────────────── */
const NativeMap: React.FC<MapComponentProps> = ({
  pickup,
  dropoff,
  driverLocation,
  routeCoordinates,
  showTraffic,
  onMapReady,
  style,
}) => {
  const MapView = require('react-native-maps').default;
  const { Marker, Polyline } = require('react-native-maps');
  const mapRef = useRef<any>(null);

  const hasPickup =
    pickup && Number.isFinite(pickup.latitude) && Number.isFinite(pickup.longitude);
  const hasDropoff =
    dropoff && Number.isFinite(dropoff.latitude) && Number.isFinite(dropoff.longitude);
  const hasDriver =
    driverLocation &&
    Number.isFinite(driverLocation.latitude) &&
    Number.isFinite(driverLocation.longitude);

  const initialRegion = hasPickup
    ? {
        latitude: pickup!.latitude,
        longitude: pickup!.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      }
    : {
        latitude: 6.5244,
        longitude: 3.3792,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

  // Fit to markers when both pickup & dropoff exist
  useEffect(() => {
    if (!mapRef.current || !hasPickup || !hasDropoff) return;
    const t = setTimeout(() => {
      try {
        const coords: { latitude: number; longitude: number }[] = [];
        if (hasPickup) coords.push({ latitude: pickup!.latitude, longitude: pickup!.longitude });
        if (hasDropoff)
          coords.push({ latitude: dropoff!.latitude, longitude: dropoff!.longitude });
        if (hasDriver)
          coords.push({
            latitude: driverLocation!.latitude,
            longitude: driverLocation!.longitude,
          });
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
          animated: true,
        });
      } catch {
        /* silent */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [
    hasPickup,
    hasDropoff,
    hasDriver,
    pickup?.latitude,
    pickup?.longitude,
    dropoff?.latitude,
    dropoff?.longitude,
  ]);

  const cleanRoute: { latitude: number; longitude: number }[] = Array.isArray(routeCoordinates)
    ? routeCoordinates.filter(
        (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
      )
    : [];

  return (
    <View style={[styles.nativeMap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        customMapStyle={DARK_STYLE}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        loadingEnabled
        showsTraffic={Boolean(showTraffic)}
        showsBuildings={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        showsIndoors={false}
        toolbarEnabled={false}
        onMapReady={onMapReady}
      >
        {/* Route polyline */}
        {cleanRoute.length >= 2 ? (
          <>
            <Polyline
              coordinates={cleanRoute}
              strokeColor="rgba(0,212,106,0.18)"
              strokeWidth={12}
            />
            <Polyline coordinates={cleanRoute} strokeColor="#00D46A" strokeWidth={3.5} />
          </>
        ) : null}

        {/* Pickup marker */}
        {hasPickup ? (
          <Marker
            coordinate={{ latitude: pickup!.latitude, longitude: pickup!.longitude }}
            title="Pickup"
            description={pickup!.address}
            pinColor="#22C55E"
            tracksViewChanges={false}
          />
        ) : null}

        {/* Dropoff marker */}
        {hasDropoff ? (
          <Marker
            coordinate={{ latitude: dropoff!.latitude, longitude: dropoff!.longitude }}
            title="Destination"
            description={dropoff!.address}
            pinColor="#EF4444"
            tracksViewChanges={false}
          />
        ) : null}

        {/* Driver location marker */}
        {hasDriver ? (
          <Marker
            coordinate={{
              latitude: driverLocation!.latitude,
              longitude: driverLocation!.longitude,
            }}
            title={driverLocation!.address || 'Your driver'}
            pinColor="#0EA5E9"
            tracksViewChanges={false}
          />
        ) : null}
      </MapView>
    </View>
  );
};

/* ─── Exported component ──────────────────────────────────────── */
export const MapComponent: React.FC<MapComponentProps> = (props) => {
  if (Platform.OS === 'web') {
    return <WebPlaceholder {...props} />;
  }
  return <NativeMap {...props} />;
};

export const MapPlaceholder: React.FC<{ style?: any }> = ({ style }) => (
  <View style={[styles.placeholder, style]}>
    <View style={styles.placeholderContent}>
      <Ionicons name="map" size={60} color={COLORS.gray300} />
      <Text style={styles.placeholderText}>Map View</Text>
      <Text style={styles.placeholderSubtext}>Live tracking enabled</Text>
    </View>
  </View>
);

export default MapComponent;

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
  },
  placeholderContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  placeholderText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  placeholderSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
  locationInfo: {
    marginTop: SPACING.lg,
    width: '100%',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  destDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: COLORS.error,
  },
  locationText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  nativeMap: {
    flex: 1,
    minHeight: 160,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    backgroundColor: '#0D1117',
  },
});
