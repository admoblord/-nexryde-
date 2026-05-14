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
  Alert,
  Dimensions,
  ScrollView,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

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

/** Nexryde rider assignment / pickup sheet palette */
const NR_GREEN = '#00D084';
const NR_BG = '#1A1A2E';
const NR_TEXT = '#FFFFFF';
const NR_MUTED = '#B0B0B0';
const NR_ERR = '#FF3B30';
const NR_BLUE = '#2563EB';

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
      // AnimatedRegion.timing sets per-axis toValue from latitude/longitude keys (see react-native-maps).
      animCoord
        .timing({
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0,
          longitudeDelta: 0,
          duration: 700,
          useNativeDriver: false,
        } as Parameters<AnimatedRegion['timing']>[0])
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

function formatRiderApproachMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

/** Elapsed in-ride time for ongoing trip stats chip (e.g. `12 min 30 sec`). */
function formatTripElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  return `${m} min ${String(s).padStart(2, '0')} sec`;
}

function NexRydeWordmarkMini() {
  return (
    <View style={assignStyles.wordmarkMini} pointerEvents="none">
      <Text style={assignStyles.wordmarkNex}>NEX</Text>
      <Text style={assignStyles.wordmarkRyde}>RYDE</Text>
    </View>
  );
}

/* ─── Embedded assignment / pickup sheet (Bolt / Uber style) ─── */
function DriverAssignmentSheet({
  name,
  vehicle,
  vehicleColor,
  plate,
  rating,
  profileImage,
  moving,
  etaMin,
  distanceKm,
  tripStatus,
  pickupLine,
  dropoffLine,
  pickupVicinityLabel,
  fareDisplay,
  fareSubLabel,
  arrivalCountdownSec,
  rideAcceptedSubtitle,
  onCall,
  onChat,
  callAvailable,
  onVerifyIdentity,
  identityConfirmed,
  onShowPickupCode,
  onCancelRide,
  onReportBadPickup,
  onOpenTripMenu,
  sheetBottom,
  etaTrafficAware,
  tripCount,
}: {
  name: string;
  vehicle?: string;
  vehicleColor?: string | null;
  plate?: string;
  rating?: number;
  profileImage?: string | null;
  moving: boolean;
  etaMin: number | null;
  distanceKm: number | null;
  tripStatus: string;
  pickupLine: string;
  dropoffLine: string;
  pickupVicinityLabel?: string;
  fareDisplay?: string | null;
  fareSubLabel?: string;
  arrivalCountdownSec: number | null;
  rideAcceptedSubtitle?: string;
  onCall?: () => void;
  onChat?: () => void;
  callAvailable?: boolean;
  onVerifyIdentity?: () => void;
  identityConfirmed?: boolean;
  onShowPickupCode?: () => void;
  onCancelRide?: () => void;
  onReportBadPickup?: () => void;
  onOpenTripMenu?: () => void;
  sheetBottom: number;
  /** True when ETA comes from Google Directions (traffic). */
  etaTrafficAware?: boolean;
  tripCount?: number | null;
}) {
  const slideAnim = useRef(new Animated.Value(48)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sheetW = Dimensions.get('window').width - 20;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  const initial = (name || 'D').charAt(0).toUpperCase();
  const vehicleLine = [vehicle, vehicleColor].filter(Boolean).join(' · ') || '';

  const isArrived = tripStatus === 'arrived';
  const hasCountdown = !isArrived && arrivalCountdownSec != null && arrivalCountdownSec > 0;
  const etaMinuteVal = etaMin != null && etaMin >= 1 ? etaMin : null;

  const handleConfirmPickup = () => {
    if (!onShowPickupCode) return;
    if (tripStatus === 'accepted') {
      Alert.alert(
        'Confirm pickup',
        'Only continue once you are with your driver so your pickup code stays secure.',
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onShowPickupCode();
            },
          },
        ],
      );
      return;
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onShowPickupCode();
  };

  return (
    <Animated.View
      style={[
        assignStyles.wrap,
        {
          bottom: sheetBottom,
          width: sheetW,
          alignSelf: 'center',
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={assignStyles.cardOuter} pointerEvents="auto">
        <View style={assignStyles.sheetHandle} accessibilityLabel="Trip details sheet" />

        {isArrived ? (
          <>
            <LinearGradient
              colors={['rgba(251,191,36,0.45)', 'rgba(120,53,15,0.2)', 'rgba(26,26,46,0.05)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={assignStyles.phaseBar}
            >
              <View style={assignStyles.phaseBarInner}>
                <View style={[assignStyles.phaseLiveDot, { backgroundColor: moving ? '#4ADE80' : '#FBBF24' }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={assignStyles.phaseTitle}>Driver arrived</Text>
                  <Text style={assignStyles.phaseSubtitle} numberOfLines={2}>
                    Walk to the mint pickup pin — verify the plate before you get in.
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <View style={assignStyles.topRow}>
              <View style={assignStyles.avatarRing}>
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={assignStyles.avatarImg}
                    resizeMode="cover"
                    {...(Platform.OS === 'android' ? { fadeDuration: 0 } : {})}
                  />
                ) : (
                  <LinearGradient colors={['#0f172a', '#0EA5E9']} style={assignStyles.avatarPh}>
                    <Text style={assignStyles.avatarInitial}>{initial}</Text>
                  </LinearGradient>
                )}
                <View
                  style={[
                    assignStyles.onlineDot,
                    { backgroundColor: moving ? NR_GREEN : '#F59E0B' },
                  ]}
                />
              </View>
              <View style={assignStyles.topInfo}>
                <Text style={assignStyles.name} numberOfLines={2}>
                  {name}
                </Text>
                {vehicleLine ? (
                  <Text style={assignStyles.vehicle} numberOfLines={2}>
                    {vehicleLine}
                  </Text>
                ) : null}
                {rating != null && rating > 0 ? (
                  <View style={assignStyles.ratingRow}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={assignStyles.ratingText}>{rating.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
              {plate ? (
                <View style={assignStyles.platePill}>
                  <Text style={assignStyles.plateText}>{plate}</Text>
                </View>
              ) : null}
            </View>

            {identityConfirmed ? (
              <View style={assignStyles.verifiedRow}>
                <Ionicons name="shield-checkmark" size={14} color={NR_GREEN} />
                <Text style={assignStyles.verifiedText}>Verified</Text>
              </View>
            ) : onVerifyIdentity ? (
              <TouchableOpacity
                style={assignStyles.verifyLink}
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  onVerifyIdentity();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="eye-outline" size={14} color={NR_BLUE} />
                <Text style={assignStyles.verifyLinkText}>Verify identity</Text>
              </TouchableOpacity>
            ) : null}

            <View style={assignStyles.divider} />

            <View style={assignStyles.metricsRow}>
              <LinearGradient
                colors={['rgba(0,208,132,0.2)', 'rgba(15,23,42,0.88)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={assignStyles.metricTile}
              >
                <Text style={assignStyles.metricTileLabel}>Meet driver</Text>
                <View style={assignStyles.metricHeroRow}>
                  <Text style={[assignStyles.metricHeroNum, { color: '#FDE68A', fontSize: 26 }]} numberOfLines={1}>
                    Arrived
                  </Text>
                </View>
                <Text style={assignStyles.metricTileHint} numberOfLines={2}>
                  Head to the pickup pin to meet your driver
                </Text>
              </LinearGradient>

              <LinearGradient
                colors={['rgba(148,163,184,0.16)', 'rgba(15,23,42,0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={assignStyles.metricTile}
              >
                <Text style={assignStyles.metricTileLabel}>Proximity</Text>
                <View style={assignStyles.metricHeroRow}>
                  {distanceKm == null ? (
                    <Text style={assignStyles.metricHeroMuted}>—</Text>
                  ) : distanceKm < 1 ? (
                    <View style={assignStyles.metricHeroRow}>
                      <Text style={[assignStyles.metricHeroNum, { color: '#E2E8F0' }]}>
                        {Math.round(distanceKm * 1000)}
                      </Text>
                      <Text style={assignStyles.metricHeroUnit}>m</Text>
                    </View>
                  ) : (
                    <View style={assignStyles.metricHeroRow}>
                      <Text style={[assignStyles.metricHeroNum, { color: '#E2E8F0' }]}>{distanceKm.toFixed(1)}</Text>
                      <Text style={assignStyles.metricHeroUnit}>km</Text>
                    </View>
                  )}
                </View>
                <Text style={assignStyles.metricTileHint} numberOfLines={2}>
                  Driver marker shows live GPS at the pickup zone — walk to the mint pin.
                </Text>
              </LinearGradient>
            </View>

            <LinearGradient
              colors={['rgba(251,191,36,0.38)', 'rgba(120,53,15,0.55)', 'rgba(15,23,42,0.75)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={assignStyles.arrivalBand}
            >
              <View style={assignStyles.arrivalIconWrap}>
                <Ionicons name="shield-checkmark" size={21} color="#FFFBEB" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={assignStyles.arrivalTitle}>Verify, then share your code</Text>
                <Text style={assignStyles.arrivalSub} numberOfLines={3}>
                  Match vehicle color and plate to the map pin. When you are together at pickup, use the button below
                  to reveal your code.
                </Text>
              </View>
            </LinearGradient>
          </>
        ) : (
          <>
            <View style={assignStyles.acceptedStatsRow}>
              <View style={assignStyles.acceptedStatChip}>
                <View style={assignStyles.acceptedStatIconBlue}>
                  <Ionicons name="time" size={20} color="#2563EB" />
                </View>
                {hasCountdown ? (
                  <Text style={[assignStyles.acceptedStatBig, assignStyles.acceptedStatMono]} numberOfLines={1}>
                    {formatRiderApproachMmSs(arrivalCountdownSec as number)}
                  </Text>
                ) : etaMinuteVal != null ? (
                  <Text style={assignStyles.acceptedStatBig} numberOfLines={1}>
                    ~{etaMinuteVal} min
                  </Text>
                ) : (
                  <Text style={assignStyles.acceptedStatBigMuted} numberOfLines={1}>
                    —
                  </Text>
                )}
                <Text style={assignStyles.acceptedStatCaption}>Arrival in</Text>
                {etaTrafficAware ? (
                  <View style={assignStyles.acceptedLiveHint}>
                    <Ionicons name="pulse" size={10} color="#60A5FA" />
                    <Text style={assignStyles.acceptedLiveHintTxt}>Live traffic</Text>
                  </View>
                ) : null}
              </View>
              <View style={assignStyles.acceptedStatChip}>
                <View style={assignStyles.acceptedStatIconBlue}>
                  <Ionicons name="location" size={20} color="#2563EB" />
                </View>
                {distanceKm == null ? (
                  <Text style={assignStyles.acceptedStatBigMuted} numberOfLines={1}>
                    —
                  </Text>
                ) : distanceKm < 1 ? (
                  <Text style={assignStyles.acceptedStatBig} numberOfLines={1}>
                    {`${Math.round(distanceKm * 1000)} m`}
                  </Text>
                ) : (
                  <Text style={assignStyles.acceptedStatBig} numberOfLines={1}>
                    {`${distanceKm.toFixed(1)} km`}
                  </Text>
                )}
                <Text style={assignStyles.acceptedStatCaption}>Distance away</Text>
              </View>
            </View>

            <View style={assignStyles.acceptedDriverCard}>
              <View style={assignStyles.avatarRingLg}>
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={assignStyles.avatarImgLg}
                    resizeMode="cover"
                    accessibilityLabel={`Photo of ${name}`}
                    {...(Platform.OS === 'android' ? { fadeDuration: 0 } : {})}
                  />
                ) : (
                  <LinearGradient colors={['#0f172a', '#0EA5E9']} style={assignStyles.avatarPhLg}>
                    <Text style={assignStyles.avatarInitialLg}>{initial}</Text>
                  </LinearGradient>
                )}
                <View
                  style={[
                    assignStyles.onlineDotLg,
                    { backgroundColor: moving ? NR_GREEN : '#F59E0B' },
                  ]}
                />
              </View>
              <View style={assignStyles.acceptedDriverMid}>
                <Text style={assignStyles.acceptedDriverName} numberOfLines={2}>
                  {name}
                </Text>
                <Text style={assignStyles.acceptedVehiclePlate} numberOfLines={2}>
                  {[vehicle, plate].filter(Boolean).join(' • ') || vehicleLine || '—'}
                </Text>
                {rating != null && rating > 0 ? (
                  <View style={assignStyles.acceptedRatingRow}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={assignStyles.acceptedRatingText}>
                      {rating.toFixed(1)}
                      {typeof tripCount === 'number' && tripCount > 0
                        ? `  |  ${tripCount.toLocaleString()} trips`
                        : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
              <NexRydeWordmarkMini />
            </View>

            {identityConfirmed ? (
              <View style={assignStyles.verifiedRow}>
                <Ionicons name="shield-checkmark" size={14} color={NR_GREEN} />
                <Text style={assignStyles.verifiedText}>Verified</Text>
              </View>
            ) : onVerifyIdentity ? (
              <TouchableOpacity
                style={assignStyles.verifyLink}
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  onVerifyIdentity();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="eye-outline" size={14} color={NR_BLUE} />
                <Text style={assignStyles.verifyLinkText}>Verify identity</Text>
              </TouchableOpacity>
            ) : null}

            <View style={assignStyles.divider} />
          </>
        )}

        <ScrollView
          style={assignStyles.detailScroll}
          contentContainerStyle={assignStyles.detailScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled
        >
          <View style={assignStyles.detailPanel}>
            {pickupVicinityLabel ? (
              <View style={assignStyles.locRow}>
                <Ionicons name="location-outline" size={17} color={NR_GREEN} />
                <View style={assignStyles.locTextCol}>
                  <Text style={assignStyles.locLabel}>Area</Text>
                  <Text style={assignStyles.locTextMuted} numberOfLines={2}>
                    {pickupVicinityLabel}
                  </Text>
                </View>
              </View>
            ) : null}

            {fareDisplay ? (
              <View style={[assignStyles.locRow, pickupVicinityLabel ? assignStyles.locRowSpaced : null]}>
                <Ionicons name="wallet-outline" size={17} color={NR_GREEN} />
                <View style={assignStyles.locTextCol}>
                  <Text style={assignStyles.locLabel}>Fare</Text>
                  <Text style={assignStyles.locText}>
                    {fareDisplay}
                    {fareSubLabel ? <Text style={assignStyles.locSub}> {fareSubLabel}</Text> : null}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={[assignStyles.locRow, assignStyles.locRowSpaced]}>
              <Ionicons name="navigate-circle-outline" size={17} color={NR_GREEN} />
              <View style={assignStyles.locTextCol}>
                <Text style={assignStyles.locLabel}>Pickup</Text>
                <Text style={assignStyles.locText} numberOfLines={3}>
                  {pickupLine}
                </Text>
              </View>
            </View>
            <View style={[assignStyles.locRow, assignStyles.locRowSpaced]}>
              <Ionicons name="flag-outline" size={17} color="#FB7185" />
              <View style={assignStyles.locTextCol}>
                <Text style={assignStyles.locLabel}>Dropoff</Text>
                <Text style={assignStyles.locText} numberOfLines={3}>
                  {dropoffLine}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {rideAcceptedSubtitle ? (
          <Text style={assignStyles.acceptedHint}>{rideAcceptedSubtitle}</Text>
        ) : null}

        <View style={assignStyles.commsRow}>
          <TouchableOpacity
            style={[assignStyles.commBlue, callAvailable === false && assignStyles.commMuted]}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Call driver"
            onPress={() => {
              if (callAvailable === false) {
                Alert.alert('Call unavailable', 'Calling is not available for this trip yet.');
                return;
              }
              if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCall?.();
            }}
          >
            <Ionicons name="call" size={20} color="#FFF" />
            <Text style={assignStyles.commBlueText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[assignStyles.commBlue, !onChat && assignStyles.commMuted]}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Message driver"
            onPress={() => {
              if (!onChat) {
                Alert.alert('Chat unavailable', 'Messaging is not available right now.');
                return;
              }
              if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChat();
            }}
          >
            <Ionicons name="chatbubble-ellipses" size={20} color="#FFF" />
            <Text style={assignStyles.commBlueText}>Message</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={assignStyles.confirmBtn}
          activeOpacity={0.92}
          onPress={handleConfirmPickup}
          accessibilityRole="button"
          accessibilityLabel={isArrived ? 'Show pickup code' : 'Confirm pickup'}
        >
          <LinearGradient
            colors={['#00E894', NR_GREEN, '#00A86B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={assignStyles.confirmBtnGrad}
          >
            <Ionicons name="keypad" size={22} color="#022C22" />
            <View style={assignStyles.confirmTextCol}>
              <Text style={assignStyles.confirmBtnText}>
                {isArrived ? 'Show pickup code' : 'Confirm pickup'}
              </Text>
              <Text style={assignStyles.confirmBtnSub}>
                {isArrived
                  ? 'Only when you are together at the green pin'
                  : 'When you are together at the pin'}
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {onCancelRide ? (
          <TouchableOpacity
            style={assignStyles.cancelBtn}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Cancel ride"
            onPress={() => {
              if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              onCancelRide();
            }}
          >
            <View style={assignStyles.cancelIconRing}>
              <Ionicons name="close" size={17} color="#EF4444" />
            </View>
            <Text style={assignStyles.cancelBtnText}>Cancel Ride</Text>
          </TouchableOpacity>
        ) : null}

        {(onOpenTripMenu || onReportBadPickup) && (
          <View style={assignStyles.toolsRow}>
            {onOpenTripMenu ? (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  onOpenTripMenu();
                }}
                style={assignStyles.toolGhost}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="ellipsis-horizontal" size={16} color={NR_MUTED} />
                <Text style={assignStyles.toolGhostText}>Menu</Text>
              </TouchableOpacity>
            ) : null}
            {onReportBadPickup ? (
              <TouchableOpacity
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  onReportBadPickup();
                }}
                style={assignStyles.toolGhost}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="alert-circle-outline" size={16} color="#F87171" />
                <Text style={assignStyles.toolGhostTextWarn}>Report</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const assignStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  cardOuter: {
    backgroundColor: '#0c1220',
    borderRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.22)',
    overflow: 'hidden',
  },
  phaseBar: {
    borderRadius: 16,
    padding: 1,
    marginBottom: 2,
  },
  phaseBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(8,12,22,0.88)',
  },
  phaseLiveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  phaseTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.4,
  },
  phaseSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.72)',
    lineHeight: 17,
  },
  trafficPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.35)',
  },
  trafficPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#A7F3D0',
    letterSpacing: 1.1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricTile: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 6,
    minHeight: 108,
  },
  metricTileLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(148,163,184,0.95)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  metricHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'nowrap',
    gap: 3,
    minHeight: 38,
  },
  metricHeroNum: {
    fontSize: 30,
    fontWeight: '900',
    color: NR_GREEN,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  metricMono: {
    fontSize: 28,
    letterSpacing: 0.5,
  },
  metricHeroUnit: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(226,232,240,0.75)',
    marginLeft: 2,
  },
  metricHeroMuted: {
    fontSize: 26,
    fontWeight: '800',
    color: 'rgba(148,163,184,0.55)',
  },
  metricTileHint: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.88)',
    lineHeight: 15,
    marginTop: 2,
  },
  motionBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  motionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1.5,
  },
  motionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.2,
  },
  motionSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.62)',
    lineHeight: 15,
  },
  arrivalBand: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.35)',
  },
  arrivalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1.5,
    borderColor: 'rgba(254,243,199,0.45)',
  },
  arrivalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFBEB',
    letterSpacing: -0.35,
  },
  arrivalSub: {
    marginTop: 5,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(254,243,199,0.82)',
    lineHeight: 17,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 4,
  },
  acceptedStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 2,
  },
  acceptedStatChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(51,65,85,0.55)',
    alignItems: 'center',
    gap: 6,
    minHeight: 118,
    justifyContent: 'flex-start',
  },
  acceptedStatIconBlue: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(37,99,235,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(96,165,250,0.35)',
    marginBottom: 2,
  },
  acceptedStatBig: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  acceptedStatMono: {
    letterSpacing: 0.5,
    fontSize: 26,
  },
  acceptedStatBigMuted: {
    fontSize: 26,
    fontWeight: '800',
    color: 'rgba(148,163,184,0.55)',
  },
  acceptedStatCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.95)',
    marginTop: 2,
  },
  acceptedLiveHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  acceptedLiveHintTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FA',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  acceptedDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(51,65,85,0.5)',
  },
  avatarRingLg: {
    position: 'relative',
  },
  avatarImgLg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(37,99,235,0.45)',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  avatarPhLg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(37,99,235,0.45)',
  },
  avatarInitialLg: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
  },
  onlineDotLg: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: NR_BG,
  },
  acceptedDriverMid: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  acceptedDriverName: {
    fontSize: 18,
    fontWeight: '900',
    color: NR_TEXT,
    letterSpacing: -0.35,
  },
  acceptedVehiclePlate: {
    fontSize: 13,
    fontWeight: '600',
    color: NR_MUTED,
    lineHeight: 18,
  },
  acceptedRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  acceptedRatingText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  wordmarkMini: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingLeft: 4,
  },
  wordmarkNex: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  wordmarkRyde: {
    fontSize: 13,
    fontWeight: '900',
    color: NR_GREEN,
    letterSpacing: -0.3,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarRing: {
    position: 'relative',
  },
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: NR_GREEN,
  },
  avatarPh: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,208,132,0.5)',
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFF',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: NR_BG,
  },
  topInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 19,
    fontWeight: '900',
    color: NR_TEXT,
    letterSpacing: -0.35,
  },
  vehicle: {
    fontSize: 13,
    fontWeight: '600',
    color: NR_MUTED,
    lineHeight: 18,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FBBF24',
  },
  platePill: {
    backgroundColor: 'rgba(37,99,235,0.28)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.45)',
    maxWidth: 100,
  },
  plateText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BFDBFE',
    letterSpacing: 1.2,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '800',
    color: NR_GREEN,
  },
  verifyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  verifyLinkText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#93C5FA',
  },
  detailScroll: {
    maxHeight: 200,
  },
  detailScrollContent: {
    paddingBottom: 4,
  },
  detailPanel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  locRowSpaced: {
    marginTop: 12,
  },
  locTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  locLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: NR_MUTED,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  locText: {
    fontSize: 14,
    fontWeight: '700',
    color: NR_TEXT,
    lineHeight: 20,
  },
  locTextMuted: {
    fontSize: 14,
    fontWeight: '600',
    color: NR_MUTED,
    lineHeight: 20,
  },
  locSub: {
    fontSize: 12,
    fontWeight: '600',
    color: NR_MUTED,
  },
  acceptedHint: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(0,208,132,0.85)',
    textAlign: 'center',
    marginTop: -2,
  },
  commsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  commBlue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: NR_BLUE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(147,197,253,0.35)',
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  commMuted: {
    opacity: 0.42,
  },
  commBlueText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFF',
  },
  confirmBtn: {
    marginTop: 2,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.55)',
  },
  confirmBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  confirmTextCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 2,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.15,
  },
  confirmBtnSub: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.72)',
    maxWidth: 220,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  cancelIconRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FCA5A5',
    letterSpacing: 0.2,
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginTop: 2,
    paddingTop: 4,
  },
  toolGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 4,
  },
  toolGhostText: {
    fontSize: 12,
    fontWeight: '800',
    color: NR_MUTED,
  },
  toolGhostTextWarn: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F87171',
  },
});

