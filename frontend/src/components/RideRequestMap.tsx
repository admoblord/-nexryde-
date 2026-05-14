/**
 * RideRequestMap — Nexryde 2030 full-screen A→B map for driver ride requests.
 *
 * Features:
 *  – Rider avatar / human-head marker at pickup (A)
 *  – Destination flag marker at dropoff (B)
 *  – Brand-colored polyline with glow (primary road path only — no straight A→B chord, no alternate overlays)
 *  – Traffic overlay (optional) + recenter control after pan
 *  – fitToCoordinates uses sampled route + driver; respects top/bottom chrome padding
 *  – Driver car dot (optional)
 *  – Route loaded asynchronously, no UI block
 */

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Image,
  Platform,
  TouchableOpacity,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  MapStyleElement,
} from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';

/* ─────────────────────── Dark night map style ─────────────────────── */
const NIGHT_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0a0f1e' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a6fa5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0f1e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a2a4a' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d1a30' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1d3a6e' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#5b8cff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#1a2f52' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0d1525' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1a2a40' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#7ba3d0' }] },
];

/* ─────────────────────── Types ─────────────────────── */
export interface RideRequestMapProps {
  pickupLat: number | null | undefined;
  pickupLng: number | null | undefined;
  dropLat: number | null | undefined;
  dropLng: number | null | undefined;
  routeCoords?: Array<{ lat: number; lng: number }> | null;
  riderPhoto?: string | null;
  riderInitial?: string;
  riderRiskColor?: string;
  driverLat?: number | null;
  driverLng?: number | null;
  /** Bottom padding to leave room for the trip card (px) */
  bottomPad?: number;
  /** Top edge padding for header / chips so fit does not clip under chrome */
  topPad?: number;
  /** Traffic overlay — helps drivers judge congestion before accepting */
  showTraffic?: boolean;
  onMapReady?: () => void;
}

/** Cap points passed to fitToCoordinates (large polylines are slow on some devices). */
function sampleCoordsForFit(
  coords: Array<{ latitude: number; longitude: number }>,
  maxPoints: number,
): Array<{ latitude: number; longitude: number }> {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const out: Array<{ latitude: number; longitude: number }> = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const last = coords[coords.length - 1];
  const prev = out[out.length - 1];
  if (prev && last && (prev.latitude !== last.latitude || prev.longitude !== last.longitude)) {
    out.push(last);
  }
  return out;
}

/* ─────────────────────── Rider avatar marker (Uber-style) ─────────────────────── */
function RiderAvatarMarker({
  photo,
  initial,
  riskColor,
  pulse,
}: {
  photo?: string | null;
  initial: string;
  riskColor: string;
  pulse: Animated.Value;
}) {
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.3, 0] });
  const [imgErr, setImgErr] = useState(false);

  return (
    <View style={markerS.riderWrap}>
      {/* Animated pulse ring */}
      <Animated.View
        style={[
          markerS.riderPulse,
          { borderColor: riskColor, transform: [{ scale: ringScale }], opacity: ringOpacity },
        ]}
      />
      {/* Avatar circle */}
      <View style={[markerS.riderCircle, { borderColor: riskColor }]}>
        {photo && !imgErr ? (
          <Image
            source={{ uri: photo }}
            style={markerS.riderImg}
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient colors={['#1e40af', '#1d4ed8']} style={markerS.riderImg}>
            <Text style={markerS.riderInitialText}>{initial}</Text>
          </LinearGradient>
        )}
      </View>
      {/* Label pill "A" — pickup / blue */}
      <View style={markerS.labelPillA}>
        <Text style={markerS.labelTextA}>A</Text>
      </View>
      {/* Stem */}
      <View style={[markerS.stem, { backgroundColor: riskColor }]} />
    </View>
  );
}

/* ─────────────────────── Destination marker ─────────────────────── */
function DestinationMarker() {
  return (
    <View style={markerS.destWrap}>
      <LinearGradient
        colors={['#ef4444', '#b91c1c']}
        style={markerS.destCircle}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name="flag" size={15} color="#FFF" />
      </LinearGradient>
      {/* Label pill "B" */}
      <View style={markerS.labelPillB}>
        <Text style={markerS.labelTextB}>B</Text>
      </View>
      <View style={[markerS.stem, { backgroundColor: '#ef4444' }]} />
    </View>
  );
}

/* ─────────────────────── Driver dot ─────────────────────── */
function DriverDot() {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1.5, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(p, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={markerS.driverWrap}>
      <Animated.View style={[markerS.driverPulse, { transform: [{ scale: p }] }]} />
      <View style={markerS.driverDot}>
        <Ionicons name="car-sport" size={10} color="#FFF" />
      </View>
    </View>
  );
}

