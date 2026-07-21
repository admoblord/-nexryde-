import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '../constants/theme';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '../navigation/navUtils';
import { NEXRYDE_MAP_STYLE } from '../constants/nexrydeMapBehavior';

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

  const cleanRoute: { latitude: number; longitude: number }[] = Array.isArray(routeCoordinates)
    ? routeCoordinates.filter(
        (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
      )
    : [];

  // Fit to route polyline when present, else pickup + dropoff (+ driver).
  useEffect(() => {
    if (!mapRef.current || !hasPickup || !hasDropoff) return;
    const t = setTimeout(() => {
      try {
        let coordsFit: { latitude: number; longitude: number }[] = [];
        if (cleanRoute.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
          if (cleanRoute.length <= 48) coordsFit = cleanRoute;
          else {
            const n = cleanRoute.length;
            const max = 48;
            for (let i = 0; i < max; i++) {
              const idx = Math.min(n - 1, Math.round((i / Math.max(1, max - 1)) * (n - 1)));
              coordsFit.push(cleanRoute[idx]!);
            }
          }
        } else {
          if (hasPickup) coordsFit.push({ latitude: pickup!.latitude, longitude: pickup!.longitude });
          if (hasDropoff) coordsFit.push({ latitude: dropoff!.latitude, longitude: dropoff!.longitude });
          if (hasDriver)
            coordsFit.push({
              latitude: driverLocation!.latitude,
              longitude: driverLocation!.longitude,
            });
        }
        if (coordsFit.length < 1) return;
        mapRef.current.fitToCoordinates(coordsFit, {
          edgePadding: { top: 80, right: 44, bottom: 80, left: 44 },
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
    cleanRoute.length,
  ]);

  return (
    <View style={[styles.nativeMap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider="google"
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        loadingEnabled={false}
        loadingBackgroundColor="#0D1420"
        showsTraffic={Boolean(showTraffic)}
        showsBuildings={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        showsIndoors={false}
        toolbarEnabled={false}
        onMapReady={onMapReady}
        customMapStyle={NEXRYDE_MAP_STYLE}
      >
        {/* Route polyline — layered NEXRYDE greens */}
        {cleanRoute.length >= DIRECTIONS_ROUTE_MIN_POINTS ? (
          <>
            <Polyline
              coordinates={cleanRoute}
              strokeColor="rgba(74,222,128,0.18)"
              strokeWidth={20}
              geodesic={false}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={cleanRoute}
              strokeColor="rgba(0,212,106,0.45)"
              strokeWidth={10}
              geodesic={false}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={cleanRoute}
              strokeColor={COLORS.accentGreenLight}
              strokeWidth={3}
              geodesic={false}
              lineCap="round"
              lineJoin="round"
            />
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
export const MapComponent: React.FC<MapComponentProps> = React.memo((props) => {
  if (Platform.OS === 'web') {
    return <WebPlaceholder {...props} />;
  }
  return <NativeMap {...props} />;
});

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
