/**
 * DriverOfferRoutePreview — 2026 edition
 *
 * Full-bleed map preview for incoming ride offers.
 * Custom view markers, dark map style, floating info chips,
 * driver position dot, animated polyline, and location breakdown.
 */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, MapStyleElement } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SkeletonBlock } from '@/src/components/ui/SkeletonBlock';

export type PreviewCoord = { lat: number; lng: number };

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type Props = {
  routePreviewCoordinates?: PreviewCoord[] | null;
  mapPreviewRegion?: MapRegion | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
  areaSummaryLine?: string | null;
  distanceKm?: number | null;
  durationMins?: number | null;
  distToPickupKm?: number | null;
  etaToPickupMin?: number | null;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  /** Driver's current GPS position */
  driverLat?: number | null;
  driverLng?: number | null;
  /** Map height in px */
  mapHeight?: number;
  interactive?: boolean;
  interactionLocked?: boolean;
  darkOverlay?: boolean;
};

/* ───── Dark map style (Google Maps Night) ───── */
const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f2744' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1d4ed8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0ea5e9' }, { lightness: -60 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0f1f35' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
];

/* ───── Custom marker views ───── */
function PickupMarker() {
  return (
    <View style={markerStyles.wrap}>
      <LinearGradient colors={['#22c55e', '#16a34a']} style={markerStyles.circle}>
        <Ionicons name="location" size={14} color="#FFF" />
      </LinearGradient>
      <View style={[markerStyles.stem, { backgroundColor: '#22c55e' }]} />
      <View style={markerStyles.labelWrap}>
        <Text style={markerStyles.labelText}>A · Pickup</Text>
      </View>
    </View>
  );
}

function DropoffMarker() {
  return (
    <View style={markerStyles.wrap}>
      <LinearGradient colors={['#ef4444', '#dc2626']} style={markerStyles.circle}>
        <Ionicons name="flag" size={13} color="#FFF" />
      </LinearGradient>
      <View style={[markerStyles.stem, { backgroundColor: '#ef4444' }]} />
      <View style={markerStyles.labelWrap}>
        <Text style={markerStyles.labelText}>B · Drop-off</Text>
      </View>
    </View>
  );
}

function DriverDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [pulse]);
  return (
    <View style={markerStyles.driverWrap}>
      <Animated.View style={[markerStyles.driverPulse, { transform: [{ scale: pulse }] }]} />
      <View style={markerStyles.driverDot}>
        <Ionicons name="car" size={11} color="#FFF" />
      </View>
    </View>
  );
}

