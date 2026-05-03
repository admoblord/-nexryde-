import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Circle,
  AnimatedRegion,
  type LatLng,
} from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/* ─── Map Styles ──────────────────────────────────────────────── */
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0D1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8B9EB7' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0D1117' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1E2D3D' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#131C24' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#253546' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2C3E50' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1A2332' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060E18' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5B7A9A' }],
  },
];

/* ─── Helpers ─────────────────────────────────────────────────── */
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

/** Compass bearing in degrees from point A → B */
function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Haversine distance in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Pulsing location dot ────────────────────────────────────── */
function PulseDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.4,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 850,
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
        shadowOpacity: 0.6,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
      }}
    />
  );
}

/* ─── Custom driver marker view ───────────────────────────────── */
function DriverMarkerView({
  initial,
  moving,
  profileImage,
}: {
  initial: string;
  moving: boolean;
  profileImage?: string | null;
}) {
  const glowOpacity = useRef(new Animated.Value(0.5)).current;
  const glowScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!moving) {
      glowOpacity.setValue(0.3);
      glowScale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.8,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.3,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(glowScale, {
            toValue: 1.3,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [moving, glowOpacity, glowScale]);

  const glowColor = moving ? '#22C55E' : '#F59E0B';
  const gradColors: [string, string] = moving
    ? ['#15803D', '#22C55E']
    : ['#92400E', '#F59E0B'];

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 52, height: 64 }}>
      {/* Outer animated glow */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: glowColor,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />
      {/* Avatar ring */}
      <LinearGradient
        colors={gradColors}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2.5,
          borderColor: '#FFFFFF',
          overflow: 'hidden',
          elevation: 12,
        }}
      >
        {profileImage ? (
          <Image
            source={{ uri: profileImage }}
            style={{ width: 40, height: 40, borderRadius: 20 }}
            resizeMode="cover"
          />
        ) : (
          <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFF' }}>
            {initial.toUpperCase()}
          </Text>
        )}
      </LinearGradient>
      {/* Car badge */}
      <View
        style={{
          marginTop: 3,
          backgroundColor: glowColor,
          borderRadius: 8,
          paddingHorizontal: 6,
          paddingVertical: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Ionicons name="car" size={9} color="#FFF" />
      </View>
    </View>
  );
}

/* ─── Animated driver marker ──────────────────────────────────── */
function AnimatedDriverMarker({
  lat,
  lng,
  moving,
  initial,
  profileImage,
}: {
  lat: number;
  lng: number;
  moving: boolean;
  initial: string;
  profileImage?: string | null;
}) {
  const markerRef = useRef<any>(null);
  const animCoord = useRef(
    new AnimatedRegion({ latitude: lat, longitude: lng, latitudeDelta: 0, longitudeDelta: 0 }),
  ).current;

  useEffect(() => {
    if (Platform.OS === 'android') {
      markerRef.current?.animateMarkerToCoordinate({ latitude: lat, longitude: lng }, 700);
    } else {
      animCoord
        .timing({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0,
          longitudeDelta: 0,
          duration: 700,
          useNativeDriver: false,
        })
        .start();
    }
  }, [lat, lng, animCoord]);

  // @ts-ignore — Marker.Animated exists in react-native-maps
  const MarkerAnimated = Marker.Animated as React.ComponentType<any>;

  return (
    <MarkerAnimated
      ref={markerRef}
      coordinate={animCoord}
      anchor={{ x: 0.5, y: 0.65 }}
      tracksViewChanges={moving}
      zIndex={10}
    >
      <DriverMarkerView initial={initial} moving={moving} profileImage={profileImage} />
    </MarkerAnimated>
  );
}

/* ─── Nearby driver mini marker ───────────────────────────────── */
function NearbyDriverMarker({ onTrip }: { onTrip: boolean }) {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: onTrip ? '#374151' : '#1E3A5F',
        borderWidth: 2,
        borderColor: onTrip ? '#6B7280' : '#0EA5E9',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="car" size={13} color={onTrip ? '#9CA3AF' : '#38BDF8'} />
    </View>
  );
}

