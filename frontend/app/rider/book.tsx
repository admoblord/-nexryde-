import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  Linking,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Switch,
  StatusBar,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import { useAppStore } from '@/src/store/appStore';
import { useRiderHasActiveTrip } from '@/src/hooks/useRiderHasActiveTrip';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import {
  BACKEND_URL,
  getAuthHeaders,
  getWalletMe,
  getRiderPreferences,
  updateRiderPreferences,
  getAvailableDrivers,
  estimateFare,
  type FareEstimateResponse,
} from '@/src/services/api';
import {
  buildCompactSurgeChipText,
  formatRouteKmMin,
  humanizeFareBreakdownLine,
  isShortTripFare,
} from '@/src/utils/farePresentation';
import {
  inferFareCitySlugFromAddress,
  pickFareCitySlugFromCoords,
} from '@/src/constants/nigeriaFareCity';
import { fetchRouteSafety, type RouteSafetyResponse } from '@/src/services/crimeSafetyData';
import {
  DIRECTIONS_ROUTE_MIN_POINTS,
} from '@/src/navigation/navUtils';
import { decodePolyline } from '@/src/utils/polylineDecoder';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';
import {
  beginRouteRecalc,
  commitFare,
  commitRouteMetrics,
  EMPTY_TRIP_DRAFT,
  getCurrentRouteRequestId,
  ignoreStaleRouteResponse,
  tripDraftRouteSignature,
  type TripDraft,
  type TripDraftLocation,
} from '@/src/utils/bookingTripDraft';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import { isRiderMapLiveTripStatus } from '@/src/constants/tripRealtimeRhythm';
import { tripLocationRecord } from '@/src/utils/tripCoords';
import { TrafficAI, type TrafficRoute } from '@/src/services/trafficAI';
import MapComponent from '@/src/components/MapComponent';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { RiderPostRequestOverlay, type RiderMatchedDriver } from '@/src/components/rider/RiderPostRequestOverlay';
import { getRecentLocations, cacheRecentLocation, createOfflineBooking, checkOnlineStatus } from '@/src/services/offlineMode';
import { authedFetch } from '@/src/utils/sessionRefresh';
import * as Haptics from 'expo-haptics';
import { geocodeAddressForRider } from '@/src/services/riderSavedPlaces';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { RIDER_PRIMARY_CTA_GRADIENT } from '@/src/constants/riderRideChrome';
import {
  RIDER_DRIVER_FOUND_HANDOFF_MS,
  riderHandoffCountdownSec,
} from '@/src/constants/riderTripHandoff';

/** Set `EXPO_PUBLIC_BOOKING_PROMO=false` to hide the booking promo strip entirely. */
const BOOKING_PROMO_ENABLED = String(process.env.EXPO_PUBLIC_BOOKING_PROMO ?? 'true').toLowerCase() !== 'false';
const BOOKING_PROMO_DISMISS_KEY = '@nexryde_booking_promo_dismissed_v1';

/** Distance/base fare only — time line appears when rider adds a stop (all cities). */
function isDistanceOnlyFare(fd: FareEstimateResponse | null | undefined): boolean {
  if (!fd) return false;
  if (fd.fare_rate_model === 'lagride_lagos_exact_v1') {
    return !(fd.stop_time_fee_applied || Number(fd.time_fee) > 0);
  }
  return Number(fd.time_fee) === 0 && !fd.stop_time_fee_applied;
}

function stopTimeFeeLabel(fd: FareEstimateResponse | null | undefined): string | null {
  if (!fd?.stop_time_fee_applied && !(Number(fd?.time_fee) > 0 && fd?.has_intermediate_stop)) {
    return null;
  }
  const mins = Number(fd.pricing_route_minutes ?? fd.duration_min ?? 0);
  const perMin = Number(fd.stop_time_per_min ?? 80);
  const fee = Number(fd.time_fee ?? 0);
  if (!Number.isFinite(fee) || fee <= 0) return null;
  return `Stop time · ${Math.round(mins)} min × ₦${Math.round(perMin)}/min = ₦${Math.round(fee).toLocaleString()}`;
}

/** True when the pickup label is still raw "lat, lng" (geocode not applied yet or failed). */
function isRawLatLngLabel(s: string): boolean {
  return /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(String(s || '').trim());
}

const ROUTE_FIT_MAX_POINTS = 48;

function sampleCoordsForFit(
  coords: Array<{ latitude: number; longitude: number }>,
  max = ROUTE_FIT_MAX_POINTS,
): Array<{ latitude: number; longitude: number }> {
  if (coords.length <= max) return coords;
  const out: Array<{ latitude: number; longitude: number }> = [];
  const n = coords.length;
  for (let i = 0; i < max; i++) {
    const idx = Math.min(n - 1, Math.round((i / Math.max(1, max - 1)) * (n - 1)));
    out.push(coords[idx]!);
  }
  return out;
}

function parseRoutePreviewToMapCoords(
  raw: unknown,
): Array<{ latitude: number; longitude: number }> {
  if (!Array.isArray(raw) || raw.length < DIRECTIONS_ROUTE_MIN_POINTS) return [];
  const out: Array<{ latitude: number; longitude: number }> = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ latitude: lat, longitude: lng });
  }
  return out.length >= DIRECTIONS_ROUTE_MIN_POINTS ? out : [];
}