/* ─────────────────────── Main component ─────────────────────── */
export default function RideRequestMap({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  routeCoords,
  riderPhoto,
  riderInitial = 'R',
  riderRiskColor = '#22E5A0',
  driverLat,
  driverLng,
  bottomPad = 300,
  topPad = 108,
  showTraffic = true,
  onMapReady,
}: RideRequestMapProps) {
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  /** Ref = source of truth for “driver panned”; avoids effect re-running on recenter (double-fit). */
  const userPannedRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  /* ── Pulse animation for rider marker ── */
  useEffect(() => {
    if (pulseLoopRef.current) pulseLoopRef.current.stop();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.delay(400),
        Animated.timing(pulseAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.delay(600),
      ])
    );
    pulseLoopRef.current.start();
    return () => { if (pulseLoopRef.current) pulseLoopRef.current.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Build polyline (road shape only — no A→B chord; avoids double line vs Directions curve) ── */
  const lineCoords = useMemo(() => {
    if (!routeCoords || routeCoords.length < DIRECTIONS_ROUTE_MIN_POINTS) return [];
    return routeCoords
      .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({ latitude: p.lat, longitude: p.lng }));
  }, [routeCoords]);

  const routeFitKey = useMemo(() => {
    if (lineCoords.length < 2) return 0;
    const a = lineCoords[0];
    const b = lineCoords[lineCoords.length - 1];
    return lineCoords.length + (a.latitude + a.longitude + b.latitude + b.longitude) * 1e5;
  }, [lineCoords]);

  const fitTripOnMap = useCallback(
    (animated: boolean) => {
      if (!mapRef.current) return;
      if (
        pickupLat == null ||
        pickupLng == null ||
        dropLat == null ||
        dropLng == null ||
        !Number.isFinite(pickupLat) ||
        !Number.isFinite(pickupLng) ||
        !Number.isFinite(dropLat) ||
        !Number.isFinite(dropLng)
      ) {
        return;
      }

      let pts: Array<{ latitude: number; longitude: number }>;
      if (lineCoords.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        pts = sampleCoordsForFit(lineCoords, 48);
      } else {
        pts = [
          { latitude: pickupLat, longitude: pickupLng },
          { latitude: dropLat, longitude: dropLng },
        ];
      }
      if (
        driverLat != null &&
        driverLng != null &&
        Number.isFinite(driverLat) &&
        Number.isFinite(driverLng)
      ) {
        pts = [...pts, { latitude: driverLat, longitude: driverLng }];
      }
      mapRef.current.fitToCoordinates(pts, {
        edgePadding: {
          top: Math.max(88, topPad),
          right: 52,
          bottom: bottomPad + 12,
          left: 52,
        },
        animated,
      });
    },
    [
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      bottomPad,
      topPad,
      driverLat,
      driverLng,
      lineCoords,
    ],
  );

  const tripRouteEpoch = useMemo(
    () =>
      `${pickupLat ?? ''}_${pickupLng ?? ''}_${dropLat ?? ''}_${dropLng ?? ''}_${routeFitKey}`,
    [pickupLat, pickupLng, dropLat, dropLng, routeFitKey],
  );

  const prevTripRouteEpochRef = useRef<string | null>(null);

  /* One fit path: new trip/route always refits; padding/driver updates refit only if driver did not pan */
  useEffect(() => {
    if (!mapReady) return;
    if (
      pickupLat == null ||
      pickupLng == null ||
      dropLat == null ||
      dropLng == null ||
      !Number.isFinite(pickupLat) ||
      !Number.isFinite(pickupLng) ||
      !Number.isFinite(dropLat) ||
      !Number.isFinite(dropLng)
    ) {
      return;
    }

    const epochChanged = prevTripRouteEpochRef.current !== tripRouteEpoch;
    prevTripRouteEpochRef.current = tripRouteEpoch;

    if (epochChanged) {
      userPannedRef.current = false;
      const t = setTimeout(() => fitTripOnMap(true), 380);
      return () => clearTimeout(t);
    }

    if (!userPannedRef.current) {
      const t = setTimeout(() => fitTripOnMap(true), 260);
      return () => clearTimeout(t);
    }
  }, [
    mapReady,
    tripRouteEpoch,
    bottomPad,
    topPad,
    driverLat,
    driverLng,
    fitTripOnMap,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
  ]);

  /** Google Maps-style blue */
  const ROUTE_BLUE = '#4285F4';
  const ROUTE_GLOW = 'rgba(66,133,244,0.22)';

  /* ── Initial region (center between A and B) ── */
  const initialRegion = useMemo(() => {
    if (
      pickupLat != null && pickupLng != null &&
      dropLat != null && dropLng != null
    ) {
      return {
        latitude: (pickupLat! + dropLat!) / 2,
        longitude: (pickupLng! + dropLng!) / 2,
        latitudeDelta: Math.max(0.04, Math.abs(pickupLat! - dropLat!) * 2.5),
        longitudeDelta: Math.max(0.04, Math.abs(pickupLng! - dropLng!) * 2.5),
      };
    }
    return { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.08, longitudeDelta: 0.08 };
  }, [pickupLat, pickupLng, dropLat, dropLng]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    onMapReady?.();
  }, [onMapReady]);

  const showA = pickupLat != null && pickupLng != null && Number.isFinite(pickupLat!);
  const showB = dropLat != null && dropLng != null && Number.isFinite(dropLat!);
  const showDriver = driverLat != null && driverLng != null && Number.isFinite(driverLat!);

  if (Platform.OS === 'web') {
    return (
      <View style={mapStyles.webFallback}>
        <Ionicons name="map" size={32} color="#22E5A0" />
        <Text style={mapStyles.webText}>Map — Mobile Only</Text>
      </View>
    );
  }

  return (
    <View style={mapStyles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={NIGHT_STYLE}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={showTraffic}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled={true}
        zoomEnabled={true}
        toolbarEnabled={false}
        onMapReady={handleMapReady}
        onPanDrag={() => {
          userPannedRef.current = true;
        }}
      >
        {/* Glow shadow polyline */}
        {lineCoords.length >= 2 && (
          <Polyline
            coordinates={lineCoords}
            strokeColor={ROUTE_GLOW}
            strokeWidth={14}
            geodesic
          />
        )}
        {/* Main route — road-snapped blue (slightly thicker for sun glare) */}
        {lineCoords.length >= 2 && (
          <Polyline
            coordinates={lineCoords}
            strokeColor={ROUTE_BLUE}
            strokeWidth={6}
            geodesic
            lineCap="round"
            lineJoin="round"
          />
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

        {/* Pickup — Rider avatar marker (A) */}
        {showA && (
          <Marker
            coordinate={{ latitude: pickupLat!, longitude: pickupLng! }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={true}
          >
            <RiderAvatarMarker
              photo={riderPhoto}
              initial={riderInitial}
              riskColor={riderRiskColor}
              pulse={pulseAnim}
            />
          </Marker>
        )}

        {/* Destination — flag marker (B) */}
        {showB && (
          <Marker
            coordinate={{ latitude: dropLat!, longitude: dropLng! }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <DestinationMarker />
          </Marker>
        )}
      </MapView>

      {/* Recenter after pan — keeps full trip in view */}
      <TouchableOpacity
        style={[mapStyles.recenterBtn, { bottom: bottomPad + 14 }]}
        onPress={() => {
          userPannedRef.current = false;
          fitTripOnMap(true);
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Recenter map on trip route"
      >
        <Ionicons name="locate" size={22} color="#E2E8F0" />
      </TouchableOpacity>
    </View>
  );
}

/* ─────────────────────── Marker styles ─────────────────────── */
const markerS = StyleSheet.create({
  /* Rider avatar */
  riderWrap: { alignItems: 'center', width: 60 },
  riderPulse: {
    position: 'absolute',
    top: 0,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
  },
  riderCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
    backgroundColor: '#1e40af',
  },
  riderImg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderInitialText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
  },
  /* Label pills */
  labelPillA: {
    backgroundColor: '#4285F4',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 3,
  },
  labelPillB: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 3,
  },
  labelTextA: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  labelTextB: { fontSize: 10, fontWeight: '900', color: '#FFF' },
  stem: { width: 2.5, height: 8 },

  /* Destination */
  destWrap: { alignItems: 'center' },
  destCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFF',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 7,
  },

  /* Driver dot */
  driverWrap: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36 },
  driverPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(59,130,246,0.3)',
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

/* ─────────────────────── Map styles ─────────────────────── */
const mapStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0f1e' },
  recenterBtn: {
    position: 'absolute',
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(8,12,22,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(66,133,244,0.45)',
    zIndex: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  webFallback: {
    flex: 1,
    backgroundColor: '#0a0f1e',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  webText: { color: '#94A3B8', fontSize: 14, fontWeight: '700' },
});