/* ───── Main component ───── */
export default function DriverOfferRoutePreview({
  routePreviewCoordinates,
  mapPreviewRegion,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  areaSummaryLine,
  distanceKm,
  durationMins,
  distToPickupKm,
  etaToPickupMin,
  pickupAddress,
  dropAddress,
  driverLat,
  driverLng,
  mapHeight = 200,
  interactive = false,
  interactionLocked = false,
  darkOverlay = false,
}: Props) {
  const [mapReady, setMapReady] = useState(Platform.OS === 'web');
  const polylineAnim = useRef(new Animated.Value(0)).current;

  const region = useMemo((): MapRegion => {
    if (mapPreviewRegion) {
      return {
        latitude: mapPreviewRegion.latitude,
        longitude: mapPreviewRegion.longitude,
        latitudeDelta: Math.max(0.06, mapPreviewRegion.latitudeDelta),
        longitudeDelta: Math.max(0.06, mapPreviewRegion.longitudeDelta),
      };
    }
    if (pickupLat != null && pickupLng != null && dropLat != null && dropLng != null) {
      const midLat = (pickupLat + dropLat) / 2;
      const midLng = (pickupLng + dropLng) / 2;
      const dlat = Math.abs(pickupLat - dropLat);
      const dlng = Math.abs(pickupLng - dropLng);
      return {
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: Math.max(0.06, dlat * 2.4 + 0.04),
        longitudeDelta: Math.max(0.06, dlng * 2.4 + 0.04),
      };
    }
    // Lagos default
    return { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.2, longitudeDelta: 0.2 };
  }, [mapPreviewRegion, pickupLat, pickupLng, dropLat, dropLng]);

  const lineCoords = useMemo(() => {
    const raw = routePreviewCoordinates || [];
    const valid = raw
      .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({ latitude: p.lat, longitude: p.lng }));
    // If no polyline but we have pickup + drop, draw straight fallback
    if (valid.length < 2 && pickupLat != null && dropLat != null) {
      return [
        { latitude: pickupLat!, longitude: pickupLng! },
        { latitude: dropLat!, longitude: dropLng! },
      ];
    }
    return valid;
  }, [routePreviewCoordinates, pickupLat, pickupLng, dropLat, dropLng]);

  const regionKey = `${region.latitude.toFixed(4)},${region.longitude.toFixed(4)}`;
  useEffect(() => { setMapReady(Platform.OS === 'web'); }, [regionKey]);

  useEffect(() => {
    if (mapReady && lineCoords.length >= 2) {
      polylineAnim.setValue(0);
      Animated.timing(polylineAnim, {
        toValue: 1, duration: 1200, useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }).start();
    }
  }, [mapReady, lineCoords.length]);

  const showA = pickupLat != null && pickupLng != null && Number.isFinite(pickupLat);
  const showB = dropLat != null && dropLng != null && Number.isFinite(dropLat);
  const showDriver = driverLat != null && driverLng != null && Number.isFinite(driverLat!);
  const allowPanZoom = interactive && !interactionLocked;
  const hasPoly = lineCoords.length >= 2;
  const isStraightLine = hasPoly && (routePreviewCoordinates == null || routePreviewCoordinates.length < 2);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webFallback, { height: mapHeight }]}>
        <Ionicons name="map" size={28} color="#475569" />
        <Text style={styles.webTitle}>Route Preview</Text>
        {areaSummaryLine ? <Text style={styles.webSub}>{areaSummaryLine}</Text> : null}
        {distanceKm != null && <Text style={styles.webMeta}>{Number(distanceKm).toFixed(1)} km · ~{durationMins ?? '?'} min</Text>}
      </View>
    );
  }

  return (
    <View style={[styles.container, { height: mapHeight }, darkOverlay && styles.containerDark]}>
      {/* Map */}
      {!mapReady && (
        <SkeletonBlock style={[StyleSheet.absoluteFillObject, { zIndex: 10, borderRadius: 0 }]} />
      )}
      <MapView
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={region}
        scrollEnabled={allowPanZoom}
        zoomEnabled={allowPanZoom}
        zoomTapEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        mapPadding={{ top: 8, right: 8, bottom: 60, left: 8 }}
        onMapReady={() => setMapReady(true)}
      >
        {/* Route polyline */}
        {hasPoly && (
          <>
            {/* Glow shadow line */}
            <Polyline
              coordinates={lineCoords}
              strokeColor="rgba(14,165,233,0.25)"
              strokeWidth={10}
              lineDashPattern={isStraightLine ? [8, 6] : undefined}
            />
            {/* Main route line */}
            <Polyline
              coordinates={lineCoords}
              strokeColor="#0ea5e9"
              strokeWidth={4}
              lineDashPattern={isStraightLine ? [8, 6] : undefined}
              geodesic
            />
          </>
        )}

        {/* Driver dot */}
        {showDriver && (
          <Marker
            coordinate={{ latitude: driverLat!, longitude: driverLng! }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <DriverDot />
          </Marker>
        )}

        {/* Pickup marker */}
        {showA && (
          <Marker
            coordinate={{ latitude: pickupLat!, longitude: pickupLng! }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <PickupMarker />
          </Marker>
        )}

        {/* Dropoff marker */}
        {showB && (
          <Marker
            coordinate={{ latitude: dropLat!, longitude: dropLng! }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <DropoffMarker />
          </Marker>
        )}
      </MapView>

      {/* Top-left: distance to pickup chip */}
      {distToPickupKm != null && (
        <View style={styles.chipTopLeft}>
          <Ionicons name="navigate" size={12} color="#0ea5e9" />
          <Text style={styles.chipText}>
            {distToPickupKm < 1
              ? `${Math.round(distToPickupKm * 1000)}m to pickup`
              : `${distToPickupKm.toFixed(1)}km to pickup`}
          </Text>
          {etaToPickupMin != null && (
            <Text style={styles.chipTextMuted}> · ~{etaToPickupMin}min</Text>
          )}
        </View>
      )}

      {/* Top-right: trip stats chip */}
      {(distanceKm != null || durationMins != null) && (
        <View style={styles.chipTopRight}>
          {distanceKm != null && (
            <Text style={styles.chipText}>{Number(distanceKm).toFixed(distanceKm >= 10 ? 0 : 1)}km</Text>
          )}
          {distanceKm != null && durationMins != null && (
            <Text style={styles.chipTextMuted}> · </Text>
          )}
          {durationMins != null && (
            <Text style={styles.chipText}>~{durationMins}min</Text>
          )}
        </View>
      )}

      {/* Bottom: address strip */}
      <View style={styles.addressStrip}>
        {(pickupAddress || areaSummaryLine) && (
          <View style={styles.addressRow}>
            <View style={[styles.addressDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.addressText} numberOfLines={1}>
              {pickupAddress || areaSummaryLine}
            </Text>
          </View>
        )}
        {dropAddress && (
          <View style={[styles.addressRow, { marginTop: 4 }]}>
            <View style={[styles.addressDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.addressText} numberOfLines={1}>{dropAddress}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ───── Marker styles ───── */
const markerStyles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  stem: { width: 2, height: 6 },
  labelWrap: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  labelText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  driverWrap: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36 },
  driverPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(99,179,237,0.35)',
  },
  driverDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 5,
  },
});

/* ───── Main styles ───── */
const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#0f172a',
  },
  containerDark: {
    marginHorizontal: 16,
    width: undefined,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },

  // Floating chips
  chipTopLeft: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(14,165,233,0.4)',
    gap: 4,
  },
  chipTopRight: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipText: { fontSize: 11, fontWeight: '800', color: '#e2e8f0' },
  chipTextMuted: { fontSize: 11, fontWeight: '600', color: '#64748b' },

  // Address strip at bottom of map
  addressStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15,23,42,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  addressText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#cbd5e1' },

  // Web fallback
  webFallback: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  webTitle: { fontSize: 14, fontWeight: '800', color: '#94a3b8' },
  webSub: { fontSize: 12, fontWeight: '600', color: '#64748b', textAlign: 'center', paddingHorizontal: 20 },
  webMeta: { fontSize: 12, fontWeight: '700', color: '#0ea5e9' },
});