function formatArriveByLabel(minutesFromNow: number): string {
  const mins = Math.max(1, Math.round(minutesFromNow));
  const t = Date.now() + mins * 60_000;
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Parse lock deadline; naive ISO with `T` from the API is treated as UTC (legacy + Python naive UTC). */
function parseFareLockDeadlineMs(raw: unknown): number {
  if (typeof raw !== 'string' || !raw.trim()) return 0;
  const s0 = raw.trim();
  const hasExplicitZone =
    /(\.\d+)?(Z|[+-]\d{2}:\d{2}(:\d{2})?)$/i.test(s0) || /[+-]\d{4}$/i.test(s0);
  const s = hasExplicitZone || !s0.includes('T') ? s0 : `${s0}Z`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/** Ensure `estimate_id` / `price_valid_until` survive proxies or alternate JSON keys. */
function normalizeFareEstimatePayload(data: unknown): FareEstimateResponse {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const rawId = o.estimate_id ?? o.estimateId;
  const estimate_id =
    typeof rawId === 'string' && rawId.trim().length > 0
      ? rawId.trim()
      : typeof rawId === 'number' && Number.isFinite(rawId)
        ? String(rawId)
        : '';
  const pvu = o.price_valid_until ?? o.priceValidUntil;
  const price_valid_until =
    typeof pvu === 'string' && pvu.length > 0
      ? pvu
      : new Date(Date.now() + 600_000).toISOString();
  return { ...o, estimate_id, price_valid_until } as FareEstimateResponse;
}

async function reverseGeocodeViaBackend(
  lat: number,
  lng: number,
  baseUrl: string,
): Promise<string | null> {
  const origin = String(baseUrl || '').replace(/\/$/, '');
  if (!origin) return null;
  const q = `lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
  const url = `${origin}/api/places/reverse-geocode?${q}`;
  const once = async () => {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    if (String(data?.status || '').toUpperCase() !== 'OK') return null;
    const raw = String(
      data?.short_label || data?.formatted_address || data?.address || '',
    ).trim();
    if (!raw || isRawLatLngLabel(raw)) return null;
    return raw;
  };
  let out = await once();
  if (out) return out;
  await new Promise((r) => setTimeout(r, 220));
  out = await once();
  if (out) return out;
  await new Promise((r) => setTimeout(r, 550));
  return (await once()) || null;
}

const COLORS = {
  bg: '#0D1420',
  card: '#1A2332',
  cardLight: '#232F42',
  green: '#00D46A',
  blue: '#0EA5E9',
  accentBlue: '#0EA5E9',
  /** Inner route highlight on map (Nexryde mint, not generic sky-blue). */
  routeHighlight: '#86EFAC',
  lime: '#B8F11B',
  white: '#FFFFFF',
  muted: '#94A3B8',
  dim: '#64748B',
  yellow: '#FFB800',
  red: '#EF4444',
  purple: '#9333EA',
};

const VEHICLES = [
  { id: 'economy', name: 'Standard', icon: 'car', time: '4-5 min', desc: 'Affordable', color: '#00D46A' },
  { id: 'comfort', name: 'Comfort', icon: 'car-sport', time: '5-7 min', desc: 'More space', color: '#0EA5E9' },
  { id: 'xl', name: 'XL', icon: 'bus', time: '6-8 min', desc: '6 seats', color: '#FFB800' },
  { id: 'premium', name: 'Premium', icon: 'rocket', time: '5-6 min', desc: 'Luxury', color: '#9333EA' },
];

const RIDE_PREFERENCE_OPTIONS = [
  { id: 'quiet_ride', label: 'Quiet Ride', icon: 'volume-mute' as const },
  { id: 'chatty_driver', label: 'Chatty Driver', icon: 'chatbubbles' as const },
  { id: 'music_on', label: 'Music On', icon: 'musical-notes' as const },
  { id: 'cold_ac', label: 'AC Must Be Cold', icon: 'snow' as const },
];

/** Premium dark map — Nexryde night (depth + readable roads, minimal POI noise). */
const BOOKING_MAP_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0c1220' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8eaad4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0c1220' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#162536' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#1e2d42' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a3d55' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1b2738' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060b14' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const bookingMapStyles = StyleSheet.create({
  pickupHalo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34,229,160,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#22E5A0',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  pickupCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22E5A0',
    borderWidth: 2,
    borderColor: '#fff',
  },
  dropHalo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#EF4444',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  dropCore: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#fff',
  },
  stopHalo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  stopCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
    borderWidth: 2,
    borderColor: '#fff',
  },
  driverCar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,212,106,0.65)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  driverCarSearch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0B0F14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  pickupHaloSearch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(52,245,184,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#34F5B8',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  pickupCoreSearch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34F5B8',
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  pickupHaloLocked: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(34,229,160,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#22E5A0',
    shadowOpacity: 0.65,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  pickupCoreLocked: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34F5B8',
    borderWidth: 2,
    borderColor: '#fff',
  },
});

/** Native map — Google Directions polyline, premium blue route + dark cartography. */
function BookingRideMapNative(props: {
  pickupCoords: { lat: number; lng: number };
  destinationCoords: { lat: number; lng: number } | null;
  stopCoords?: { lat: number; lng: number } | null;
  routePolyline: { latitude: number; longitude: number }[];
  pickup: string;
  destination: string;
  stop?: string;
  /** True while fetching road-snapped path (optional subtle indicator). */
  routeLoading?: boolean;
  /** Subtle breathing scale on dropoff halo until rider dismisses (e.g. scrolls sheet). */
  pulseDropoffHalo?: boolean;
  /** Full-screen “finding driver” — stronger pickup pulse, LIVE-style chrome, driver tags. */
  searchMode?: boolean;
  /** Driver accepted — mint “locked route” + celebration markers (pairs with RiderPostRequestOverlay matched). */
  matchLocked?: boolean;
  nearbyDrivers: Array<{
    driver_id: string;
    name?: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
  }>;
}) {
  const mapRef = React.useRef<any>(null);
  const dropPulseScale = React.useRef(new Animated.Value(1)).current;
  const routeLen = props.routePolyline.length;
  const routeHead = props.routePolyline[0];
  const routeTail = routeLen > 0 ? props.routePolyline[routeLen - 1] : null;

  React.useEffect(() => {
    const pulseOn = Boolean(props.pulseDropoffHalo && props.destinationCoords);
    if (!pulseOn) {
      dropPulseScale.stopAnimation();
      dropPulseScale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dropPulseScale, {
          toValue: 1.12,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(dropPulseScale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      dropPulseScale.setValue(1);
    };
  }, [props.pulseDropoffHalo, props.destinationCoords?.lat, props.destinationCoords?.lng]);

  React.useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const t = setTimeout(() => {
      try {
        const sm = Boolean(props.searchMode);
        const locked = Boolean(sm && props.matchLocked);
        const pad = sm
          ? { top: 110, right: 18, bottom: locked ? 260 : 240, left: 18 }
          : { top: 88, right: 20, bottom: 132, left: 20 };
        if (props.destinationCoords && props.routePolyline.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
          const fit = sampleCoordsForFit(props.routePolyline);
          m.fitToCoordinates(fit, {
            edgePadding: pad,
            animated: true,
          });
        } else if (props.destinationCoords) {
          const coordsFit = [
            { latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng },
            ...(props.stopCoords
              ? [{ latitude: props.stopCoords.lat, longitude: props.stopCoords.lng }]
              : []),
            { latitude: props.destinationCoords.lat, longitude: props.destinationCoords.lng },
          ];
          m.fitToCoordinates(coordsFit, { edgePadding: pad, animated: true });
        } else {
          m.animateToRegion(
            {
              latitude: props.pickupCoords.lat,
              longitude: props.pickupCoords.lng,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
            },
            400,
          );
        }
      } catch {
        /* silent */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [
    props.pickupCoords.lat,
    props.pickupCoords.lng,
    props.destinationCoords?.lat,
    props.destinationCoords?.lng,
    routeLen,
    routeHead?.latitude,
    routeHead?.longitude,
    routeTail?.latitude,
    routeTail?.longitude,
    props.searchMode,
    props.matchLocked,
  ]);

  try {
    const { default: MapView, Marker, Polyline, Circle, PROVIDER_GOOGLE } = require('react-native-maps');
    const safeDrivers = (props.nearbyDrivers || []).filter(
      (d) => d && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)),
    );
    const sm = Boolean(props.searchMode);
    const locked = Boolean(sm && props.matchLocked);
    return (
      <View style={StyleSheet.absoluteFillObject}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: props.pickupCoords.lat,
          longitude: props.pickupCoords.lng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        loadingEnabled={false}
        showsBuildings={false}
        showsPointsOfInterest={false}
        showsCompass={false}
        showsIndoors={false}
        toolbarEnabled={false}
        customMapStyle={BOOKING_MAP_DARK_STYLE}
      >
        {sm && !locked && (
          <>
            <Circle
              center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
              radius={95}
              fillColor="rgba(52,245,184,0.06)"
              strokeColor="rgba(52,245,184,0.38)"
              strokeWidth={1}
            />
            <Circle
              center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
              radius={190}
              fillColor="rgba(52,245,184,0.03)"
              strokeColor="rgba(52,245,184,0.22)"
              strokeWidth={1}
            />
            <Circle
              center={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
              radius={320}
              fillColor="transparent"
              strokeColor="rgba(52,245,184,0.12)"
              strokeWidth={1}
            />
          </>
        )}
        {props.routePolyline.length >= DIRECTIONS_ROUTE_MIN_POINTS && (
          <>
            {locked ? (
              <>
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="rgba(34,229,160,0.14)"
                  strokeWidth={24}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="rgba(16,185,129,0.52)"
                  strokeWidth={12}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="#ECFDF5"
                  strokeWidth={4}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
              </>
            ) : sm ? (
              <>
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="rgba(56,189,248,0.1)"
                  strokeWidth={20}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="rgba(14,165,233,0.48)"
                  strokeWidth={10}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="#BAE6FD"
                  strokeWidth={3}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
              </>
            ) : (
              <>
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="rgba(56,189,248,0.12)"
                  strokeWidth={20}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor="rgba(14,165,233,0.45)"
                  strokeWidth={10}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
                <Polyline
                  coordinates={props.routePolyline}
                  strokeColor={COLORS.routeHighlight}
                  strokeWidth={3}
                  geodesic={false}
                  lineCap="round"
                  lineJoin="round"
                />
              </>
            )}
          </>
        )}
        <Marker
          coordinate={{ latitude: props.pickupCoords.lat, longitude: props.pickupCoords.lng }}
          title="Pickup"
          description={props.pickup}
          anchor={{ x: 0.5, y: sm ? 0.72 : 0.5 }}
          tracksViewChanges={false}
        >
          <View style={{ alignItems: 'center' }}>
            <View
              style={
                locked
                  ? bookingMapStyles.pickupHaloLocked
                  : sm
                    ? bookingMapStyles.pickupHaloSearch
                    : bookingMapStyles.pickupHalo
              }
            >
              <View
                style={
                  locked
                    ? bookingMapStyles.pickupCoreLocked
                    : sm
                      ? bookingMapStyles.pickupCoreSearch
                      : bookingMapStyles.pickupCore
                }
              />
            </View>
          </View>
        </Marker>
        {props.stopCoords ? (
          <Marker
            coordinate={{ latitude: props.stopCoords.lat, longitude: props.stopCoords.lng }}
            title="Stop"
            description={props.stop || 'Stop'}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={bookingMapStyles.stopHalo}>
              <View style={bookingMapStyles.stopCore} />
            </View>
          </Marker>
        ) : null}
        {props.destinationCoords && (
          <Marker
            coordinate={{ latitude: props.destinationCoords.lat, longitude: props.destinationCoords.lng }}
            title="Destination"
            description={props.destination}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={Boolean(props.pulseDropoffHalo)}
          >
            <Animated.View style={[bookingMapStyles.dropHalo, { transform: [{ scale: dropPulseScale }] }]}>
              <View style={bookingMapStyles.dropCore} />
            </Animated.View>
          </Marker>
        )}
        {safeDrivers.map((d) => (
          <Marker
            key={d.driver_id}
            coordinate={{ latitude: Number(d.lat), longitude: Number(d.lng) }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={sm ? bookingMapStyles.driverCarSearch : bookingMapStyles.driverCar}>
                <Ionicons name="car-sport" size={sm ? 14 : 11} color={sm ? '#FFFFFF' : '#4ADE80'} />
              </View>
            </View>
          </Marker>
        ))}
      </MapView>
        {sm ? (
          <>
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(2,6,23,0.5)', 'rgba(2,6,23,0.12)', 'transparent']}
              locations={[0, 0.45, 1]}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '32%' }}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', 'rgba(2,6,23,0.22)', 'rgba(2,6,23,0.45)']}
              locations={[0, 0.55, 1]}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '38%' }}
            />
          </>
        ) : null}
        {props.routeLoading ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 56,
              right: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 6,
              paddingHorizontal: 11,
              borderRadius: 999,
              backgroundColor: 'rgba(15,23,42,0.9)',
              borderWidth: 1,
              borderColor: 'rgba(34,229,160,0.28)',
            }}
          >
            <ActivityIndicator size="small" color="#22E5A0" />
            <Text style={{ color: '#E2E8F0', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
              Routing…
            </Text>
          </View>
        ) : null}
      </View>
    );
  } catch {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ color: COLORS.muted, textAlign: 'center' }}>Map could not load. Enter pickup and destination below.</Text>
      </View>
    );
  }
}

function BookInDriveStyle() {
  const toast = useErrorToast();
  const router = useRouter();
  const params = useLocalSearchParams<{
    requestedDriverId?: string;
    driverName?: string;
    pickup?: string;
    dropoff?: string;
    destination?: string;
    pickupLat?: string;
    pickupLng?: string;
    dropoffLat?: string;
    dropoffLng?: string;
    destLat?: string;
    destLng?: string;
  }>();
  const setCurrentTrip = useAppStore((s) => s.setCurrentTrip);
  const currentTrip = useAppStore((s) => s.currentTrip);
  const hasActiveTrip = useRiderHasActiveTrip();
  const { user, userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const requestedDriverId = params.requestedDriverId || null;
  const requestedDriverName = params.driverName || null;
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();

  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [stop, setStop] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [stopCoords, setStopCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Single source of truth for route geometry + metrics (pickup → stops[] → destination). */
  const [tripDraft, setTripDraft] = useState<TripDraft>(EMPTY_TRIP_DRAFT);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [gpsStatus, setGpsStatus] = useState<'detecting' | 'locked' | 'error'>('detecting');

  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [currentFare, setCurrentFare] = useState(0);
  const [fareDetails, setFareDetails] = useState<FareEstimateResponse | null>(null);
  const [fareMatrix, setFareMatrix] = useState<Record<string, number>>({});
  /** Pre-discount totals when first-ride 20% is applied (for strikethrough on vehicle rows). */
  const [fareMatrixOriginal, setFareMatrixOriginal] = useState<Record<string, number>>({});
  /** Google driving route for map (decoded polyline or Directions overview). */
  const [bookingRouteCoords, setBookingRouteCoords] = useState<Array<{ latitude: number; longitude: number }>>([]);
  /** ETA minutes for overlays (from Directions or fare estimate). */
  const [bookingRouteEtaMin, setBookingRouteEtaMin] = useState<number | null>(null);
  const [bookingRouteLoading, setBookingRouteLoading] = useState(false);
  /** After rider scrolls the booking sheet, dropoff halo pulse stops. */
  const [bookingSheetScrolled, setBookingSheetScrolled] = useState(false);
  const bookingSheetScrolledRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingField, setEditingField] = useState<'pickup' | 'destination' | 'stop'>('pickup');
  const [showVehicleModal, setShowVehicleModal] = useState(false);

  const [searchingForDriver, setSearchingForDriver] = useState(false);
  const [searchCountdown, setSearchCountdown] = useState(0);
  const searchCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [driverFound, setDriverFound] = useState<any>(null);

  /** Active trip lives on tracking — block overlapping book UI. */
  useFocusEffect(
    useCallback(() => {
      if (!hasActiveTrip || !currentTrip?.id) return;
      router.replace({ pathname: '/rider/tracking', params: { tripId: currentTrip.id } } as any);
    }, [hasActiveTrip, currentTrip?.id, router]),
  );
  const driverPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calculateInFlightRef = useRef(false);
  const offerInFlightRef = useRef(false);
  const navigationInFlightRef = useRef(false);
  const trackingHandoffRef = useRef(false);
  /** Geo + time snapshot when a fare estimate was computed (for locked quote + drift checks). */
  const fareLockSnapshotRef = useRef<{
    at: number;
    pickup: { lat: number; lng: number };
    drop: { lat: number; lng: number };
    stop?: { lat: number; lng: number } | null;
  } | null>(null);
  /** Bumps whenever pickup, destination, or stop changes — stale fare/route responses are ignored. */
  const pricingEpochRef = useRef(0);
  const fareDetailsEpochRef = useRef(0);
  const ROUTE_DRIFT_KM = 1.0;

  const [fareExplainModal, setFareExplainModal] = useState<
    'surge' | 'short' | 'breakdown' | 'positioning' | null
  >(null);
  const [ridePaymentMethod, setRidePaymentMethod] = useState<'cash' | 'wallet'>('cash');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<TrafficRoute | null>(null);
  const [routeSafety, setRouteSafety] = useState<RouteSafetyResponse | null>(null);
  const [routeSafetyLoading, setRouteSafetyLoading] = useState(false);
  const [routeSafetyFailed, setRouteSafetyFailed] = useState(false);
  const sheetSlide = useRef(new Animated.Value(28)).current;
  const fareReveal = useRef(new Animated.Value(0)).current;
  const [nearbyDrivers, setNearbyDrivers] = useState<Array<{
    driver_id: string;
    name?: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
  }>>([]);
  const [scheduledRides, setScheduledRides] = useState<Array<{
    id: string;
    pickup_address: string;
    dropoff_address: string;
    scheduled_time: string;
    ride_type?: string;
  }>>([]);
  const [ridePreferences, setRidePreferences] = useState<string[]>([]);
  const [estateName, setEstateName] = useState('');
  const [estateGateCode, setEstateGateCode] = useState('');
  const [savingGateCode, setSavingGateCode] = useState(false);
  const [gateCodeSaved, setGateCodeSaved] = useState(false);
  const [includeGateCode, setIncludeGateCode] = useState(false);
  const [editingGateCode, setEditingGateCode] = useState(false);
  const [recentDestinations, setRecentDestinations] = useState<
    Array<{ address?: string; description?: string; lat?: number; lng?: number }>
  >([]);
  const [bookingPromoVisible, setBookingPromoVisible] = useState(false);
  const [isFirstRider, setIsFirstRider] = useState(false);
  const [bookSuspended, setBookSuspended] = useState(false);
  const [bookSuspendedSeconds, setBookSuspendedSeconds] = useState(0);
  const bookSuspendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Avoid re-applying router params for destination on every render. */
  const appliedBookingDestRef = useRef<string>('');

  const availableVehicles = React.useMemo(() => {
    const base = [...VEHICLES];
    if (String(user?.gender || '').toLowerCase() === 'female') {
      base.push({
        id: 'female_only',
        name: 'Women Only',
        icon: 'woman',
        time: '6-9 min',
        desc: 'Female driver only',
        color: '#EC4899',
      });
    }
    return base;
  }, [user?.gender]);

  const routeStopFields = useMemo(() => {
    if (
      stopCoords &&
      Number.isFinite(stopCoords.lat) &&
      Number.isFinite(stopCoords.lng)
    ) {
      return {
        stop_lat: stopCoords.lat,
        stop_lng: stopCoords.lng,
        stop_address: stop?.trim() || undefined,
      };
    }
    return {};
  }, [stopCoords?.lat, stopCoords?.lng, stop]);

  /** Ordered intermediate stops — first-class waypoints for routing/fare. */
  const tripStops = useMemo((): TripDraftLocation[] => {
    if (
      stopCoords &&
      Number.isFinite(stopCoords.lat) &&
      Number.isFinite(stopCoords.lng) &&
      stop?.trim()
    ) {
      return [{ address: stop.trim(), lat: stopCoords.lat, lng: stopCoords.lng }];
    }
    return [];
  }, [stop, stopCoords?.lat, stopCoords?.lng]);

  const tripDraftRouteKey = useMemo(
    () =>
      tripDraftRouteSignature({
        pickup:
          pickupCoords && Number.isFinite(pickupCoords.lat)
            ? { address: pickup.trim(), lat: pickupCoords.lat, lng: pickupCoords.lng }
            : null,
        stops: tripStops,
        destination:
          destinationCoords && Number.isFinite(destinationCoords.lat)
            ? {
                address: destination.trim(),
                lat: destinationCoords.lat,
                lng: destinationCoords.lng,
              }
            : null,
      }),
    [
      pickup,
      pickupCoords?.lat,
      pickupCoords?.lng,
      destination,
      destinationCoords?.lat,
      destinationCoords?.lng,
      tripStops,
    ],
  );

  const applyTripDraftRoute = useCallback(
    (
      requestId: number,
      patch: Partial<Pick<TripDraft, 'polyline' | 'distanceKm' | 'durationMinutes' | 'estimatedFare'>>,
    ) => {
      if (ignoreStaleRouteResponse(requestId, 'applyTripDraftRoute')) return;
      setTripDraft((prev) => ({
        ...prev,
        pickup:
          pickupCoords && pickup?.trim()
            ? { address: pickup.trim(), lat: pickupCoords.lat, lng: pickupCoords.lng }
            : prev.pickup,
        stops: tripStops,
        destination:
          destinationCoords && destination?.trim()
            ? {
                address: destination.trim(),
                lat: destinationCoords.lat,
                lng: destinationCoords.lng,
              }
            : prev.destination,
        polyline: patch.polyline ?? prev.polyline,
        distanceKm: patch.distanceKm ?? prev.distanceKm,
        durationMinutes: patch.durationMinutes ?? prev.durationMinutes,
        estimatedFare: patch.estimatedFare ?? prev.estimatedFare,
      }));
      if (patch.polyline && patch.polyline.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        setBookingRouteCoords(patch.polyline);
      }
      if (patch.durationMinutes != null && patch.durationMinutes > 0) {
        setBookingRouteEtaMin(patch.durationMinutes);
      }
    },
    [
      pickup,
      pickupCoords?.lat,
      pickupCoords?.lng,
      destination,
      destinationCoords?.lat,
      destinationCoords?.lng,
      tripStops,
    ],
  );

  const invalidateRoutePricing = useCallback(() => {
    const requestId = getCurrentRouteRequestId();
    pricingEpochRef.current = requestId;
    fareDetailsEpochRef.current = requestId;
    setTripDraft((prev) => ({
      ...prev,
      stops: tripStops,
      distanceKm: null,
      durationMinutes: null,
      estimatedFare: null,
      polyline: [],
    }));
    setFareDetails(null);
    setCurrentFare(0);
    setFareMatrix({});
    setFareMatrixOriginal({});
    setBookingRouteCoords([]);
    setBookingRouteEtaMin(null);
    setBookingRouteLoading(true);
    setOptimizedRoute(null);
  }, [tripStops]);

  /** Only real road geometry — never a pickup→drop straight segment. */
  const routeForMapDisplay = useMemo(() => {
    if (tripDraft.polyline.length >= DIRECTIONS_ROUTE_MIN_POINTS) return tripDraft.polyline;
    if (bookingRouteCoords.length >= DIRECTIONS_ROUTE_MIN_POINTS) return bookingRouteCoords;
    return [];
  }, [tripDraft.polyline, bookingRouteCoords]);

  const arriveByClockLabel = useMemo(() => {
    if (bookingRouteEtaMin == null || !destinationCoords) return null;
    return formatArriveByLabel(bookingRouteEtaMin);
  }, [bookingRouteEtaMin, destinationCoords]);

  const routeDistanceLabel = useMemo(() => {
    const km = Number(tripDraft.distanceKm ?? fareDetails?.distance_km);
    if (!Number.isFinite(km) || km <= 0) return null;
    return km >= 10 ? `${km.toFixed(1)} km` : `${km.toFixed(2)} km`;
  }, [tripDraft.distanceKm, fareDetails?.distance_km]);

  const routeQualityLabel = useMemo(() => {
    const src = String(fareDetails?.route_metrics_source || '').toLowerCase();
    if (src.includes('google') || src.includes('client_google')) return 'Live traffic & roads';
    if (bookingRouteCoords.length > 14) return 'Turn-by-turn roads';
    return null;
  }, [fareDetails?.route_metrics_source, bookingRouteCoords.length]);

  const stopTimeFeeHint = useMemo(
    () => stopTimeFeeLabel(fareDetails),
    [fareDetails?.time_fee, fareDetails?.stop_time_fee_applied, fareDetails?.has_intermediate_stop],
  );

  useEffect(() => {
    bookingSheetScrolledRef.current = false;
    setBookingSheetScrolled(false);
  }, [destinationCoords?.lat, destinationCoords?.lng]);

  const onBookingSheetScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (bookingSheetScrolledRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    if (y > 16) {
      bookingSheetScrolledRef.current = true;
      setBookingSheetScrolled(true);
    }
  }, []);

  const clearDriverPoll = useCallback(() => {
    if (driverPollRef.current) {
      clearInterval(driverPollRef.current);
      driverPollRef.current = null;
    }
  }, []);

  const [handoffCountdown, setHandoffCountdown] = useState<number | null>(null);
  const handoffTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** After driver accepts — show "Driver found" briefly, then map-first tracking. */
  const navigateToLiveTracking = useCallback(
    (id: string, opts?: { immediate?: boolean }) => {
      if (!id) return;
      clearDriverPoll();
      if (handoffTickRef.current) {
        clearInterval(handoffTickRef.current);
        handoffTickRef.current = null;
      }
      setHandoffCountdown(null);
      const go = () => {
        if (trackingHandoffRef.current) return;
        trackingHandoffRef.current = true;
        setHandoffCountdown(null);
        router.replace({
          pathname: '/rider/tracking',
          params: {
            tripId: id,
            ...(pickup?.trim() ? { pickup } : {}),
            ...(destination?.trim() ? { destination } : {}),
            fromBook: 'true',
          },
        } as any);
        setSearchingForDriver(false);
      };
      if (opts?.immediate) {
        go();
        return;
      }
      if (trackingHandoffRef.current) return;
      setTimeout(go, RIDER_DRIVER_FOUND_HANDOFF_MS);
    },
    [router, pickup, destination, clearDriverPoll],
  );

  useEffect(() => {
    if (!driverFound || !tripId || trackingHandoffRef.current) {
      setHandoffCountdown(null);
      if (handoffTickRef.current) {
        clearInterval(handoffTickRef.current);
        handoffTickRef.current = null;
      }
      return;
    }
    const total = riderHandoffCountdownSec(RIDER_DRIVER_FOUND_HANDOFF_MS);
    setHandoffCountdown(total);
    if (handoffTickRef.current) clearInterval(handoffTickRef.current);
    handoffTickRef.current = setInterval(() => {
      setHandoffCountdown((c) => {
        if (c == null || c <= 1) return null;
        return c - 1;
      });
    }, 1000);
    return () => {
      if (handoffTickRef.current) {
        clearInterval(handoffTickRef.current);
        handoffTickRef.current = null;
      }
    };
  }, [driverFound, tripId]);

  /** Schedule screen with route context (“Later”) — lightweight, non-blocking. */
  const openScheduleRide = () => {
    if (navigationInFlightRef.current) return;
    const pLat = pickupCoords?.lat || currentLocation?.lat;
    const pLng = pickupCoords?.lng || currentLocation?.lng;
    const dLat = destinationCoords?.lat;
    const dLng = destinationCoords?.lng;
    navigationInFlightRef.current = true;
    router.push({
      pathname: '/rider/schedule',
      params: {
        ...(pickup?.trim() ? { pickup } : {}),
        ...(destination?.trim() ? { dropoff: destination } : {}),
        ...(pLat && pLng ? { pickupLat: String(pLat), pickupLng: String(pLng) } : {}),
        ...(dLat && dLng ? { dropoffLat: String(dLat), dropoffLng: String(dLng) } : {}),
        rideType: selectedVehicle || 'economy',
        fareEstimate: String(currentFare || 0),
      },
    } as any);
    setTimeout(() => {
      navigationInFlightRef.current = false;
    }, 800);
  };

  const openDestinationSearch = useCallback(() => {
    requestAnimationFrame(() => {
      setEditingField('destination');
      setShowLocationModal(true);
    });
  }, []);

  const openStopSearch = useCallback(() => {
    requestAnimationFrame(() => {
      setEditingField('stop');
      setShowLocationModal(true);
    });
  }, []);

  const clearStop = useCallback(() => {
    setStop('');
    setStopCoords(null);
    invalidateRoutePricing();
  }, [invalidateRoutePricing]);

  const openPickupEditor = useCallback(() => {
    requestAnimationFrame(() => {
      setEditingField('pickup');
      setShowLocationModal(true);
    });
  }, []);

  const dismissBookingPromo = useCallback(async () => {
    setBookingPromoVisible(false);
    try {
      await AsyncStorage.setItem(BOOKING_PROMO_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const applyRecentDestination = useCallback(
    (item: { address?: string; description?: string; lat?: number; lng?: number }) => {
      const label = String(item.address || item.description || '').trim();
      if (!label) return;
      setDestination(label);
      if (
        Number.isFinite(Number(item.lat)) &&
        Number.isFinite(Number(item.lng))
      ) {
        setDestinationCoords({ lat: Number(item.lat), lng: Number(item.lng) });
      } else {
        setDestinationCoords(null);
      }
    },
    [],
  );

  const toggleRidePreference = (preferenceId: string) => {
    setRidePreferences((prev) =>
      prev.includes(preferenceId)
        ? prev.filter((item) => item !== preferenceId)
        : [...prev, preferenceId]
    );
  };

  const tripPaymentMethod = useCallback(() => (ridePaymentMethod === 'wallet' ? 'wallet' : 'cash'), [ridePaymentMethod]);

  useEffect(() => {
    if (!riderId) {
      setWalletBalance(null);
      return;
    }
    (async () => {
      try {
        const w = await getWalletMe(1);
        setWalletBalance(Number(w.data?.balance ?? 0));
      } catch {
        setWalletBalance(null);
      }
    })();
  }, [riderId]);

  useEffect(() => {
    if (!riderId) return;
    (async () => {
      try {
        const res = await getRiderPreferences(riderId);
        const name = String(res.data?.estate_name || '');
        const code = String(res.data?.estate_gate_code || '');
        setEstateName(name);
        setEstateGateCode(code);
        if (code) {
          setGateCodeSaved(true);
          setIncludeGateCode(true);
        }
      } catch {}
    })();
  }, [riderId]);

  // Check if rider is currently booking-suspended (1h cooldown after 7 cancellations in 24h)
  useEffect(() => {
    if (!riderId) return;
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/enforcement/book-status/${riderId}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (!data.can_book && data.reason === 'booking_blocked' && data.seconds_remaining > 0) {
          setBookSuspended(true);
          setBookSuspendedSeconds(data.seconds_remaining);
        }
      } catch {}
    })();
  }, [riderId]);

  // Countdown ticker for booking suspension
  useEffect(() => {
    if (!bookSuspended) {
      if (bookSuspendIntervalRef.current) {
        clearInterval(bookSuspendIntervalRef.current);
        bookSuspendIntervalRef.current = null;
      }
      return;
    }
    bookSuspendIntervalRef.current = setInterval(() => {
      setBookSuspendedSeconds((prev) => {
        if (prev <= 1) {
          setBookSuspended(false);
          if (bookSuspendIntervalRef.current) clearInterval(bookSuspendIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (bookSuspendIntervalRef.current) clearInterval(bookSuspendIntervalRef.current);
    };
  }, [bookSuspended]);

  // Pre-load rider's saved mood preferences as default chip selection
  useEffect(() => {
    if (!riderId) return;
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/${riderId}/preferences`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        const m = data?.ride_mood;
        if (!m) return;
        const chips: string[] = [];
        if (m.conversation === 'quiet') chips.push('quiet_ride');
        if (m.conversation === 'chatty') chips.push('chatty_driver');
        if (m.music === 'on') chips.push('music_on');
        if (m.temperature === 'cold') chips.push('cold_ac');
        if (chips.length > 0) setRidePreferences(chips);
      } catch {}
    })();
  }, [riderId]);

  useEffect(() => {
    if (!BOOKING_PROMO_ENABLED) return;
    let cancelled = false;
    void AsyncStorage.getItem(BOOKING_PROMO_DISMISS_KEY).then((v) => {
      if (!cancelled && v !== '1') setBookingPromoVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Check if this rider has never taken a trip — show 20% first-ride discount banner
  useEffect(() => {
    if (!riderId) return;
    let cancelled = false;
    void fetch(`${BACKEND_URL}/api/incentives/first-ride-status`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setIsFirstRider(d?.first_ride_completed === false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [riderId]);

  useEffect(() => {
    let cancelled = false;
    void getRecentLocations().then((list) => {
      if (cancelled || !Array.isArray(list)) return;
      const normalized = list
        .map((raw: any) => ({
          address: String(raw?.address || raw?.description || '').trim() || undefined,
          description: String(raw?.description || '').trim() || undefined,
          lat: Number.isFinite(Number(raw?.lat)) ? Number(raw.lat) : undefined,
          lng: Number.isFinite(Number(raw?.lng)) ? Number(raw.lng) : undefined,
        }))
        .filter((x) => x.address || x.description);
      setRecentDestinations(normalized.slice(0, 8));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!riderId) {
      setScheduledRides([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/rides/scheduled/${encodeURIComponent(riderId)}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        const rides = Array.isArray(data?.scheduled_rides) ? data.scheduled_rides : [];
        setScheduledRides(rides.slice(0, 2));
      } catch {
        setScheduledRides([]);
      }
    })();
  }, [riderId]);

  useEffect(() => {
    const lat = pickupCoords?.lat || currentLocation?.lat;
    const lng = pickupCoords?.lng || currentLocation?.lng;
    if (!lat || !lng) {
      setNearbyDrivers([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const res = await getAvailableDrivers({
          lat,
          lng,
          vehicle_type: selectedVehicle || undefined,
        });
        const rows = Array.isArray(res.data?.drivers) ? res.data.drivers : [];
        if (cancelled) return;
        setNearbyDrivers(
          rows
            .map((d: any) => ({
              driver_id: String(d.driver_id || ''),
              name: String(d.name || 'Driver'),
              lat: Number(d.current_location?.lat),
              lng: Number(d.current_location?.lng),
              status: d.is_online ? 'online' : 'offline',
              vehicle: d.vehicle_model || d.vehicle_type || 'Car',
            }))
            .filter((d: any) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
            .slice(0, 25),
        );
      } catch {
        if (!cancelled) setNearbyDrivers([]);
      }
    };
    void run();
    const timer = setInterval(run, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pickupCoords?.lat, pickupCoords?.lng, currentLocation?.lat, currentLocation?.lng, selectedVehicle, tripDraftRouteKey]);

  /** Instant path when backend pushes trip_update over WebSocket (replaces slow polling). */
  const applyAcceptedFromRealtime = useCallback(
    (id: string, t: Record<string, any>, statusStr: string) => {
      clearDriverPoll();
      const norm =
        statusStr === 'arrived' ? 'arrived' : statusStr === 'ongoing' ? 'ongoing' : 'accepted';
      const pl = t?.pickup_location;
      const dl = t?.dropoff_location;
      setCurrentTrip({
        id,
        rider_id: riderId || '',
        driver_id: t?.driver_id || null,
        pickup_location: tripLocationRecord(
          pl,
          pickupCoords ?? currentLocation,
          pickup,
        ),
        dropoff_location: tripLocationRecord(dl, destinationCoords, destination),
        distance_km: Number(t?.distance_km ?? fareDetails?.distance_km ?? 0),
        duration_mins: Number(
          t?.duration_mins ??
            fareDetails?.duration_mins ??
            fareDetails?.duration_min ??
            fareDetails?.estimated_time_minutes ??
            0,
        ),
        fare: Number(t?.fare ?? t?.offered_fare ?? currentFare ?? 0),
        surge_multiplier: Number(fareDetails?.surge_multiplier || 1),
        status: norm as 'accepted' | 'arrived' | 'ongoing',
        payment_method: (t?.payment_method as string) || tripPaymentMethod(),
        payment_status: 'pending',
        rider_rating: null,
        driver_rating: null,
        created_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
      });
      setDriverFound({
        driver_id: t?.driver_id,
        name: t?.driver_name || 'Driver',
        rating: 4.5,
        vehicle: t?.vehicle_model || 'Vehicle',
        plate: t?.vehicle_plate || '',
        color: t?.vehicle_color || '',
      });
      navigateToLiveTracking(id);
    },
    [
      riderId,
      pickupCoords,
      destinationCoords,
      currentLocation,
      pickup,
      destination,
      fareDetails,
      currentFare,
      setCurrentTrip,
      clearDriverPoll,
      tripPaymentMethod,
      navigateToLiveTracking,
    ]
  );

  const inferCityFromCoords = (lat?: number, lng?: number) => {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    return pickFareCitySlugFromCoords(la, ln, 140);
  };

  const inferCity = (pickupText: string, destinationText: string) =>
    inferFareCitySlugFromAddress(pickupText, destinationText);

  // GPS: parallel fresh + cached fix, start reverse-geocode immediately (no serial GPS wait).
  useEffect(() => {
    let mounted = true;
    const presetPickupTxt = typeof params.pickup === 'string' ? params.pickup.trim() : '';
    const presetPLat = Number(params.pickupLat);
    const presetPLng = Number(params.pickupLng);

    const detectGPS = async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) setGpsStatus('error');
          return;
        }

        /* Deep link / "Book again": fixed pickup overrides device GPS when coords or geocoded address provided */
        if (presetPickupTxt && Number.isFinite(presetPLat) && Number.isFinite(presetPLng)) {
          const lat0 = presetPLat;
          const lng0 = presetPLng;
          const addrPromise = reverseGeocodeViaBackend(lat0, lng0, BACKEND_URL);
          if (!mounted) return;
          setPickupCoords({ lat: lat0, lng: lng0 });
          setCurrentLocation({ lat: lat0, lng: lng0, address: presetPickupTxt });
          setPickup(presetPickupTxt);
          setGpsStatus('locked');
          try {
            const resolved = await addrPromise;
            if (!mounted) return;
            if (resolved) {
              setPickup(resolved);
              setCurrentLocation({ lat: lat0, lng: lng0, address: resolved });
            }
          } catch {
            /* keep presetPickupTxt */
          }
          return;
        }
        if (presetPickupTxt) {
          const g = await geocodeAddressForRider(presetPickupTxt);
          if (g && mounted) {
            setPickupCoords({ lat: g.lat, lng: g.lng });
            setCurrentLocation({ lat: g.lat, lng: g.lng, address: g.address });
            setPickup(g.address);
            setGpsStatus('locked');
            return;
          }
        }

        const [lastRes, curRes] = await Promise.allSettled([
          Location.getLastKnownPositionAsync({
            maxAge: 120000,
            requiredAccuracy: 900,
          }),
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Lowest,
          }),
        ]);

        let latN: number | undefined;
        let lngN: number | undefined;

        if (curRes.status === 'fulfilled' && curRes.value?.coords) {
          latN = Number(curRes.value.coords.latitude);
          lngN = Number(curRes.value.coords.longitude);
        }
        if (
          (!Number.isFinite(latN) || !Number.isFinite(lngN)) &&
          lastRes.status === 'fulfilled' &&
          lastRes.value?.coords
        ) {
          latN = Number(lastRes.value.coords.latitude);
          lngN = Number(lastRes.value.coords.longitude);
        }

        if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            latN = Number(loc.coords.latitude);
            lngN = Number(loc.coords.longitude);
          } catch {
            if (mounted) setGpsStatus('error');
            return;
          }
        }

        if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
          if (mounted) setGpsStatus('error');
          return;
        }

        const lat0 = latN as number;
        const lng0 = lngN as number;

        if (!mounted) return;

        const addrPromise = reverseGeocodeViaBackend(lat0, lng0, BACKEND_URL);

        setPickupCoords({ lat: lat0, lng: lng0 });
        setCurrentLocation({ lat: lat0, lng: lng0, address: '' });
        setPickup('Finding address…');
        setGpsStatus('locked');

        try {
          const resolved = await addrPromise;
          if (!mounted) return;
          if (resolved) {
            setPickup(resolved);
            setCurrentLocation({ lat: lat0, lng: lng0, address: resolved });
          } else {
            const fallback = `${lat0.toFixed(4)}, ${lng0.toFixed(4)}`;
            setPickup(fallback);
            setCurrentLocation({ lat: lat0, lng: lng0, address: fallback });
          }
        } catch {
          if (!mounted) return;
          const fallback = `${lat0.toFixed(4)}, ${lng0.toFixed(4)}`;
          setPickup(fallback);
          setCurrentLocation({ lat: lat0, lng: lng0, address: fallback });
        }

        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then(async (loc: { coords: { latitude: number; longitude: number } }) => {
            if (!mounted) return;
            const nlat = Number(loc.coords.latitude);
            const nlng = Number(loc.coords.longitude);
            if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return;
            setPickupCoords({ lat: nlat, lng: nlng });
            setCurrentLocation(
              (prev: { lat: number; lng: number; address?: string } | null) =>
                prev ? { ...prev, lat: nlat, lng: nlng } : { lat: nlat, lng: nlng, address: '' },
            );
            const addr = await reverseGeocodeViaBackend(nlat, nlng, BACKEND_URL);
            if (!mounted || !addr) return;
            setPickup(addr);
            setCurrentLocation({ lat: nlat, lng: nlng, address: addr });
          })
          .catch(() => {});
      } catch {
        if (mounted) setGpsStatus('error');
      }
    };
    detectGPS();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preset pickup intentionally tracks URL keys only once per open
  }, [
    params.pickup,
    params.pickupLat,
    params.pickupLng,
  ]);

  // If pickup is still raw coordinates after lock, retry reverse geocode (cold start / rate limit).
  useEffect(() => {
    if (gpsStatus !== 'locked' || !pickupCoords) return;
    if (!isRawLatLngLabel(pickup)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const addr = await reverseGeocodeViaBackend(pickupCoords.lat, pickupCoords.lng, BACKEND_URL);
          if (cancelled || !addr) return;
          setPickup(addr);
          setCurrentLocation((prev: { lat: number; lng: number; address: string } | null) =>
            prev && Number(prev.lat) === pickupCoords.lat && Number(prev.lng) === pickupCoords.lng
              ? { ...prev, address: addr }
              : prev,
          );
        } catch {
          /* ignore */
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [gpsStatus, pickupCoords?.lat, pickupCoords?.lng, pickup]);

  // Opening pickup search — resolve coords / “Finding address…” to a real label when modal opens or coords jump.
  useEffect(() => {
    if (!showLocationModal || editingField !== 'pickup' || !pickupCoords) return;
    const needsResolve =
      isRawLatLngLabel(pickup) || pickup === 'Finding address…';
    if (!needsResolve) return;
    let cancelled = false;
    void (async () => {
      const addr = await reverseGeocodeViaBackend(pickupCoords.lat, pickupCoords.lng, BACKEND_URL);
      if (cancelled || !addr) return;
      setPickup(addr);
      setCurrentLocation((prev: { lat: number; lng: number; address: string } | null) =>
        prev &&
        Number(prev.lat) === pickupCoords.lat &&
        Number(prev.lng) === pickupCoords.lng
          ? { ...prev, address: addr }
          : prev,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [showLocationModal, editingField, pickupCoords?.lat, pickupCoords?.lng, pickup]);

  const fetchPlaceDetails = async (placeId: string, sessionToken?: string) => {
    const id = String(placeId || '').trim();
    if (!id) return null;
    try {
      const sessionQ =
        sessionToken && sessionToken.trim().length > 0
          ? `?sessiontoken=${encodeURIComponent(sessionToken.trim())}`
          : '';
      const res = await fetch(
        `${BACKEND_URL}/api/places/details/${encodeURIComponent(id)}${sessionQ}`,
      );
      const data = await res.json().catch(() => ({}));
      const lat = Number(data?.latitude);
      const lng = Number(data?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { description: String(data.address || data.formatted_address || '').trim() || '', lat, lng };
      }
    } catch {}
    return null;
  };

  const resolveAddressToCoords = async (address: string) => {
    try {
      const query = encodeURIComponent(address.trim());
      const res = await fetch(`${BACKEND_URL}/api/places/geocode-address?address=${query}`);
      const data = await res.json().catch(() => ({}));
      const lat = Number(data?.latitude);
      const lng = Number(data?.longitude);
      if (res.ok && Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          lat,
          lng,
          address: String(data.address || address || '').trim() || address,
        };
      }
    } catch {}
    return null;
  };

  // Destination from deep link (saved place, Book again, external) — geocode if needed
  useEffect(() => {
    const rawDest =
      typeof params.dropoff === 'string'
        ? params.dropoff.trim()
        : typeof params.destination === 'string'
          ? params.destination.trim()
          : '';
    const dLat = Number(params.dropoffLat ?? params.destLat);
    const dLng = Number(params.dropoffLng ?? params.destLng);
    const sig = `${rawDest}|${dLat}|${dLng}`;
    if (!rawDest && !(Number.isFinite(dLat) && Number.isFinite(dLng))) return;
    if (appliedBookingDestRef.current === sig) return;
    appliedBookingDestRef.current = sig;

    let cancelled = false;
    void (async () => {
      if (Number.isFinite(dLat) && Number.isFinite(dLng) && rawDest) {
        if (cancelled) return;
        setDestination(rawDest);
        setDestinationCoords({ lat: dLat, lng: dLng });
        return;
      }
      if (!rawDest) return;
      const g = await resolveAddressToCoords(rawDest);
      if (cancelled) return;
      if (g) {
        setDestination(g.address);
        setDestinationCoords({ lat: g.lat, lng: g.lng });
      } else {
        setDestination(rawDest);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.dropoff, params.destination, params.dropoffLat, params.dropoffLng, params.destLat, params.destLng]);

  const toStr = (v: any, fallback = 'Something went wrong'): string => {
    if (v === null || v === undefined) return fallback;
    if (typeof v === 'string') return v || fallback;
    if (v instanceof Error) return v.message || fallback;
    if (Array.isArray(v)) {
      const first = v[0];
      if (typeof first === 'string') return first;
      if (first?.msg) return String(first.msg);
      if (first?.message) return String(first.message);
      return fallback;
    }
    if (typeof v === 'object') {
      if (v.detail) return toStr(v.detail, fallback);
      if (v.message) return String(v.message);
      if (v.msg) return String(v.msg);
      return fallback;
    }
    return String(v);
  };

  const haversineKm = useCallback((lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  const syncFareLockSnapshot = useCallback(
    (
      pLat: number,
      pLng: number,
      dLat: number,
      dLng: number,
      sLat?: number | null,
      sLng?: number | null,
    ) => {
      fareLockSnapshotRef.current = {
        at: Date.now(),
        pickup: { lat: pLat, lng: pLng },
        drop: { lat: dLat, lng: dLng },
        stop:
          sLat != null && sLng != null && Number.isFinite(sLat) && Number.isFinite(sLng)
            ? { lat: sLat, lng: sLng }
            : null,
      };
    },
    [],
  );

  const lockedFareEstimateId = useCallback(
    (
      fd: FareEstimateResponse | null,
      pLat: number,
      pLng: number,
      dLat: number,
      dLng: number,
      sLat?: number | null,
      sLng?: number | null,
    ): string | undefined => {
      if (!fd) return undefined;
      const raw = fd as unknown as Record<string, unknown>;
      const eid =
        (typeof fd.estimate_id === 'string' && fd.estimate_id.trim()) ||
        (typeof raw.estimateId === 'string' && String(raw.estimateId).trim()) ||
        '';
      if (!eid) return undefined;
      const untilRaw = fd.price_valid_until ?? raw.priceValidUntil;
      const until = parseFareLockDeadlineMs(untilRaw);
      const CLOCK_SKEW_LEEWAY_MS = 45_000;
      if (!until || Date.now() >= until + CLOCK_SKEW_LEEWAY_MS) return undefined;
      const snap = fareLockSnapshotRef.current;
      // When we have a geo snapshot, require pickup/drop to match (same rule as server drift).
      // When snapshot is missing (race / restore), still send lock id if TTL valid — server validates coords.
      if (snap) {
        const hasStop = sLat != null && sLng != null;
        const snapHasStop = Boolean(snap.stop);
        if (hasStop !== snapHasStop) return undefined;
        if (
          haversineKm(snap.pickup.lat, snap.pickup.lng, pLat, pLng) > ROUTE_DRIFT_KM ||
          haversineKm(snap.drop.lat, snap.drop.lng, dLat, dLng) > ROUTE_DRIFT_KM
        ) {
          return undefined;
        }
        if (hasStop && snap.stop) {
          if (haversineKm(snap.stop.lat, snap.stop.lng, sLat!, sLng!) > ROUTE_DRIFT_KM) {
            return undefined;
          }
        }
      }
      return eid;
    },
    [haversineKm],
  );

  const requestFareEstimate = async (payload: {
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    stop_lat?: number;
    stop_lng?: number;
    stop_address?: string;
    service_type: string;
    city: string;
    pickup_address?: string;
    dropoff_address?: string;
    rider_id?: string;
    preferred_driver_id?: string;
  }): Promise<FareEstimateResponse> => {
    const routeStops =
      payload.stop_lat != null &&
      payload.stop_lng != null &&
      Number.isFinite(payload.stop_lat) &&
      Number.isFinite(payload.stop_lng)
        ? [{ lat: payload.stop_lat, lng: payload.stop_lng }]
        : [];

    try {
      const { data } = await estimateFare({
        pickup_lat: payload.pickup_lat,
        pickup_lng: payload.pickup_lng,
        dropoff_lat: payload.dropoff_lat,
        dropoff_lng: payload.dropoff_lng,
        ...(routeStops.length === 1
          ? {
              stop_lat: routeStops[0]!.lat,
              stop_lng: routeStops[0]!.lng,
              stop_address: payload.stop_address,
            }
          : {}),
        service_type: payload.service_type,
        city: payload.city,
        pickup_address: payload.pickup_address,
        dropoff_address: payload.dropoff_address,
        rider_id: payload.rider_id ?? (riderId ? String(riderId) : undefined),
        ...(payload.preferred_driver_id
          ? { preferred_driver_id: payload.preferred_driver_id }
          : {}),
      });
      return normalizeFareEstimatePayload(data);
    } catch (e: any) {
      const d = e?.response?.data;
      throw new Error(toStr(d?.detail, 'Could not calculate fare'));
    }
  };

  // Route preview polyline comes from POST /fare/estimate (no client-side Directions).
  useEffect(() => {
    const pLat = pickupCoords?.lat;
    const pLng = pickupCoords?.lng;
    const dLat = destinationCoords?.lat;
    const dLng = destinationCoords?.lng;

    if (
      !Number.isFinite(Number(pLat)) ||
      !Number.isFinite(Number(pLng)) ||
      !Number.isFinite(Number(dLat)) ||
      !Number.isFinite(Number(dLng))
    ) {
      setBookingRouteCoords([]);
      setBookingRouteEtaMin(null);
      setBookingRouteLoading(false);
      return undefined;
    }

    const { requestId } = beginRouteRecalc('route-deps-changed');
    pricingEpochRef.current = requestId;
    fareDetailsEpochRef.current = requestId;
    setBookingRouteLoading(true);
    return undefined;
  }, [
    pickupCoords?.lat,
    pickupCoords?.lng,
    destinationCoords?.lat,
    destinationCoords?.lng,
    tripStops,
    tripDraftRouteKey,
  ]);

  // Fare polyline from estimate only when it matches the active route request (never revert stops).
  useEffect(() => {
    const fd = fareDetails;
    if (!fd) return;
    const requestId = getCurrentRouteRequestId();
    if (fareDetailsEpochRef.current !== requestId) return;
    if (ignoreStaleRouteResponse(requestId, 'fare-polyline')) return;
    if (tripStops.length > 0 && !routeStopFields.stop_lat) return;

    const distanceMeters = Number(
      (fd as { distance_meters?: number }).distance_meters ??
        (Number(fd.distance_km) > 0 ? Number(fd.distance_km) * 1000 : NaN),
    );
    const durationSeconds = Number(
      (fd as { duration_seconds?: number }).duration_seconds ??
        (Number(fd.duration_min ?? fd.estimated_time_minutes) > 0
          ? Number(fd.duration_min ?? fd.estimated_time_minutes) * 60
          : NaN),
    );
    if (Number.isFinite(distanceMeters) && Number.isFinite(durationSeconds)) {
      const metrics = commitRouteMetrics(requestId, distanceMeters, durationSeconds);
      if (metrics) {
        setBookingRouteEtaMin(metrics.durationMinutes);
      }
    }

    let appliedPolyline = false;
    const encoded: string =
      (typeof fd.polyline === 'string' && fd.polyline) ||
      (typeof (fd as { encoded_polyline?: string }).encoded_polyline === 'string'
        ? String((fd as { encoded_polyline?: string }).encoded_polyline)
        : '') ||
      '';
    if (encoded.length > 8) {
      try {
        const dec = decodePolyline(encoded);
        if (dec.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
          applyTripDraftRoute(requestId, {
            polyline: dec.map((c) => ({ latitude: c.lat, longitude: c.lng })),
          });
          appliedPolyline = true;
        }
      } catch {
        /* fall through */
      }
    }

    if (!appliedPolyline) {
      const preview = parseRoutePreviewToMapCoords(fd.route_preview_coordinates);
      if (preview.length >= DIRECTIONS_ROUTE_MIN_POINTS) {
        applyTripDraftRoute(requestId, { polyline: preview });
        appliedPolyline = true;
      }
    }

    if (!ignoreStaleRouteResponse(requestId, 'fare-polyline-done')) {
      setBookingRouteLoading(false);
    }
  }, [
    fareDetails?.estimate_id,
    fareDetails?.polyline,
    fareDetails?.route_preview_coordinates,
    tripStops.length,
    routeStopFields.stop_lat,
    applyTripDraftRoute,
  ]);

  const calculateAllVehiclePrices = async () => {
    const requestId = getCurrentRouteRequestId();
    try {
      let pLat = pickupCoords?.lat || currentLocation?.lat;
      let pLng = pickupCoords?.lng || currentLocation?.lng;
      let dLat = destinationCoords?.lat;
      let dLng = destinationCoords?.lng;

      if ((!pLat || !pLng) && pickup?.trim()) {
        const resolvedPickup = await resolveAddressToCoords(pickup);
        if (resolvedPickup) {
          pLat = resolvedPickup.lat;
          pLng = resolvedPickup.lng;
          setPickupCoords({ lat: resolvedPickup.lat, lng: resolvedPickup.lng });
        }
      }
      if ((!dLat || !dLng) && destination?.trim()) {
        const resolvedDestination = await resolveAddressToCoords(destination);
        if (resolvedDestination) {
          dLat = resolvedDestination.lat;
          dLng = resolvedDestination.lng;
          setDestinationCoords({ lat: resolvedDestination.lat, lng: resolvedDestination.lng });
        }
      }
      if (!pLat || !pLng || !dLat || !dLng) return;

      const city =
        inferCityFromCoords(pLat, pLng) ||
        inferCityFromCoords(dLat, dLng) ||
        inferCity(pickup, destination) ||
        'default';

      const results = await Promise.all(
        availableVehicles.map(async (vehicle) => {
          try {
            const data = await requestFareEstimate({
              pickup_lat: pLat!,
              pickup_lng: pLng!,
              dropoff_lat: dLat!,
              dropoff_lng: dLng!,
              ...routeStopFields,
              service_type: vehicle.id,
              city,
              pickup_address: pickup?.trim() || undefined,
              dropoff_address: destination?.trim() || undefined,
              preferred_driver_id: requestedDriverId || undefined,
            });
            const price = Number(data?.total_fare ?? data?.fare ?? data?.total ?? 0);
            return [vehicle.id, Math.round(price), data] as const;
          } catch {
            return [vehicle.id, 0, null] as const;
          }
        })
      );

      if (ignoreStaleRouteResponse(requestId, 'fare-matrix')) return;

      const nextMatrix = Object.fromEntries(results.map(([id, price]) => [id, price]));
      const nextOrig: Record<string, number> = {};
      for (const [id, price, data] of results) {
        const d = data as FareEstimateResponse | null;
        if (
          d?.first_ride_discount_applied &&
          d.original_total_fare != null &&
          Number.isFinite(Number(d.original_total_fare))
        ) {
          const o = Math.round(Number(d.original_total_fare));
          if (o > price) nextOrig[id] = o;
        }
      }
      setFareMatrix(nextMatrix);
      setFareMatrixOriginal(nextOrig);

      let veh = selectedVehicle;
      if (!veh && (nextMatrix['economy'] ?? 0) > 0) {
        veh = 'economy';
        setSelectedVehicle('economy');
      }
      if (!veh) return;

      const row = results.find((r) => r[0] === veh);
      const detail = row?.[2];
      const vehPrice = Number(nextMatrix[veh] ?? 0);
      if (detail) {
        fareDetailsEpochRef.current = requestId;
        setFareDetails(detail);
        const etaFromEstimate = Number(
          detail.duration_min ??
            detail.estimated_time_minutes ??
            detail.traffic_duration_min ??
            detail.pricing_route_minutes ??
            tripDraft.durationMinutes ??
            0,
        );
        const distanceKm = Number(
          detail.distance_km ?? tripDraft.distanceKm ?? 0,
        );
        const vehFare = Math.round(Number(detail.total_fare ?? detail.fare ?? vehPrice ?? 0));
        commitFare(requestId, vehFare, {
          vehicleId: veh,
          distanceKm: Number(detail.distance_km ?? tripDraft.distanceKm ?? 0),
          durationMinutes: Number(
            detail.duration_min ?? detail.estimated_time_minutes ?? tripDraft.durationMinutes ?? 0,
          ),
        });
        applyTripDraftRoute(requestId, {
          durationMinutes:
            Number.isFinite(etaFromEstimate) && etaFromEstimate > 0
              ? Math.round(etaFromEstimate)
              : tripDraft.durationMinutes,
          distanceKm: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : tripDraft.distanceKm,
          estimatedFare: vehFare > 0 ? vehFare : null,
        });
        syncFareLockSnapshot(
          pLat!,
          pLng!,
          dLat!,
          dLng!,
          routeStopFields.stop_lat,
          routeStopFields.stop_lng,
        );
        setCurrentFare((prev) => {
          if (ignoreStaleRouteResponse(requestId, 'current-fare')) return prev;
          return vehFare > 0 ? vehFare : prev;
        });
      } else if (vehPrice > 0) {
        syncFareLockSnapshot(
          pLat!,
          pLng!,
          dLat!,
          dLng!,
          routeStopFields.stop_lat,
          routeStopFields.stop_lng,
        );
        applyTripDraftRoute(requestId, { estimatedFare: vehPrice });
        if (!ignoreStaleRouteResponse(requestId, 'current-fare-fallback')) {
          setCurrentFare(vehPrice);
        }
      }
    } catch {
      /* matrix calc failed — keep prior fares; avoid crashing booking sheet */
    }
  };

  const handleCalculateFare = async (vehicleOverride?: string) => {
    if (calculateInFlightRef.current) return;
    if (!pickup || !destination) {
      Alert.alert('Missing', 'Please select pickup and destination');
      return;
    }
    if (stop?.trim() && !routeStopFields.stop_lat) {
      Alert.alert('Stop location', 'Pick your stop from search suggestions so we can price the full route.');
      return;
    }
    const effectiveVehicle = vehicleOverride || selectedVehicle;
    if (!effectiveVehicle) {
      Alert.alert('Select Vehicle', 'Please select a vehicle type first.');
      setShowVehicleModal(true);
      return;
    }
    calculateInFlightRef.current = true;
    setIsLoading(true);
    try {
      let pLat = pickupCoords?.lat || currentLocation?.lat;
      let pLng = pickupCoords?.lng || currentLocation?.lng;
      let dLat = destinationCoords?.lat;
      let dLng = destinationCoords?.lng;

      // Fallback: if user typed address manually without selecting prediction,
      // resolve it to coordinates before fare estimation.
      if ((!pLat || !pLng) && pickup?.trim()) {
        const resolvedPickup = await resolveAddressToCoords(pickup);
        if (resolvedPickup) {
          pLat = resolvedPickup.lat;
          pLng = resolvedPickup.lng;
          setPickupCoords({ lat: resolvedPickup.lat, lng: resolvedPickup.lng });
          if (resolvedPickup.address) setPickup(resolvedPickup.address);
        }
      }

      if ((!dLat || !dLng) && destination?.trim()) {
        const resolvedDestination = await resolveAddressToCoords(destination);
        if (resolvedDestination) {
          dLat = resolvedDestination.lat;
          dLng = resolvedDestination.lng;
          setDestinationCoords({ lat: resolvedDestination.lat, lng: resolvedDestination.lng });
          if (resolvedDestination.address) setDestination(resolvedDestination.address);
        }
      }

      if (!pLat || !pLng || !dLat || !dLng) {
        Alert.alert('Location Error', 'Could not resolve coordinates. Please tap a suggestion or try a more specific address.');
        setIsLoading(false);
        return;
      }

      const serviceType = effectiveVehicle;
      const inferredCity =
        inferCityFromCoords(pLat, pLng) ||
        inferCityFromCoords(dLat, dLng) ||
        inferCity(pickup, destination) ||
        'default';
      const basePayload = {
        pickup_lat: pLat,
        pickup_lng: pLng,
        dropoff_lat: dLat,
        dropoff_lng: dLng,
        ...routeStopFields,
        service_type: serviceType,
        city: inferredCity,
        pickup_address: pickup?.trim() || undefined,
        dropoff_address: destination?.trim() || undefined,
        preferred_driver_id: requestedDriverId || undefined,
      };

      let data;
      try {
        data = await requestFareEstimate(basePayload);
      } catch (firstError) {
        // Retry once for the default Standard flow with a stable fallback city.
        const retryPayload = {
          ...basePayload,
          service_type: serviceType || 'economy',
          city: inferredCity || 'default',
        };
        data = await requestFareEstimate(retryPayload);
      }

      const computedFare = Number(
        data?.total_fare ??
        data?.fare ??
        data?.total ??
        0
      );
      if (Number.isFinite(computedFare) && computedFare > 0) {
        const rounded = Math.round(computedFare);
        const lo = data.min_price != null ? Math.max(100, Math.round(Number(data.min_price))) : 100;
        const hi = data.max_price != null ? Math.round(Number(data.max_price)) : rounded;
        const clamped = Math.min(Math.max(rounded, lo), Math.max(lo, hi));
        setCurrentFare(clamped);
        const requestId = getCurrentRouteRequestId();
        fareDetailsEpochRef.current = requestId;
        setFareDetails({ ...data, service_type: serviceType, city: inferredCity });
        applyTripDraftRoute(requestId, {
          estimatedFare: clamped,
          distanceKm: Number(data.distance_km) || tripDraft.distanceKm,
          durationMinutes:
            Number(
              data.duration_min ??
                data.estimated_time_minutes ??
                data.traffic_duration_min ??
                tripDraft.durationMinutes,
            ) || tripDraft.durationMinutes,
        });
        syncFareLockSnapshot(
          pLat,
          pLng,
          dLat,
          dLng,
          routeStopFields.stop_lat,
          routeStopFields.stop_lng,
        );
        let routes: TrafficRoute[] = [];
        try {
          routes = await TrafficAI.getOptimizedRoutes(
            { latitude: pLat, longitude: pLng },
            { latitude: dLat, longitude: dLng },
            { prioritizeTime: true, avoidTolls: false }
          );
        } catch {
          routes = [];
        }
        const first = routes[0];
        setOptimizedRoute(first ? TrafficAI.normalizeTrafficRoute(first) : null);
      } else {
        toast.show(toStr(
          (data as { detail?: unknown; message?: unknown })?.detail ||
            (data as { message?: unknown })?.message,
          'Could not calculate fare. Please try again.',
        ), 'error');
      }
    } catch (error: any) {
      toast.show(toStr(error, 'Network error. Check your connection and try again.'), 'error');
    } finally {
      calculateInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!pickupCoords?.lat || !pickupCoords?.lng || !destinationCoords?.lat || !destinationCoords?.lng) {
      setFareMatrix({});
      setFareMatrixOriginal({});
      setOptimizedRoute(null);
      return;
    }
    const run = async () => {
      try {
        await calculateAllVehiclePrices();
      } catch {
        /* fare matrix best-effort */
      }
    };
    const timer = setTimeout(run, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [
    pickupCoords?.lat,
    pickupCoords?.lng,
    destinationCoords?.lat,
    destinationCoords?.lng,
    tripDraftRouteKey,
    tripDraft.distanceKm,
    selectedVehicle,
    availableVehicles,
    riderId,
    requestedDriverId,
  ]);

  useEffect(() => {
    Animated.timing(sheetSlide, {
      toValue: 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sheetSlide]);

  useEffect(() => {
    if (currentFare > 0) {
      fareReveal.setValue(0);
      Animated.timing(fareReveal, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [currentFare, fareReveal]);

  useEffect(() => {
    const pLat = pickupCoords?.lat ?? currentLocation?.lat;
    const pLng = pickupCoords?.lng ?? currentLocation?.lng;
    const dLat = destinationCoords?.lat;
    const dLng = destinationCoords?.lng;
    if (
      !Number.isFinite(Number(pLat)) ||
      !Number.isFinite(Number(pLng)) ||
      !Number.isFinite(Number(dLat)) ||
      !Number.isFinite(Number(dLng))
    ) {
      setRouteSafety(null);
      setRouteSafetyLoading(false);
      setRouteSafetyFailed(false);
      return;
    }
    let cancelled = false;
    setRouteSafetyFailed(false);
    setRouteSafetyLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const snap = await fetchRouteSafety({
            pickup_lat: Number(pLat),
            pickup_lng: Number(pLng),
            dropoff_lat: Number(dLat),
            dropoff_lng: Number(dLng),
          });
          if (!cancelled) { setRouteSafety(snap ?? null); setRouteSafetyFailed(false); }
        } catch {
          if (!cancelled) setRouteSafetyFailed(true);
        } finally {
          if (!cancelled) setRouteSafetyLoading(false);
        }
      })();
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    pickupCoords?.lat,
    pickupCoords?.lng,
    destinationCoords?.lat,
    destinationCoords?.lng,
    currentLocation?.lat,
    currentLocation?.lng,
  ]);

  const findOffers = async () => {
    if (offerInFlightRef.current) return;
    if (!riderId || !canCallAuthedApi) { Alert.alert('Login', 'Please login to request a ride.'); return; }
    if (!selectedVehicle) { Alert.alert('Select Vehicle', 'Please select a vehicle type first.'); setShowVehicleModal(true); return; }
    if (!pickup?.trim() || !destination?.trim()) {
      Alert.alert('Locations', 'Choose pickup and destination.');
      return;
    }
    const payMethod = tripPaymentMethod();
    const pLatEarly = pickupCoords?.lat || currentLocation?.lat || 0;
    const pLngEarly = pickupCoords?.lng || currentLocation?.lng || 0;
    const dLatEarly = destinationCoords?.lat || 0;
    const dLngEarly = destinationCoords?.lng || 0;
    if (!pLatEarly || !pLngEarly || !dLatEarly || !dLngEarly) {
      Alert.alert('Pin locations', 'Pick addresses from search suggestions or use GPS so we have coordinates for drivers.');
      return;
    }
    if (stop?.trim() && !routeStopFields.stop_lat) {
      Alert.alert('Stop location', 'Pick your stop from search suggestions so we can route through it.');
      return;
    }

    const cityEarly =
      inferCityFromCoords(pLatEarly, pLngEarly) ||
      inferCityFromCoords(dLatEarly, dLngEarly) ||
      inferCity(pickup, destination) ||
      'default';
    const normalizedServiceEarly = selectedVehicle === 'standard' ? 'economy' : selectedVehicle;

    let fareForBid: FareEstimateResponse | null = fareDetails ? normalizeFareEstimatePayload(fareDetails) : null;
    let lockIdEarly = lockedFareEstimateId(
      fareForBid,
      pLatEarly,
      pLngEarly,
      dLatEarly,
      dLngEarly,
      routeStopFields.stop_lat,
      routeStopFields.stop_lng,
    );

    if (!lockIdEarly) {
      try {
        const fresh = await requestFareEstimate({
          pickup_lat: pLatEarly,
          pickup_lng: pLngEarly,
          dropoff_lat: dLatEarly,
          dropoff_lng: dLngEarly,
          ...routeStopFields,
          service_type: normalizedServiceEarly,
          city: cityEarly,
          pickup_address: pickup?.trim() || undefined,
          dropoff_address: destination?.trim() || undefined,
          rider_id: riderId ? String(riderId) : undefined,
          preferred_driver_id: requestedDriverId || undefined,
        });
        fareForBid = fresh;
        fareDetailsEpochRef.current = getCurrentRouteRequestId();
        setFareDetails(fresh);
        syncFareLockSnapshot(
          pLatEarly,
          pLngEarly,
          dLatEarly,
          dLngEarly,
          routeStopFields.stop_lat,
          routeStopFields.stop_lng,
        );
        lockIdEarly = lockedFareEstimateId(
          fresh,
          pLatEarly,
          pLngEarly,
          dLatEarly,
          dLngEarly,
          routeStopFields.stop_lat,
          routeStopFields.stop_lng,
        );
      } catch {
        /* fall through to messaging below */
      }
    }

    if (!lockIdEarly) {
      const fd = fareForBid;
      const fdRaw = fd as unknown as Record<string, unknown>;
      const hinted =
        fd &&
        ((typeof fd.estimate_id === 'string' && fd.estimate_id.trim().length > 0) ||
          (typeof fdRaw.estimateId === 'string' &&
            String(fdRaw.estimateId).trim().length > 0));
      Alert.alert(
        hinted ? 'Refresh your fare' : 'Fare quote',
        hinted
          ? 'This quote is no longer locked (expired or pickup/destination shifted). Tap “Refresh estimate”, then request again.'
          : 'We could not lock a price for this route. Check your connection and tap “Refresh estimate”.',
      );
      return;
    }

    const MIN_FARE = 100;
    const smartMin = fareForBid?.min_price != null ? Math.round(Number(fareForBid.min_price)) : 0;
    const floor = Math.max(MIN_FARE, smartMin || 0);
    const bid = Math.round(Number(currentFare));
    if (!Number.isFinite(bid) || bid < floor) {
      Alert.alert(
        'Minimum fare',
        smartMin
          ? `Your bid must be at least ₦${floor.toLocaleString()} for this route (matches drivers’ minimum).`
          : `Use at least ₦${floor.toLocaleString()}. Tap Calculate Fare or adjust with +/−.`,
      );
      return;
    }
    const smartMax = fareForBid?.max_price != null ? Math.round(Number(fareForBid.max_price)) : null;
    if (smartMax != null && smartMax > 0 && bid > smartMax) {
      Alert.alert(
        'Maximum fare',
        `Your bid cannot exceed ₦${smartMax.toLocaleString()} for this route. Tap − or Refresh estimate.`,
      );
      return;
    }

    if (payMethod === 'wallet') {
      let bal = walletBalance ?? 0;
      try {
        const w = await getWalletMe(1);
        bal = Number(w.data?.balance ?? 0);
        setWalletBalance(bal);
      } catch {
        /* use cached balance */
      }
      if (bal + 1e-6 < bid) {
        Alert.alert(
          'Insufficient balance',
          `You need at least ₦${bid.toLocaleString()} in your wallet. Top up in Wallet or pay with cash.`,
        );
        return;
      }
    }
    offerInFlightRef.current = true;
    setIsLoading(true);
    const pLat = pLatEarly;
    const pLng = pLngEarly;
    const dLat = dLatEarly;
    const dLng = dLngEarly;
    const lockId = lockIdEarly;
    const city =
      inferCityFromCoords(pLat, pLng) ||
      inferCityFromCoords(dLat, dLng) ||
      inferCity(pickup, destination) ||
      'default';
    const normalizedService = selectedVehicle === 'standard' ? 'economy' : selectedVehicle;
    const idempotencyKey = (() => {
      try {
        const c = globalThis.crypto as Crypto | undefined;
        return c?.randomUUID ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      } catch {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
    })();
    const requestBody = {
      pickup_lat: pLat,
      pickup_lng: pLng,
      pickup_address: pickup.trim(),
      dropoff_lat: dLat,
      dropoff_lng: dLng,
      dropoff_address: destination.trim(),
      ...routeStopFields,
      service_type: normalizedService,
      city,
      payment_method: payMethod,
      offered_fare: bid,
      recommended_fare:
        Number(fareForBid?.base_price || fareForBid?.total_fare || 0) || undefined,
      fare_estimate_id: lockId,
      idempotency_key: idempotencyKey,
      ...(fareForBid?.demand_ratio != null && Number.isFinite(Number(fareForBid.demand_ratio))
        ? { demand_ratio: Number(fareForBid.demand_ratio) }
        : {}),
      ...(fareForBid?.rain_applied === true ? { rain: true } : {}),
      trip_type: 'intra',
      preferred_driver_id: requestedDriverId || undefined,
      ride_preferences: ridePreferences,
      estate_name: (includeGateCode && estateName.trim()) ? estateName.trim() : undefined,
      estate_gate_code: (includeGateCode && estateGateCode.trim()) ? estateGateCode.trim() : undefined,
    };
    try {
      const res = await authedFetch(`${BACKEND_URL}/api/trips/request?rider_id=${riderId}`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && (result.trip || result.success)) {
        const tid = result.trip?.id || result.trip_id || null;
        const tripFromApi = result.trip as Record<string, unknown> | undefined;
        setTripId(tid);
        if (tid && riderId) {
          const pendingStatus =
            tripFromApi?.status === 'pending_driver_offers' ? 'pending_driver_offers' : 'pending';
          setCurrentTrip({
            id: tid,
            rider_id: riderId,
            driver_id: (tripFromApi?.driver_id as string) || null,
            pickup_location: tripLocationRecord(
              tripFromApi?.pickup_location,
              pickupCoords ?? currentLocation,
              pickup,
            ),
            dropoff_location: tripLocationRecord(
              tripFromApi?.dropoff_location,
              destinationCoords,
              destination,
            ),
            distance_km: Number(tripFromApi?.distance_km ?? fareForBid?.distance_km ?? 0),
            duration_mins: Number(
              tripFromApi?.duration_mins ??
                fareForBid?.duration_mins ??
                fareForBid?.duration_min ??
                fareForBid?.estimated_time_minutes ??
                0,
            ),
            fare: Number(tripFromApi?.fare ?? tripFromApi?.offered_fare ?? bid ?? 0),
            surge_multiplier: Number(fareForBid?.surge_multiplier || 1),
            status: pendingStatus,
            payment_method: (tripFromApi?.payment_method as string) || payMethod,
            payment_status: String(tripFromApi?.payment_status || 'pending'),
            rider_rating: null,
            driver_rating: null,
            created_at: String(tripFromApi?.created_at || new Date().toISOString()),
            accepted_at: null,
            started_at: null,
            completed_at: null,
          });
        }
        setSearchingForDriver(true);
        // Start cancellation countdown (90 s matches server offer expiry)
        setSearchCountdown(90);
        if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
        searchCountdownRef.current = setInterval(() => {
          setSearchCountdown((prev) => {
            if (prev <= 1) {
              if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        pollForDriver(tid);
      } else {
        toast.show(toStr(result?.detail || result?.message, 'Could not request ride. Please try again in a moment.'), 'error');
      }
    } catch {
      const online = await checkOnlineStatus();
      if (!online && riderId) {
        await createOfflineBooking(riderId, requestBody);
      } else {
        toast.show('Could not reach server. Check your connection.', 'error');
      }
    } finally {
      offerInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const cancelPendingTrip = async (id: string | null) => {
    if (!id || !riderId || !canCallAuthedApi) return;
    try {
      await authedFetch(`${BACKEND_URL}/api/trips/${id}/cancel`, {
        method: 'PUT',
        body: JSON.stringify({ cancelled_by: riderId }),
      });
    } catch {}
  };

  const handleSaveGateCode = async () => {
    if (!riderId || !canCallAuthedApi) return;
    if (!estateGateCode.trim()) {
      Alert.alert('Gate Code Required', 'Enter the gate code before saving.');
      return;
    }
    setSavingGateCode(true);
    try {
      await updateRiderPreferences(riderId, {
        estate_name: estateName.trim() || null,
        estate_gate_code: estateGateCode.trim() || null,
      });
      setGateCodeSaved(true);
      setIncludeGateCode(true);
      setEditingGateCode(false);
    } catch {
      Alert.alert('Error', 'Could not save estate gate code. Try again.');
    } finally {
      setSavingGateCode(false);
    }
  };

  const handleClearGateCode = async () => {
    if (!riderId || !canCallAuthedApi) return;
    try {
      await updateRiderPreferences(riderId, { estate_name: null, estate_gate_code: null });
      setEstateName('');
      setEstateGateCode('');
      setGateCodeSaved(false);
      setIncludeGateCode(false);
      setEditingGateCode(false);
    } catch {}
  };

  const pollForDriver = (id: string | null) => {
    if (!id) return;
    clearDriverPoll();
    let attempts = 0;
    driverPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await authedFetch(`${BACKEND_URL}/api/trips/${id}/status`, {
          method: 'GET',
        });
        const data = await res.json();
        if (data.success && isRiderMapLiveTripStatus(String(data.status || '')) && data.driver_info) {
          clearDriverPoll();
          setCurrentTrip({
            id,
            rider_id: riderId || '',
            driver_id: data.driver_info.driver_id || null,
            pickup_location: tripLocationRecord(
              data.pickup_location,
              pickupCoords ?? currentLocation,
              pickup,
            ),
            dropoff_location: tripLocationRecord(data.dropoff_location, destinationCoords, destination),
            distance_km: Number(fareDetails?.distance_km || 0),
            duration_mins: Number(
              fareDetails?.duration_mins ||
                fareDetails?.duration_min ||
                fareDetails?.estimated_time_minutes ||
                0,
            ),
            fare: Number(currentFare || 0),
            surge_multiplier: Number(fareDetails?.surge_multiplier || 1),
            status: data.status === 'arrived' ? 'arrived' : data.status === 'ongoing' ? 'ongoing' : 'accepted',
            payment_method: (data.payment_method as string) || tripPaymentMethod(),
            payment_status: 'pending',
            rider_rating: null,
            driver_rating: null,
            created_at: new Date().toISOString(),
            accepted_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
          });
          setDriverFound(data.driver_info);
          navigateToLiveTracking(id);
        }
      } catch {}
      if (attempts >= 30) {
        clearDriverPoll();
        try {
          const finalRes = await fetch(`${BACKEND_URL}/api/trips/${id}/status`, {
            headers: getAuthHeaders(),
          });
          const finalData = await finalRes.json();
          if (finalData?.success && isRiderMapLiveTripStatus(String(finalData.status || '')) && finalData.driver_info) {
            setCurrentTrip({
              id,
              rider_id: riderId || '',
              driver_id: finalData.driver_info.driver_id || null,
              pickup_location: tripLocationRecord(
                finalData.pickup_location,
                pickupCoords ?? currentLocation,
                pickup,
              ),
              dropoff_location: tripLocationRecord(
                finalData.dropoff_location,
                destinationCoords,
                destination,
              ),
              distance_km: Number(fareDetails?.distance_km || 0),
              duration_mins: Number(
              fareDetails?.duration_mins ||
                fareDetails?.duration_min ||
                fareDetails?.estimated_time_minutes ||
                0,
            ),
              fare: Number(currentFare || 0),
              surge_multiplier: Number(fareDetails?.surge_multiplier || 1),
              status: finalData.status === 'arrived' ? 'arrived' : finalData.status === 'ongoing' ? 'ongoing' : 'accepted',
              payment_method: (finalData.payment_method as string) || tripPaymentMethod(),
              payment_status: 'pending',
              rider_rating: null,
              driver_rating: null,
              created_at: new Date().toISOString(),
              accepted_at: new Date().toISOString(),
              started_at: null,
              completed_at: null,
            });
            setDriverFound(finalData.driver_info);
            navigateToLiveTracking(id);
            return;
          }
        } catch {}
        await cancelPendingTrip(id);
        setSearchingForDriver(false);
        setTripId(null);
        Alert.alert('No Drivers', 'Try increasing your fare or try again later.');
      }
    }, 6000);
  };

  useEffect(() => () => clearDriverPoll(), [clearDriverPoll]);

  const handleRiderTripWs = useCallback(
    (msg: RiderTripWsMessage) => {
      const id = String(msg.trip_id || '');
      if (!id || !tripId || id !== tripId) return;
      const st = String(msg.status || '');
      const t = (msg.trip || {}) as Record<string, any>;
      if (st === 'cancelled') {
        clearDriverPoll();
        setSearchingForDriver(false);
        setTripId(null);
        setDriverFound(null);
        setCurrentTrip(null);
        Alert.alert('Trip cancelled', 'This ride request was cancelled.');
        return;
      }
      if (st === 'pending_payment') {
        // Trip done but payment not yet settled — send to tracking payment screen
        clearDriverPoll();
        setSearchingForDriver(false);
        setDriverFound(null);
        router.replace({ pathname: '/rider/tracking', params: { tripId: id } } as any);
        return;
      }
      if (st === 'completed') {
        clearDriverPoll();
        setSearchingForDriver(false);
        setDriverFound(null);
        setTripId(null);
        router.replace({ pathname: '/rider/trip-receipt', params: { tripId: id } } as any);
        return;
      }
      if (isRiderMapLiveTripStatus(String(st || '')) && t.driver_id) {
        applyAcceptedFromRealtime(id, t, st);
      }
    },
    [tripId, clearDriverPoll, setCurrentTrip, applyAcceptedFromRealtime, router]
  );

  useRiderTripRealtime({
    riderId,
    enabled: Boolean(searchingForDriver && tripId && canCallAuthedApi && riderId),
    watchTripId: tripId,
    onTripUpdate: handleRiderTripWs,
  });

  const cancelSearch = async () => {
    clearDriverPoll();
    trackingHandoffRef.current = false;
    if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
    setSearchCountdown(0);
    await cancelPendingTrip(tripId);
    setSearchingForDriver(false);
    setDriverFound(null);
    setTripId(null);
  };
  const veh = selectedVehicle ? availableVehicles.find(v => v.id === selectedVehicle) : null;

  const smartMinUi = fareDetails?.min_price != null ? Math.round(Number(fareDetails.min_price)) : null;
  const smartMaxUi = fareDetails?.max_price != null ? Math.round(Number(fareDetails.max_price)) : null;
  const smartBaseUi =
    fareDetails?.base_price != null
      ? Math.round(Number(fareDetails.base_price))
      : fareDetails?.total_fare != null
        ? Math.round(Number(fareDetails.total_fare))
        : null;
  /** Tap target: post-discount total clamped to server min/max (matches drivers’ “suggested” band). */
  const suggestedBidUi = useMemo(() => {
    const fd = fareDetails;
    if (!fd) return null;
    const t = fd.total_fare != null ? Math.round(Number(fd.total_fare)) : 0;
    const b = fd.base_price != null ? Math.round(Number(fd.base_price)) : 0;
    const anchor = t > 0 ? t : b;
    if (!anchor) return null;
    const lo = fd.min_price != null ? Math.max(100, Math.round(Number(fd.min_price))) : 100;
    const hi = fd.max_price != null ? Math.round(Number(fd.max_price)) : anchor;
    return Math.min(Math.max(anchor, lo), Math.max(lo, hi));
  }, [fareDetails]);
  const fareInsightChips = useMemo(() => {
    const fd = fareDetails;
    if (!fd) {
      return {
        routeLabel: null as string | null,
        surgeCompact: null as string | null,
        shortTrip: false,
        cityLabel: null as string | null,
      };
    }
    const routeLabel = formatRouteKmMin(
      fd.distance_km,
      fd.duration_min ?? fd.estimated_time_minutes,
    );
    const surgeCompact = buildCompactSurgeChipText({
      surge_multiplier: fd.surge_multiplier,
      multiplier: fd.multiplier,
      is_peak: fd.is_peak,
      peak_type: fd.peak_type ?? null,
      surge_factors: fd.surge_factors,
    });
    const shortTrip = isShortTripFare(fd.fare_bucket, fd.distance_km);
    const rawCity = fd.city != null ? String(fd.city).trim() : '';
    const cityPretty =
      rawCity.length > 0 ? rawCity.charAt(0).toUpperCase() + rawCity.slice(1).replace(/_/g, ' ') : null;
    const hideCity =
      isDistanceOnlyFare(fd) || String(rawCity).toLowerCase() === 'lagos';
    const cityLabel = cityPretty && !hideCity ? cityPretty : null;
    return { routeLabel, surgeCompact, shortTrip, cityLabel };
  }, [fareDetails]);

  const winH = flow.height;
  const searchRouteKmLabel = useMemo(() => {
    const km = fareDetails?.distance_km;
    if (km == null || !Number.isFinite(Number(km))) return null;
    return `${Number(km).toFixed(1)} km`;
  }, [fareDetails?.distance_km]);
  const searchRouteMinLabel = useMemo(() => {
    if (bookingRouteEtaMin != null && Number.isFinite(bookingRouteEtaMin)) {
      return `~${Math.round(bookingRouteEtaMin)} min trip`;
    }
    const fd = fareDetails;
    if (!fd) return null;
    const raw =
      fd.duration_min ??
      (fd as { duration_mins?: number }).duration_mins ??
      (fd as { estimated_time_minutes?: number }).estimated_time_minutes ??
      (fd as { estimated_time_mins?: number }).estimated_time_mins;
    if (raw != null && Number.isFinite(Number(raw))) return `~${Math.round(Number(raw))} min trip`;
    return null;
  }, [bookingRouteEtaMin, fareDetails]);
  const matchedDriverForOverlay = useMemo((): RiderMatchedDriver | null => {
    if (!driverFound) return null;
    const df = driverFound as Record<string, unknown>;
    const trips = df.total_trips ?? df.completed_trips;
    const face =
      typeof df.face_image === 'string' && df.face_image.length > 0
        ? df.face_image
        : null;
    const profileRaw =
      typeof df.profile_image === 'string' && df.profile_image.length > 0
        ? df.profile_image
        : typeof df.photo === 'string' && df.photo.length > 0
          ? df.photo
          : typeof (df as Record<string, unknown>).avatar_url === 'string' &&
              String((df as Record<string, unknown>).avatar_url).trim().length > 0
            ? String((df as Record<string, unknown>).avatar_url).trim()
            : null;
    const profile = profileRaw;
    const phoneRaw =
      typeof df.phone === 'string' && df.phone.length > 0
        ? df.phone
        : typeof df.phone_number === 'string' && df.phone_number.length > 0
          ? (df.phone_number as string)
          : null;
    return {
      name: String(df.name || 'Driver'),
      vehicle: typeof df.vehicle === 'string' ? df.vehicle : undefined,
      plate: typeof df.plate === 'string' ? df.plate : undefined,
      color: typeof df.color === 'string' ? df.color : undefined,
      rating:
        typeof df.rating === 'number'
          ? df.rating
          : typeof df.avg_rating === 'number'
            ? (df.avg_rating as number)
            : undefined,
      trip_count: typeof trips === 'number' && trips > 0 ? trips : undefined,
      face_image: resolvePublicMediaUri(face) ?? resolvePublicMediaUri(profile),
      profile_image: resolvePublicMediaUri(profile) ?? resolvePublicMediaUri(face),
      phone: phoneRaw,
    };
  }, [driverFound]);

  const formatScheduledTime = (iso: string) => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return 'Scheduled ride';
    return dt.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const useNativeBookingMap = Platform.OS !== 'web';

  if (bookSuspended && bookSuspendedSeconds > 0) {
    const mins = Math.floor(bookSuspendedSeconds / 60);
    const secs = bookSuspendedSeconds % 60;
    const progress = bookSuspendedSeconds / 3600; // 1 hour total
    const circumference = 2 * Math.PI * 54;
    const strokeDashoffset = circumference * (1 - progress);
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1420' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0D1420" />
        <LinearGradient colors={['#0D1420', '#1A0A0A']} style={StyleSheet.absoluteFill} />
        <SafeAreaView
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 28,
            paddingHorizontal: flow.padH,
          }}
        >
          {/* Icon */}
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 28, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)' }}>
            <Ionicons name="ban" size={40} color="#EF4444" />
          </View>

          <Text style={{ color: '#F1F5F9', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
            Booking Suspended
          </Text>
          <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 36 }}>
            You've reached 7 ride cancellations in 24 hours.{'\n'}Booking will resume automatically when the timer ends.
          </Text>

          {/* Countdown ring */}
          <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 36 }}>
            <View style={{ width: 130, height: 130, alignItems: 'center', justifyContent: 'center' }}>
              {/* Background ring */}
              <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: 'rgba(239,68,68,0.15)' }} />
              {/* Time */}
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#EF4444', fontSize: 32, fontWeight: '900', letterSpacing: -1 }}>
                  {`${mins}:${String(secs).padStart(2, '0')}`}
                </Text>
                <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '700', marginTop: 2 }}>REMAINING</Text>
              </View>
            </View>
          </View>

          {/* Warning count info */}
          <View
            style={{
              backgroundColor: 'rgba(239,68,68,0.08)',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(239,68,68,0.2)',
              padding: 16,
              width: '100%',
              maxWidth: flow.maxContentWidth,
              marginBottom: 24,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Ionicons name="information-circle" size={18} color="#EF4444" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '800', marginBottom: 4 }}>Why am I suspended?</Text>
                <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 19 }}>
                  You reached 7 cancellations in 24 hours. Cancelling affects drivers who are on their way to you — it wastes their time and fuel.
                </Text>
              </View>
            </View>
          </View>

          {/* Policy note — cancellation path is 1h booking pause only at 7/24h */}
          <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
            This pause is one hour. Other serious policy violations may be handled separately under our terms.
          </Text>

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 28, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: '#1E2D45' }}>
            <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1420" />
      {/* MAP SECTION */}
      <View
        style={s.mapArea}
      >
        {pickupCoords ? (
          !useNativeBookingMap ? (
            <MapComponent
              style={s.mapPlaceholder}
              pickup={{
                latitude: pickupCoords.lat,
                longitude: pickupCoords.lng,
                address: pickup,
              }}
              dropoff={
                destinationCoords
                  ? {
                      latitude: destinationCoords.lat,
                      longitude: destinationCoords.lng,
                      address: destination,
                    }
                  : undefined
              }
              routeCoordinates={
                routeForMapDisplay.length >= 1
                  ? routeForMapDisplay
                  : [{ latitude: pickupCoords.lat, longitude: pickupCoords.lng }]
              }
            />
          ) : (
            <BookingRideMapNative
              pickupCoords={pickupCoords}
              destinationCoords={destinationCoords}
              stopCoords={stopCoords}
              routePolyline={routeForMapDisplay}
              pickup={pickup}
              destination={destination}
              stop={stop}
              routeLoading={bookingRouteLoading}
              pulseDropoffHalo={Boolean(destinationCoords && !bookingSheetScrolled)}
              searchMode={searchingForDriver}
              matchLocked={Boolean(searchingForDriver && driverFound)}
              nearbyDrivers={nearbyDrivers}
            />
          )
        ) : (
          <View style={s.mapPlaceholder}>
            <Ionicons name="map" size={56} color={COLORS.dim} />
            <Text style={s.mapText}>Turn on location or choose pickup to see the map</Text>
          </View>
        )}

        {destinationCoords &&
        routeForMapDisplay.length >= DIRECTIONS_ROUTE_MIN_POINTS &&
        bookingRouteEtaMin != null &&
        arriveByClockLabel &&
        !searchingForDriver ? (
          <View pointerEvents="none" style={[s.routeSummaryBarOuter, { left: flow.padH, right: flow.padH }]}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 52 : 40}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
            />
            <LinearGradient
              colors={['rgba(15,23,42,0.15)', 'rgba(15,23,42,0.72)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={s.routeSummaryGradient}
            >
              <View style={s.routeSummaryRow}>
                <View style={s.routeSummaryBlock}>
                  <Text style={s.routeSummaryKicker}>Trip time</Text>
                  <Text style={s.routeSummaryHero}>{Math.round(bookingRouteEtaMin)} min</Text>
                </View>
                <View style={s.routeSummaryVsep} />
                <View style={s.routeSummaryMid}>
                  <Text style={s.routeSummaryKicker}>Arrive</Text>
                  <Text style={s.routeSummaryArrive}>{arriveByClockLabel}</Text>
                  {routeQualityLabel ? (
                    <Text style={s.routeSummaryMeta} numberOfLines={1}>
                      {routeQualityLabel}
                    </Text>
                  ) : null}
                </View>
                {routeDistanceLabel ? (
                  <>
                    <View style={s.routeSummaryVsep} />
                    <View style={s.routeSummaryBlockRight}>
                      <Text style={s.routeSummaryKicker}>Distance</Text>
                      <Text style={s.routeSummaryDist}>{routeDistanceLabel}</Text>
                    </View>
                  </>
                ) : null}
              </View>
              {stopCoords && stopTimeFeeHint ? (
                <Text style={s.routeSummaryStopTime} numberOfLines={2}>
                  {stopTimeFeeHint} included in fare
                </Text>
              ) : null}
            </LinearGradient>
          </View>
        ) : null}

        {/* Route hint — shown when pickup set, no destination yet */}
        {pickupCoords && !destinationCoords ? (
          <View style={[s.mapRouteHint, { left: flow.padH, right: flow.padH }]} pointerEvents="none">
            <Ionicons name="navigate-circle-outline" size={15} color={COLORS.lime} />
            <Text style={s.mapRouteHintText}>Scroll down to choose your destination</Text>
          </View>
        ) : null}

        {/* GPS error banner */}
        {gpsStatus === 'error' && !pickupCoords ? (
          <TouchableOpacity
            style={[s.gpsErrorBanner, { left: flow.padH, right: flow.padH }]}
            onPress={openPickupEditor}
            activeOpacity={0.85}
          >
            <Ionicons name="warning-outline" size={14} color={COLORS.yellow} />
            <Text style={s.gpsErrorText}>Location unavailable — tap to set pickup manually</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.yellow} />
          </TouchableOpacity>
        ) : null}

        {!searchingForDriver ? (
        <View style={[s.mapTopBar, { left: flow.padH, right: flow.padH }]}>
          <TouchableOpacity style={s.backBtnCircle} onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.pickupChip}
            onPress={openPickupEditor}
            accessibilityLabel="Edit pickup location"
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <View style={[s.pickupDot, { backgroundColor: COLORS.green }]} />
            <Text style={s.pickupChipLabel} numberOfLines={1}>
              {pickup?.trim() ? pickup : 'Pickup · GPS or search'}
            </Text>
            <View
              style={[
                s.gpsMini,
                gpsStatus === 'locked' && { backgroundColor: 'rgba(0,212,106,0.2)' },
                gpsStatus === 'error' && { backgroundColor: 'rgba(255,184,0,0.15)' },
              ]}
            >
              {gpsStatus === 'detecting' && <ActivityIndicator size="small" color={COLORS.blue} />}
              {gpsStatus === 'locked' && <Ionicons name="locate" size={14} color={COLORS.green} />}
              {gpsStatus === 'error' && <Ionicons name="warning" size={14} color={COLORS.yellow} />}
            </View>
          </TouchableOpacity>
        </View>
        ) : null}

        {pickupCoords && destinationCoords && !searchingForDriver ? (
          <View style={[s.mapBidRouteCard, { left: flow.padH, right: flow.padH }]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(11,18,32,0.97)', 'rgba(11,18,32,0.9)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.mapBidRouteInner, { paddingHorizontal: flow.cardPad }]}
            >
              <View style={s.mapBidRow}>
                <View style={[s.mapBidDot, { backgroundColor: COLORS.green }]} />
                <Text style={s.mapBidTxt} numberOfLines={1}>
                  {pickup?.trim() || 'Pickup'}
                </Text>
              </View>
              {stopCoords ? (
                <>
                  <View style={s.mapBidLine} />
                  <View style={s.mapBidRow}>
                    <View style={[s.mapBidDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={s.mapBidTxt} numberOfLines={1}>
                      {stop?.trim() || 'Stop'}
                    </Text>
                  </View>
                </>
              ) : null}
              <View style={s.mapBidLine} />
              <View style={s.mapBidRow}>
                <View style={[s.mapBidDot, { backgroundColor: '#F87171' }]} />
                <Text style={s.mapBidTxt} numberOfLines={1}>
                  {destination?.trim() || 'Destination'}
                </Text>
              </View>
            </LinearGradient>
          </View>
        ) : null}

        {/* Preferred driver banner */}
        {requestedDriverId && !searchingForDriver ? (
          <View style={[s.preferredBanner, { left: flow.padH, right: flow.padH, bottom: flow.sectionGap }]}>
            <Ionicons name="heart" size={16} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={s.preferredText}>
                Priority match: {requestedDriverName || 'this driver'}
              </Text>
              <Text style={s.preferredSub}>
                About 5% off the trip fare when they accept — only if they are saved in My Favourite Drivers.
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.setParams({ requestedDriverId: '', driverName: '' })}>
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </View>
        ) : null}

      </View>

      {/* BOTTOM SHEET */}
      <Animated.View
        style={[
          s.sheet,
          searchingForDriver && s.sheetHidden,
          { transform: [{ translateY: sheetSlide }] },
        ]}
        pointerEvents={searchingForDriver ? 'none' : 'auto'}
      >
        <ScrollView
          contentContainerStyle={[
            s.sheetContent,
            {
              paddingHorizontal: flow.padH,
              paddingTop: Math.round(flow.sectionGap * 0.4),
              paddingBottom: Math.max(insets.bottom + 16, 56),
              gap: Math.round(flow.sectionGap * 0.42),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onScroll={onBookingSheetScroll}
          scrollEventThrottle={16}
        >
          <View style={s.sheetHandle} accessibilityRole="none" />

          {BOOKING_PROMO_ENABLED && bookingPromoVisible ? (
            <View style={s.bookFlowPromoBanner}>
              <View style={s.bookFlowPromoIconWrap}>
                <Ionicons name="pricetag" size={18} color={COLORS.blue} />
              </View>
              <View style={s.bookFlowPromoTextCol}>
                <Text style={s.bookFlowPromoTitle}>Ride on your schedule</Text>
                <Text style={s.bookFlowPromoBody}>
                  Book ahead and lock your route when it suits you.
                </Text>
                <View style={s.bookFlowPromoActions}>
                  <TouchableOpacity
                    style={s.bookFlowPromoCta}
                    onPress={openScheduleRide}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel="Open schedule from promo"
                  >
                    <Text style={s.bookFlowPromoCtaText}>Schedule</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.bg} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                onPress={dismissBookingPromo}
                style={s.bookFlowPromoClose}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityLabel="Dismiss promo"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={s.bookFlowHeroTitle}>Go wherever, whenever.</Text>
          <Text style={s.bookFlowHeroSub}>Pickup follows your map. Set where you are headed below.</Text>

          <View style={s.bookFlowServiceRow}>
            <TouchableOpacity
              style={s.bookFlowServiceCard}
              onPress={openDestinationSearch}
              activeOpacity={0.88}
              accessibilityLabel="Find a ride"
              accessibilityRole="button"
            >
              <View style={[s.bookFlowServiceIconBg, { backgroundColor: 'rgba(0,212,106,0.14)' }]}>
                <Ionicons name="car-sport" size={26} color={COLORS.green} />
              </View>
              <Text style={s.bookFlowServiceTitle}>Rides</Text>
              <Text style={s.bookFlowServiceSub}>{`Let's go`}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.bookFlowServiceCard}
              onPress={openScheduleRide}
              activeOpacity={0.88}
              accessibilityLabel="Schedule a ride"
              accessibilityRole="button"
            >
              <View style={[s.bookFlowServiceIconBg, { backgroundColor: 'rgba(14,165,233,0.18)' }]}>
                <Ionicons name="calendar" size={24} color={COLORS.blue} />
              </View>
              <Text style={s.bookFlowServiceTitle}>Schedule</Text>
              <Text style={s.bookFlowServiceSub}>Book ahead</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.bookFlowServiceCard}
              onPress={() => router.push('/rider/family')}
              activeOpacity={0.88}
              accessibilityLabel="Family and favorites"
              accessibilityRole="button"
            >
              <View style={[s.bookFlowServiceIconBg, { backgroundColor: 'rgba(147,51,234,0.2)' }]}>
                <Ionicons name="people" size={24} color={COLORS.purple} />
              </View>
              <Text style={s.bookFlowServiceTitle}>Family</Text>
              <Text style={s.bookFlowServiceSub}>People you trust</Text>
            </TouchableOpacity>
          </View>

          <View style={s.bookFlowWhereShell}>
            <TouchableOpacity
              style={s.bookFlowWhereMain}
              onPress={openDestinationSearch}
              activeOpacity={0.88}
              accessibilityLabel={destination?.trim() ? 'Edit destination' : 'Where to'}
              accessibilityRole="button"
            >
              <Ionicons name="search" size={22} color={COLORS.dim} />
              <Text
                style={[s.bookFlowWhereQuestion, !!destination?.trim() && s.bookFlowWhereFilled]}
                numberOfLines={1}
              >
                {destination?.trim() ? destination : 'Where to?'}
              </Text>
            </TouchableOpacity>
            <View style={s.bookFlowWhereDivider} />
            <TouchableOpacity
              style={s.bookFlowLaterWrap}
              onPress={openScheduleRide}
              activeOpacity={0.88}
              accessibilityLabel="Schedule for later"
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={20} color={COLORS.bg} />
              <Text style={s.bookFlowLaterLabel}>Later</Text>
            </TouchableOpacity>
          </View>

          {destination?.trim() ? (
            stopCoords ? (
              <View style={s.bookFlowStopRow}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  onPress={openStopSearch}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Edit stop"
                >
                  <View style={s.bookFlowStopDot} />
                  <Text style={s.bookFlowStopText} numberOfLines={1}>
                    {stop?.trim() || 'Stop'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={clearStop}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Remove stop"
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle" size={20} color={COLORS.dim} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={s.bookFlowAddStopBtn}
                onPress={openStopSearch}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Add stop"
              >
                <Ionicons name="add-circle-outline" size={18} color={COLORS.blue} />
                <Text style={s.bookFlowAddStopText}>Add stop</Text>
              </TouchableOpacity>
            )
          ) : null}

          <View style={s.bookFlowRecentBlock}>
            <Text style={s.bookFlowRecentHeading}>Recent</Text>
            {recentDestinations.length > 0 ? (
              recentDestinations.slice(0, 5).map((item, idx) => {
                const title = String(item.address || item.description || '').trim();
                if (!title) return null;
                return (
                  <TouchableOpacity
                    key={`recent-${idx}-${title.slice(0, 24)}`}
                    style={s.bookFlowRecentRow}
                    onPress={() => applyRecentDestination(item)}
                    activeOpacity={0.88}
                  >
                    <View style={s.bookFlowRecentIcon}>
                      <Ionicons name="time-outline" size={18} color={COLORS.dim} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bookFlowRecentTitle} numberOfLines={1}>{title}</Text>
                      <Text style={s.bookFlowRecentMeta}>
                        {Number.isFinite(item.lat) && Number.isFinite(item.lng) ? 'Saved pin' : 'Recent place'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.dim} />
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={s.recentEmptyRow}>
                <Ionicons name="location-outline" size={18} color={COLORS.dim} />
                <Text style={s.recentEmptyText}>Your recent destinations will appear here</Text>
              </View>
            )}
          </View>

          {scheduledRides.length > 0 && (
            <View style={s.scheduledCard}>
              <View style={s.scheduledHeader}>
                <Text style={s.scheduledTitle}>Scheduled rides active</Text>
                <TouchableOpacity onPress={() => router.push('/rider/schedule')}>
                  <Text style={s.scheduledLink}>Manage</Text>
                </TouchableOpacity>
              </View>
              {scheduledRides.map((ride) => (
                <View key={ride.id} style={s.scheduledRow}>
                  <Ionicons name="calendar-outline" size={15} color={COLORS.blue} />
                  <Text style={s.scheduledText} numberOfLines={1}>
                    {formatScheduledTime(ride.scheduled_time)}{' '}
                    - {(ride.pickup_address || 'Pickup').slice(0, 24)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {pickupCoords && destinationCoords && (routeSafetyLoading || routeSafety !== null || routeSafetyFailed) ? (
            <View
              style={[
                s.routeSafetyCard,
                routeSafety?.route_risk_level === 'high' && s.routeSafetyCardHigh,
              ]}
            >
              <View style={s.routeSafetyHeader}>
                <Ionicons
                  name="shield-half-outline"
                  size={20}
                  color={routeSafety?.route_risk_level === 'high' ? COLORS.red : COLORS.yellow}
                />
                <Text style={s.routeSafetyTitle}>
                  {routeSafety ? `Route safety · ${routeSafety.city}` : 'Route safety'}
                </Text>
              </View>
              {routeSafetyLoading && !routeSafety ? (
                <Text style={s.routeSafetySub}>Checking corridor against known risk anchors…</Text>
              ) : routeSafety ? (
                <>
                  {routeSafety.route_risk_level === 'high' ? (
                    <View style={s.routeSafetyWarnBanner}>
                      <Ionicons name="warning" size={18} color="#0D1420" />
                      <Text style={s.routeSafetyWarnText}>
                        Higher-risk corridor — travel alert: share trip, stay on main roads, avoid stops after dark.
                      </Text>
                    </View>
                  ) : null}
                  <Text style={s.routeSafetyRisk}>
                    Corridor risk:{' '}
                    <Text
                      style={{
                        fontWeight: '900',
                        color:
                          routeSafety.route_risk_level === 'high'
                            ? COLORS.red
                            : routeSafety.route_risk_level === 'moderate'
                              ? COLORS.yellow
                              : COLORS.green,
                      }}
                    >
                      {routeSafety.route_risk_level.toUpperCase()}
                    </Text>
                  </Text>
                  {routeSafety.risk_zones_on_route?.length ? (
                    <>
                      <Text style={s.routeSafetySub}>Anchors near this pickup–drop corridor:</Text>
                      {routeSafety.risk_zones_on_route.slice(0, 5).map((z) => (
                        <Text key={z.area} style={s.routeSafetyBullet}>
                          • {z.area} ({z.risk})
                        </Text>
                      ))}
                    </>
                  ) : (
                    <Text style={s.routeSafetySub}>No mapped high-risk anchors in this corridor box.</Text>
                  )}
                  {routeSafety.safety_tips?.length ? (
                    <Text style={s.routeSafetyTips} numberOfLines={4}>
                      {routeSafety.safety_tips.join(' · ')}
                    </Text>
                  ) : null}
                </>
              ) : routeSafetyFailed ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="cloud-offline-outline" size={14} color={COLORS.dim} />
                  <Text style={s.routeSafetySub}>Could not check route safety — no network</Text>
                </View>
              ) : (
                <Text style={s.routeSafetySub}>Checking route…</Text>
              )}
            </View>
          ) : null}

          {/* ── First-ride 20% discount banner ── */}
          {isFirstRider && (
            <View style={s.firstRideBanner}>
              <View style={s.firstRideBannerIcon}>
                <Ionicons name="gift-outline" size={18} color="#00D46A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.firstRideBannerTitle}>Your first ride — 20% off! 🎉</Text>
                <Text style={s.firstRideBannerSub}>Discount applied automatically at checkout. No code needed.</Text>
              </View>
            </View>
          )}

          {/* ── Inline Ride Categories (all visible, no modal required) ── */}
          <View style={s.inlineCatSection}>
            <Text style={s.inlineCatTitle}>Choose your ride</Text>
            {availableVehicles.map((v) => {
              const price = fareMatrix[v.id];
              const listOrig = fareMatrixOriginal[v.id];
              const isSelected = selectedVehicle === v.id;
              const loadingPrice = !!(pickup && destination && !price && isLoading);
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[s.inlineCatRow, isSelected && s.inlineCatRowActive, isSelected && { borderColor: v.color }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedVehicle(v.id);
                    if (price && price > 0) {
                      setCurrentFare(price);
                    }
                    // Always re-fetch from backend when selecting a ride type so
                    // price cards cannot stay stale after server-side fare updates.
                    if (pickup && destination) {
                      setCurrentFare(0);
                      setFareDetails(null);
                      handleCalculateFare(v.id);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[s.inlineCatIcon, { backgroundColor: v.color + (isSelected ? '28' : '18') }]}>
                    <Ionicons name={v.icon as any} size={26} color={isSelected ? v.color : COLORS.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.inlineCatName, isSelected && { color: v.color }]}>{v.name}</Text>
                    <Text style={s.inlineCatMeta}>{v.time} · {v.desc}</Text>
                  </View>
                  <View style={s.inlineCatPriceCol}>
                    {loadingPrice ? (
                      <ActivityIndicator size="small" color={v.color} />
                    ) : price > 0 ? (
                      <>
                        <Text style={[s.inlineCatPrice, isSelected && { color: v.color }]}>
                          ₦{price.toLocaleString()}
                        </Text>
                        {listOrig != null && listOrig > price ? (
                          <Text style={s.inlineCatOrigPrice}>₦{listOrig.toLocaleString()}</Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={s.inlineCatPriceMuted}>
                        {pickup && destination ? '—' : 'Enter route'}
                      </Text>
                    )}
                  </View>
                  {isFirstRider && price > 0 && listOrig != null && listOrig > price ? (
                    <View style={s.firstRideBadge}>
                      <Text style={s.firstRideBadgeText}>-20%</Text>
                    </View>
                  ) : isSelected ? (
                    <View style={[s.inlineCatCheck, { backgroundColor: v.color }]}>
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Fare / Calculate */}
          {currentFare > 0 ? (
            <View style={s.fareSection}>
              {optimizedRoute ? (
                <View style={s.aiRouteCard}>
                  <View style={s.aiRouteHeader}>
                    <Ionicons name="navigate-circle" size={20} color={COLORS.blue} />
                    <Text style={s.aiRouteTitle}>AI Route Optimisation</Text>
                  </View>
                  <Text style={s.aiRouteText}>
                    Fastest route selected for current Lagos/Nigerian traffic conditions:{' '}
                    {TrafficAI.formatDelay(Number(optimizedRoute.trafficDelay))}
                    {optimizedRoute.timeSavedVsAlternative
                      ? ` saved versus a slower alternative.`
                      : '.'}
                  </Text>
                  <Text style={s.aiRouteMeta}>
                    Traffic level:{' '}
                    {String(optimizedRoute.trafficLevel || 'light').toUpperCase()} • AI score{' '}
                    {Number.isFinite(Number(optimizedRoute.aiScore)) ? Math.round(Number(optimizedRoute.aiScore)) : 0}/100
                  </Text>
                </View>
              ) : null}
              {(smartBaseUi != null && smartBaseUi > 0) || (suggestedBidUi != null && suggestedBidUi > 0) ? (
                <View style={{ marginBottom: 10, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="cash-outline" size={13} color="#22d3ee" />
                      <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '700' }}>
                        ₦{(smartMinUi ?? smartBaseUi ?? 0).toLocaleString()} – ₦{(smartMaxUi ?? Math.round((smartBaseUi ?? 0) * 1.3)).toLocaleString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        if (suggestedBidUi != null && suggestedBidUi > 0) {
                          Haptics.selectionAsync();
                          setCurrentFare(suggestedBidUi);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Apply suggested fare"
                      disabled={!suggestedBidUi}
                      style={{ backgroundColor: '#0f2d18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Ionicons name="star" size={12} color="#fbbf24" />
                      <Text style={{ color: '#86efac', fontSize: 12, fontWeight: '700' }}>
                        Suggested ₦{(suggestedBidUi ?? smartBaseUi ?? 0).toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                    {fareDetails?.first_ride_discount_applied && (
                      <View style={{ backgroundColor: 'rgba(0,212,106,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(0,212,106,0.35)' }}>
                        <Ionicons name="gift-outline" size={12} color="#00D46A" />
                        <Text style={{ color: '#00D46A', fontSize: 11, fontWeight: '800' }}>First ride −20%</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    {fareInsightChips.routeLabel ? (
                      <View style={{ backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="navigate-outline" size={12} color="#94a3b8" />
                        <Text style={{ color: '#cbd5e1', fontSize: 11, fontWeight: '700' }}>{fareInsightChips.routeLabel}</Text>
                      </View>
                    ) : null}
                    {fareInsightChips.cityLabel ? (
                      <View style={{ backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="location-outline" size={12} color="#94a3b8" />
                        <Text style={{ color: '#cbd5e1', fontSize: 11, fontWeight: '700' }}>{fareInsightChips.cityLabel}</Text>
                      </View>
                    ) : null}
                    {fareInsightChips.surgeCompact ? (
                      <View style={{ backgroundColor: 'rgba(245,158,11,0.14)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' }}>
                        <Ionicons name="flash" size={12} color="#f59e0b" />
                        <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '800' }}>{fareInsightChips.surgeCompact}</Text>
                      </View>
                    ) : null}
                    {fareInsightChips.shortTrip ? (
                      <View style={{ backgroundColor: 'rgba(14,165,233,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(14,165,233,0.35)' }}>
                        <Ionicons name="map-outline" size={12} color={COLORS.blue} />
                        <Text style={{ color: COLORS.blue, fontSize: 11, fontWeight: '800' }}>
                          {`Short trip · under ${fareDetails?.short_trip_threshold_km ?? 5} km`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 6 }}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        handleCalculateFare();
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      accessibilityLabel="Refresh fare estimate"
                      accessibilityRole="button"
                    >
                      <Ionicons name="refresh" size={15} color={COLORS.blue} />
                      <Text style={{ color: COLORS.blue, fontSize: 12, fontWeight: '700' }}>Refresh estimate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setFareExplainModal('surge')} accessibilityLabel="About surge pricing" accessibilityRole="button">
                      <Ionicons name="information-circle-outline" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                    {fareDetails?.competitive_positioning_summary ||
                    (fareDetails?.competitive_positioning_bullets?.length ?? 0) > 0 ? (
                      <TouchableOpacity
                        onPress={() => setFareExplainModal('positioning')}
                        accessibilityLabel="Why Nexryde pricing"
                        accessibilityRole="button"
                      >
                        <Ionicons name="rocket-outline" size={20} color="#a78bfa" />
                      </TouchableOpacity>
                    ) : null}
                    {!isDistanceOnlyFare(fareDetails) ? (
                      <TouchableOpacity onPress={() => setFareExplainModal('short')} accessibilityLabel="About short trip rates" accessibilityRole="button">
                        <Ionicons name="map-outline" size={20} color="#94a3b8" />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity onPress={() => setFareExplainModal('breakdown')} accessibilityLabel="Fare breakdown" accessibilityRole="button">
                      <Ionicons name="list-outline" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              <Animated.View style={[s.fareRow, { opacity: fareReveal }]}>
                <TouchableOpacity
                  style={s.fareBtn}
                  onPress={() =>
                    setCurrentFare((prev) =>
                      Math.max(smartMinUi ?? 100, Math.max(100, prev - 100)),
                    )
                  }
                  accessibilityLabel="Decrease fare"
                  accessibilityRole="button"
                >
                  <Text style={s.fareBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.fareAmount}>₦{currentFare.toLocaleString()}</Text>
                <TouchableOpacity
                  style={s.fareBtn}
                  onPress={() =>
                    setCurrentFare((prev) =>
                      smartMaxUi != null ? Math.min(smartMaxUi, prev + 100) : prev + 100,
                    )
                  }
                  accessibilityLabel="Increase fare"
                  accessibilityRole="button"
                >
                  <Text style={s.fareBtnText}>+</Text>
                </TouchableOpacity>
              </Animated.View>
              <View>
                <Text style={s.paySectionLabel}>Pay with</Text>
                <View style={s.payRow}>
                  <TouchableOpacity
                    style={[s.payChip, ridePaymentMethod === 'cash' && s.payChipOn]}
                    onPress={() => setRidePaymentMethod('cash')}
                    accessibilityLabel="Pay with cash"
                    accessibilityRole="button"
                  >
                    <Ionicons name="cash" size={20} color={ridePaymentMethod === 'cash' ? COLORS.green : COLORS.dim} />
                    <Text style={[s.payChipText, ridePaymentMethod === 'cash' && s.payChipTextOn]}>Cash</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.payChip, ridePaymentMethod === 'wallet' && s.payChipOn]}
                    onPress={() => setRidePaymentMethod('wallet')}
                    accessibilityLabel="Pay with wallet"
                    accessibilityRole="button"
                  >
                    <Ionicons name="wallet" size={20} color={ridePaymentMethod === 'wallet' ? COLORS.green : COLORS.dim} />
                    <Text style={[s.payChipText, ridePaymentMethod === 'wallet' && s.payChipTextOn]}>Wallet</Text>
                  </TouchableOpacity>
                </View>
                {ridePaymentMethod === 'wallet' && walletBalance != null && currentFare > 0 && walletBalance < currentFare ? (
                  <View style={s.walletWarnRow}>
                    <Ionicons name="warning-outline" size={14} color={COLORS.yellow} />
                    <Text style={s.walletWarnText}>
                      Insufficient balance (₦{walletBalance.toLocaleString()}) — top up or pay cash
                    </Text>
                  </View>
                ) : (
                  <Text style={s.payHint}>
                    {ridePaymentMethod === 'wallet'
                      ? walletBalance != null
                        ? `Balance ₦${walletBalance.toLocaleString()} · charged after trip`
                        : 'Loading balance…'
                      : 'Pay the driver in person'}
                  </Text>
                )}
              </View>
              <View>
                <Text style={s.paySectionLabel}>Ride mood</Text>
                <Text style={s.preferenceHint}>Tell the driver how you want the ride to feel.</Text>
                <View style={s.preferenceRow}>
                  {RIDE_PREFERENCE_OPTIONS.map((option) => {
                    const active = ridePreferences.includes(option.id);
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[s.preferenceChip, active && s.preferenceChipOn]}
                        onPress={() => toggleRidePreference(option.id)}
                        accessibilityRole="button"
                        accessibilityLabel={option.label}
                      >
                        <Ionicons
                          name={option.icon}
                          size={16}
                          color={active ? COLORS.green : COLORS.muted}
                        />
                        <Text style={[s.preferenceChipText, active && s.preferenceChipTextOn]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/rider/mood-preferences')}
                  style={{ marginTop: 8, alignSelf: 'flex-end' }}
                >
                  <Text style={{ color: COLORS.accentBlue, fontSize: 12, fontWeight: '700' }}>
                    Manage preferences →
                  </Text>
                </TouchableOpacity>
              </View>
              {/* ── Estate Gate Code ─────────────────────────────────── */}
              <View>
                <View style={s.gateSectionHeader}>
                  <View style={s.gateSectionLeft}>
                    <View style={s.gateIconBadge}>
                      <Ionicons name="key" size={14} color="#F59E0B" />
                    </View>
                    <View>
                      <Text style={s.paySectionLabel}>Estate Gate Code</Text>
                      <Text style={s.preferenceHint}>Shared with driver automatically on arrival.</Text>
                    </View>
                  </View>
                  {gateCodeSaved && (
                    <Switch
                      value={includeGateCode}
                      onValueChange={setIncludeGateCode}
                      trackColor={{ false: COLORS.dim, true: '#065F46' }}
                      thumbColor={includeGateCode ? '#22C55E' : '#94A3B8'}
                    />
                  )}
                </View>

                {/* Saved + collapsed state */}
                {gateCodeSaved && !editingGateCode ? (
                  <View style={[s.gateSavedCard, !includeGateCode && s.gateSavedCardOff]}>
                    <View style={s.gateSavedRow}>
                      <Ionicons
                        name={includeGateCode ? 'shield-checkmark' : 'shield-outline'}
                        size={20}
                        color={includeGateCode ? '#22C55E' : COLORS.dim}
                      />
                      <View style={{ flex: 1 }}>
                        {estateName ? (
                          <Text style={s.gateSavedEstate} numberOfLines={1}>{estateName}</Text>
                        ) : null}
                        <Text style={[s.gateSavedCode, !includeGateCode && { color: COLORS.dim }]}>
                          {estateGateCode.replace(/./g, '●')}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={() => setEditingGateCode(true)} style={s.gateEditBtn}>
                          <Ionicons name="create-outline" size={14} color={COLORS.muted} />
                          <Text style={s.gateEditBtnText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleClearGateCode} style={s.gateEditBtn}>
                          <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {includeGateCode && (
                      <View style={s.gateActivePill}>
                        <View style={s.gateActiveDot} />
                        <Text style={s.gateActivePillText}>Active for this ride · shared on arrival</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  /* Input form (new or editing) */
                  <View style={s.gateCard}>
                    <View style={s.gateInputWrapper}>
                      <Ionicons name="home-outline" size={16} color={COLORS.muted} style={s.gateInputIcon} />
                      <TextInput
                        value={estateName}
                        onChangeText={setEstateName}
                        placeholder="Estate or apartment name (optional)"
                        placeholderTextColor={COLORS.dim}
                        style={s.gateInputField}
                      />
                    </View>
                    <View style={s.gateInputWrapper}>
                      <Ionicons name="key-outline" size={16} color="#F59E0B" style={s.gateInputIcon} />
                      <TextInput
                        value={estateGateCode}
                        onChangeText={setEstateGateCode}
                        placeholder="Gate code  e.g. 1234 or A#7"
                        placeholderTextColor={COLORS.dim}
                        style={[s.gateInputField, { letterSpacing: 2 }]}
                        autoCapitalize="characters"
                        returnKeyType="done"
                        onSubmitEditing={handleSaveGateCode}
                      />
                    </View>
                    <LinearGradient
                      colors={['#065F46', '#047857']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={s.gateSaveBtnGrad}
                    >
                      <TouchableOpacity
                        style={s.gateSaveBtn}
                        onPress={handleSaveGateCode}
                        disabled={savingGateCode}
                        accessibilityRole="button"
                        accessibilityLabel="Save gate code"
                      >
                        {savingGateCode ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                            <Text style={s.gateSaveBtnText}>Save Gate Code</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </LinearGradient>
                    {editingGateCode && (
                      <TouchableOpacity onPress={() => setEditingGateCode(false)} style={s.gateCancelBtn}>
                        <Text style={s.gateCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
              {/* Nearby driver count hint */}
              {nearbyDrivers.length > 0 && !isLoading && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green }} />
                  <Text style={{ color: '#86EFAC', fontSize: 12, fontWeight: '700' }}>
                    {nearbyDrivers.length} driver{nearbyDrivers.length !== 1 ? 's' : ''} nearby — quick pickup likely
                  </Text>
                </View>
              )}
              <TouchableOpacity style={[s.findBtn, isLoading && { opacity: 0.7 }]} onPress={findOffers} disabled={isLoading} accessibilityLabel="Find ride offers" accessibilityRole="button">
                <LinearGradient
                  colors={isLoading ? ['#64748b', '#475569'] : [...RIDER_PRIMARY_CTA_GRADIENT]}
                  style={[s.btnGrad, { paddingVertical: 18 }]}
                >
                  {isLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[s.findBtnText, { color: '#fff', fontSize: 16 }]}>Finding drivers...</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="car-sport" size={22} color="#FFF" />
                      <Text style={[s.findBtnText, { color: '#FFF', fontSize: 17, fontWeight: '900' }]}>Request Ride — ₦{currentFare.toLocaleString()}</Text>
                    </View>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={s.calcBtn}
              onPress={() => handleCalculateFare()}
              disabled={isLoading || !pickup || !destination}
              accessibilityLabel="Calculate fare"
              accessibilityRole="button"
            >
              <LinearGradient
                colors={pickup && destination && selectedVehicle ? [...RIDER_PRIMARY_CTA_GRADIENT] : ['#334155', '#475569']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.calcBtnGrad, { paddingVertical: 18 }]}
              >
                {isLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color={COLORS.white} />
                    <Text style={[s.calcBtnText, { color: '#FFF' }]}>Calculating...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name={selectedVehicle ? 'calculator' : 'car-outline'} size={20} color="#FFF" />
                    <Text style={[s.calcBtnText, { color: '#FFF', fontSize: 16 }]}>
                      {selectedVehicle ? 'Get Fare Estimate' : 'Select Vehicle First'}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </Animated.View>

      <Modal
        visible={fareExplainModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setFareExplainModal(null)}
      >
        <TouchableWithoutFeedback onPress={() => setFareExplainModal(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: COLORS.card, borderRadius: 16, padding: 18, maxHeight: '75%' }}>
                <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '800', marginBottom: 10 }}>
                  {fareExplainModal === 'surge' && 'Surge pricing'}
                  {fareExplainModal === 'short' && 'Short trips'}
                  {fareExplainModal === 'breakdown' && 'Fare breakdown'}
                  {fareExplainModal === 'positioning' && 'Why Nexryde'}
                </Text>
                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                  {fareExplainModal === 'surge' ? (
                    <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: 22 }}>
                      {(fareDetails?.surge_details as { rider_message?: string } | undefined)?.rider_message ||
                        'Surge uses the highest active factor: normal pricing (1×), high demand near you (up to 1.3× when the area ratio crosses the threshold), rain (1.4× when flagged), or morning/evening peak windows in WAT (1.5×). Your ride type caps the final multiplier.'}
                      {'\n\n'}
                      Demand ratio (this estimate):{' '}
                      {fareDetails?.demand_ratio != null ? Number(fareDetails.demand_ratio).toFixed(2) : '—'} (
                      {fareDetails?.demand_ratio_source || '—'}
                      ).
                      {fareDetails?.rain_applied ? `\n\nRain / weather factor: ${fareDetails.rain_multiplier ?? '—'}× applied.` : '\n\nNo rain surcharge on this estimate.'}
                    </Text>
                  ) : null}
                  {fareExplainModal === 'positioning' ? (
                    <View style={{ gap: 12 }}>
                      {fareDetails?.competitive_positioning_summary ? (
                        <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: 22 }}>
                          {fareDetails.competitive_positioning_summary}
                        </Text>
                      ) : null}
                      {(fareDetails?.competitive_positioning_bullets ?? []).map((line, i) => (
                        <Text
                          key={`cp-${i}-${line.slice(0, 32)}`}
                          style={{ color: COLORS.muted, fontSize: 14, lineHeight: 22 }}
                        >
                          {'\u2022 '}
                          {line}
                        </Text>
                      ))}
                      <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 20, fontStyle: 'italic' }}>
                        Surge on estimates follows the same max-of-active-factors rule as above (capped for your
                        service tier).
                      </Text>
                      {fareDetails?.driver_payout_policy_note ? (
                        <Text style={{ color: '#64748b', fontSize: 13, lineHeight: 20 }}>
                          {fareDetails.driver_payout_policy_note}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {fareExplainModal === 'short' ? (
                    <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: 22 }}>
                      {isDistanceOnlyFare(fareDetails)
                        ? 'In Lagos, your estimate uses the driving distance on the route. Vehicle tier adjusts the rate, and demand, peak windows, or rain can apply a surge multiplier. Open the fare breakdown for the line-item view.'
                        : `Trips under about ${fareDetails?.short_trip_threshold_km ?? 5} km use the short-trip rate card (base, per km, and per minute). Booking fee, minimum fare, surge cap, and cancellation fee still follow your city and service tier.`}
                    </Text>
                  ) : null}
                  {fareExplainModal === 'breakdown' ? (
                    <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: 22 }}>
                      {fareDetails?.lagride_profile?.rider_value_summary
                        ? `${String(fareDetails.lagride_profile.rider_value_summary)}\n\n`
                        : ''}
                      {fareDetails?.price_breakdown
                        ? `${humanizeFareBreakdownLine(String(fareDetails.price_breakdown))}\n\n`
                        : ''}
                      {fareDetails
                        ? isDistanceOnlyFare(fareDetails)
                          ? `Lagos route fare · Distance line ₦${Number(fareDetails.distance_fee ?? 0).toLocaleString()} (area and vehicle tier before surge) · Surge ${fareDetails.surge_multiplier ?? 1}×\nTotal ₦${Number(fareDetails.total_fare ?? 0).toLocaleString()}`
                          : stopTimeFeeLabel(fareDetails)
                            ? `Route fare · Base ₦${Number(fareDetails.base_fare ?? 0).toLocaleString()} · Distance ₦${Number(fareDetails.distance_fee ?? 0).toLocaleString()} · ${stopTimeFeeLabel(fareDetails)} · Surge ${fareDetails.surge_multiplier ?? 1}×\nTotal ₦${Number(fareDetails.total_fare ?? 0).toLocaleString()}`
                            : `Base ₦${Number(fareDetails.base_fare ?? 0).toLocaleString()} · Distance ₦${Number(fareDetails.distance_fee ?? 0).toLocaleString()} · Time ₦${Number(fareDetails.time_fee ?? 0).toLocaleString()} · Traffic ₦${Number(fareDetails.traffic_fee ?? 0).toLocaleString()} · Booking ₦${Number(fareDetails.booking_fee ?? 0).toLocaleString()}\nSubtotal ₦${Number(fareDetails.subtotal ?? 0).toLocaleString()} · Surge ${fareDetails.surge_multiplier ?? 1}×\nTotal ₦${Number(fareDetails.total_fare ?? 0).toLocaleString()}`
                        : 'Get a fare estimate to see the breakdown.'}
                    </Text>
                  ) : null}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => setFareExplainModal(null)}
                  style={{ marginTop: 14, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text style={{ color: COLORS.green, fontWeight: '800' }}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* LOCATION MODAL */}
      <Modal visible={showLocationModal} animationType="slide" onRequestClose={() => setShowLocationModal(false)}>
        <SafeAreaView style={s.modalContainer} edges={['top', 'bottom']}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>
              {editingField === 'pickup'
                ? 'Pickup'
                : editingField === 'stop'
                  ? 'Add stop'
                  : 'Where to?'}
            </Text>
            <View style={{ width: 28 }} />
          </View>
          <KeyboardAvoidingView
            style={s.modalKb}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
          >
            <View style={s.modalBody}>
            <LocationAutocomplete
              placeholder={
                editingField === 'pickup'
                  ? 'Search pickup…'
                  : editingField === 'stop'
                    ? 'Search stop…'
                    : 'Search destination…'
              }
              value={
                editingField === 'pickup'
                  ? pickup
                  : editingField === 'stop'
                    ? stop
                    : destination
              }
              onChangeText={(text) => {
                if (editingField === 'pickup') setPickup(text);
                else if (editingField === 'stop') setStop(text);
                else setDestination(text);
              }}
              onPlaceSelected={async (loc) => {
                try {
                  const field = editingField;
                  const rawDesc = typeof loc?.description === 'string' ? loc.description : '';
                  let desc = String(rawDesc || '').trim() || 'Selected location';
                  let coords: { lat: number; lng: number } | null = null;

                  const placeId = typeof loc?.placeId === 'string' ? loc.placeId.trim() : '';
                  const syntheticPlaceId = !placeId || placeId.startsWith('prediction-');

                  if (placeId && !syntheticPlaceId) {
                    const details = await fetchPlaceDetails(placeId, loc.sessionToken);
                    if (details && Number.isFinite(details.lat) && Number.isFinite(details.lng)) {
                      coords = { lat: details.lat, lng: details.lng };
                      if (details.description) desc = details.description;
                    }
                  }

                  if (!coords && desc.length >= 3) {
                    const resolved = await resolveAddressToCoords(desc);
                    if (resolved && Number.isFinite(resolved.lat) && Number.isFinite(resolved.lng)) {
                      coords = { lat: resolved.lat, lng: resolved.lng };
                      desc = String(resolved.address || desc).trim() || desc;
                    }
                  }

                  if (field === 'pickup') {
                    setPickup(desc);
                    if (coords) {
                      setPickupCoords(coords);
                    } else {
                      Alert.alert(
                        'Could not pin pickup',
                        'Pick a suggestion from the list or type a fuller address so we can show the map at your pickup.',
                      );
                      return;
                    }
                  } else if (field === 'stop') {
                    setStop(desc);
                    if (coords) {
                      setStopCoords(coords);
                      invalidateRoutePricing();
                    } else {
                      Alert.alert(
                        'Could not pin stop',
                        'Pick a suggestion from the list or type a fuller address for your stop.',
                      );
                      return;
                    }
                  } else {
                    setDestination(desc);
                    if (coords) {
                      setDestinationCoords(coords);
                      void cacheRecentLocation({
                        address: desc,
                        description: desc,
                        lat: coords.lat,
                        lng: coords.lng,
                      });
                      setRecentDestinations((prev) => {
                        const next = [
                          { address: desc, lat: coords.lat, lng: coords.lng },
                          ...prev.filter(
                            (p) =>
                              String(p.address || p.description) !== desc,
                          ),
                        ];
                        return next.slice(0, 8);
                      });
                    } else {
                      Alert.alert(
                        'Could not pin destination',
                        'Pick a suggestion from the list or type a fuller street address so we can place it on the map.',
                      );
                      return;
                    }
                  }
                  setShowLocationModal(false);
                } catch {
                  Alert.alert('Location', 'Could not load that place. Try another suggestion or type the address again.');
                }
              }}
              biasLat={pickupCoords?.lat ?? currentLocation?.lat}
              biasLng={pickupCoords?.lng ?? currentLocation?.lng}
              biasRadiusM={42000}
              apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
              placeholderTextColor="#64748B"
            />
            {currentLocation && (
              <TouchableOpacity style={s.useGpsBtn} onPress={() => {
                if (editingField === 'pickup') {
                  setPickup(currentLocation.address);
                  setPickupCoords({ lat: currentLocation.lat, lng: currentLocation.lng });
                } else {
                  setDestination(currentLocation.address);
                  setDestinationCoords({ lat: currentLocation.lat, lng: currentLocation.lng });
                }
                setShowLocationModal(false);
              }}>
                <Ionicons name="navigate" size={20} color={COLORS.green} />
                <Text style={s.useGpsText}>Use current location</Text>
              </TouchableOpacity>
            )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* VEHICLE MODAL */}
      <Modal visible={showVehicleModal} animationType="slide" transparent onRequestClose={() => setShowVehicleModal(false)}>
        <View style={s.vehModalBg}>
          <View style={s.vehModalContent}>
            <Text style={s.vehModalTitle}>Select Vehicle</Text>
            {availableVehicles.map(v => (
              <TouchableOpacity key={v.id} style={[s.vehOption, selectedVehicle === v.id && s.vehOptionActive]}
                onPress={() => {
                  setSelectedVehicle(v.id);
                  setShowVehicleModal(false);
                  const price = fareMatrix[v.id];
                  if (price > 0) {
                    setCurrentFare(price);
                  } else if (pickup && destination) {
                    setCurrentFare(0);
                    setFareDetails(null);
                    handleCalculateFare(v.id);
                  }
                }}>
                <View style={[s.vehIcon, { backgroundColor: v.color + '20' }]}>
                  <Ionicons name={v.icon as any} size={32} color={v.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vehOptName}>{v.name}</Text>
                  <Text style={s.vehOptDesc}>{v.time} • {v.desc}</Text>
                </View>
                {fareMatrix[v.id] > 0 && (
                  <Text style={s.vehOptFare}>₦{fareMatrix[v.id].toLocaleString()}</Text>
                )}
                {selectedVehicle === v.id && <Ionicons name="checkmark-circle" size={24} color={COLORS.green} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.vehClose} onPress={() => setShowVehicleModal(false)}>
              <Text style={s.vehCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RiderPostRequestOverlay
        visible={searchingForDriver}
        phase={driverFound ? 'matched' : 'searching'}
        topInset={insets.top}
        bottomInset={insets.bottom}
        requestedDriverId={requestedDriverId}
        requestedDriverName={requestedDriverName}
        bidNgn={currentFare}
        routeKmLabel={searchRouteKmLabel}
        routeMinLabel={searchRouteMinLabel}
        searchCountdown={searchCountdown}
        driverMatched={matchedDriverForOverlay}
        handoffCountdownSec={handoffCountdown}
        onMenuPress={() => {
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          router.back();
        }}
        onCancelSearch={() => void cancelSearch()}
        onTrackDriver={() => {
          if (!tripId) return;
          navigateToLiveTracking(tripId, { immediate: true });
        }}
        onCallDriver={() => {
          const raw = matchedDriverForOverlay?.phone?.trim();
          if (!raw) {
            Alert.alert('Call unavailable', 'Driver phone will appear here once the line is connected.');
            return;
          }
          const digits = raw.replace(/[^\d+]/g, '');
          const href = digits.startsWith('+') ? `tel:${digits}` : `tel:${raw.replace(/\s/g, '')}`;
          void Linking.openURL(href);
        }}
        onChatDriver={() => {
          if (!tripId) {
            Alert.alert('Chat unavailable', 'Trip is still being set up. Try again in a moment.');
            return;
          }
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          router.push({ pathname: '/chat', params: { tripId } } as any);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapArea: { height: '42%', position: 'relative', backgroundColor: '#0D1420', overflow: 'hidden' },
  mapBidRouteCard: {
    position: 'absolute',
    top: 68,
    zIndex: 4,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  mapBidRouteInner: { paddingVertical: 12 },
  mapBidRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapBidDot: { width: 9, height: 9, borderRadius: 5 },
  mapBidLine: {
    width: 2,
    height: 12,
    backgroundColor: 'rgba(148,163,184,0.35)',
    marginLeft: 3,
    marginVertical: 4,
    borderRadius: 2,
  },
  mapBidTxt: { flex: 1, color: '#F1F5F9', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  mapPlaceholder: { flex: 1, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  mapText: { fontSize: 14, color: COLORS.dim, marginTop: 10 },
  mapRouteHint: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(11,18,32,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    zIndex: 3,
  },
  mapRouteHintText: { color: COLORS.lime, fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  routeSummaryBarOuter: {
    position: 'absolute',
    bottom: 10,
    zIndex: 4,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  routeSummaryGradient: { paddingVertical: 13, paddingHorizontal: 14 },
  routeSummaryRow: { flexDirection: 'row', alignItems: 'stretch' },
  routeSummaryBlock: { minWidth: 76, justifyContent: 'center' },
  routeSummaryBlockRight: { minWidth: 72, justifyContent: 'center', alignItems: 'flex-end' },
  routeSummaryMid: { flex: 1, paddingHorizontal: 10, justifyContent: 'center' },
  routeSummaryKicker: {
    color: 'rgba(148,163,184,0.95)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  routeSummaryHero: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  routeSummaryArrive: {
    color: '#F1F5F9',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  routeSummaryMeta: {
    marginTop: 3,
    color: 'rgba(56,189,248,0.95)',
    fontSize: 11,
    fontWeight: '700',
  },
  routeSummaryDist: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  routeSummaryStopTime: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.22)',
    color: 'rgba(167,243,208,0.95)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  routeSummaryVsep: {
    width: 1,
    backgroundColor: 'rgba(148,163,184,0.22)',
    marginVertical: 2,
  },
  gpsErrorBanner: {
    position: 'absolute',
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,184,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.3)',
  },
  gpsErrorText: { flex: 1, color: COLORS.yellow, fontSize: 12, fontWeight: '600' },
  mapTopBar: {
    position: 'absolute',
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 5,
  },
  backBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  pickupChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pickupDot: { width: 10, height: 10, borderRadius: 5 },
  pickupChipLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.white },
  gpsMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,165,233,0.15)',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(148,163,184,0.35)',
    marginBottom: 18,
  },
  bookFlowHeroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  bookFlowHeroSub: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  bookFlowPromoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(14,165,233,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.28)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  bookFlowPromoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(14,165,233,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookFlowPromoTextCol: { flex: 1, minWidth: 0 },
  bookFlowPromoTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
  },
  bookFlowPromoBody: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    lineHeight: 18,
  },
  bookFlowPromoActions: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bookFlowPromoCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lime,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  bookFlowPromoCtaText: { fontSize: 13, fontWeight: '900', color: COLORS.bg },
  bookFlowPromoClose: { padding: 2, marginTop: -4 },
  bookFlowServiceRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 10,
    marginBottom: 18,
  },
  bookFlowServiceCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    minHeight: 112,
  },
  bookFlowServiceIconBg: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  bookFlowServiceTitle: { fontSize: 15, fontWeight: '900', color: COLORS.white },
  bookFlowServiceSub: { fontSize: 12, fontWeight: '600', color: COLORS.dim, marginTop: 4 },
  bookFlowWhereShell: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.cardLight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    marginBottom: 20,
    overflow: 'hidden',
    minHeight: 58,
  },
  bookFlowWhereMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingVertical: 14,
    paddingRight: 8,
  },
  bookFlowWhereQuestion: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.dim,
  },
  bookFlowWhereFilled: { color: COLORS.white, fontWeight: '700' },
  bookFlowWhereDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148,163,184,0.35)' },
  bookFlowLaterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    backgroundColor: COLORS.lime,
    minWidth: 88,
  },
  bookFlowLaterLabel: { fontSize: 15, fontWeight: '900', color: COLORS.bg },
  bookFlowAddStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: -4,
    marginBottom: 4,
  },
  bookFlowAddStopText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.blue,
  },
  bookFlowStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: -4,
    marginBottom: 4,
  },
  bookFlowStopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
  },
  bookFlowStopText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  bookFlowRecentBlock: { marginBottom: 18 },
  bookFlowRecentHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.dim,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bookFlowRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.2)',
  },
  bookFlowRecentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookFlowRecentTitle: { fontSize: 15, fontWeight: '700', color: COLORS.white, lineHeight: 20 },
  bookFlowRecentMeta: { fontSize: 12, fontWeight: '500', color: COLORS.dim, marginTop: 1 },
  recentEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  recentEmptyText: { fontSize: 13, color: COLORS.dim, fontStyle: 'italic' },
  walletWarnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,184,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.25)',
  },
  walletWarnText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FDE68A' },
  preferredBanner: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  preferredText: { fontSize: 13, fontWeight: '800', color: '#FCA5A5' },
  preferredSub: { marginTop: 3, fontSize: 11, fontWeight: '600', color: 'rgba(252,211,231,0.85)', lineHeight: 15 },
  sheet: { flex: 1, backgroundColor: COLORS.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -24, paddingTop: 10 },
  sheetHidden: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 0, overflow: 'hidden', opacity: 0, marginTop: 0, paddingTop: 0 },
  sheetContent: { flexGrow: 1 },
  scheduledCard: {
    backgroundColor: '#10213A',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.25)',
    marginBottom: 14,
    gap: 8,
  },
  scheduledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduledTitle: { fontSize: 13, fontWeight: '900', color: COLORS.white },
  scheduledLink: { fontSize: 12, fontWeight: '800', color: COLORS.blue },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduledText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#D6E4F0' },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  vehicleCardPrompt: { borderWidth: 1.5, borderColor: COLORS.green, borderStyle: 'dashed' },
  vehIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  vehName: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  vehDesc: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  // ── Inline ride category selector ──────────────────────────────────────
  inlineCatSection: { marginBottom: 16 },
  inlineCatTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
    marginBottom: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  inlineCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(148,163,184,0.14)',
    position: 'relative',
  },
  inlineCatRowActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  inlineCatIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCatName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.white,
  },
  inlineCatMeta: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  inlineCatPriceCol: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  inlineCatPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.white,
  },
  inlineCatPriceMuted: {
    fontSize: 13,
    color: COLORS.dim,
    fontWeight: '600',
  },
  inlineCatCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineCatOrigPrice: {
    fontSize: 11,
    color: COLORS.dim,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    textAlign: 'right',
  },
  firstRideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,212,106,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,106,0.3)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  firstRideBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(0,212,106,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  firstRideBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#00D46A',
    marginBottom: 2,
  },
  firstRideBannerSub: {
    fontSize: 11,
    color: '#A7F3D0',
    fontWeight: '500',
    lineHeight: 16,
  },
  firstRideBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#00D46A',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  firstRideBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0D1420',
  },
  routeSafetyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    gap: 6,
  },
  routeSafetyCardHigh: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.65)',
  },
  routeSafetyWarnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  routeSafetyWarnText: {
    flex: 1,
    color: '#0D1420',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  routeSafetyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeSafetyTitle: { fontSize: 14, fontWeight: '900', color: COLORS.white },
  routeSafetyRisk: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  routeSafetySub: { fontSize: 12, fontWeight: '700', color: COLORS.dim, marginTop: 4 },
  routeSafetyBullet: { fontSize: 12, fontWeight: '600', color: '#E2E8F0', lineHeight: 18 },
  routeSafetyTips: { fontSize: 11, fontWeight: '600', color: COLORS.dim, marginTop: 6, lineHeight: 16 },
  fareSection: { gap: 18 },
  aiRouteCard: {
    backgroundColor: '#10213A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.25)',
  },
  aiRouteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  aiRouteTitle: { fontSize: 14, fontWeight: '900', color: COLORS.white },
  aiRouteText: { fontSize: 13, color: '#D6E4F0', lineHeight: 18 },
  aiRouteMeta: { fontSize: 12, color: COLORS.blue, fontWeight: '700', marginTop: 6 },
  fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  fareBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center' },
  fareBtnText: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  fareAmount: { fontSize: 36, fontWeight: '900', color: COLORS.lime },
  noSurgeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    marginTop: 2,
  },
  noSurgeBadgeText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  paySectionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted, marginBottom: 8 },
  payRow: { flexDirection: 'row', gap: 10 },
  payChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: COLORS.cardLight,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  payChipOn: { borderColor: COLORS.green, backgroundColor: 'rgba(0,212,106,0.12)' },
  payChipText: { fontSize: 14, fontWeight: '800', color: COLORS.muted },
  payChipTextOn: { color: COLORS.white },
  payHint: { fontSize: 11, color: COLORS.dim, marginTop: 8, lineHeight: 15 },
  preferenceHint: { fontSize: 11, color: COLORS.dim, marginTop: 2, marginBottom: 10, lineHeight: 15 },
  preferenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  preferenceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.cardLight,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  preferenceChipOn: {
    borderColor: COLORS.green,
    backgroundColor: 'rgba(0,212,106,0.12)',
  },
  preferenceChipText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  preferenceChipTextOn: { color: COLORS.white },
  /* ── Gate code section ───────────────────────────── */
  gateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  gateSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  gateIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateSavedCard: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  gateSavedCardOff: {
    backgroundColor: 'rgba(100,116,139,0.08)',
    borderColor: 'rgba(100,116,139,0.2)',
  },
  gateSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gateSavedEstate: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
  },
  gateSavedCode: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 4,
  },
  gateEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(100,116,139,0.15)',
  },
  gateEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
  },
  gateActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gateActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  gateActivePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#86EFAC',
  },
  gateCard: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  gateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  gateInputIcon: {},
  gateInputField: {
    flex: 1,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  gateInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  gateSaveBtnGrad: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gateSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  gateSaveBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.white },
  gateCancelBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  gateCancelBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  findBtn: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.lime,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  btnGrad: { paddingVertical: 19, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  findBtnText: { fontSize: 18, fontWeight: '900', color: COLORS.bg },
  calcBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    shadowColor: COLORS.green,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  calcBtnGrad: {
    minHeight: 60,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  calcBtnText: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalKb: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  modalBody: { flex: 1, padding: 16, overflow: 'visible' },
  useGpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: COLORS.card, borderRadius: 14, marginTop: 16 },
  useGpsText: { fontSize: 15, fontWeight: '700', color: COLORS.green },
  vehModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  vehModalContent: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  vehModalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.white, marginBottom: 16, textAlign: 'center' },
  vehOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, marginBottom: 8, backgroundColor: COLORS.card, gap: 12 },
  vehOptionActive: {
    borderWidth: 2,
    borderColor: COLORS.green,
    shadowColor: COLORS.green,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  vehOptName: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  vehOptDesc: { fontSize: 13, color: COLORS.muted },
  vehOptFare: { fontSize: 14, fontWeight: '900', color: COLORS.lime, marginRight: 8 },
  vehClose: { alignItems: 'center', paddingVertical: 14, marginTop: 8, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.dim },
  vehCloseText: { fontSize: 16, fontWeight: '800', color: COLORS.muted },
  searchBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  searchBox: {
    backgroundColor: '#111827',
    borderRadius: 28,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchSpinnerWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  searchSpinnerRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(0,212,106,0.2)',
  },
  searchTitle: { fontSize: 20, fontWeight: '900', color: COLORS.white, marginTop: 8, textAlign: 'center' },
  searchSub: { fontSize: 13, color: COLORS.muted, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  searchCountdownRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, marginBottom: 4 },
  searchCountdownText: { fontSize: 13, color: COLORS.muted },
  searchCancel: { marginTop: 20, paddingVertical: 11, paddingHorizontal: 32, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.red },
  searchSuccessRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,212,106,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(0,212,106,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 14,
    marginVertical: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,212,106,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,212,106,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  driverVeh: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  driverPlate: { fontSize: 12, fontWeight: '700', color: COLORS.dim, marginTop: 2 },
  driverRatingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  driverRatingText: { fontSize: 14, fontWeight: '800', color: '#F59E0B' },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 18,
    width: '100%',
  },
});

export default function BookInDriveStyleScreen() {
  return (
    <ErrorBoundary>
      <BookInDriveStyle />
    </ErrorBoundary>
  );
}