/* ─── Driver preview card overlay ─────────────────────────────── */
function DriverPreviewCard({
  name,
  vehicle,
  plate,
  rating,
  profileImage,
  moving,
  etaMin,
  distanceKm,
  tripStatus,
}: {
  name: string;
  vehicle?: string;
  plate?: string;
  rating?: number;
  profileImage?: string | null;
  moving: boolean;
  etaMin: number | null;
  distanceKm: number | null;
  tripStatus?: string;
}) {
  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  const initial = (name || 'D').charAt(0).toUpperCase();
  const statusText =
    tripStatus === 'arrived'
      ? '📍 Driver has arrived'
      : tripStatus === 'ongoing'
      ? '🚗 Trip in progress'
      : etaMin != null
      ? `En route · ${etaMin} min away`
      : distanceKm != null
      ? `${distanceKm < 1 ? Math.round(distanceKm * 1000) + ' m' : distanceKm.toFixed(1) + ' km'} away`
      : 'On the way';

  const statusColor =
    tripStatus === 'arrived'
      ? '#F59E0B'
      : tripStatus === 'ongoing'
      ? '#22C55E'
      : '#38BDF8';

  return (
    <Animated.View
      style={[
        styles.driverCard,
        { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
      ]}
      pointerEvents="none"
    >
      <View style={styles.driverCardInner}>
        {/* Avatar */}
        <View style={styles.driverAvatarWrap}>
          {profileImage ? (
            <Image
              source={{ uri: profileImage }}
              style={styles.driverAvatarImg}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={['#1E3A5F', '#0EA5E9']}
              style={styles.driverAvatarGrad}
            >
              <Text style={styles.driverAvatarInitial}>{initial}</Text>
            </LinearGradient>
          )}
          {/* Online dot */}
          <View
            style={[
              styles.driverOnlineDot,
              { backgroundColor: moving ? '#22C55E' : '#F59E0B' },
            ]}
          />
        </View>

        {/* Info */}
        <View style={styles.driverCardInfo}>
          <Text style={styles.driverCardName} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.driverCardRow}>
            {vehicle ? (
              <Text style={styles.driverCardVehicle} numberOfLines={1}>
                {vehicle}
              </Text>
            ) : null}
            {plate ? (
              <View style={styles.plateBadge}>
                <Text style={styles.plateBadgeText}>{plate}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.driverCardStatusRow}>
            <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
            <Text style={[styles.driverCardStatus, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Rating */}
        {rating != null && rating > 0 ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#FBBF24" />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/* ─── Driver Approaching Counter ─────────────────────────────── */
function DriverApproachingBar({ distanceKm }: { distanceKm: number }) {
  const distM = Math.round(distanceKm * 1000);
  const fillAnim = useRef(new Animated.Value(0)).current;
  const maxShow = 800; // show this bar when < 800 m away

  useEffect(() => {
    const pct = Math.max(0, Math.min(1, 1 - distM / maxShow));
    Animated.timing(fillAnim, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [distM]);

  const color = distM > 400 ? '#22C55E' : distM > 150 ? '#F59E0B' : '#EF4444';
  const label =
    distM < 50 ? 'Almost there!' : distM < 1000 ? `${distM} m away` : `${distanceKm.toFixed(1)} km`;

  return (
    <View style={approachStyles.wrap}>
      <View style={approachStyles.bar}>
        <Animated.View
          style={[
            approachStyles.fill,
            {
              width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <View style={approachStyles.labelRow}>
        <Ionicons name="car-sport" size={13} color={color} />
        <Text style={[approachStyles.label, { color }]}>Driver is {label}</Text>
      </View>
    </View>
  );
}

const approachStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    zIndex: 20,
    gap: 4,
  },
  bar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});

/* ─── Driver Arrived Banner ───────────────────────────────────── */
function DriverArrivedBanner() {
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        arrivedBannerStyles.wrap,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <LinearGradient
        colors={['#052e16', '#14532d']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={arrivedBannerStyles.banner}
      >
        <View style={arrivedBannerStyles.iconWrap}>
          <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={arrivedBannerStyles.title}>Your driver has arrived!</Text>
          <Text style={arrivedBannerStyles.sub}>
            Share your 4-digit pickup code when you meet your driver
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const arrivedBannerStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 25,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#22C55E',
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 11,
    color: 'rgba(134,239,172,0.8)',
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 15,
  },
});

/* ─── ETA chip overlay ────────────────────────────────────────── */
function EtaChip({ etaMin, distanceKm }: { etaMin: number | null; distanceKm: number | null }) {
  if (etaMin == null && distanceKm == null) return null;
  const label =
    etaMin != null
      ? `${etaMin} min`
      : distanceKm != null && distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm?.toFixed(1)} km`;

  return (
    <View style={styles.etaChip}>
      <Ionicons name="time-outline" size={12} color="#22C55E" />
      <Text style={styles.etaChipText}>{label}</Text>
    </View>
  );
}

/* ─── Re-center button ────────────────────────────────────────── */
function RecenterButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.recenterBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="locate" size={18} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

/* ─── Props ───────────────────────────────────────────────────── */
export interface RideMapProps {
  mapRef: React.RefObject<MapView | null> | null;
  pickupCoords: { lat: number; lng: number };
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
  activeDriverMeta?: {
    name?: string;
    vehicle?: string;
    plate?: string;
    rating?: number;
    profileImage?: string | null;
  } | null;
  /** 'accepted' | 'arrived' | 'ongoing' — drives preview card text */
  tripStatus?: string;
}

/* ─── Main component ──────────────────────────────────────────── */
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
  tripStatus,
}: RideMapProps) {
  const internalRef = useRef<MapView>(null);
  const mapViewRef = (mapRef ?? internalRef) as React.RefObject<MapView>;

  const prevDriverRef = useRef<{ lat: number; lng: number } | null>(null);
  const bearingRef = useRef<number>(0);
  const [userPanned, setUserPanned] = useState(false);

  const pickupLL = parseCoordPair(pickupCoords);
  const destLL = parseCoordPair(destinationCoords ?? undefined);
  const lineCoords = useMemo(() => sanitizePolyline(routePolyline), [routePolyline]);
  const activeLL = parseCoordPair(activeDriverLocation ?? undefined);

  const pickupLabel = String(pickup ?? '');
  const destLabel = String(destination ?? '');

  /* ── ETA & distance computation ── */
  const { etaMin, distanceKm } = useMemo(() => {
    if (!activeLL || !pickupLL) return { etaMin: null, distanceKm: null };
    const targetLat =
      tripStatus === 'ongoing' && destLL ? destLL.lat : pickupLL.lat;
    const targetLng =
      tripStatus === 'ongoing' && destLL ? destLL.lng : pickupLL.lng;
    const km = haversineKm(activeLL.lat, activeLL.lng, targetLat, targetLng);
    const avgSpeedKmH = activeDriverMoving ? 28 : 15;
    const min = Math.round((km / avgSpeedKmH) * 60);
    return { etaMin: min < 1 ? 1 : min > 120 ? null : min, distanceKm: km };
  }, [activeLL?.lat, activeLL?.lng, pickupLL?.lat, pickupLL?.lng, destLL?.lat, destLL?.lng, activeDriverMoving, tripStatus]);

  /* ── Initial fit-to-route ── */
  const fitCoords = useMemo(() => {
    if (!pickupLL) return [];
    if (!destLL) return [{ latitude: pickupLL.lat, longitude: pickupLL.lng }];
    return lineCoords.length >= 2
      ? lineCoords
      : [
          { latitude: pickupLL.lat, longitude: pickupLL.lng },
          { latitude: destLL.lat, longitude: destLL.lng },
        ];
  }, [pickupLL, destLL, lineCoords]);

  useEffect(() => {
    const m = mapViewRef.current;
    if (!m || !pickupLL || userPanned) return;
    const t = setTimeout(() => {
      try {
        if (destLL && fitCoords.length >= 2) {
          m.fitToCoordinates(fitCoords, {
            edgePadding: { top: 60, right: 48, bottom: 120, left: 48 },
            animated: true,
          });
        } else {
          m.animateToRegion(
            { latitude: pickupLL.lat, longitude: pickupLL.lng, latitudeDelta: 0.06, longitudeDelta: 0.06 },
            350,
          );
        }
      } catch {
        /* silent */
      }
    }, 150);
    return () => clearTimeout(t);
  }, [fitCoords, userPanned, pickupLL?.lat, pickupLL?.lng, destLL?.lat, destLL?.lng]);

  /* ── Bearing-aware camera follow ── */
  useEffect(() => {
    if (!activeLL) return;
    const m = mapViewRef.current;
    const prev = prevDriverRef.current;

    // Calculate bearing from previous position
    if (prev && (prev.lat !== activeLL.lat || prev.lng !== activeLL.lng)) {
      bearingRef.current = calcBearing(prev.lat, prev.lng, activeLL.lat, activeLL.lng);
    }
    prevDriverRef.current = activeLL;

    if (m && activeDriverMoving && !userPanned) {
      const distMoved = prev
        ? haversineKm(prev.lat, prev.lng, activeLL.lat, activeLL.lng) * 1000
        : 999;
      // Only re-center camera when driver has actually moved (>5m)
      if (distMoved > 5 || !prev) {
        m.animateCamera(
          {
            center: { latitude: activeLL.lat, longitude: activeLL.lng },
            zoom: 16,
            heading: bearingRef.current,
            pitch: 20,
          },
          { duration: 800 },
        );
      }
    }
  }, [activeLL?.lat, activeLL?.lng, activeDriverMoving, userPanned]);

  const handleRecenter = () => {
    setUserPanned(false);
    const m = mapViewRef.current;
    if (!m || !activeLL) return;
    m.animateCamera(
      {
        center: { latitude: activeLL.lat, longitude: activeLL.lng },
        zoom: 16,
        heading: bearingRef.current,
        pitch: 15,
      },
      { duration: 600 },
    );
  };

  if (!pickupLL) {
    return (
      <View style={[styles.mapContainer, styles.fallback]}>
        <Text style={styles.fallbackText}>Map needs a valid pickup location.</Text>
      </View>
    );
  }

  const driverInitial = (activeDriverMeta?.name ?? 'D').charAt(0);

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
        showsTraffic={tripStatus === 'ongoing'}
        showsBuildings={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        showsIndoors={false}
        toolbarEnabled={false}
        onPanDrag={() => setUserPanned(true)}
      >
        {/* ── Route: glow underlay + bright top layer ── */}
        {destLL && lineCoords.length >= 2 ? (
          <>
            <Polyline
              coordinates={lineCoords}
              strokeColor="rgba(0,212,106,0.18)"
              strokeWidth={14}
            />
            <Polyline
              coordinates={lineCoords}
              strokeColor="#00D46A"
              strokeWidth={4}
              lineDashPattern={activeLL ? undefined : [10, 6]}
            />
          </>
        ) : null}

        {/* ── Driver → pickup dashed guide (accepted state) ── */}
        {activeLL && pickupLL && tripStatus === 'accepted' ? (
          <Polyline
            coordinates={[
              { latitude: activeLL.lat, longitude: activeLL.lng },
              { latitude: pickupLL.lat, longitude: pickupLL.lng },
            ]}
            strokeColor="rgba(56,189,248,0.5)"
            strokeWidth={2.5}
            lineDashPattern={[6, 5]}
          />
        ) : null}

        {/* ── Pickup marker ── */}
        <Marker
          coordinate={{ latitude: pickupLL.lat, longitude: pickupLL.lng }}
          title="Pickup"
          description={pickupLabel}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={5}
        >
          <PulseDot color="#22C55E" />
        </Marker>

        {/* ── Destination marker ── */}
        {destLL ? (
          <Marker
            coordinate={{ latitude: destLL.lat, longitude: destLL.lng }}
            title="Destination"
            description={destLabel}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={5}
          >
            <PulseDot color="#EF4444" />
          </Marker>
        ) : null}

        {/* ── Nearby available drivers ── */}
        {nearbyDrivers.map((driver, index) => {
          const d = parseCoordPair({ lat: driver.lat, lng: driver.lng });
          if (!d) return null;
          const keyId = driver.driver_id ? String(driver.driver_id) : `idx-${index}`;
          return (
            <Marker
              key={`nearby-${keyId}`}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              title={driver.name ? `${String(driver.name)} · ${String(driver.vehicle || 'Car')}` : String(driver.vehicle || 'Available driver')}
              description={String(driver.status || 'available nearby')}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={3}
            >
              <NearbyDriverMarker onTrip={driver.status === 'on_trip'} />
            </Marker>
          );
        })}

        {/* ── Active driver — animated smooth marker ── */}
        {activeLL ? (
          <AnimatedDriverMarker
            lat={activeLL.lat}
            lng={activeLL.lng}
            moving={activeDriverMoving}
            initial={driverInitial}
            profileImage={activeDriverMeta?.profileImage}
          />
        ) : null}
      </MapView>

      {/* ── Driver arrived banner (top) ── */}
      {tripStatus === 'arrived' ? <DriverArrivedBanner /> : null}

      {/* ── Driver approaching distance bar (when within 800 m) ── */}
      {tripStatus === 'accepted' && activeLL && distanceKm != null && distanceKm < 0.8 ? (
        <DriverApproachingBar distanceKm={distanceKm} />
      ) : null}

      {/* ── ETA chip top-right ── */}
      {activeLL && (tripStatus === 'accepted' || tripStatus === 'ongoing') && tripStatus !== 'arrived' ? (
        <EtaChip etaMin={etaMin} distanceKm={distanceKm} />
      ) : null}

      {/* ── Re-center button (shows after user pans) ── */}
      {userPanned && activeLL ? <RecenterButton onPress={handleRecenter} /> : null}

      {/* ── Driver preview card ── */}
      {activeLL && activeDriverMeta && tripStatus !== 'arrived' ? (
        <DriverPreviewCard
          name={String(activeDriverMeta.name || 'Driver')}
          vehicle={activeDriverMeta.vehicle}
          plate={activeDriverMeta.plate}
          rating={activeDriverMeta.rating}
          profileImage={activeDriverMeta.profileImage}
          moving={activeDriverMoving}
          etaMin={etaMin}
          distanceKm={distanceKm}
          tripStatus={tripStatus}
        />
      ) : null}
    </View>
  );
}

/* ─── Danger circles (unchanged) ─────────────────────────────── */
export function RideMapDangerCircles({
  center,
  zones,
}: {
  center: { lat: number; lng: number };
  zones: Array<{ area: string; lat: number; lng: number }>;
}) {
  return (
    <View style={styles.mapContainer}>
      <MapView
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
        {zones.slice(0, 8).map((z, idx) => (
          <Circle
            key={`zone-${idx}-${z.area}`}
            center={{ latitude: z.lat, longitude: z.lng }}
            radius={750}
            strokeColor="rgba(239, 68, 68, 0.95)"
            fillColor="rgba(239, 68, 68, 0.18)"
            strokeWidth={2}
          />
        ))}
      </MapView>
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    minHeight: 200,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1117',
  },
  fallbackText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },

  /* ETA chip */
  etaChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    backdropFilter: 'blur(8px)',
  },
  etaChipText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Re-center button */
  recenterBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  /* Driver preview card */
  driverCard: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  driverCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,16,25,0.92)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  driverAvatarWrap: {
    position: 'relative',
  },
  driverAvatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  driverAvatarGrad: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0EA5E9',
  },
  driverAvatarInitial: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFF',
  },
  driverOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0A1019',
  },
  driverCardInfo: {
    flex: 1,
    gap: 2,
  },
  driverCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  driverCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driverCardVehicle: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  plateBadge: {
    backgroundColor: 'rgba(14,165,233,0.15)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.3)',
  },
  plateBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  driverCardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  driverCardStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
});