/** In-trip bottom sheet (ongoing) — fare, live stats, driver, pause + emergency. */
function OngoingRidePanel({
  name,
  vehicle,
  rating,
  profileImage,
  moving,
  etaMin,
  distanceKm,
  fareDisplay,
  fareSubLabel,
  tripStartedAtIso,
  embedded,
  sheetBottom,
  onPauseRide,
  onEmergencyRide,
}: {
  name: string;
  vehicle?: string;
  rating?: number;
  profileImage?: string | null;
  moving: boolean;
  etaMin: number | null;
  distanceKm: number | null;
  fareDisplay?: string | null;
  fareSubLabel?: string;
  tripStartedAtIso?: string | null;
  embedded: boolean;
  sheetBottom: number;
  onPauseRide?: () => void;
  onEmergencyRide?: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(44)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [nowTick, setNowTick] = useState(() => Date.now());
  const sheetW = Dimensions.get('window').width - (embedded ? 20 : 28);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, fadeAnim]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startedMs = tripStartedAtIso ? new Date(tripStartedAtIso).getTime() : NaN;
  const elapsedMs =
    Number.isFinite(startedMs) && !Number.isNaN(startedMs) ? Math.max(0, nowTick - startedMs) : 0;
  const timeLabel = elapsedMs > 0 ? formatTripElapsed(elapsedMs) : '—';
  const distLabel =
    distanceKm == null
      ? '—'
      : distanceKm < 1
        ? `${Math.round(distanceKm * 1000)} m`
        : `${distanceKm.toFixed(1)} km`;
  const etaLabel = etaMin != null && etaMin >= 1 ? `~${etaMin} min` : '—';
  const initial = (name || 'D').charAt(0).toUpperCase();
  const vehicleOnly = vehicle?.trim() || '';

  return (
    <Animated.View
      style={[
        styles.driverCard,
        embedded && {
          left: 10,
          right: 10,
          width: sheetW,
          maxWidth: '100%',
        },
        !embedded && { width: sheetW },
        {
          bottom: sheetBottom,
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.driverCardInner, styles.ongoingCardInner]} pointerEvents="auto">
        <LinearGradient
          colors={['rgba(15,23,42,0.5)', 'rgba(7,11,18,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.ongoingSheetContent}>
          <View style={styles.ongoingFareBlock}>
            <Text style={styles.ongoingFareLabel}>Current fare</Text>
            <Text style={styles.ongoingFareAmount} numberOfLines={1}>
              {fareDisplay || '—'}
            </Text>
            {fareSubLabel && fareSubLabel !== '(NET, tax incl.)' ? (
              <Text style={styles.ongoingFareSub} numberOfLines={1}>
                {fareSubLabel}
              </Text>
            ) : null}
          </View>

          <View style={styles.ongoingChipRow}>
            <View style={styles.ongoingChip}>
              <View style={styles.ongoingChipIconBg}>
                <Ionicons name="location" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.ongoingChipLabel}>Distance</Text>
              <Text style={styles.ongoingChipValue} numberOfLines={1}>
                {distLabel}
              </Text>
            </View>
            <View style={styles.ongoingChip}>
              <View style={styles.ongoingChipIconBg}>
                <Ionicons name="time" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.ongoingChipLabel}>Time</Text>
              <Text style={[styles.ongoingChipValue, styles.ongoingChipValueSm]} numberOfLines={2}>
                {timeLabel}
              </Text>
            </View>
            <View style={styles.ongoingChip}>
              <View style={styles.ongoingChipIconBg}>
                <Ionicons name="timer-outline" size={18} color="#3B82F6" />
              </View>
              <Text style={styles.ongoingChipLabel}>ETA</Text>
              <Text style={styles.ongoingChipValue} numberOfLines={1}>
                {etaLabel}
              </Text>
            </View>
          </View>

          <View style={styles.ongoingDriverRow}>
            <View style={styles.ongoingAvatarWrap}>
              {profileImage ? (
                <Image
                  source={{ uri: profileImage }}
                  style={styles.ongoingAvatarImg}
                  resizeMode="cover"
                  {...(Platform.OS === 'android' ? { fadeDuration: 0 } : {})}
                />
              ) : (
                <LinearGradient colors={['#1E3A5F', '#2563EB']} style={styles.ongoingAvatarPh}>
                  <Text style={styles.ongoingAvatarInitial}>{initial}</Text>
                </LinearGradient>
              )}
              <View
                style={[
                  styles.ongoingOnlineDot,
                  { backgroundColor: moving ? '#22C55E' : '#F59E0B' },
                ]}
              />
            </View>
            <View style={styles.ongoingDriverTextCol}>
              <Text style={styles.ongoingDriverName} numberOfLines={1}>
                {name}
              </Text>
              {vehicleOnly ? (
                <Text style={styles.ongoingDriverVehicle} numberOfLines={1}>
                  {vehicleOnly}
                </Text>
              ) : null}
              {rating != null && rating > 0 ? (
                <View style={styles.ongoingRatingRow}>
                  <Ionicons name="star" size={14} color="#FBBF24" />
                  <Text style={styles.ongoingRatingTxt}>{Number(rating).toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.ongoingActionRow}>
            <TouchableOpacity
              style={styles.ongoingPauseBtn}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Trip options"
              onPress={() => {
                if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPauseRide?.();
              }}
            >
              <Ionicons name="pause" size={22} color="#FFFFFF" />
              <Text style={styles.ongoingPauseBtnTxt}>Pause</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ongoingEmergencyBtn}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Emergency"
              onPress={() => {
                if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onEmergencyRide?.();
              }}
            >
              <View style={styles.ongoingEmergencyIconRing}>
                <Ionicons name="call" size={16} color="#EF4444" />
              </View>
              <Text style={styles.ongoingEmergencyBtnTxt}>Emergency</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/* ─── Driver overlay card (Uber-style — call/chat + identity) ─ */
function DriverPreviewCard({
  name,
  vehicle,
  vehicleColor,
  plate,
  rating,
  profileImage,
  moving,
  etaMin,
  distanceKm,
  tripStatus,
  destinationLine,
  pickupLine,
  pickupVicinityLabel,
  rideAcceptedSubtitle,
  arrivalCountdownSec,
  assignmentSheet,
  onCall,
  onChat,
  callAvailable,
  onVerifyIdentity,
  identityConfirmed,
  fareDisplay,
  fareSubLabel,
  onReportBadPickup,
  onOpenTripMenu,
  onShowPickupCode,
  onCancelRide,
  etaTrafficAware,
  tripCount,
  tripStartedAtIso,
  embedded = false,
  onPauseRide,
  onEmergencyRide,
  sheetBottom = 20,
}: {
  name: string;
  vehicle?: string;
  vehicleColor?: string | null;
  plate?: string;
  rating?: number;
  profileImage?: string | null;
  moving: boolean;
  etaMin: number | null;
  distanceKm: number | null;
  tripStatus?: string;
  destinationLine?: string;
  pickupLine?: string;
  pickupVicinityLabel?: string;
  rideAcceptedSubtitle?: string;
  arrivalCountdownSec?: number | null;
  assignmentSheet?: boolean;
  onCall?: () => void;
  onChat?: () => void;
  /** When false (no phone / policy), CALL is visibly disabled */
  callAvailable?: boolean;
  /** Opens rider identity modal when not yet confirmed */
  onVerifyIdentity?: () => void;
  identityConfirmed?: boolean;
  fareDisplay?: string | null;
  fareSubLabel?: string;
  onReportBadPickup?: () => void;
  onOpenTripMenu?: () => void;
  onShowPickupCode?: () => void;
  onCancelRide?: () => void;
  etaTrafficAware?: boolean;
  tripCount?: number | null;
  tripStartedAtIso?: string | null;
  embedded?: boolean;
  onPauseRide?: () => void;
  onEmergencyRide?: () => void;
  /** Distance from bottom of screen — respects home indicator. */
  sheetBottom?: number;
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

  if (assignmentSheet && (tripStatus === 'accepted' || tripStatus === 'arrived')) {
    return (
      <DriverAssignmentSheet
        name={name}
        vehicle={vehicle}
        vehicleColor={vehicleColor}
        plate={plate}
        rating={rating}
        profileImage={profileImage}
        moving={moving}
        etaMin={etaMin}
        distanceKm={distanceKm}
        tripStatus={tripStatus}
        pickupLine={pickupLine || 'Pickup'}
        dropoffLine={destinationLine || 'Destination'}
        pickupVicinityLabel={pickupVicinityLabel}
        fareDisplay={fareDisplay}
        fareSubLabel={fareSubLabel}
        arrivalCountdownSec={arrivalCountdownSec ?? null}
        rideAcceptedSubtitle={rideAcceptedSubtitle}
        tripCount={tripCount}
        onCall={onCall}
        onChat={onChat}
        callAvailable={callAvailable}
        onVerifyIdentity={onVerifyIdentity}
        identityConfirmed={identityConfirmed}
        onShowPickupCode={onShowPickupCode}
        onCancelRide={onCancelRide}
        onReportBadPickup={onReportBadPickup}
        onOpenTripMenu={onOpenTripMenu}
        sheetBottom={sheetBottom}
        etaTrafficAware={etaTrafficAware}
      />
    );
  }

  if (tripStatus === 'ongoing') {
    return (
      <OngoingRidePanel
        name={name}
        vehicle={vehicle}
        rating={rating}
        profileImage={profileImage}
        moving={moving}
        etaMin={etaMin}
        distanceKm={distanceKm}
        fareDisplay={fareDisplay}
        fareSubLabel={fareSubLabel}
        tripStartedAtIso={tripStartedAtIso}
        embedded={embedded}
        sheetBottom={sheetBottom}
        onPauseRide={onPauseRide}
        onEmergencyRide={onEmergencyRide}
      />
    );
  }

  const initial = (name || 'D').charAt(0).toUpperCase();
  const statusText =
    tripStatus === 'arrived'
      ? 'Driver arrived · meet at pickup'
      : tripStatus === 'ongoing'
      ? 'In progress'
      : etaMin != null
      ? `${etaMin} min to pickup`
      : distanceKm != null
      ? `${distanceKm < 1 ? Math.round(distanceKm * 1000) + ' m' : distanceKm.toFixed(1) + ' km'} to pickup`
      : 'Driver en route';

  const statusColor =
    tripStatus === 'arrived'
      ? '#FBBF24'
      : tripStatus === 'ongoing'
      ? '#22C55E'
      : '#38BDF8';

  const showFareBand =
    Boolean(fareDisplay) && ['accepted', 'arrived', 'ongoing'].includes(String(tripStatus || ''));
  const showTripTools = ['accepted', 'arrived', 'ongoing'].includes(String(tripStatus || ''));
  const showReportPickup = (tripStatus === 'accepted' || tripStatus === 'arrived') && onReportBadPickup;
  const showInRideStrip = tripStatus === 'ongoing';

  const vehicleLine = [vehicle, vehicleColor].filter(Boolean).join(', ') || '';

  const hasComms = Boolean(onCall && onChat);

  return (
    <Animated.View
      style={[
        styles.driverCard,
        {
          bottom: sheetBottom,
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.driverCardInner} pointerEvents="auto">
        <LinearGradient
          colors={['rgba(51,65,85,0.55)', 'rgba(15,23,42,0.02)', 'rgba(6,11,24,0.4)']}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.driverCardInnerGrad}
        />
        <View style={styles.driverCardContent}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Avatar */}
          <View style={styles.driverAvatarWrap}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.driverAvatarImg} resizeMode="cover" />
            ) : (
              <LinearGradient colors={['#1E3A5F', '#0EA5E9']} style={styles.driverAvatarGrad}>
                <Text style={styles.driverAvatarInitial}>{initial}</Text>
              </LinearGradient>
            )}
            <View
              style={[
                styles.driverOnlineDot,
                { backgroundColor: moving ? '#22C55E' : '#F59E0B' },
              ]}
            />
          </View>

          <View style={styles.driverCardInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.driverCardNameUber} numberOfLines={2} ellipsizeMode="tail">
                  {name}
                </Text>
                {vehicleLine ? (
                  <Text style={styles.driverCardVehicleUber} numberOfLines={2}>
                    {vehicleLine}
                  </Text>
                ) : null}
                {rating != null && rating > 0 ? (
                  <View style={styles.ratingBadgeUber}>
                    <Ionicons name="star" size={14} color="#FBBF24" />
                    <Text style={styles.ratingTextUber}>{rating.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
              {plate ? (
                <View style={styles.plateBadgeUber}>
                  <Text style={styles.plateBadgeTextUber}>{plate}</Text>
                </View>
              ) : null}
            </View>

            {identityConfirmed ? (
              <View style={styles.identityOkChipSmall}>
                <Ionicons name="shield-checkmark" size={12} color="#022C22" />
                <Text style={styles.identityOkChipSmallText}>Verified</Text>
              </View>
            ) : onVerifyIdentity ? (
              <TouchableOpacity
                style={styles.identityVerifyLink}
                activeOpacity={0.85}
                onPress={() => onVerifyIdentity()}
              >
                <Ionicons name="eye-outline" size={14} color="#38BDF8" />
                <Text style={styles.identityVerifyLinkText}>Verify identity</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.driverCardStatusRowUber}>
              <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
              <Text style={[styles.driverCardStatusUber, { color: statusColor }]}>
                {statusText}
              </Text>
            </View>
          </View>
        </View>

        {showFareBand ? (
          <View style={styles.fareBand}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.fareBandAmount} numberOfLines={1}>
                {fareDisplay}
              </Text>
              <Text style={styles.fareBandSub} numberOfLines={1}>
                {fareSubLabel}
              </Text>
            </View>
            {tripStatus === 'ongoing' && etaMin != null ? (
              <View style={styles.fareBandEtaPill}>
                <Ionicons name="navigate-outline" size={12} color="#86EFAC" />
                <Text style={styles.fareBandEtaText}>~{etaMin} min</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {showInRideStrip && destinationLine ? (
          <View style={styles.inRideDest}>
            <Ionicons name="flag-outline" size={14} color="#F87171" style={{ marginTop: 1 }} />
            <Text style={styles.inRideDestText} numberOfLines={2}>
              {destinationLine}
            </Text>
          </View>
        ) : null}

        {showInRideStrip ? (
          <View style={styles.inRideMetrics}>
            <View style={styles.inRideMetric}>
              <Text style={styles.inRideMetricLabel}>ETA</Text>
              <Text style={styles.inRideMetricValue}>{etaMin != null ? `~${etaMin} min` : '—'}</Text>
            </View>
            <View style={styles.inRideMetricDivider} />
            <View style={styles.inRideMetric}>
              <Text style={styles.inRideMetricLabel}>Distance</Text>
              <Text style={styles.inRideMetricValue}>
                {distanceKm != null
                  ? distanceKm < 1
                    ? `${Math.round(distanceKm * 1000)} m`
                    : `${distanceKm.toFixed(1)} km`
                  : '—'}
              </Text>
            </View>
            <View style={styles.inRideMetricDivider} />
            <View style={styles.inRideMetric}>
              <Text style={styles.inRideMetricLabel}>Fare</Text>
              <Text style={styles.inRideMetricValue} numberOfLines={1}>
                {fareDisplay || '—'}
              </Text>
            </View>
          </View>
        ) : null}

        {tripStatus === 'arrived' && onShowPickupCode ? (
          <TouchableOpacity
            style={styles.primaryCtaGreenOuter}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Confirm pickup; show your code to the driver"
            onPress={() => {
              if (Platform.OS !== 'web') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              onShowPickupCode();
            }}
          >
            <LinearGradient
              colors={['#4ADE80', '#22C55E', '#15803D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryCtaGreen}
            >
              <Ionicons name="keypad" size={20} color="#022C22" />
              <View style={styles.primaryCtaGreenTextCol}>
                <Text style={styles.primaryCtaGreenText}>Confirm pickup</Text>
                <Text style={styles.primaryCtaGreenSub}>Show your code to the driver</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {showTripTools && (onOpenTripMenu || showReportPickup) ? (
          <View style={styles.tripToolsRow}>
            {onOpenTripMenu ? (
              <TouchableOpacity
                style={styles.tripToolBtn}
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  onOpenTripMenu();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#E2E8F0" />
                <Text style={styles.tripToolBtnText}>{tripStatus === 'ongoing' ? 'Trip options' : 'Menu'}</Text>
              </TouchableOpacity>
            ) : null}
            {showReportPickup ? (
              <TouchableOpacity
                style={styles.tripToolBtnGhost}
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  onReportBadPickup();
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="alert-circle-outline" size={18} color="#F87171" />
                <Text style={styles.tripToolBtnGhostText}>Report bad pickup</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {hasComms ? (
          <View style={styles.commsRow}>
            <TouchableOpacity
              style={[styles.commPill, callAvailable === false ? styles.commPillMuted : styles.commPillPrimary]}
              activeOpacity={0.88}
              onPress={() => {
                if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onCall?.();
              }}
            >
              <Ionicons name="call" size={22} color={callAvailable === false ? '#94A3B8' : '#022C22'} />
              <View style={styles.commPillTextStack}>
                <Text style={[styles.commPillLabel, callAvailable === false && styles.commPillLabelMuted]}>
                  Call
                </Text>
                <Text style={[styles.commPillSub, callAvailable === false && styles.commPillSubMuted]}>
                  Phone dialer
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.commPill, styles.commPillSecondary]}
              activeOpacity={0.88}
              onPress={() => {
                if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChat?.();
              }}
            >
              <Ionicons name="chatbubble-ellipses" size={22} color="#022C22" />
              <View style={styles.commPillTextStack}>
                <Text style={styles.commPillLabel}>Chat</Text>
                <Text style={styles.commPillSub}>In-app</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

/** Floating “Driver is on the way” card on map (embedded accepted) — light card per product reference. */
function DriverEnRouteMapPill({
  top,
  remainingSec,
  etaMin,
  distanceKm,
  moving: _moving,
}: {
  top: number;
  remainingSec: number | null;
  etaMin: number | null;
  distanceKm: number | null;
  moving: boolean;
}) {
  const distLine =
    distanceKm == null
      ? '…'
      : distanceKm < 1
        ? `${Math.round(distanceKm * 1000)} m`
        : `${distanceKm.toFixed(1)} km`;
  const etaLine =
    remainingSec != null && remainingSec > 0
      ? `~${Math.max(1, Math.ceil(remainingSec / 60))} min`
      : etaMin != null && etaMin >= 1
        ? `~${etaMin} min`
        : '—';

  return (
    <View style={[enRouteMapPillStyles.wrap, { top }]} pointerEvents="none">
      <View style={enRouteMapPillStyles.card}>
        <View style={enRouteMapPillStyles.iconWrap}>
          <Ionicons name="car-sport" size={24} color="#2563EB" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={enRouteMapPillStyles.title} numberOfLines={1}>
            Driver is on the way
          </Text>
          <Text style={enRouteMapPillStyles.sub} numberOfLines={2}>
            {distLine} away • ETA {etaLine}
          </Text>
        </View>
      </View>
    </View>
  );
}

const enRouteMapPillStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    left: 14,
    right: 14,
    zIndex: 24,
    maxWidth: 440,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.35,
  },
  sub: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 18,
    letterSpacing: 0.05,
  },
});

/** Floating context while driver is at pickup (embedded arrived). */
function DriverArrivedMapPill({
  top,
  distanceKm,
  plate,
  hasDriverLocation,
}: {
  top: number;
  distanceKm: number | null;
  plate?: string | null;
  hasDriverLocation: boolean;
}) {
  const prox = !hasDriverLocation
    ? 'Pickup pin is on the map · driver GPS may take a moment'
    : distanceKm == null
      ? 'Live GPS on map'
      : distanceKm < 0.05
        ? 'At your pickup pin'
        : distanceKm < 1
          ? `~${Math.round(distanceKm * 1000)} m to pin`
          : `~${distanceKm.toFixed(1)} km to pin`;
  const plateLine = plate ? String(plate).trim() : '';

  return (
    <View style={[arrivedMapPillStyles.wrap, { top }]} pointerEvents="none">
      <LinearGradient
        colors={['rgba(69,26,3,0.96)', 'rgba(15,23,42,0.94)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={arrivedMapPillStyles.grad}
      >
        <View style={arrivedMapPillStyles.iconRing}>
          <Ionicons name="location" size={18} color="#FDE047" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={arrivedMapPillStyles.title} numberOfLines={1}>
            Driver is here
          </Text>
          <Text style={arrivedMapPillStyles.sub} numberOfLines={2}>
            {plateLine ? `${plateLine} · ` : ''}
            {prox}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const arrivedMapPillStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    left: 16,
    right: 16,
    zIndex: 24,
    maxWidth: 420,
  },
  grad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 12,
  },
  iconRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(253,224,71,0.45)',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFBEB',
    letterSpacing: -0.4,
  },
  sub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(254,243,199,0.88)',
    lineHeight: 16,
  },
});

function DriverArrivalCountdownPill({ remainingSec, top }: { remainingSec: number; top: number }) {
  const color =
    remainingSec > 300 ? '#22C55E' : remainingSec >= 120 ? '#EAB308' : '#EF4444';
  const label =
    remainingSec <= 0
      ? 'Driver arriving any moment'
      : `Driver arriving in: ${formatRiderApproachMmSs(remainingSec)}`;
  return (
    <View style={[riderCountdownStyles.wrap, { top }]}>
      <LinearGradient
        colors={['rgba(5,9,20,0.96)', 'rgba(15,23,42,0.92)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={riderCountdownStyles.pill}
      >
        <Ionicons name="time-outline" size={16} color={color} />
        <Text style={[riderCountdownStyles.text, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </LinearGradient>
    </View>
  );
}

const riderCountdownStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 22,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  text: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
});

/* ─── Driver Approaching Counter ─────────────────────────────── */
function DriverApproachingBar({ distanceKm, topOffset = 8 }: { distanceKm: number; topOffset?: number }) {
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
    <View style={[approachStyles.wrap, { top: topOffset }]}>
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
      Animated.timing(opacityAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
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
        colors={['rgba(120,53,15,0.95)', 'rgba(26,18,8,0.92)', 'rgba(15,23,42,0.9)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={arrivedBannerStyles.banner}
      >
        <View style={arrivedBannerStyles.iconWrap}>
          <Ionicons name="location" size={22} color="#FDE047" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={arrivedBannerStyles.kicker}>ARRIVED</Text>
          <Text style={arrivedBannerStyles.title}>Your driver is here</Text>
          <Text style={arrivedBannerStyles.sub}>
            Meet at the pickup pin on the map. Verify the vehicle, then share your pickup code in person.
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
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.42)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(251,191,36,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(253,224,71,0.4)',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(253,224,71,0.95)',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFBEB',
    letterSpacing: -0.45,
  },
  sub: {
    fontSize: 12,
    color: 'rgba(254,243,199,0.88)',
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 17,
  },
});

/* ─── ETA chip overlay ────────────────────────────────────────── */
function EtaChip({
  etaMin,
  distanceKm,
  trafficModel,
}: {
  etaMin: number | null;
  distanceKm: number | null;
  /** True when ETA comes from Google traffic-aware Directions. */
  trafficModel?: boolean;
}) {
  if (etaMin == null && distanceKm == null) return null;
  const label =
    etaMin != null
      ? trafficModel
        ? `${etaMin} min · traffic`
        : `${etaMin} min`
      : distanceKm != null && distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm?.toFixed(1)} km`;

  return (
    <View style={styles.etaChip}>
      <Ionicons name={trafficModel ? 'car-outline' : 'time-outline'} size={12} color="#22C55E" />
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
  /** When set, overrides straight-line ETA chip with Google Directions (traffic-aware when available). */
  directionsEtaMin?: number | null;
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
    tripCount?: number | null;
  } | null;
  /** 'accepted' | 'arrived' | 'ongoing' — drives preview card text */
  tripStatus?: string;
  /** Map fills a fixed-height stage — trim outer chrome & margins */
  embedded?: boolean;
  vehicleColor?: string | null;
  onCallDriver?: () => void;
  onChatDriver?: () => void;
  /** When false, CALL chip is muted — parent should still attach onCallDriver to explain why */
  callAvailable?: boolean;
  onVerifyIdentity?: () => void;
  identityConfirmed?: boolean;
  fareDisplay?: string | null;
  fareSubLabel?: string;
  onReportBadPickup?: () => void;
  onOpenTripMenu?: () => void;
  onShowPickupCode?: () => void;
  /** Short area label near pickup (e.g. neighbourhood, city). */
  pickupVicinityLabel?: string;
  /** One-line subtitle under trip details (e.g. “Name accepted your ride”). */
  rideAcceptedSubtitle?: string;
  onCancelRide?: () => void;
  tripStartedAtIso?: string | null;
  onPauseRide?: () => void;
  onEmergencyRide?: () => void;
}

/* ─── Main component ──────────────────────────────────────────── */
export default function RideMap({
  mapRef,
  pickupCoords,
  destinationCoords,
  routePolyline,
  directionsEtaMin = null,
  pickup,
  destination,
  nearbyDrivers = [],
  activeDriverLocation = null,
  activeDriverMoving = false,
  activeDriverMeta = null,
  tripStatus,
  embedded = false,
  vehicleColor: vehicleColorProp,
  onCallDriver,
  onChatDriver,
  callAvailable,
  onVerifyIdentity,
  identityConfirmed,
  fareDisplay = null,
  fareSubLabel = '(NET, tax incl.)',
  onReportBadPickup,
  onOpenTripMenu,
  onShowPickupCode,
  pickupVicinityLabel,
  rideAcceptedSubtitle,
  onCancelRide,
  tripStartedAtIso = null,
  onPauseRide,
  onEmergencyRide,
}: RideMapProps) {
  const insets = useSafeAreaInsets();
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
  const assignmentSheet =
    Boolean(embedded && (tripStatus === 'accepted' || tripStatus === 'arrived'));
  const riderSheetBottom = Math.max(
    14,
    insets.bottom +
      (assignmentSheet ? 4 : embedded && tripStatus === 'ongoing' ? 10 : embedded ? 8 : 14),
  );

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

  const displayEtaMin =
    directionsEtaMin != null && directionsEtaMin >= 1 && directionsEtaMin <= 180
      ? directionsEtaMin
      : etaMin;
  const etaFromDirections = Boolean(
    directionsEtaMin != null && directionsEtaMin >= 1 && directionsEtaMin <= 180,
  );

  /** Live MM:SS countdown while driver is en route to pickup (resyncs when ETA refreshes). */
  const [riderApproachSec, setRiderApproachSec] = useState<number | null>(null);
  useEffect(() => {
    if (tripStatus !== 'accepted') {
      setRiderApproachSec(null);
      return;
    }
    if (displayEtaMin == null || displayEtaMin < 1) {
      setRiderApproachSec(null);
      return;
    }
    setRiderApproachSec(Math.min(displayEtaMin * 60, 7200));
  }, [tripStatus, displayEtaMin]);

  useEffect(() => {
    if (tripStatus !== 'accepted' || riderApproachSec == null) return;
    const id = setInterval(
      () => setRiderApproachSec((prev) => (prev != null && prev > 0 ? prev - 1 : prev)),
      1000,
    );
    return () => clearInterval(id);
  }, [tripStatus, riderApproachSec === null]);

  const showRiderArrivalCountdown =
    tripStatus === 'accepted' && riderApproachSec != null && !assignmentSheet;
  const riderCountdownTop = insets.top + 8;
  const approachingBarTopOffset = showRiderArrivalCountdown ? insets.top + 54 : insets.top + 8;

  const showTrafficOverlay = ['accepted', 'arrived', 'ongoing'].includes(String(tripStatus || ''));
  const routeBlueMode = String(tripStatus || '') === 'ongoing';
  const routeStrokeGlow = routeBlueMode ? 'rgba(37,99,235,0.28)' : 'rgba(0,212,106,0.18)';
  const routeStrokeMain = routeBlueMode ? '#2563EB' : '#00D46A';
  const pickupPulseColor = routeBlueMode ? '#3B82F6' : '#22C55E';
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

  const fitEdgeBottom = assignmentSheet
    ? Math.max(360, insets.bottom + 318)
    : embedded && tripStatus === 'ongoing'
      ? Math.max(320, insets.bottom + 300)
      : embedded
        ? Math.max(248, insets.bottom + 228)
        : 120;

  useEffect(() => {
    const m = mapViewRef.current;
    if (!m || !pickupLL || userPanned) return;
    const t = setTimeout(() => {
      try {
        if (String(tripStatus) === 'arrived' && activeLL) {
          m.fitToCoordinates(
            [
              { latitude: pickupLL.lat, longitude: pickupLL.lng },
              { latitude: activeLL.lat, longitude: activeLL.lng },
            ],
            {
              edgePadding: {
                top: embedded ? 100 : 84,
                right: 48,
                bottom: fitEdgeBottom,
                left: 48,
              },
              animated: true,
            },
          );
          return;
        }
        if (String(tripStatus) === 'arrived' && !activeLL) {
          m.animateToRegion(
            {
              latitude: pickupLL.lat,
              longitude: pickupLL.lng,
              latitudeDelta: 0.016,
              longitudeDelta: 0.016,
            },
            400,
          );
          return;
        }
        if (destLL && fitCoords.length >= 2) {
          m.fitToCoordinates(fitCoords, {
            edgePadding: { top: embedded ? 52 : 60, right: 44, bottom: fitEdgeBottom, left: 44 },
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
  }, [
    fitCoords,
    userPanned,
    pickupLL?.lat,
    pickupLL?.lng,
    destLL?.lat,
    destLL?.lng,
    embedded,
    fitEdgeBottom,
    tripStatus,
    activeLL?.lat,
    activeLL?.lng,
  ]);

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

    if (m && activeDriverMoving && !userPanned && String(tripStatus) !== 'arrived') {
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
  }, [activeLL?.lat, activeLL?.lng, activeDriverMoving, userPanned, tripStatus]);

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
      <View style={[embedded ? styles.mapContainerEmbedded : styles.mapContainerDefault, styles.fallback]}>
        <Text style={styles.fallbackText}>Map needs a valid pickup location.</Text>
      </View>
    );
  }

  const driverInitial = (activeDriverMeta?.name ?? 'D').charAt(0);
  const mapShellStyle = embedded ? styles.mapContainerEmbedded : styles.mapContainerDefault;

  return (
    <View style={mapShellStyle} collapsable={false}>
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
        showsTraffic={showTrafficOverlay}
        showsBuildings={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        showsIndoors={false}
        toolbarEnabled={false}
        onPanDrag={() => setUserPanned(true)}
        mapPadding={
          embedded
            ? {
                top: 48,
                right: 10,
                bottom: assignmentSheet
                  ? Math.max(300, insets.bottom + 275)
                  : tripStatus === 'ongoing'
                    ? Math.max(285, insets.bottom + 260)
                    : Math.max(168, insets.bottom + 150),
                left: 10,
              }
            : { top: 8, right: 8, bottom: 8, left: 8 }
        }
      >
        {/* ── Route: glow + main stroke (Directions polyline only — no straight connector overlays) ── */}
        {destLL && lineCoords.length >= 2 ? (
          <>
            <Polyline
              coordinates={lineCoords}
              strokeColor={routeStrokeGlow}
              strokeWidth={14}
              lineCap="round"
              lineJoin="round"
              geodesic
            />
            <Polyline
              coordinates={lineCoords}
              strokeColor={routeStrokeMain}
              strokeWidth={routeBlueMode ? 5 : 4}
              lineCap="round"
              lineJoin="round"
              geodesic
            />
          </>
        ) : null}

        {/* Driver → pickup (accepted): direct path feel while full route polyline may follow roads */}
        {String(tripStatus || '') === 'accepted' && activeLL && pickupLL ? (
          <Polyline
            coordinates={[
              { latitude: activeLL.lat, longitude: activeLL.lng },
              { latitude: pickupLL.lat, longitude: pickupLL.lng },
            ]}
            strokeColor="rgba(0,212,132,0.55)"
            strokeWidth={4}
            lineDashPattern={[14, 10]}
            lineCap="round"
            geodesic
            zIndex={7}
          />
        ) : null}

        {/* Pickup zone highlight when driver has arrived */}
        {String(tripStatus || '') === 'arrived' && pickupLL ? (
          <Circle
            center={{ latitude: pickupLL.lat, longitude: pickupLL.lng }}
            radius={48}
            strokeColor="rgba(253,224,71,0.72)"
            strokeWidth={2}
            fillColor="rgba(0,208,132,0.08)"
            zIndex={4}
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
          <PulseDot color={pickupPulseColor} />
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

      {assignmentSheet && tripStatus === 'accepted' && activeLL ? (
        <DriverEnRouteMapPill
          top={insets.top + 10}
          remainingSec={riderApproachSec}
          etaMin={displayEtaMin}
          distanceKm={distanceKm}
          moving={activeDriverMoving}
        />
      ) : null}

      {assignmentSheet && tripStatus === 'arrived' ? (
        <DriverArrivedMapPill
          top={insets.top + 10}
          distanceKm={activeLL ? distanceKm : null}
          plate={activeDriverMeta?.plate ?? null}
          hasDriverLocation={Boolean(activeLL)}
        />
      ) : null}

      {/* ── Driver arrived banner — hidden when rich assignment sheet already explains state ── */}
      {tripStatus === 'arrived' && !assignmentSheet ? <DriverArrivedBanner /> : null}

      {/* ── Rider: countdown while driver approaches pickup ── */}
      {showRiderArrivalCountdown && riderApproachSec != null ? (
        <DriverArrivalCountdownPill remainingSec={riderApproachSec} top={riderCountdownTop} />
      ) : null}

      {/* ── Driver approaching distance bar (when within 800 m) — hidden when embedded sheet shows distance ── */}
      {!assignmentSheet &&
      tripStatus === 'accepted' &&
      activeLL &&
      distanceKm != null &&
      distanceKm < 0.8 ? (
        <DriverApproachingBar distanceKm={distanceKm} topOffset={approachingBarTopOffset} />
      ) : null}

      {/* ── ETA chip — hide during embedded assignment (sheet is the single source of truth) ── */}
      {!assignmentSheet &&
      activeLL &&
      ['accepted', 'arrived', 'ongoing'].includes(String(tripStatus || '')) &&
      !(embedded && tripStatus === 'ongoing') ? (
        <EtaChip
          etaMin={displayEtaMin}
          distanceKm={etaFromDirections ? null : distanceKm}
          trafficModel={etaFromDirections}
        />
      ) : null}

      {/* ── Re-center button (shows after user pans) ── */}
      {userPanned && activeLL ? <RecenterButton onPress={handleRecenter} /> : null}

      {/* ── Driver overlay (assigned / arrived / ongoing) — sheet uses meta even if GPS briefly missing ── */}
      {activeDriverMeta && ['accepted', 'arrived', 'ongoing'].includes(String(tripStatus || '')) ? (
        <DriverPreviewCard
          name={String(activeDriverMeta.name || 'Driver')}
          vehicle={activeDriverMeta.vehicle}
          vehicleColor={vehicleColorProp}
          plate={activeDriverMeta.plate}
          rating={activeDriverMeta.rating}
          profileImage={activeDriverMeta.profileImage}
          moving={activeDriverMoving}
          etaMin={displayEtaMin}
          distanceKm={distanceKm}
          tripStatus={tripStatus}
          destinationLine={destLabel}
          pickupLine={pickupLabel}
          pickupVicinityLabel={pickupVicinityLabel}
          rideAcceptedSubtitle={rideAcceptedSubtitle}
          arrivalCountdownSec={riderApproachSec}
          assignmentSheet={assignmentSheet}
          onCall={onCallDriver}
          onChat={onChatDriver}
          callAvailable={callAvailable !== false}
          onVerifyIdentity={onVerifyIdentity}
          identityConfirmed={identityConfirmed}
          fareDisplay={fareDisplay}
          fareSubLabel={fareSubLabel}
          onReportBadPickup={onReportBadPickup}
          onOpenTripMenu={onOpenTripMenu}
          onShowPickupCode={onShowPickupCode}
          onCancelRide={onCancelRide}
          etaTrafficAware={etaFromDirections}
          tripCount={activeDriverMeta.tripCount ?? null}
          tripStartedAtIso={tripStartedAtIso}
          embedded={embedded}
          onPauseRide={onPauseRide}
          onEmergencyRide={onEmergencyRide}
          sheetBottom={riderSheetBottom}
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
    <View style={styles.mapContainerDefault}>
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
  mapContainerDefault: {
    flex: 1,
    minHeight: 200,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  mapContainerEmbedded: {
    flex: 1,
    minHeight: 200,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0D1117',
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
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.42)',
    backdropFilter: 'blur(8px)',
  },
  etaChipText: {
    color: '#86EFAC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
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

  /* Driver overlay card */
  driverCard: {
    position: 'absolute',
    left: 14,
    alignSelf: 'flex-start',
    maxWidth: '94%',
    zIndex: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 22,
    elevation: 16,
  },
  driverCardInner: {
    position: 'relative',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    maxWidth: 400,
    backgroundColor: 'rgba(6,11,24,0.55)',
  },
  driverCardInnerGrad: {
    ...StyleSheet.absoluteFillObject,
  },
  driverCardContent: {
    position: 'relative',
    zIndex: 1,
    padding: 16,
    gap: 14,
  },
  driverAvatarWrap: {
    position: 'relative',
  },
  driverAvatarImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  driverAvatarGrad: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0EA5E9',
  },
  driverAvatarInitial: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
  },
  driverOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0A1019',
  },
  driverCardInfo: {
    flex: 1,
    minWidth: 0,
    gap: 8,
    justifyContent: 'center',
  },
  driverCardNameUber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.4,
    lineHeight: 23,
  },
  driverCardVehicleUber: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: -0.12,
    lineHeight: 19,
  },
  ratingBadgeUber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251,191,36,0.14)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
  },
  ratingTextUber: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FBBF24',
  },
  plateBadgeUber: {
    backgroundColor: 'rgba(14,165,233,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    maxWidth: 100,
    alignSelf: 'flex-start',
  },
  plateBadgeTextUber: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1,
    textAlign: 'center',
  },
  identityVerifyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 2,
  },
  identityVerifyLinkText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#38BDF8',
  },
  identityOkChipSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#22E5A0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  identityOkChipSmallText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#022C22',
  },
  driverCardStatusRowUber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  driverCardStatusUber: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  fareBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(2,6,23,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.32)',
  },
  fareBandAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  fareBandSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  fareBandEtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(22,163,74,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  fareBandEtaText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BBF7D0',
  },
  inRideDest: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  inRideDestText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
    lineHeight: 18,
  },
  inRideMetrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(2,6,23,0.5)',
  },
  inRideMetric: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  inRideMetricDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  inRideMetricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  inRideMetricValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F1F5F9',
    textAlign: 'center',
  },
  primaryCtaGreenOuter: {
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.65)',
  },
  primaryCtaGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  primaryCtaGreenTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  primaryCtaGreenText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.2,
  },
  primaryCtaGreenSub: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.78)',
    letterSpacing: 0.1,
  },
  tripToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  tripToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(51,65,85,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  tripToolBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  tripToolBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(127,29,29,0.25)',
  },
  tripToolBtnGhostText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FECACA',
  },
  commsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'stretch',
  },
  commPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  commPillTextStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  commPillSub: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.72)',
  },
  commPillSubMuted: {
    color: 'rgba(148,163,184,0.9)',
  },
  commPillPrimary: {
    backgroundColor: '#22E5A0',
    borderColor: '#16A34A',
  },
  commPillSecondary: {
    backgroundColor: '#4ADE80',
    borderColor: '#15803D',
  },
  commPillMuted: {
    backgroundColor: 'rgba(51,65,85,0.85)',
    borderColor: 'rgba(148,163,184,0.35)',
  },
  commPillLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.25,
  },
  commPillLabelMuted: {
    color: '#94A3B8',
  },
  ongoingCardInner: {
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'stretch',
    borderColor: 'rgba(59,130,246,0.22)',
    backgroundColor: 'rgba(7,11,18,0.94)',
  },
  ongoingSheetContent: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },
  ongoingFareBlock: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  ongoingFareLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(248,250,252,0.85)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  ongoingFareAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: '#34F5B8',
    letterSpacing: -1.2,
  },
  ongoingFareSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.9)',
  },
  ongoingChipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ongoingChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(51,65,85,0.55)',
    alignItems: 'center',
    gap: 6,
    minHeight: 96,
  },
  ongoingChipIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(37,99,235,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(96,165,250,0.3)',
  },
  ongoingChipLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  ongoingChipValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  ongoingChipValueSm: {
    fontSize: 13,
    lineHeight: 17,
  },
  ongoingDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(51,65,85,0.45)',
  },
  ongoingAvatarWrap: {
    position: 'relative',
  },
  ongoingAvatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.45)',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  ongoingAvatarPh: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.45)',
  },
  ongoingAvatarInitial: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFF',
  },
  ongoingOnlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#070B12',
  },
  ongoingDriverTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  ongoingDriverName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.35,
  },
  ongoingDriverVehicle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  ongoingRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  ongoingRatingTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  ongoingActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  ongoingPauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(147,197,253,0.35)',
    shadowColor: '#1e40af',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  ongoingPauseBtnTxt: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  ongoingEmergencyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  ongoingEmergencyIconRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ongoingEmergencyBtnTxt: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FCA5A5',
    letterSpacing: 1.1,
  },
});
