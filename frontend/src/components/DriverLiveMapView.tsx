/**
 * DriverLiveMapView — Nexryde 2030 Driver Map Experience
 *
 * Full-screen Google Maps live view for drivers when online.
 * Features:
 *  – Dark map style, auto-follow camera with heading rotation
 *  – Animated bouncing/swinging car marker with glow pulse
 *  – Today's earnings floating header
 *  – Zoom in/out controls
 *  – Route polyline + turn-by-turn card when on trip
 *  – Bottom bar (Go Offline / on-trip hint)
 *  – Smooth marker position transitions
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  AppState,
  ScrollView,
  Linking,
  useWindowDimensions,
  type NativeSyntheticEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MapView, {
  Marker,
  Polyline,
  UrlTile,
  PROVIDER_GOOGLE,
  MapStyleElement,
  Camera,
  Region,
} from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { startupLog } from '@/src/utils/driverStartupTrace';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import notificationService from '@/src/services/notifications';
import { DriverBrandHeaderRow } from '@/src/components/driver/DriverBrandChrome';
import { useFlowLayout } from '@/src/constants/flowLayout';
import DriverMapOfferDock, { offerTripPickupDropCoords } from '@/src/components/driver/DriverMapOfferDock';
import DriverNavigatePickupDock from '@/src/components/driver/DriverNavigatePickupDock';
import {
  DriverTripPhaseChrome,
  type DriverTripPhase,
} from '@/src/components/driver/DriverTripPhaseChrome';
import DriverArrivedPickupDock from '@/src/components/driver/DriverArrivedPickupDock';
import DriverStartTripDock from '@/src/components/driver/DriverStartTripDock';
import DriverOngoingTripDock from '@/src/components/driver/DriverOngoingTripDock';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { DRIVER_OFFER_COUNTDOWN_SECONDS } from '@/src/constants/driverOffer';
import {
  DOCK_BLUR_INTENSITY,
  DOCK_TOP_RADIUS,
  HANDLE_GRADIENT_DEFAULT,
} from '@/src/components/driver/driverDockTheme';
import { formatPickupWaitLabel } from '@/src/components/driver/driverDockUtils';
import { driverTripProgressPercent } from '@/src/utils/driverOngoingDisplay';
import {
  fetchGoogleDrivingRoutes,
  fetchDirections,
  fmtDistanceDisplay,
  maneuverToColor,
  haversineM,
  type NavStep,
} from '@/src/navigation/navUtils';
import { COLORS as THEME_COLORS } from '@/src/constants/theme';

/** Advance to next Directions step when the driver is this close to the step end (metres). */
const NAV_STEP_END_PROXIMITY_M = 40;
/** Driver may mark “arrived” when within this radius of pickup (GPS tolerance). */
const PICKUP_ARRIVAL_RADIUS_M = 50;

function formatCountdownMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function parseTripIsoMs(raw: unknown): number {
  if (raw == null || raw === '') return NaN;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : NaN;
}

function formatTripShortId(id: string | undefined | null): string {
  if (!id || typeof id !== 'string') return '—';
  const tail = id.replace(/-/g, '').slice(-6).toUpperCase();
  return tail.length >= 4 ? tail : id.slice(0, 6).toUpperCase();
}

function readLocationAddress(loc: unknown): string | null {
  if (loc == null) return null;
  if (typeof loc === 'string') {
    const t = loc.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof loc === 'object') {
    const o = loc as Record<string, unknown>;
    const a = o.address ?? o.formatted_address ?? o.name ?? o.label;
    if (typeof a === 'string' && a.trim()) return a.trim();
  }
  return null;
}

function formatPaymentLabel(pm: unknown): string {
  const s = String(pm || 'cash').toLowerCase().replace(/_/g, ' ');
  if (s === 'cash') return 'Cash';
  if (s.includes('wallet')) return 'Wallet';
  if (s.includes('card') || s.includes('paystack') || s.includes('squad')) return 'Card';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Google Static Maps — pin preview in trip sheet (same key as Directions when configured). */
function buildStaticMapPinUrl(lat: number, lng: number, apiKey: string): string | null {
  if (!apiKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const markers = encodeURIComponent(`color:0x22E5A0|${lat},${lng}`);
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=160x160&scale=2&maptype=roadmap&markers=${markers}&key=${encodeURIComponent(apiKey)}`;
}

/** Thin progress + status line — similar to ride-hail “trip phase” headers */
function TripStageProgress({
  status,
  paymentStatus,
}: {
  status: string;
  paymentStatus?: string | null;
}) {
  const st = String(status);
  const segOn = (i: number, activeIdx: number) => (st === 'pending_payment' ? true : i <= activeIdx);
  const segEl = (i: number, activeIdx: number) => {
    const on = segOn(i, activeIdx);
    return (
      <View key={i} style={[styles.tripStageSeg, !on && styles.tripStageSegOff]}>
        {on ? (
          <LinearGradient
            colors={['#34F5B8', '#22E5A0', '#0D9F6E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
      </View>
    );
  };
  if (st === 'pending_payment') {
    const ps = String(paymentStatus || '').toLowerCase();
    const financial = ps === 'pending' || ps === 'unpaid' || ps === '';
    return (
      <View style={styles.tripStageWrap}>
        <View style={styles.tripStageBar}>
          {[0, 1, 2].map((i) => segEl(i, 2))}
        </View>
        <Text style={styles.tripStageTitle} numberOfLines={2}>
          {financial
            ? 'Trip completed — settle fare with rider (cash or in-app)'
            : 'Trip completed — confirm safety steps with rider if needed'}
        </Text>
      </View>
    );
  }
  const activeIdx = st === 'accepted' ? 0 : st === 'arrived' ? 1 : st === 'ongoing' ? 2 : 0;
  const title = ['Heading to pickup', 'At pickup — meet rider', 'Trip in progress'][activeIdx];
  return (
    <View style={styles.tripStageWrap}>
      <View style={styles.tripStageBar}>
        {[0, 1, 2].map((i) => segEl(i, activeIdx))}
      </View>
      <Text style={styles.tripStageTitle} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

/** Lagos — used when driver GPS is missing or NaN until a fix arrives. */
const LAGOS_MAP_REGION_FALLBACK = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
} as const;

/** If `onMapLoaded` never runs, avoid hammering `animateCamera` on first paint (can stress the native view). */
const CAMERA_UNLOCK_FALLBACK_MS = 2500;
/** `onMapLoaded` can be very late on slow networks; 8s was a false alarm vs real GCP tile failures. */
const MAP_ONLOADED_TIMEOUT_MS = 40000;

function haversineKmDriver(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Stringify react-native-maps / Google Maps SDK native error payloads for logs and UI. */
function serializeMapsNativePayload(error: { nativeEvent?: unknown } | null | undefined): string {
  const ev = error?.nativeEvent;
  if (ev == null) return '';
  if (typeof ev === 'string') return ev;
  try {
    return JSON.stringify(ev);
  } catch {
    return String(ev);
  }
}

/* ─────────────────────── Dark "Nexryde Night" map style ───────────────────────── */
/**
 * NEXRYDE night map — city + road labels stay readable while driving.
 * Exported so other components (e.g. offline home) can reuse it.
 */
export const NEXRYDE_MAP_STYLE: MapStyleElement[] = [
  /* ── Base geometry ── */
  { elementType: 'geometry',                         stylers: [{ color: '#0c1220' }] },
  { elementType: 'labels.text.stroke',               stylers: [{ color: '#0c1220' }] },
  { elementType: 'labels.text.fill',                 stylers: [{ color: '#8eaad4' }] },
  { elementType: 'labels.icon',                      stylers: [{ visibility: 'off' }] },

  /* ── Land & landscape ── */
  { featureType: 'landscape',          elementType: 'geometry',            stylers: [{ color: '#0e1628' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry',            stylers: [{ color: '#111d33' }] },
  { featureType: 'landscape.natural',  elementType: 'geometry',            stylers: [{ color: '#0b1421' }] },

  /* ── Water ── */
  { featureType: 'water',              elementType: 'geometry',            stylers: [{ color: '#071524' }] },
  { featureType: 'water',              elementType: 'labels.text.fill',    stylers: [{ color: '#2c5282' }] },

  /* ── Roads (thicker, higher-contrast “tick” lines for driving) ── */
  { featureType: 'road',               elementType: 'geometry',            stylers: [{ color: '#243a5c' }] },
  { featureType: 'road',               elementType: 'geometry.stroke',     stylers: [{ color: '#4a6a9a', weight: 1.2 }] },
  { featureType: 'road',               elementType: 'labels.text.fill',    stylers: [{ color: '#9ec5ef' }] },
  { featureType: 'road',               elementType: 'labels.text.stroke',  stylers: [{ color: '#0c1220', weight: 2 }] },
  { featureType: 'road.highway',       elementType: 'geometry',            stylers: [{ color: '#2a4f82' }] },
  { featureType: 'road.highway',       elementType: 'geometry.stroke',     stylers: [{ color: '#6b9ee8', weight: 1.8 }] },
  { featureType: 'road.highway',       elementType: 'labels.text.fill',    stylers: [{ color: '#b8d4f5' }] },
  { featureType: 'road.arterial',      elementType: 'geometry',            stylers: [{ color: '#1f3558' }] },
  { featureType: 'road.arterial',      elementType: 'geometry.stroke',     stylers: [{ color: '#5a82b8', weight: 1.4 }] },
  { featureType: 'road.arterial',      elementType: 'labels.text.fill',    stylers: [{ color: '#8eb4dc' }] },
  { featureType: 'road.local',         elementType: 'geometry',            stylers: [{ color: '#1a2d48' }] },
  { featureType: 'road.local',         elementType: 'geometry.stroke',     stylers: [{ color: '#3d5f88', weight: 1 }] },
  { featureType: 'road.local',         elementType: 'labels.text.fill',    stylers: [{ color: '#6a90b8' }] },

  /* ── Cities & admin labels (readable while moving) ── */
  { featureType: 'administrative',                    elementType: 'geometry',            stylers: [{ color: '#1a2a42' }] },
  { featureType: 'administrative',                    elementType: 'geometry.stroke',     stylers: [{ color: '#1e3660' }] },
  { featureType: 'administrative.country',            elementType: 'labels.text.fill',    stylers: [{ color: '#94a3b8' }] },
  { featureType: 'administrative.country',            elementType: 'labels.text.stroke',  stylers: [{ color: '#0c1220' }] },
  { featureType: 'administrative.province',           elementType: 'labels.text.fill',    stylers: [{ color: '#7ea0c4' }] },
  { featureType: 'administrative.locality',           elementType: 'labels.text.fill',    stylers: [{ color: '#c0d4ef' }] },
  { featureType: 'administrative.locality',           elementType: 'labels.text.stroke',  stylers: [{ color: '#0c1220' }] },
  { featureType: 'administrative.neighborhood',       elementType: 'labels.text.fill',    stylers: [{ color: '#6a8db0' }] },
  { featureType: 'administrative.land_parcel',        elementType: 'labels',              stylers: [{ visibility: 'off' }] },

  /* ── POI — keep off for clean look, except parks ── */
  { featureType: 'poi',                               stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',          elementType: 'geometry',            stylers: [{ color: '#0a1e14', visibility: 'on' }] },
  { featureType: 'poi.park',          elementType: 'labels.text.fill',    stylers: [{ color: '#2e6b47', visibility: 'on' }] },

  /* ── Transit off ── */
  { featureType: 'transit',                           stylers: [{ visibility: 'off' }] },
];

/* ─────────────────────── Types ───────────────────────── */
export type DriverCoords = { lat: number; lng: number; heading?: number };

export interface ActiveTrip {
  id: string;
  pickup_location?: any;
  dropoff_location?: any;
  route_preview_coordinates?: Array<{ lat: number; lng: number }> | null;
  current_instruction?: string | null;
  next_instruction?: string | null;
  distance_to_next_km?: number | null;
  distance_km?: number | null;
  duration_mins?: number | null;
  status?: string;
  rider_name?: string | null;
  rider_profile_image?: string | null;
  rider_phone?: string | null;
  pickup_code_verified?: boolean;
  security_code_verified?: boolean;
  pickup_code_required?: boolean;
  arrived_at?: string | null;
  started_at?: string | null;
  fare?: number | null;
  /** Live meter components when backend sends them */
  base_fare?: number | null;
  distance_fee?: number | null;
  time_fee?: number | null;
  payment_method?: string | null;
  /** Mirrors trip `payment_status` when parent merges it (e.g. pending vs paid). */
  payment_status?: string | null;
  /** Rider reputation average (Shield / profile), 1–5 */
  rider_reputation_avg?: number | null;
  rider_trip_count?: number | null;
  rider_new_account?: boolean;
  vehicle_model?: string | null;
  vehicle_plate?: string | null;
  vehicle_color?: string | null;
}

interface Props {
  driverCoords: DriverCoords | null;
  isOnline: boolean;
  driverCanReceiveOffers: boolean;
  todayEarnings: number;
  todayTrips?: number;
  /** Sum of completed trip duration today (hours), from earnings `summary.total_time_mins`. */
  todayTripHours?: number;
  /** Driver lifetime/average rating for idle stats (from profile). */
  driverRating?: number | null;
  weekEarnings?: number;
  activeTrip?: ActiveTrip | null;
  driverOffersWsConnected?: boolean;
  surgeActive?: boolean;
  surgeMultiplier?: number;
  destinationActive?: boolean;
  destinationName?: string;
  destinationTripsRemaining?: number;
  /** Called when driver taps GO (offline → online) */
  onGoOnline?: () => void;
  /** Called when driver taps Go Offline (online → offline) */
  onGoOffline?: () => void;
  onFeatureHub?: () => void;
  onSearch?: () => void;
  onShieldPress?: () => void;
  /** Opens app messages (enforcement, announcements). Defaults to driver notifications tab. */
  onInboxPress?: () => void;
  onDestination?: () => void;
  /** True while the online/offline toggle is processing */
  toggling?: boolean;
  /** Verification / subscription status for offline banner */
  driverApproved?: boolean;
  trialReady?: boolean;

  /** Open Google Maps to current leg (pickup vs dropoff based on trip status). */
  onTripOpenNavigation?: () => void;
  onTripMarkArrived?: () => void | Promise<void>;
  onTripStart?: () => void | Promise<void>;
  /** After pickup code is verified — begins metered trip (PUT /start). */
  onTripConfirmStart?: () => void | Promise<void>;
  /** Driver cancels from pre-start sheet (arrived + verified). */
  onTripCancel?: () => void | Promise<void>;
  /** Drop-off complete — ends active trip on the map */
  onTripComplete?: () => void | Promise<void>;
  /** Optional — e.g. hold / report issue while metered (UI may show “coming soon”). */
  onTripPause?: () => void | Promise<void>;
  onTripCallRider?: () => void | Promise<void>;
  onTripMessageRider?: () => void | Promise<void>;
  /** When set with no active trip, show offer dock on this map (driver is online). */
  embeddedOfferTrip?: Record<string, unknown> | null;
  embeddedOfferCountdown?: number;
  embeddedOfferFareInput?: string;
  onEmbeddedOfferFareInputChange?: (v: string) => void;
  onEmbeddedOfferAcceptRider?: () => void;
  onEmbeddedOfferAcceptCounter?: () => void;
  onEmbeddedOfferDecline?: () => void;
  embeddedOfferAccepting?: boolean;
  /** When set (e.g. 'arrive' | 'nav' | 'complete') primary actions show spinner */
  tripActionBusy?: string | null;
  /** When true, hide the active-trip bottom dock (e.g. trip-completion sheet is covering it). */
  suppressTripDock?: boolean;
}

/* ─────────────────────── Animated car marker on map ───────────────────────── */
function CarMarker({
  bounceAnim,
  pulseAnim,
  tone = 'green',
  caption,
}: {
  bounceAnim: Animated.Value;
  pulseAnim: Animated.Value;
  /** Blue glow + gradient when online and idle (reference UI). */
  tone?: 'green' | 'blue';
  /** Small label above the car (e.g. "You" on pickup navigation). */
  caption?: string;
}) {
  const translateY = bounceAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [4, 0, -4],
  });
  const scaleX = bounceAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [1.08, 1, 0.93],
  });
  const ringScale = pulseAnim.interpolate({
    inputRange: [1, 1.6],
    outputRange: [1, 1.5],
  });
  const ringOpacity = pulseAnim.interpolate({
    inputRange: [1, 1.6],
    outputRange: [0.6, 0],
  });
  const blue = tone === 'blue';

  return (
    <View style={{ alignItems: 'center' }}>
      {caption ? (
        <View style={markerStyles.youPill}>
          <Text style={markerStyles.youPillTxt}>{caption}</Text>
        </View>
      ) : null}
      <Animated.View style={[markerStyles.container, { transform: [{ translateY }, { scaleX }] }]}>
        {blue ? <View style={markerStyles.accuracyRing} /> : null}
        <Animated.View
          style={[
            blue ? markerStyles.glowRingBlue : markerStyles.glowRing,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <LinearGradient
          colors={blue ? ['#3B82F6', '#1D4ED8'] : ['#22e5a0', '#00c473']}
          style={[markerStyles.carCircle, blue && markerStyles.carCircleBlue]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="car-sport" size={20} color="#FFF" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

/* ─────────────────────── Pickup/Dropoff markers ───────────────────────── */
function PickupMarker() {
  return (
    <View style={markerStyles.destWrap}>
      <LinearGradient colors={['#22C55E', '#16A34A']} style={markerStyles.destCircle}>
        <Ionicons name="location" size={13} color="#FFF" />
      </LinearGradient>
      <View style={[markerStyles.stopLabel, { backgroundColor: '#15803D' }]}>
        <Text style={markerStyles.stopLabelText}>A</Text>
      </View>
      <View style={[markerStyles.destStem, { backgroundColor: '#22C55E' }]} />
    </View>
  );
}

function MapStopAddressCallout({ label }: { label: string }) {
  if (!label.trim()) return null;
  return (
    <View style={markerStyles.addrCallout}>
      <Text style={markerStyles.addrCalloutTxt} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function DropoffMarker({ large = false, addressLabel }: { large?: boolean; addressLabel?: string }) {
  const sz = large ? 36 : 28;
  const labelSz = large ? 11 : 9;
  return (
    <View style={markerStyles.destWrap}>
      <LinearGradient
        colors={['#ef4444', '#dc2626']}
        style={[markerStyles.destCircle, large && { width: sz, height: sz, borderRadius: sz / 2 }]}
      >
        <Ionicons name="flag" size={large ? 15 : 12} color="#FFF" />
      </LinearGradient>
      <View style={[markerStyles.stopLabel, markerStyles.stopLabelB, large && markerStyles.stopLabelLg]}>
        <Text style={[markerStyles.stopLabelText, { fontSize: labelSz }]}>B</Text>
      </View>
      <View style={[markerStyles.destStem, { backgroundColor: '#ef4444' }, large && { height: 8 }]} />
      {large ? <MapStopAddressCallout label={addressLabel || ''} /> : null}
    </View>
  );
}

function PickupMarkerLarge({ addressLabel }: { addressLabel?: string }) {
  return (
    <View style={markerStyles.destWrap}>
      <LinearGradient
        colors={['#22C55E', '#16A34A']}
        style={[markerStyles.destCircle, { width: 36, height: 36, borderRadius: 18 }]}
      >
        <Ionicons name="location" size={15} color="#FFF" />
      </LinearGradient>
      <View style={[markerStyles.stopLabel, { backgroundColor: '#15803D' }, markerStyles.stopLabelLg]}>
        <Text style={[markerStyles.stopLabelText, { fontSize: 11 }]}>A</Text>
      </View>
      <View style={[markerStyles.destStem, { backgroundColor: '#22C55E', height: 8 }]} />
      <MapStopAddressCallout label={addressLabel || ''} />
    </View>
  );
}

/** Incoming-offer map: rider at pickup (green). */
function OfferRiderPin() {
  return (
    <View style={markerStyles.destWrap}>
      <LinearGradient colors={['#34F5B8', '#0D9F6E']} style={markerStyles.destCircle}>
        <Ionicons name="person" size={12} color="#022C22" />
      </LinearGradient>
      <View style={[markerStyles.stopLabel, { backgroundColor: '#16A34A' }]}>
        <Text style={markerStyles.stopLabelText}>Rider</Text>
      </View>
      <View style={[markerStyles.destStem, { backgroundColor: '#22E5A0' }]} />
    </View>
  );
}

/** Incoming-offer map: destination (blue). */
function OfferDropPin({ label }: { label: string }) {
  return (
    <View style={markerStyles.destWrap}>
      <LinearGradient colors={['#3B82F6', '#1D4ED8']} style={markerStyles.destCircle}>
        <Ionicons name="flag" size={12} color="#FFF" />
      </LinearGradient>
      <View style={[markerStyles.stopLabel, { backgroundColor: '#2563EB', maxWidth: 128 }]}>
        <Text style={[markerStyles.stopLabelText, { fontSize: 8 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={[markerStyles.destStem, { backgroundColor: '#3B82F6' }]} />
    </View>
  );
}

/* ─────────────────────── Zoom button ───────────────────────── */
function ZoomButton({
  icon,
  onPress,
}: {
  icon: 'add' | 'remove';
  onPress: () => void;
}) {
  const label = icon === 'add' ? 'Zoom in on map' : 'Zoom out on map';
  return (
    <TouchableOpacity
      style={zoomStyles.btn}
      onPress={onPress}
      activeOpacity={0.72}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={21} color="#F1F5F9" />
    </TouchableOpacity>
  );
}

/* ─────────────────────── Main component ───────────────────────── */
function DriverLiveMapViewInner({
  driverCoords,
  isOnline,
  driverCanReceiveOffers,
  todayEarnings,
  todayTrips = 0,
  todayTripHours = 0,
  driverRating = null,
  weekEarnings = 0,
  activeTrip,
  driverOffersWsConnected = false,
  surgeActive = false,
  surgeMultiplier = 1,
  destinationActive = false,
  destinationName = '',
  destinationTripsRemaining = 0,
  onGoOnline,
  onGoOffline,
  onFeatureHub,
  onSearch,
  onShieldPress,
  onInboxPress,
  onDestination,
  toggling = false,
  driverApproved = true,
  trialReady = true,
  embeddedOfferTrip = null,
  embeddedOfferCountdown = 0,
  embeddedOfferFareInput = '',
  onEmbeddedOfferFareInputChange,
  onEmbeddedOfferAcceptRider,
  onEmbeddedOfferAcceptCounter,
  onEmbeddedOfferDecline,
  embeddedOfferAccepting = false,
  onTripOpenNavigation,
  onTripMarkArrived,
  onTripStart,
  onTripConfirmStart,
  onTripCancel,
  onTripComplete,
  onTripPause,
  onTripCallRider,
  onTripMessageRider,
  tripActionBusy = null,
  suppressTripDock = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();
  const flow = useFlowLayout();
  const router = useRouter();
  const { user } = useAppStore();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();
  const [mapInboxUnread, setMapInboxUnread] = useState(0);
  const mapRef = useRef<MapView>(null);
  const cameraZoomRef = useRef(15);
  const lastAnimCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  /* ── Bounce animation for the car marker ── */
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const bounceLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  /* ── Pulse animation for the glow ring ── */
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  /* ── Stats card slide ── */
  const statsSlide = useRef(new Animated.Value(0)).current;
  const [statsOpen, setStatsOpen] = useState(false);
  /** Premium pickup dock: chevron in heading bar can collapse the sheet for more map. */
  const [pickupNavDockExpanded, setPickupNavDockExpanded] = useState(true);
  /** “You’ve arrived” dock — same collapse pattern. */
  const [arrivedDockExpanded, setArrivedDockExpanded] = useState(false);
  /** “Start trip” dock (code verified, rider in car). */
  const [startTripDockExpanded, setStartTripDockExpanded] = useState(true);
  /** Metered trip — drop-off leg. */
  const [ongoingDockExpanded, setOngoingDockExpanded] = useState(true);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapSdkErrorDetail, setMapSdkErrorDetail] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [useDefaultMapStyle, setUseDefaultMapStyle] = useState(true);
  const [useTileFallback, setUseTileFallback] = useState(false);
  const [cameraUnlocked, setCameraUnlocked] = useState(false);
  const [mapLayout, setMapLayout] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (isOnline) startupLog('MAP_INIT', { component: 'DriverLiveMapView' });
  }, [isOnline]);

  const logMapEvent = useCallback((event: string, extra?: Record<string, unknown>) => {
    if (!__DEV__) return;
    console.log('[DriverLiveMapView]', event, {
      platform: Platform.OS,
      provider: 'google',
      useDefaultMapStyle,
      mapReady,
      mapLoaded,
      ...extra,
    });
  }, [mapLoaded, mapReady, useDefaultMapStyle]);

  const lastRegionChangeLogMs = useRef(0);

  /* Defer follow-camera until native `onMapLoaded` or a short fallback (whichever first). */
  useEffect(() => {
    if (mapLoaded) {
      setCameraUnlocked(true);
      return;
    }
    if (!mapReady) {
      setCameraUnlocked(false);
      return;
    }
    const t = setTimeout(() => setCameraUnlocked(true), CAMERA_UNLOCK_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [mapLoaded, mapReady]);

  // If Google tiles don't load shortly after map is ready, fail over gracefully.
  useEffect(() => {
    if (!isOnline || !mapReady || mapLoaded || useTileFallback) return;
    const t = setTimeout(() => {
      setMapError(true);
      const sizeNote = mapLayout
        ? ` MapView layout: ${Math.round(mapLayout.width)}×${Math.round(mapLayout.height)}.`
        : '';
      setMapSdkErrorDetail(
        `[Timer ${MAP_ONLOADED_TIMEOUT_MS / 1000}s] onMapLoaded never ran — native map did not finish its load callback.${sizeNote} Beige + Google watermark usually means GCP: add EAS/Android release SHA‑1 + package com.nexryde.app to this API key, confirm billing, enable Maps SDK for Android. This is not an overlay hiding the map. Tap "Load fallback tiles" to confirm the MapView works.`
      );
      setUseDefaultMapStyle(true);
      setUseTileFallback(true);
      console.warn('[NEXRYDE_MAP_SDK] mapLoadTimeoutFallback', { mapReady, mapLoaded, mapLayout });
      logMapEvent('mapLoadTimeoutFallback');
    }, MAP_ONLOADED_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isOnline, mapLoaded, mapReady, useTileFallback, logMapEvent, mapLayout]);

  /* Unread app notifications (same source as driver tab badge — includes enforcement inserts). */
  useEffect(() => {
    if (!driverId || !canCallAuthedApi) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/users/${driverId}/notifications?unread_only=true&limit=1`,
          { headers: getAuthHeaders() }
        );
        if (!res.ok) return;
        const data = await res.json();
        const count = data?.unread_count ?? (Array.isArray(data?.notifications) ? data.notifications.length : 0);
        if (!cancelled) setMapInboxUnread(Number(count));
      } catch {
        /* silent */
      }
    };
    void fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void fetchUnread();
    });
    return () => {
      cancelled = true;
      clearInterval(iv);
      appSub.remove();
    };
  }, [driverId, canCallAuthedApi]);

  const handleMapInboxPress = useCallback(() => {
    if (onInboxPress) {
      onInboxPress();
      return;
    }
    router.push('/(driver-tabs)/driver-notifications');
  }, [onInboxPress, router]);

  const retryGoogleTiles = useCallback(() => {
    setMapError(false);
    setMapSdkErrorDetail(null);
    setMapLoaded(false);
    setCameraUnlocked(false);
    setUseTileFallback(false);
    setUseDefaultMapStyle(true);
    logMapEvent('retryGoogleTiles');
  }, [logMapEvent]);

  /* ── Start/stop bounce when online and not on trip ── */
  useEffect(() => {
    if (bounceLoopRef.current) {
      bounceLoopRef.current.stop();
      bounceLoopRef.current = null;
    }
    if (isOnline && !activeTrip) {
      bounceLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, {
            toValue: -1,
            duration: 500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(bounceAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(bounceAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(400),
        ])
      );
      bounceLoopRef.current.start();
    } else {
      Animated.spring(bounceAnim, { toValue: 0, useNativeDriver: true }).start();
    }
    return () => {
      if (bounceLoopRef.current) bounceLoopRef.current.stop();
    };
  }, [isOnline, !!activeTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── GO button pulse (offline state) ── */
  const goPulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isOnline) { goPulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goPulseAnim, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(goPulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Pulse loop for glow ── */
  useEffect(() => {
    if (!isOnline) return;
    if (pulseLoopRef.current) pulseLoopRef.current.stop();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.6,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current.start();
    return () => {
      if (pulseLoopRef.current) pulseLoopRef.current.stop();
    };
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Camera follow driver with throttle ── */
  useEffect(() => {
    if (!driverCoords || !mapReady || !cameraUnlocked || !mapRef.current) return;
    const prev = lastAnimCoordsRef.current;
    // Throttle: only animate if moved > 5m or first update
    if (prev) {
      const dlat = Math.abs(driverCoords.lat - prev.lat);
      const dlng = Math.abs(driverCoords.lng - prev.lng);
      if (dlat < 0.00004 && dlng < 0.00004) return;
    }
    lastAnimCoordsRef.current = { lat: driverCoords.lat, lng: driverCoords.lng };

    const cam: Camera = {
      center: {
        latitude: driverCoords.lat,
        longitude: driverCoords.lng,
      },
      heading: driverCoords.heading ?? 0,
      pitch: activeTrip ? 15 : 0,
      zoom: cameraZoomRef.current,
      altitude: 5000,
    };
    mapRef.current.animateCamera(cam, { duration: 800 });
  }, [driverCoords, mapReady, cameraUnlocked, !!activeTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Stats card toggle ── */
  const toggleStats = useCallback(() => {
    const opening = !statsOpen;
    setStatsOpen(opening);
    Animated.spring(statsSlide, {
      toValue: opening ? 1 : 0,
      tension: 60,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [statsOpen, statsSlide]);

  /* ── Zoom controls ── */
  const handleZoomIn = useCallback(() => {
    cameraZoomRef.current = Math.min(cameraZoomRef.current + 1.5, 20);
    if (driverCoords && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: { latitude: driverCoords.lat, longitude: driverCoords.lng },
          zoom: cameraZoomRef.current,
          heading: driverCoords.heading ?? 0,
          pitch: activeTrip ? 15 : 0,
          altitude: 2000,
        },
        { duration: 400 }
      );
    }
  }, [driverCoords, activeTrip]);

  const handleZoomOut = useCallback(() => {
    cameraZoomRef.current = Math.max(cameraZoomRef.current - 1.5, 6);
    if (driverCoords && mapRef.current) {
      mapRef.current.animateCamera(
        {
          center: { latitude: driverCoords.lat, longitude: driverCoords.lng },
          zoom: cameraZoomRef.current,
          heading: driverCoords.heading ?? 0,
          pitch: 0,
          altitude: 50000,
        },
        { duration: 400 }
      );
    }
  }, [driverCoords]);

  /* ── Extract pickup/dropoff coords (early — used by recenter + map) ── */
  const getCoord = (loc: any): { lat: number; lng: number } | null => {
    if (!loc) return null;
    if (typeof loc === 'object' && 'lat' in loc) return { lat: Number(loc.lat), lng: Number(loc.lng) };
    if (typeof loc === 'object' && 'latitude' in loc)
      return { lat: Number(loc.latitude), lng: Number(loc.longitude) };
    return null;
  };
  const pickupCoord = activeTrip ? getCoord(activeTrip.pickup_location) : null;
  const dropCoord = activeTrip ? getCoord(activeTrip.dropoff_location) : null;

  /* ── Re-centre on my location ── */
  const handleRecenter = useCallback(() => {
    if (!mapRef.current) return;
    const st = String(activeTrip?.status || '');
    const atPickupWait =
      st === 'arrived' &&
      activeTrip?.pickup_code_required !== false &&
      !(activeTrip?.pickup_code_verified || activeTrip?.security_code_verified);
    const pts: { latitude: number; longitude: number }[] = [];
    if (driverCoords && Number.isFinite(driverCoords.lat)) {
      pts.push({ latitude: driverCoords.lat, longitude: driverCoords.lng });
    }
    if (pickupCoord) pts.push({ latitude: pickupCoord.lat, longitude: pickupCoord.lng });
    if (atPickupWait && dropCoord) {
      pts.push({ latitude: dropCoord.lat, longitude: dropCoord.lng });
    }
    if (pts.length >= 2) {
      try {
        mapRef.current.fitToCoordinates(pts, {
          edgePadding: {
            top: insets.top + 72,
            right: 40,
            bottom: atPickupWait
              ? arrivedDockExpanded
                ? insets.bottom + Math.round(winHeight * 0.48) + 24
                : insets.bottom + 100
              : insets.bottom + 120,
            left: 40,
          },
          animated: true,
        });
      } catch {
        /* noop */
      }
      return;
    }
    if (!driverCoords) return;
    cameraZoomRef.current = 15;
    mapRef.current.animateCamera(
      {
        center: { latitude: driverCoords.lat, longitude: driverCoords.lng },
        zoom: 15,
        heading: driverCoords.heading ?? 0,
        pitch: activeTrip ? 15 : 0,
        altitude: 5000,
      },
      { duration: 600 },
    );
  }, [
    driverCoords,
    activeTrip,
    pickupCoord,
    dropCoord,
    arrivedDockExpanded,
    insets.top,
    insets.bottom,
    winHeight,
  ]);

  const openMapsAtDriver = useCallback(() => {
    if (!driverCoords || !Number.isFinite(driverCoords.lat) || !Number.isFinite(driverCoords.lng)) {
      handleRecenter();
      return;
    }
    const { lat, lng } = driverCoords;
    const url =
      Platform.select({
        ios: `maps://?ll=${lat},${lng}&q=My+location`,
        android: `geo:0,0?q=${lat},${lng}(My+location)`,
      }) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      handleRecenter();
    });
  }, [driverCoords, handleRecenter]);

  /* ── Build route polyline ── */
  const routeCoords = React.useMemo(() => {
    if (!activeTrip?.route_preview_coordinates) return [];
    return activeTrip.route_preview_coordinates
      .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({ latitude: p.lat, longitude: p.lng }));
  }, [activeTrip?.route_preview_coordinates]);

  const hasEmbeddedOffer = Boolean(isOnline && embeddedOfferTrip && !activeTrip);
  const offerTripKey =
    embeddedOfferTrip && typeof (embeddedOfferTrip as { id?: unknown }).id === 'string'
      ? String((embeddedOfferTrip as { id: string }).id)
      : '';
  const { offerRouteLatLng, offerPickupCoord, offerDropCoord } = useMemo(() => {
    const g = offerTripPickupDropCoords(
      hasEmbeddedOffer ? (embeddedOfferTrip as Record<string, unknown>) : null,
    );
    return {
      offerPickupCoord: g.pickup,
      offerDropCoord: g.drop,
      offerRouteLatLng: g.route
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => ({ latitude: p.lat, longitude: p.lng })),
    };
  }, [hasEmbeddedOffer, offerTripKey]);

  const offerMapTripKm = useMemo(() => {
    if (!hasEmbeddedOffer || !embeddedOfferTrip) return null;
    const t = embeddedOfferTrip as Record<string, unknown>;
    const k = t.distance_km != null ? Number(t.distance_km) : null;
    return k != null && Number.isFinite(k) ? k : null;
  }, [hasEmbeddedOffer, embeddedOfferTrip, offerTripKey]);

  const offerDropLabelShort = useMemo(() => {
    if (!hasEmbeddedOffer || !embeddedOfferTrip) return 'Drop';
    const t = embeddedOfferTrip as Record<string, unknown>;
    const dl = t.dropoff_location ?? t.destination;
    const line =
      typeof dl === 'string'
        ? dl
        : dl && typeof dl === 'object'
          ? String(
              (dl as { address?: string }).address ||
                (dl as { name?: string }).name ||
                (dl as { label?: string }).label ||
                ''
            )
          : '';
    const first = line.split(',')[0]?.trim() || line.trim() || 'Drop';
    return first.length > 18 ? `${first.slice(0, 16)}…` : first;
  }, [hasEmbeddedOffer, embeddedOfferTrip, offerTripKey]);

  const offerRouteSplit = useMemo(() => {
    const coords = offerRouteLatLng;
    if (coords.length < 2) {
      return {
        first: [] as typeof coords,
        second: [] as typeof coords,
        mid: null as (typeof coords)[0] | null,
      };
    }
    const mid = Math.max(1, Math.floor(coords.length / 2));
    const first = coords.slice(0, mid + 1);
    const second = coords.slice(mid);
    const midCoord = coords[Math.floor((coords.length - 1) / 2)] ?? coords[0];
    return { first, second, mid: midCoord };
  }, [offerRouteLatLng]);

  const isFindingRide = isOnline && driverCanReceiveOffers && !activeTrip && !hasEmbeddedOffer;
  const showOnlineIdleChrome = isOnline && !activeTrip && !hasEmbeddedOffer;
  const onlineIdleMapPadBottom = useMemo(() => {
    if (!showOnlineIdleChrome) return 0;
    return Math.round(insets.bottom + 228);
  }, [showOnlineIdleChrome, insets.bottom]);
  const showLegacyTopBar = !showOnlineIdleChrome && !hasEmbeddedOffer && !activeTrip;
  const tripPhaseChromeTop = insets.top + 52;
  const tripPhaseChromeHeight = 72;

  const tripTargetCoord = useMemo(() => {
    const st = String(activeTrip?.status || '');
    if (st === 'ongoing') return dropCoord;
    return pickupCoord;
  }, [activeTrip?.status, pickupCoord?.lat, pickupCoord?.lng, dropCoord?.lat, dropCoord?.lng]);

  const tripEtaMin = useMemo(() => {
    if (!driverCoords || !tripTargetCoord) return null as number | null;
    const km = haversineKmDriver(
      { lat: driverCoords.lat, lng: driverCoords.lng },
      { lat: tripTargetCoord.lat, lng: tripTargetCoord.lng },
    );
    const min = Math.round((km / 26) * 60);
    if (!Number.isFinite(min)) return null;
    return min < 1 ? 1 : min > 180 ? null : min;
  }, [driverCoords?.lat, driverCoords?.lng, tripTargetCoord?.lat, tripTargetCoord?.lng]);

  const metersToTarget = useMemo(() => {
    if (!driverCoords || !tripTargetCoord) return null as number | null;
    return Math.round(haversineKmDriver(
      { lat: driverCoords.lat, lng: driverCoords.lng },
      { lat: tripTargetCoord.lat, lng: tripTargetCoord.lng },
    ) * 1000);
  }, [driverCoords?.lat, driverCoords?.lng, tripTargetCoord?.lat, tripTargetCoord?.lng]);

  const directionsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    (Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined) ||
    (Constants.expoConfig?.extra?.googleMapsDirectionsKey as string | undefined) ||
    '';

  const [routeStaticThumbErr, setRouteStaticThumbErr] = useState(false);
  const legStaticMapUri = useMemo(() => {
    if (!activeTrip || !directionsApiKey) return null;
    const st = String(activeTrip.status || '');
    const c = st === 'ongoing' ? dropCoord : pickupCoord;
    if (!c) return null;
    return buildStaticMapPinUrl(c.lat, c.lng, directionsApiKey);
  }, [activeTrip?.id, activeTrip?.status, pickupCoord, dropCoord, directionsApiKey]);

  useEffect(() => {
    setRouteStaticThumbErr(false);
  }, [legStaticMapUri]);

  const lastSnapReqRef = useRef<{ key: string; at: number } | null>(null);
  /** Prior snapped-route metrics (same trip + phase) to detect material reroutes / traffic shifts. */
  const prevRouteSnapMetaRef = useRef<{
    legKey: string;
    distanceM: number;
    durationSec: number;
  } | null>(null);
  const routeChangeAlertAtRef = useRef(0);
  const routeChangeBannerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [routeChangeBanner, setRouteChangeBanner] = useState<string | null>(null);
  const [snapRoutes, setSnapRoutes] = useState<Array<Array<{ latitude: number; longitude: number }>>>([]);
  const [snapPrimaryMeta, setSnapPrimaryMeta] = useState<{ distanceM: number; durationSec: number } | null>(
    null,
  );
  /** Full Directions steps for the active leg — index advances with GPS near step ends. */
  const [tripNavSteps, setTripNavSteps] = useState<NavStep[]>([]);
  const [navLegKey, setNavLegKey] = useState('');
  const [navStepIndex, setNavStepIndex] = useState(0);

  useEffect(() => {
    lastSnapReqRef.current = null;
    prevRouteSnapMetaRef.current = null;
    routeChangeAlertAtRef.current = 0;
    if (routeChangeBannerTimerRef.current) {
      clearTimeout(routeChangeBannerTimerRef.current);
      routeChangeBannerTimerRef.current = undefined;
    }
    setRouteChangeBanner(null);
    setTripNavSteps([]);
    setNavLegKey('');
    setNavStepIndex(0);
  }, [activeTrip?.id]);

  useEffect(() => {
    setNavStepIndex(0);
  }, [navLegKey]);

  useEffect(() => {
    if (!driverCoords || tripNavSteps.length === 0) return;
    setNavStepIndex((prev) => {
      const maxIdx = Math.max(0, tripNavSteps.length - 1);
      let idx = Math.min(prev, maxIdx);
      while (idx < tripNavSteps.length - 1) {
        const s = tripNavSteps[idx];
        const d = haversineM(driverCoords.lat, driverCoords.lng, s.endLat, s.endLng);
        if (d < NAV_STEP_END_PROXIMITY_M) idx += 1;
        else break;
      }
      return idx;
    });
  }, [driverCoords?.lat, driverCoords?.lng, tripNavSteps]);

  useEffect(() => {
    if (!directionsApiKey || !activeTrip?.id) {
      setSnapRoutes([]);
      setSnapPrimaryMeta(null);
      setTripNavSteps([]);
      setNavLegKey('');
      return;
    }
    const st = String(activeTrip.status || '');
    if (!['accepted', 'arrived', 'ongoing'].includes(st)) {
      setSnapRoutes([]);
      setSnapPrimaryMeta(null);
      setTripNavSteps([]);
      setNavLegKey('');
      return;
    }

    let oLat: number;
    let oLng: number;
    let dLat: number;
    let dLng: number;

    if (st === 'accepted') {
      if (!driverCoords || !pickupCoord) {
        setSnapRoutes([]);
        setSnapPrimaryMeta(null);
        setTripNavSteps([]);
        setNavLegKey('');
        return;
      }
      oLat = driverCoords.lat;
      oLng = driverCoords.lng;
      dLat = pickupCoord.lat;
      dLng = pickupCoord.lng;
    } else if (st === 'arrived') {
      const verified = !!(activeTrip.pickup_code_verified || activeTrip.security_code_verified);
      if (!verified) {
        setSnapRoutes([]);
        setSnapPrimaryMeta(null);
        setTripNavSteps([]);
        setNavLegKey('');
        return;
      }
      if (!driverCoords || !dropCoord) {
        setSnapRoutes([]);
        setSnapPrimaryMeta(null);
        setTripNavSteps([]);
        setNavLegKey('');
        return;
      }
      oLat = driverCoords.lat;
      oLng = driverCoords.lng;
      dLat = dropCoord.lat;
      dLng = dropCoord.lng;
    } else {
      if (!driverCoords || !dropCoord) {
        setSnapRoutes([]);
        setSnapPrimaryMeta(null);
        setTripNavSteps([]);
        setNavLegKey('');
        return;
      }
      oLat = driverCoords.lat;
      oLng = driverCoords.lng;
      dLat = dropCoord.lat;
      dLng = dropCoord.lng;
    }

    const reqKey = `${activeTrip.id}|${st}|${oLat.toFixed(3)},${oLng.toFixed(3)}→${dLat.toFixed(3)},${dLng.toFixed(3)}`;
    const prev = lastSnapReqRef.current;
    const minMs = st === 'arrived' && !(activeTrip.pickup_code_verified || activeTrip.security_code_verified) ? 78000 : 38000;
    if (prev && prev.key === reqKey && Date.now() - prev.at < minMs) {
      return;
    }

    let cancelled = false;
    fetchGoogleDrivingRoutes(oLat, oLng, dLat, dLng, directionsApiKey, {
      alternatives: st === 'accepted' || st === 'ongoing',
    })
      .then((res) => {
        if (cancelled || !res?.routes?.length) return;
        lastSnapReqRef.current = { key: reqKey, at: Date.now() };
        setSnapRoutes(res.routes.map((r) => r.overview));
        const leg = res.routes[0];
        const newDist = leg.distanceM;
        const newDur = leg.durationSec;
        const legKey = `${activeTrip.id}|${st}`;
        const prevMeta = prevRouteSnapMetaRef.current;
        if (
          prevMeta &&
          prevMeta.legKey === legKey &&
          prevMeta.distanceM > 80 &&
          prevMeta.durationSec > 30
        ) {
          const dDist = Math.abs(newDist - prevMeta.distanceM);
          const dDur = Math.abs(newDur - prevMeta.durationSec);
          const baseD = Math.max(prevMeta.distanceM, 300);
          const baseT = Math.max(prevMeta.durationSec, 90);
          const significant =
            dDur >= 120 || dDist >= 500 || dDur / baseT >= 0.18 || dDist / baseD >= 0.14;
          if (significant && Date.now() - routeChangeAlertAtRef.current > 80000) {
            routeChangeAlertAtRef.current = Date.now();
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            const etaMin = Math.max(1, Math.ceil(newDur / 60));
            const kmStr = (newDist / 1000).toFixed(1);
            void notificationService.sendLocalNotification({
              type: 'route_updated',
              title: 'Route updated',
              body: `Your path or ETA changed (traffic or roads). About ${etaMin} min · ${kmStr} km along the route.`,
              data: { trip_id: activeTrip.id, phase: st },
            });
            if (routeChangeBannerTimerRef.current) {
              clearTimeout(routeChangeBannerTimerRef.current);
            }
            setRouteChangeBanner('Route recalculated — follow the updated line on the map.');
            routeChangeBannerTimerRef.current = setTimeout(() => {
              setRouteChangeBanner(null);
              routeChangeBannerTimerRef.current = undefined;
            }, 12000);
          }
        }
        prevRouteSnapMetaRef.current = { legKey, distanceM: newDist, durationSec: newDur };
        setSnapPrimaryMeta({ distanceM: newDist, durationSec: newDur });
        void fetchDirections(oLat, oLng, dLat, dLng, directionsApiKey).then((dir) => {
          if (cancelled) return;
          if (!dir?.steps?.length) {
            setTripNavSteps([]);
            setNavLegKey('');
            return;
          }
          setNavLegKey(reqKey);
          setTripNavSteps(dir.steps);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSnapRoutes([]);
          setSnapPrimaryMeta(null);
          setTripNavSteps([]);
          setNavLegKey('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    directionsApiKey,
    activeTrip?.id,
    activeTrip?.status,
    driverCoords?.lat,
    driverCoords?.lng,
    pickupCoord?.lat,
    pickupCoord?.lng,
    dropCoord?.lat,
    dropCoord?.lng,
    activeTrip?.pickup_code_verified,
    activeTrip?.security_code_verified,
  ]);

  const snapDistKm = useMemo(() => {
    if (!snapPrimaryMeta?.distanceM || snapPrimaryMeta.distanceM <= 0) return null;
    return snapPrimaryMeta.distanceM / 1000;
  }, [snapPrimaryMeta?.distanceM]);

  const snapEtaMin = useMemo(() => {
    if (!snapPrimaryMeta?.durationSec || snapPrimaryMeta.durationSec <= 0) return null;
    const m = Math.ceil(snapPrimaryMeta.durationSec / 60);
    if (!Number.isFinite(m)) return null;
    return m < 1 ? 1 : m > 240 ? null : m;
  }, [snapPrimaryMeta?.durationSec]);

  /** Road-snapped line for active navigation leg. */
  const primaryLineCoords = useMemo(() => {
    const st = String(activeTrip?.status || '');
    const pv = !!(activeTrip?.pickup_code_verified || activeTrip?.security_code_verified);
    if (st === 'arrived' && !pv) return [];
    const snap0 = snapRoutes[0];
    if (snap0 && snap0.length >= 2) return snap0;
    if ((st === 'ongoing' || (st === 'arrived' && pv)) && routeCoords.length >= 2) return routeCoords;
    return [];
  }, [
    snapRoutes,
    routeCoords,
    activeTrip?.status,
    activeTrip?.pickup_code_verified,
    activeTrip?.security_code_verified,
  ]);

  const alternateLineCoords = useMemo(
    () => snapRoutes.slice(1).filter((seg) => seg.length >= 2),
    [snapRoutes],
  );

  const dashedDriverPickup = (() => {
    const st = String(activeTrip?.status || '');
    const pv = !!(activeTrip?.pickup_code_verified || activeTrip?.security_code_verified);
    return (
      (st === 'accepted' || (st === 'arrived' && !pv)) &&
      primaryLineCoords.length < 2 &&
      (st === 'arrived' || routeCoords.length < 2) &&
      Boolean(driverCoords && pickupCoord)
    );
  })();

  const arrivalEligible =
    String(activeTrip?.status || '') === 'accepted' &&
    metersToTarget != null &&
    metersToTarget <= PICKUP_ARRIVAL_RADIUS_M;

  const handleMarkArrivedPress = useCallback(() => {
    if (!onTripMarkArrived) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!arrivalEligible && metersToTarget != null && metersToTarget > PICKUP_ARRIVAL_RADIUS_M) {
      Alert.alert(
        "I've arrived?",
        `You're about ${Math.round(metersToTarget)} m from the pickup pin. Confirm only when you're at the pin so the rider gets an accurate alert.`,
        [
          { text: 'Not yet', style: 'cancel' },
          { text: "I'm at pickup", onPress: () => void onTripMarkArrived() },
        ],
      );
      return;
    }
    void onTripMarkArrived();
  }, [onTripMarkArrived, arrivalEligible, metersToTarget]);

  const displayTripEtaMin = useMemo(() => {
    const st = String(activeTrip?.status || '');
    if (!activeTrip) return null as number | null;
    if (st === 'accepted' || st === 'ongoing') return snapEtaMin ?? tripEtaMin;
    if (st === 'arrived') return snapEtaMin ?? tripEtaMin;
    return tripEtaMin;
  }, [activeTrip?.id, activeTrip?.status, snapEtaMin, tripEtaMin]);

  const [driverLegCountdownSec, setDriverLegCountdownSec] = useState<number | null>(null);
  useEffect(() => {
    const st = String(activeTrip?.status || '');
    const pv = !!(activeTrip?.pickup_code_verified || activeTrip?.security_code_verified);
    if (st !== 'accepted' && st !== 'ongoing' && !(st === 'arrived' && pv)) {
      setDriverLegCountdownSec(null);
      return;
    }
    if (!snapPrimaryMeta?.durationSec || snapPrimaryMeta.durationSec <= 0) {
      setDriverLegCountdownSec(null);
      return;
    }
    setDriverLegCountdownSec(Math.min(Math.ceil(snapPrimaryMeta.durationSec), 7200));
  }, [activeTrip?.id, activeTrip?.status, activeTrip?.pickup_code_verified, activeTrip?.security_code_verified, snapPrimaryMeta?.durationSec]);

  useEffect(() => {
    if (driverLegCountdownSec == null || driverLegCountdownSec <= 0) return;
    const id = setInterval(() => {
      setDriverLegCountdownSec((prev) => (prev != null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(id);
  }, [driverLegCountdownSec === null, activeTrip?.id]);

  const navigatePrimaryTitle = useMemo(() => {
    const st = String(activeTrip?.status || '');
    if (st === 'accepted') return 'Navigate to pickup';
    if (st === 'arrived') {
      const pv = !!(activeTrip?.pickup_code_verified || activeTrip?.security_code_verified);
      return pv ? 'Navigate to drop-off' : 'Navigate to pickup';
    }
    if (st === 'ongoing') return 'Navigate to drop-off';
    return Platform.OS === 'ios' ? 'Open Apple Maps' : 'Open Google Maps';
  }, [activeTrip?.status, activeTrip?.pickup_code_verified, activeTrip?.security_code_verified]);

  const navigatePrimaryHint = useMemo(() => {
    const st = String(activeTrip?.status || '');
    if (st === 'accepted') {
      return Platform.OS === 'ios'
        ? 'Turn-by-turn in Maps'
        : 'Turn-by-turn in Google Maps';
    }
    return 'Traffic-aware routing in Maps';
  }, [activeTrip?.status]);

  const driverDockCountdownColor = useMemo(() => {
    const s = driverLegCountdownSec;
    if (s == null || s <= 0) return '#94A3B8';
    if (s > 300) return '#22C55E';
    if (s >= 120) return '#EAB308';
    return '#EF4444';
  }, [driverLegCountdownSec]);

  const pickupAddrLine = useMemo(
    () => readLocationAddress(activeTrip?.pickup_location),
    [activeTrip?.pickup_location],
  );
  const pickupAddrShort = useMemo(() => {
    const a = pickupAddrLine?.trim();
    if (!a) return '';
    const first = a.split(',')[0]?.trim() || a;
    return first.length > 22 ? `${first.slice(0, 20)}…` : first;
  }, [pickupAddrLine]);
  const dropAddrLine = useMemo(
    () => readLocationAddress(activeTrip?.dropoff_location),
    [activeTrip?.dropoff_location],
  );
  const dropAddrShort = useMemo(() => {
    const a = dropAddrLine?.trim();
    if (!a) return '';
    const first = a.split(',')[0]?.trim() || a;
    return first.length > 18 ? `${first.slice(0, 16)}…` : first;
  }, [dropAddrLine]);

  const startTripRouteSummary = useMemo(() => {
    const p = pickupAddrShort || 'Pickup';
    const d = dropAddrShort || 'Drop-off';
    const km = snapDistKm ?? (activeTrip?.distance_km != null ? Number(activeTrip.distance_km) : null);
    const kmPart =
      km != null && Number.isFinite(Number(km))
        ? ` | ${Number(km) < 1 ? `${Math.round(Number(km) * 1000)} m` : `${Number(km).toFixed(1)} km`}`
        : '';
    const eta = displayTripEtaMin != null ? ` | ~${displayTripEtaMin} min` : '';
    return `${p} → ${d}${kmPart}${eta}`;
  }, [pickupAddrShort, dropAddrShort, snapDistKm, activeTrip?.distance_km, displayTripEtaMin]);

  const startTripDistanceLabel = useMemo(() => {
    const km = snapDistKm ?? (activeTrip?.distance_km != null ? Number(activeTrip.distance_km) : null);
    if (km != null && Number.isFinite(km)) return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    return '—';
  }, [snapDistKm, activeTrip?.distance_km]);

  const startTripDurationLabel = useMemo(() => {
    if (displayTripEtaMin != null) return `~${displayTripEtaMin} min`;
    const dm = activeTrip?.duration_mins;
    if (dm != null && Number.isFinite(Number(dm))) return `~${Math.round(Number(dm))} min`;
    return '—';
  }, [displayTripEtaMin, activeTrip?.duration_mins]);

  const startTripFareLabel = useMemo(() => {
    if (activeTrip?.fare != null && Number(activeTrip.fare) > 0)
      return `₦${Math.round(Number(activeTrip.fare)).toLocaleString()}`;
    return '—';
  }, [activeTrip?.fare]);

  const vehicleDisplayLine = useMemo(() => {
    const color = activeTrip?.vehicle_color != null ? String(activeTrip.vehicle_color).trim() : '';
    const model = activeTrip?.vehicle_model != null ? String(activeTrip.vehicle_model).trim() : '';
    const plate = activeTrip?.vehicle_plate != null ? String(activeTrip.vehicle_plate).trim() : '';
    if (!model && !plate && !color) return null;
    const left = [color, model].filter(Boolean).join(' ');
    if (plate) return `${left}${left ? ' | ' : ''}${plate}`;
    return left || null;
  }, [activeTrip?.vehicle_color, activeTrip?.vehicle_model, activeTrip?.vehicle_plate]);

  const isHeadingToPickup = String(activeTrip?.status || '') === 'accepted';

  /** While en route to pickup, show full A→B corridor on the map (green route preview). */
  const showPickupFullRoute = isHeadingToPickup && routeCoords.length >= 2;

  /** Fainter context when road-snapped leg exists alongside preview */
  const showTripContextPolyline =
    isHeadingToPickup &&
    (snapRoutes[0]?.length ?? 0) >= 2 &&
    routeCoords.length >= 3 &&
    !showPickupFullRoute;

  const pickupCodeRequired = activeTrip?.pickup_code_required !== false;
  const rawPickupVerifiedAtPickup = !!(
    activeTrip?.pickup_code_verified || activeTrip?.security_code_verified
  );
  const pickupVerifiedAtPickup = rawPickupVerifiedAtPickup || !pickupCodeRequired;
  const isArrivedPhase = String(activeTrip?.status || '') === 'arrived';
  const isWaitingAtPickupNoCode =
    isArrivedPhase && pickupCodeRequired && !rawPickupVerifiedAtPickup;
  const isReadyToStartTrip = isArrivedPhase && pickupVerifiedAtPickup;

  /** Full A→B corridor on map while waiting at pickup (map-first pickup screen). */
  const arrivedFullRouteCoords = useMemo(() => {
    if (!isWaitingAtPickupNoCode) return [] as { latitude: number; longitude: number }[];
    if (routeCoords.length >= 2) return routeCoords;
    const snap0 = snapRoutes[0];
    if (snap0 && snap0.length >= 2) return snap0;
    if (pickupCoord && dropCoord) {
      return [
        { latitude: pickupCoord.lat, longitude: pickupCoord.lng },
        { latitude: dropCoord.lat, longitude: dropCoord.lng },
      ];
    }
    return [];
  }, [
    isWaitingAtPickupNoCode,
    routeCoords,
    snapRoutes,
    pickupCoord?.lat,
    pickupCoord?.lng,
    dropCoord?.lat,
    dropCoord?.lng,
  ]);

  useEffect(() => {
    if (!isWaitingAtPickupNoCode || !mapReady || !mapRef.current) return;
    const pts: { latitude: number; longitude: number }[] = [];
    if (driverCoords) pts.push({ latitude: driverCoords.lat, longitude: driverCoords.lng });
    if (pickupCoord) pts.push({ latitude: pickupCoord.lat, longitude: pickupCoord.lng });
    if (dropCoord) pts.push({ latitude: dropCoord.lat, longitude: dropCoord.lng });
    if (pts.length < 2) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(pts, {
          edgePadding: {
            top: insets.top + 64,
            right: 44,
            bottom: insets.bottom + (arrivedDockExpanded ? Math.round(winHeight * 0.52) : 96),
            left: 44,
          },
          animated: true,
        });
      } catch {
        /* noop */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [
    isWaitingAtPickupNoCode,
    activeTrip?.id,
    mapReady,
    driverCoords?.lat,
    driverCoords?.lng,
    pickupCoord?.lat,
    dropCoord?.lat,
    arrivedDockExpanded,
    insets.top,
    insets.bottom,
    winHeight,
  ]);

  const isOngoingTrip = String(activeTrip?.status || '') === 'ongoing';

  const ongoingFareDisplayLabel = useMemo(() => {
    if (!isOngoingTrip) return startTripFareLabel;
    if (activeTrip?.fare != null && Number.isFinite(Number(activeTrip.fare)))
      return `₦${Math.round(Number(activeTrip.fare)).toLocaleString()}`;
    return startTripFareLabel;
  }, [isOngoingTrip, activeTrip?.fare, startTripFareLabel, activeTrip?.id]);

  const distKmForPickupUi = useMemo(() => {
    if (!isHeadingToPickup) return null;
    if (metersToTarget != null && Number.isFinite(metersToTarget)) return metersToTarget / 1000;
    const d = activeTrip?.distance_to_next_km;
    if (d != null && Number.isFinite(Number(d))) return Number(d);
    return null;
  }, [isHeadingToPickup, activeTrip?.distance_to_next_km, metersToTarget, activeTrip?.id]);

  useEffect(() => {
    if (isHeadingToPickup) setPickupNavDockExpanded(true);
  }, [activeTrip?.id]);

  useEffect(() => {
    if (isWaitingAtPickupNoCode) setArrivedDockExpanded(false);
  }, [activeTrip?.id, isWaitingAtPickupNoCode]);

  useEffect(() => {
    if (isReadyToStartTrip) setStartTripDockExpanded(true);
  }, [activeTrip?.id, isReadyToStartTrip]);

  useEffect(() => {
    if (isOngoingTrip) setOngoingDockExpanded(true);
  }, [activeTrip?.id, isOngoingTrip]);

  const pickupDetailSubline = useMemo(() => {
    const full = pickupAddrLine?.trim();
    if (!full) return '';
    const parts = full.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    const short = pickupAddrShort.trim();
    const rest = parts.slice(1).join(', ');
    if (!rest) return '';
    if (short && rest.toLowerCase().startsWith(short.toLowerCase())) {
      return rest.length > short.length ? rest.slice(short.length).replace(/^,\s*/, '').trim() : rest;
    }
    return `Near ${rest}`;
  }, [pickupAddrLine, pickupAddrShort]);

  const dropDetailSubline = useMemo(() => {
    const full = dropAddrLine?.trim();
    if (!full) return '';
    const parts = full.split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    const short = dropAddrShort.trim();
    const rest = parts.slice(1).join(', ');
    if (!rest) return '';
    if (short && rest.toLowerCase().startsWith(short.toLowerCase())) {
      return rest.length > short.length ? rest.slice(short.length).replace(/^,\s*/, '').trim() : rest;
    }
    return `Near ${rest}`;
  }, [dropAddrLine, dropAddrShort]);

  const ongoingDistanceLabel = useMemo(() => {
    if (!isOngoingTrip) return '—';
    if (metersToTarget != null && Number.isFinite(metersToTarget))
      return metersToTarget < 1000 ? `${Math.round(metersToTarget)} m` : `${(metersToTarget / 1000).toFixed(1)} km`;
    const sk = snapDistKm;
    if (sk != null && Number.isFinite(sk)) return sk < 1 ? `${Math.round(sk * 1000)} m` : `${sk.toFixed(1)} km`;
    const d = activeTrip?.distance_to_next_km;
    if (d != null && Number.isFinite(Number(d))) return Number(d) < 1 ? `${Math.round(Number(d) * 1000)} m` : `${Number(d).toFixed(1)} km`;
    return '—';
  }, [isOngoingTrip, metersToTarget, snapDistKm, activeTrip?.distance_to_next_km, activeTrip?.id]);

  const ongoingEtaToDropLabel = useMemo(() => {
    if (!isOngoingTrip) return '—';
    if (displayTripEtaMin != null) return `~${displayTripEtaMin} min`;
    return 'Follow Maps';
  }, [isOngoingTrip, displayTripEtaMin, activeTrip?.id]);

  const ongoingRemainingKm = useMemo(() => {
    if (!isOngoingTrip) return null;
    if (metersToTarget != null && Number.isFinite(metersToTarget)) return metersToTarget / 1000;
    const sk = snapDistKm;
    if (sk != null && Number.isFinite(sk)) return sk;
    const d = activeTrip?.distance_to_next_km;
    return d != null && Number.isFinite(Number(d)) ? Number(d) : null;
  }, [isOngoingTrip, metersToTarget, snapDistKm, activeTrip?.distance_to_next_km, activeTrip?.id]);

  const ongoingTripProgressPercent = useMemo(() => {
    const total = activeTrip?.distance_km;
    return driverTripProgressPercent(
      total != null ? Number(total) : null,
      ongoingRemainingKm,
    );
  }, [activeTrip?.distance_km, ongoingRemainingKm, activeTrip?.id]);

  const fareBreakdownLineOngoing = useMemo(() => {
    if (!isOngoingTrip || !activeTrip) return null;
    const b = activeTrip.base_fare != null ? Math.round(Number(activeTrip.base_fare)) : null;
    const d = activeTrip.distance_fee != null ? Math.round(Number(activeTrip.distance_fee)) : null;
    const t = activeTrip.time_fee != null ? Math.round(Number(activeTrip.time_fee)) : null;
    const parts: string[] = [];
    if (b != null && b > 0) parts.push(`Base ₦${b.toLocaleString()}`);
    if (d != null && d > 0) parts.push(`Distance ₦${d.toLocaleString()}`);
    if (t != null && t > 0) parts.push(`Time ₦${t.toLocaleString()}`);
    return parts.length ? parts.join(' + ') : null;
  }, [isOngoingTrip, activeTrip?.base_fare, activeTrip?.distance_fee, activeTrip?.time_fee, activeTrip?.id]);

  const lastOngoingFareTripIdRef = useRef<string | null>(null);
  const lastOngoingFareAmountRef = useRef<number | null>(null);
  const [ongoingFareDeltaLabel, setOngoingFareDeltaLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!isOngoingTrip || !activeTrip?.id) {
      setOngoingFareDeltaLabel(null);
      lastOngoingFareTripIdRef.current = null;
      lastOngoingFareAmountRef.current = null;
      return;
    }
    if (lastOngoingFareTripIdRef.current !== activeTrip.id) {
      lastOngoingFareTripIdRef.current = activeTrip.id;
      lastOngoingFareAmountRef.current =
        activeTrip.fare != null && Number.isFinite(Number(activeTrip.fare))
          ? Math.round(Number(activeTrip.fare))
          : null;
      setOngoingFareDeltaLabel(null);
      return;
    }
    const n =
      activeTrip.fare != null && Number.isFinite(Number(activeTrip.fare)) ? Math.round(Number(activeTrip.fare)) : null;
    const prev = lastOngoingFareAmountRef.current;
    lastOngoingFareAmountRef.current = n;
    if (n != null && prev != null && n > prev) {
      setOngoingFareDeltaLabel(`↗ ₦${(n - prev).toLocaleString()} just now`);
    }
  }, [isOngoingTrip, activeTrip?.id, activeTrip?.fare]);

  const arrivedAtMs = useMemo(() => parseTripIsoMs(activeTrip?.arrived_at), [activeTrip?.arrived_at]);
  const startedAtMs = useMemo(() => parseTripIsoMs(activeTrip?.started_at), [activeTrip?.started_at]);

  /** When server omits arrived_at, anchor wait time to first render of this arrived trip. */
  const arrivedWaitAnchorRef = useRef<{ tripId: string; ms: number } | null>(null);

  const [pickupWaitSec, setPickupWaitSec] = useState(0);
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (String(activeTrip?.status) !== 'arrived' || !tripId) {
      arrivedWaitAnchorRef.current = null;
      setPickupWaitSec(0);
      return;
    }
    let anchorMs = arrivedAtMs;
    if (!Number.isFinite(anchorMs)) {
      if (arrivedWaitAnchorRef.current?.tripId !== tripId) {
        arrivedWaitAnchorRef.current = { tripId, ms: Date.now() };
      }
      anchorMs = arrivedWaitAnchorRef.current.ms;
    } else {
      arrivedWaitAnchorRef.current = { tripId, ms: anchorMs };
    }
    const tick = () => {
      const now = Date.now();
      let sec = Math.floor((now - anchorMs) / 1000);
      const clientMs = arrivedWaitAnchorRef.current?.tripId === tripId ? arrivedWaitAnchorRef.current.ms : now;
      if (sec > 45 * 60 || sec < 0) {
        sec = Math.floor((now - clientMs) / 1000);
      }
      setPickupWaitSec(Math.max(0, Math.min(sec, 99 * 60)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTrip?.status, activeTrip?.id, arrivedAtMs]);

  const [tripLegSec, setTripLegSec] = useState(0);
  // Client anchor used when started_at hasn't synced yet from backend
  const tripStartClientRef = useRef<number | null>(null);
  useEffect(() => {
    const isOngoing = String(activeTrip?.status) === 'ongoing';
    if (!isOngoing) {
      setTripLegSec(0);
      tripStartClientRef.current = null;
      return;
    }
    // Prefer server-provided started_at; fall back to client anchor
    let anchor: number;
    if (Number.isFinite(startedAtMs) && startedAtMs > 0) {
      anchor = startedAtMs;
      tripStartClientRef.current = null; // server time is authoritative
    } else {
      if (tripStartClientRef.current == null) {
        tripStartClientRef.current = Date.now();
      }
      anchor = tripStartClientRef.current;
    }
    const tick = () => setTripLegSec(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTrip?.status, activeTrip?.id, startedAtMs]);

  const activeTripPhase = useMemo((): DriverTripPhase | null => {
    if (isHeadingToPickup) return 'heading_pickup';
    if (isWaitingAtPickupNoCode) return 'arrived';
    if (isReadyToStartTrip) return 'rider_in_car';
    if (isOngoingTrip) return 'ongoing';
    return null;
  }, [isHeadingToPickup, isWaitingAtPickupNoCode, isReadyToStartTrip, isOngoingTrip]);

  const tripPhaseMetricPrimary = useMemo(() => {
    if (activeTripPhase === 'heading_pickup' && distKmForPickupUi != null && Number.isFinite(distKmForPickupUi)) {
      return distKmForPickupUi < 1
        ? `${Math.round(distKmForPickupUi * 1000)} m away`
        : `${distKmForPickupUi.toFixed(1)} km away`;
    }
    if (activeTripPhase === 'ongoing' && ongoingDistanceLabel !== '—') return ongoingDistanceLabel;
    return null;
  }, [activeTripPhase, distKmForPickupUi, ongoingDistanceLabel]);

  const tripPhaseMetricSecondary = useMemo(() => {
    if (activeTripPhase === 'heading_pickup' && displayTripEtaMin != null) {
      return `ETA ~${displayTripEtaMin} min`;
    }
    if (activeTripPhase === 'ongoing' && ongoingEtaToDropLabel !== '—') return ongoingEtaToDropLabel;
    if (activeTripPhase === 'arrived' && pickupWaitSec > 0) {
      return `Waiting ${formatPickupWaitLabel(pickupWaitSec)}`;
    }
    return null;
  }, [activeTripPhase, displayTripEtaMin, ongoingEtaToDropLabel, pickupWaitSec]);

  const currentNavStep = useMemo(() => {
    if (!tripNavSteps.length) return null;
    const i = Math.min(Math.max(0, navStepIndex), tripNavSteps.length - 1);
    return tripNavSteps[i];
  }, [tripNavSteps, navStepIndex]);

  const followingNavStep = useMemo(() => {
    const i = Math.min(Math.max(0, navStepIndex), Math.max(0, tripNavSteps.length - 1));
    return tripNavSteps[i + 1] ?? null;
  }, [tripNavSteps, navStepIndex]);

  const navRemainingToStepEndM = useMemo(() => {
    if (!currentNavStep || !driverCoords) return null;
    return haversineM(
      driverCoords.lat,
      driverCoords.lng,
      currentNavStep.endLat,
      currentNavStep.endLng,
    );
  }, [currentNavStep, driverCoords?.lat, driverCoords?.lng]);

  const navAccentColor = useMemo(
    () => (currentNavStep ? maneuverToColor(currentNavStep.maneuver) : '#1DFFA0'),
    [currentNavStep],
  );

  const mapScreenPadding = useMemo(
    () => ({
      top:
        insets.top +
        (activeTrip
          ? isWaitingAtPickupNoCode
            ? 56
            : isHeadingToPickup
              ? 72
              : isReadyToStartTrip || isOngoingTrip
                ? 172
                : 134
          : showOnlineIdleChrome
            ? 108
            : 124),
      right: 12,
      bottom: activeTrip
        ? isHeadingToPickup
          ? pickupNavDockExpanded
            ? insets.bottom + 300
            : insets.bottom + 88
          : isWaitingAtPickupNoCode
            ? arrivedDockExpanded
              ? insets.bottom + Math.round(winHeight * 0.5) + 16
              : insets.bottom + 88
            : isReadyToStartTrip
              ? startTripDockExpanded
                ? insets.bottom + 400
                : insets.bottom + 96
              : isOngoingTrip
                ? ongoingDockExpanded
                  ? insets.bottom + 400
                  : insets.bottom + 96
                : insets.bottom + 432
        : hasEmbeddedOffer
          ? insets.bottom + 300
          : isOnline && !activeTrip
            ? showOnlineIdleChrome
              ? onlineIdleMapPadBottom
              : insets.bottom + 210
            : insets.bottom + 108,
      left: showOnlineIdleChrome ? 58 : 12,
    }),
    [
      insets.top,
      insets.bottom,
      showOnlineIdleChrome,
      !!activeTrip,
      isHeadingToPickup,
      isWaitingAtPickupNoCode,
      isReadyToStartTrip,
      isOngoingTrip,
      pickupNavDockExpanded,
      arrivedDockExpanded,
      startTripDockExpanded,
      ongoingDockExpanded,
      hasEmbeddedOffer,
      isOnline,
      showOnlineIdleChrome,
      onlineIdleMapPadBottom,
      winHeight,
    ],
  );

  const floatControlsBottom = activeTrip
    ? isHeadingToPickup
      ? pickupNavDockExpanded
        ? insets.bottom + 292
        : insets.bottom + 80
      : isWaitingAtPickupNoCode
        ? arrivedDockExpanded
          ? insets.bottom + Math.round(winHeight * 0.5)
          : insets.bottom + 76
        : isReadyToStartTrip
          ? startTripDockExpanded
            ? insets.bottom + 388
            : insets.bottom + 84
          : isOngoingTrip
            ? ongoingDockExpanded
              ? insets.bottom + 388
              : insets.bottom + 84
            : insets.bottom + 418
    : hasEmbeddedOffer
      ? insets.bottom + 280
      : isOnline && !activeTrip
        ? showOnlineIdleChrome
          ? onlineIdleMapPadBottom + 12
          : insets.bottom + 188
        : insets.bottom + 100;

  useEffect(() => {
    if (!activeTrip?.id || !mapReady || !cameraUnlocked || !mapRef.current) return;
    const pts: { latitude: number; longitude: number }[] = [];
    if (driverCoords && Number.isFinite(driverCoords.lat)) {
      pts.push({ latitude: driverCoords.lat, longitude: driverCoords.lng });
    }
    if (pickupCoord) pts.push({ latitude: pickupCoord.lat, longitude: pickupCoord.lng });
    const tripSt = String(activeTrip.status || '');
    const arrivedVerified =
      tripSt === 'arrived' &&
      !!(activeTrip.pickup_code_verified || activeTrip.security_code_verified);
    if (
      dropCoord &&
      ['accepted', 'arrived', 'ongoing', 'pending_payment'].includes(tripSt) &&
      (tripSt !== 'arrived' || arrivedVerified || isWaitingAtPickupNoCode)
    ) {
      pts.push({ latitude: dropCoord.lat, longitude: dropCoord.lng });
    }
    if (pts.length < 2) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(pts, {
          edgePadding: {
            top: activeTrip
              ? isHeadingToPickup
                ? insets.top + 72
                : tripPhaseChromeTop + tripPhaseChromeHeight + 24
              : 116,
            right: 36,
            bottom: activeTrip
              ? isHeadingToPickup
                ? insets.bottom + (pickupNavDockExpanded ? 300 : 100)
                : 420
              : 276,
            left: 36,
          },
          animated: true,
        });
      } catch { /* noop */ }
    }, 500);
    return () => clearTimeout(t);
  }, [
    activeTrip?.id,
    activeTrip?.status,
    activeTrip?.pickup_code_verified,
    activeTrip?.security_code_verified,
    !!activeTrip,
    mapReady,
    cameraUnlocked,
    driverCoords?.lat,
    driverCoords?.lng,
    pickupCoord?.lat,
    dropCoord?.lat,
    isHeadingToPickup,
    pickupNavDockExpanded,
    insets.top,
    insets.bottom,
  ]);

  useEffect(() => {
    if (!hasEmbeddedOffer || !mapReady || !cameraUnlocked || !mapRef.current) return;
    const pts: { latitude: number; longitude: number }[] = [];
    if (driverCoords && Number.isFinite(driverCoords.lat)) {
      pts.push({ latitude: driverCoords.lat, longitude: driverCoords.lng });
    }
    if (offerPickupCoord) pts.push({ latitude: offerPickupCoord.lat, longitude: offerPickupCoord.lng });
    if (offerDropCoord) pts.push({ latitude: offerDropCoord.lat, longitude: offerDropCoord.lng });
    if (pts.length < 2) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(pts, {
          edgePadding: { top: 150, right: 36, bottom: 360, left: 36 },
          animated: true,
        });
      } catch {
        /* noop */
      }
    }, 450);
    return () => clearTimeout(t);
  }, [
    hasEmbeddedOffer,
    offerTripKey,
    mapReady,
    cameraUnlocked,
    driverCoords?.lat,
    driverCoords?.lng,
    offerPickupCoord?.lat,
    offerDropCoord?.lat,
  ]);

  /* ── Earnings display ── */
  const earningsDisplay = todayEarnings >= 1000
    ? `₦${(todayEarnings / 1000).toFixed(1)}k`
    : `₦${todayEarnings.toLocaleString()}`;

  /* ── Fallback region — always finite lat/lng + valid deltas ── */
  const initialRegion = useMemo(() => {
    const lat = Number(driverCoords?.lat);
    const lng = Number(driverCoords?.lng);
    return {
      latitude: Number.isFinite(lat) ? lat : LAGOS_MAP_REGION_FALLBACK.latitude,
      longitude: Number.isFinite(lng) ? lng : LAGOS_MAP_REGION_FALLBACK.longitude,
      latitudeDelta: LAGOS_MAP_REGION_FALLBACK.latitudeDelta,
      longitudeDelta: LAGOS_MAP_REGION_FALLBACK.longitudeDelta,
    };
  }, [driverCoords?.lat, driverCoords?.lng]);

  const onRegionChangeComplete = useCallback(
    (region: Region, details?: { isGesture?: boolean }) => {
      const now = Date.now();
      if (now - lastRegionChangeLogMs.current < 2500) return;
      lastRegionChangeLogMs.current = now;
      console.log('[NEXRYDE_MAP_SDK] onRegionChangeComplete', {
        platform: Platform.OS,
        isGesture: details?.isGesture,
        region,
      });
      logMapEvent('onRegionChangeComplete', {
        latitude: region.latitude,
        longitude: region.longitude,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
        isGesture: details?.isGesture,
      });
    },
    [logMapEvent]
  );

  /* ── Sonar pulse for finding chip ── */
  const sonarAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!showOnlineIdleChrome) {
      sonarAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sonarAnim, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(sonarAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showOnlineIdleChrome]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Outer ring for offline GO button ── */
  const goRingAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isOnline) { goRingAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goRingAnim, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(goRingAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline]); // eslint-disable-line

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webFallback]}>
        <Ionicons name="map" size={40} color="#22E5A0" />
        <Text style={styles.webText}>Live Map — Mobile Only</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Map error banner ── */}
      {mapError && (
        <View style={styles.mapErrorBanner}>
          <Ionicons name="warning-outline" size={16} color="#F59E0B" />
          <View style={styles.mapErrorTextCol}>
            <Text style={styles.mapErrorText}>
              {mapSdkErrorDetail
                ? 'Google Maps SDK error — native payload below.'
                : 'Map tiles unavailable — verify billing, enabled APIs, API key restrictions, and SHA-1 for com.nexryde.app in Google Cloud.'}
            </Text>
            {mapSdkErrorDetail ? (
              <Text style={styles.mapErrorDetail} selectable numberOfLines={12}>
                {mapSdkErrorDetail}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity style={styles.mapRetryAction} onPress={retryGoogleTiles} activeOpacity={0.85}>
            <Text style={styles.mapRetryActionText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapErrorAction}
            onPress={() => {
              setUseDefaultMapStyle(true);
              setUseTileFallback(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.mapErrorActionText}>Load fallback tiles</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Map canvas: pinned below UI overlays (never paint a full-screen blocker above this). */}
      <View style={styles.mapCanvas} collapsable={false}>
      <MapView
        key={useTileFallback ? 'map-fallback' : 'map-google'}
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={useDefaultMapStyle ? undefined : NEXRYDE_MAP_STYLE}
        mapType={useTileFallback ? 'none' : 'standard'}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsScale={false}
        rotateEnabled={true}
        pitchEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
        toolbarEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
        onMapReady={() => {
          startupLog('MAP_READY', { platform: Platform.OS });
          console.log('✅ MAP READY - Google Maps initialized successfully');
          setMapReady(true);
          console.log('[NEXRYDE_MAP_SDK] onMapReady', {
            platform: Platform.OS,
            initialRegion,
          });
          logMapEvent('onMapReady', { initialRegion });
        }}
        onMapLoaded={() => {
          setMapLoaded(true);
          if (!useTileFallback) {
            setMapError(false);
            setMapSdkErrorDetail(null);
          }
          console.log('[NEXRYDE_MAP_SDK] onMapLoaded', { platform: Platform.OS });
          logMapEvent('onMapLoaded');
        }}
        // @ts-expect-error react-native-maps types omit native onMapLoadingError
        onMapLoadingError={(error: NativeSyntheticEvent<Record<string, unknown>>) => {
          try {
            console.error('🔴 MAP LOADING ERROR:', JSON.stringify(error, null, 2));
          } catch {
            console.error('🔴 MAP LOADING ERROR (event not JSON-serializable):', error);
          }
          console.error('🔴 Error details:', error.nativeEvent);
          const ne = error.nativeEvent as Record<string, unknown> | undefined;
          console.error('🔴 Error message:', ne?.message);
          console.error('🔴 Error code:', ne?.code);

          const detail = serializeMapsNativePayload(error) || '(no nativeEvent — check adb logcat for Google/AndroidRuntime)';
          setMapError(true);
          setMapSdkErrorDetail(detail);
          setUseDefaultMapStyle(true);
          setUseTileFallback(true);
          console.warn('[NEXRYDE_MAP_SDK] onMapLoadingError', detail, error.nativeEvent);
          console.warn('[NEXRYDE_MAP_SDK] onMapError', { detail, nativeEvent: error.nativeEvent ?? null });
          logMapEvent('onMapLoadingError', { error: error.nativeEvent ?? null });
        }}
        // Native MapView may ignore onError if unsupported — kept for logging experiments
        onError={(error: unknown) => {
          console.error('🔴 MAPVIEW ERROR:', error);
        }}
        mapPadding={mapScreenPadding}
      >
        {/* Fallback tiles when Google tile service fails */}
        {useTileFallback && (
          <>
            <UrlTile
              urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maximumZ={19}
              flipY={false}
              zIndex={10}
              tileSize={256}
            />
            <UrlTile
              urlTemplate="https://b.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maximumZ={19}
              flipY={false}
              zIndex={11}
              tileSize={256}
            />
          </>
        )}

        {/* Full trip context (pickup → drop) while driving to A — under nav leg */}
        {showPickupFullRoute && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeColor="rgba(34,197,94,0.16)"
              strokeWidth={14}
              geodesic
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoords}
              strokeColor="#22C55E"
              strokeWidth={6}
              geodesic
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {showTripContextPolyline && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="rgba(148,163,184,0.32)"
            strokeWidth={4}
            geodesic
          />
        )}

        {/* Alternate legs from Directions (fainter blue) — hidden at pickup wait */}
        {!isWaitingAtPickupNoCode &&
          alternateLineCoords.map((coords, idx) => (
            <Polyline
              key={`alt-snap-${idx}`}
              coordinates={coords}
              strokeColor="rgba(66,133,244,0.35)"
              strokeWidth={4}
              geodesic
              lineCap="round"
              lineJoin="round"
            />
          ))}

        {/* At pickup: full trip corridor A→B (green) */}
        {isWaitingAtPickupNoCode && arrivedFullRouteCoords.length >= 2 ? (
          <>
            <Polyline
              coordinates={arrivedFullRouteCoords}
              strokeColor="rgba(34,197,94,0.18)"
              strokeWidth={14}
              geodesic
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={arrivedFullRouteCoords}
              strokeColor="#22C55E"
              strokeWidth={6}
              geodesic
              lineCap="round"
              lineJoin="round"
            />
          </>
        ) : null}

        {isWaitingAtPickupNoCode && driverCoords && pickupCoord ? (
          <Polyline
            coordinates={[
              { latitude: driverCoords.lat, longitude: driverCoords.lng },
              { latitude: pickupCoord.lat, longitude: pickupCoord.lng },
            ]}
            strokeColor="rgba(59,130,246,0.65)"
            strokeWidth={4}
            lineDashPattern={[10, 8]}
            geodesic
            lineCap="round"
          />
        ) : null}

        {/* Primary navigation leg — Google-style blue, road-snapped */}
        {!isWaitingAtPickupNoCode && primaryLineCoords.length >= 2 && (
          <>
            <Polyline
              coordinates={primaryLineCoords}
              strokeColor={
                isHeadingToPickup || isReadyToStartTrip ? 'rgba(52,245,184,0.28)' : 'rgba(66,133,244,0.24)'
              }
              strokeWidth={12}
              geodesic
            />
            <Polyline
              coordinates={primaryLineCoords}
              strokeColor={isHeadingToPickup || isReadyToStartTrip ? '#34F5B8' : '#4285F4'}
              strokeWidth={isHeadingToPickup || isReadyToStartTrip ? 6 : 5}
              geodesic
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* No API key / no snap yet: show backend A→B preview on accepted if we have points */}
        {primaryLineCoords.length < 2 &&
          activeTrip &&
          String(activeTrip.status) === 'accepted' &&
          routeCoords.length >= 2 && (
            <>
              <Polyline
                coordinates={routeCoords}
                strokeColor="rgba(52,245,184,0.22)"
                strokeWidth={10}
                geodesic
              />
              <Polyline
                coordinates={routeCoords}
                strokeColor="#34F5B8"
                strokeWidth={5}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}

        {dashedDriverPickup && (
          <Polyline
            coordinates={[
              { latitude: driverCoords!.lat, longitude: driverCoords!.lng },
              { latitude: pickupCoord!.lat, longitude: pickupCoord!.lng },
            ]}
            strokeColor="rgba(52,245,184,0.75)"
            strokeWidth={5}
            lineDashPattern={[10, 6]}
            geodesic
          />
        )}

        {hasEmbeddedOffer && offerRouteSplit.first.length >= 2 && (
          <Polyline
            coordinates={offerRouteSplit.first}
            strokeColor="rgba(52,245,184,0.92)"
            strokeWidth={4}
            lineDashPattern={[12, 10]}
            geodesic
            lineCap="round"
            lineJoin="round"
          />
        )}
        {hasEmbeddedOffer && offerRouteSplit.second.length >= 2 && (
          <Polyline
            coordinates={offerRouteSplit.second}
            strokeColor="rgba(59,130,246,0.92)"
            strokeWidth={4}
            lineDashPattern={[12, 10]}
            geodesic
            lineCap="round"
            lineJoin="round"
          />
        )}
        {hasEmbeddedOffer && offerRouteSplit.mid && offerMapTripKm != null && (
          <Marker
            coordinate={offerRouteSplit.mid}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.offerRouteKmChip}>
              <Text style={styles.offerRouteKmChipTxt}>{offerMapTripKm.toFixed(1)} km</Text>
            </View>
          </Marker>
        )}
        {hasEmbeddedOffer && offerPickupCoord && (
          <Marker
            coordinate={{ latitude: offerPickupCoord.lat, longitude: offerPickupCoord.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <OfferRiderPin />
          </Marker>
        )}
        {hasEmbeddedOffer && offerDropCoord && (
          <Marker
            coordinate={{ latitude: offerDropCoord.lat, longitude: offerDropCoord.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <OfferDropPin label={offerDropLabelShort} />
          </Marker>
        )}

        {/* Pickup marker */}
        {pickupCoord && (
          <Marker
            coordinate={{ latitude: pickupCoord.lat, longitude: pickupCoord.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            {isHeadingToPickup || isWaitingAtPickupNoCode ? (
              <PickupMarkerLarge addressLabel={isHeadingToPickup ? pickupAddrShort : undefined} />
            ) : (
              <PickupMarker />
            )}
          </Marker>
        )}

        {/* Dropoff marker — visible during pickup leg and later phases */}
        {dropCoord && (
          <Marker
            coordinate={{ latitude: dropCoord.lat, longitude: dropCoord.lng }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <DropoffMarker
              large={isHeadingToPickup || isWaitingAtPickupNoCode}
              addressLabel={isHeadingToPickup ? dropAddrShort : undefined}
            />
          </Marker>
        )}

        {/* Driver car marker */}
        {driverCoords && (
          <Marker
            coordinate={{ latitude: driverCoords.lat, longitude: driverCoords.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={false}
            tracksViewChanges={false}
            rotation={driverCoords.heading ?? 0}
          >
            <CarMarker
              bounceAnim={bounceAnim}
              pulseAnim={pulseAnim}
              tone={
                isOnline && !activeTrip
                  ? 'blue'
                  : isReadyToStartTrip
                    ? 'blue'
                    : 'green'
              }
              caption={
                isHeadingToPickup || isWaitingAtPickupNoCode || isReadyToStartTrip || (isOnline && !activeTrip)
                  ? 'You'
                  : undefined
              }
            />
          </Marker>
        )}
      </MapView>
      </View>

      {/* ── Top / bottom gradients — map readable under chrome + dock ── */}
      <LinearGradient
        colors={
          isHeadingToPickup
            ? ['rgba(255,255,255,0.55)', 'transparent']
            : ['rgba(6,11,24,0.9)', 'transparent']
        }
        style={styles.topGradient}
        pointerEvents="none"
      />
      {activeTrip && !isHeadingToPickup ? (
        <LinearGradient
          colors={
            isWaitingAtPickupNoCode
              ? ['transparent', 'rgba(2,6,23,0.15)', 'rgba(2,6,23,0.45)']
              : ['transparent', 'rgba(2,6,23,0.55)', 'rgba(2,6,23,0.92)']
          }
          style={[
            styles.bottomMapFade,
            {
              height: Math.min(200, 140 + insets.bottom),
            },
          ]}
          pointerEvents="none"
        />
      ) : null}

      <View style={styles.brandChromeWrap} pointerEvents="box-none">
        <DriverBrandHeaderRow
          topInset={insets.top}
          variant={
            isHeadingToPickup
              ? 'trip-light'
              : hasEmbeddedOffer && onFeatureHub && onInboxPress
                ? 'incoming'
                : 'default'
          }
          onMenuPress={
            isHeadingToPickup && onFeatureHub
              ? onFeatureHub
              : hasEmbeddedOffer && onFeatureHub
                ? onFeatureHub
                : undefined
          }
          onInboxPress={hasEmbeddedOffer && onInboxPress ? onInboxPress : undefined}
        />
      </View>

      {isHeadingToPickup ? (
        <View
          style={[styles.pickupMapChromeRow, { top: insets.top + 64, left: flow.padH }]}
          pointerEvents="none"
        >
          <View style={styles.pickupMapLegend}>
            <View style={styles.pickupMapLegendItem}>
              <View style={[styles.pickupMapLegendDot, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.pickupMapLegendTxt}>Pickup</Text>
            </View>
            <View style={styles.pickupMapLegendItem}>
              <View style={[styles.pickupMapLegendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.pickupMapLegendTxt}>Drop-off</Text>
            </View>
          </View>
          {displayTripEtaMin != null || distKmForPickupUi != null ? (
            <View style={styles.pickupMapEtaChip}>
              <Ionicons name="navigate" size={14} color="#2563EB" />
              <Text style={styles.pickupMapEtaChipTxt}>
                {displayTripEtaMin != null ? `${displayTripEtaMin} min` : ''}
                {displayTripEtaMin != null && distKmForPickupUi != null ? ' · ' : ''}
                {distKmForPickupUi != null
                  ? distKmForPickupUi < 1
                    ? `${Math.round(distKmForPickupUi * 1000)} m`
                    : `${distKmForPickupUi.toFixed(1)} km`
                  : ''}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isWaitingAtPickupNoCode ? (
        <>
          <View
            style={[styles.arrivedMapLegend, { top: insets.top + 52, left: flow.padH }]}
            pointerEvents="none"
          >
            <View style={styles.arrivedLegendItem}>
              <View style={[styles.arrivedLegendDot, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.arrivedLegendTxt}>Pickup</Text>
            </View>
            <View style={styles.arrivedLegendItem}>
              <View style={[styles.arrivedLegendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.arrivedLegendTxt}>Destination</Text>
            </View>
          </View>
          <View
            style={[
              styles.arrivedRouteMapChip,
              { top: insets.top + 52, alignSelf: 'center' },
            ]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={['rgba(34,197,94,0.2)', 'rgba(15,23,42,0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <Ionicons name="git-commit-outline" size={15} color="#4ADE80" />
            <Text style={styles.arrivedRouteMapChipTxt}>
              {startTripDistanceLabel}
              <Text style={styles.arrivedRouteMapChipSep}> · </Text>
              {startTripDurationLabel}
            </Text>
          </View>
        </>
      ) : null}

      {activeTripPhase && !isWaitingAtPickupNoCode && !isHeadingToPickup ? (
        <DriverTripPhaseChrome
          phase={activeTripPhase}
          top={tripPhaseChromeTop}
          metricPrimary={tripPhaseMetricPrimary}
          metricSecondary={tripPhaseMetricSecondary}
          hideMetrics={
            (activeTripPhase === 'heading_pickup' && pickupNavDockExpanded) ||
            (activeTripPhase === 'arrived' && arrivedDockExpanded)
          }
          dockExpanded={
            activeTripPhase === 'heading_pickup'
              ? pickupNavDockExpanded
              : activeTripPhase === 'arrived'
                ? arrivedDockExpanded
                : activeTripPhase === 'rider_in_car'
                  ? startTripDockExpanded
                  : ongoingDockExpanded
          }
          onToggleDock={() => {
            if (activeTripPhase === 'heading_pickup') setPickupNavDockExpanded((v) => !v);
            else if (activeTripPhase === 'arrived') setArrivedDockExpanded((v) => !v);
            else if (activeTripPhase === 'rider_in_car') setStartTripDockExpanded((v) => !v);
            else setOngoingDockExpanded((v) => !v);
          }}
          onMenuPress={onFeatureHub}
        />
      ) : null}

      {/* ── Top header (hidden on reference online-idle chrome — earnings live in bottom status row) ── */}
      {showLegacyTopBar ? (
      <View style={[styles.topBar, { paddingTop: insets.top + 52 + (activeTrip ? 2 : 6) }, activeTrip && styles.topBarTrip]}>
        <View style={styles.topBarLeftCluster}>
          <TouchableOpacity
            style={[styles.topIconBtnOuter, activeTrip && styles.topIconBtnOuterTrip]}
            onPress={onFeatureHub}
            activeOpacity={0.88}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Home and menu"
          >
            <LinearGradient
              colors={['rgba(51,65,85,0.92)', 'rgba(15,23,42,0.98)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.topIconBtnGrad, activeTrip && styles.topIconBtnGradTrip]}
            >
              <Ionicons name="home" size={activeTrip ? 19 : 21} color="#F8FAFC" style={styles.topIconGlyphShadow} />
            </LinearGradient>
          </TouchableOpacity>
          {isOnline ? (
            <View
              style={[
                styles.mapHealthChip,
                activeTrip && styles.mapHealthChipTrip,
                useTileFallback && styles.mapHealthChipWarn,
                !mapLoaded && !useTileFallback && styles.mapHealthChipLoading,
              ]}
              pointerEvents="none"
            >
              <Ionicons
                name={useTileFallback ? 'earth-outline' : mapLoaded ? 'map-outline' : 'hourglass-outline'}
                size={activeTrip ? 12 : 13}
                color={useTileFallback ? '#FBBF24' : mapLoaded ? '#4ADE80' : '#94A3B8'}
              />
              <Text style={[styles.mapHealthChipText, activeTrip && styles.mapHealthChipTextTrip]} numberOfLines={1}>
                {useTileFallback ? 'OSM' : mapLoaded ? 'Live' : 'Map…'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.topBarCenter} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.earningsPillOuter, activeTrip && styles.earningsPillOuterTrip]}
            activeOpacity={0.88}
            onPress={toggleStats}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Today's earnings, ${todayEarnings > 0 ? earningsDisplay : '₦0.00'}`}
            accessibilityHint="Opens earnings summary"
          >
            <LinearGradient
              colors={['rgba(15,23,42,0.98)', 'rgba(6,11,24,0.99)', 'rgba(6,20,14,0.97)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.earningsPillGrad, activeTrip && styles.earningsPillGradTrip]}
            >
              <View style={styles.earningsWalletBadge}>
                <LinearGradient
                  colors={['#1DFFA0', '#0D9F6E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.earningsWalletBadgeInner, activeTrip && styles.earningsWalletBadgeInnerTrip]}
                >
                  <Ionicons name="wallet" size={activeTrip ? 14 : 15} color="#022C22" />
                </LinearGradient>
              </View>
              <View style={styles.earningsTextCol}>
                <Text style={[styles.earningsTodayLabel, activeTrip && styles.earningsTodayLabelTrip]}>Today</Text>
                <View style={styles.earningsAmountRow}>
                  <Text style={[styles.earningsCurrency, activeTrip && styles.earningsCurrencyTrip]}>₦</Text>
                  <Text
                    style={[styles.earningsValue, activeTrip && styles.earningsValueTrip]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {todayEarnings > 0 ? earningsDisplay.replace('₦', '') : '0.00'}
                  </Text>
                </View>
              </View>
              <Ionicons
                name="chevron-down"
                size={activeTrip ? 12 : 13}
                color="rgba(29,255,160,0.55)"
                style={{ marginLeft: 2 }}
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.topBarRightCluster}>
          <TouchableOpacity
            style={[styles.topIconBtnOuter, activeTrip && styles.topIconBtnOuterTrip]}
            onPress={onSearch}
            activeOpacity={0.88}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Search and heatmap"
          >
            <LinearGradient
              colors={['rgba(51,65,85,0.92)', 'rgba(15,23,42,0.98)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.topIconBtnGrad, activeTrip && styles.topIconBtnGradTrip]}
            >
              <Ionicons name="search" size={activeTrip ? 19 : 21} color="#F8FAFC" style={styles.topIconGlyphShadow} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
      ) : null}

      {isOnline && !activeTrip && !hasEmbeddedOffer && showLegacyTopBar ? (
        <View style={[styles.mapOnlineBadge, { top: insets.top + 52 + 56, left: flow.padH }]} pointerEvents="none">
          <View style={styles.mapOnlineDot} />
          <Text style={styles.mapOnlineText}>ONLINE</Text>
        </View>
      ) : null}

      {/* ── Route-change alert (above nav card) ── */}
      {routeChangeBanner ? (
        <View
          style={[
            styles.routeChangeBanner,
            { top: insets.top + 52 + (activeTrip ? 54 : 70) },
          ]}
        >
          <Ionicons name="git-compare-outline" size={16} color="#FBBF24" />
          <Text style={styles.routeChangeBannerText} numberOfLines={2}>
            {routeChangeBanner}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (routeChangeBannerTimerRef.current) {
                clearTimeout(routeChangeBannerTimerRef.current);
                routeChangeBannerTimerRef.current = undefined;
              }
              setRouteChangeBanner(null);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss route update notice"
          >
            <Ionicons name="close" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Turn-by-turn / next-step card ── */}
      {activeTrip &&
        !isHeadingToPickup &&
        !isArrivedPhase &&
        (tripNavSteps.length > 0 ||
          Boolean(activeTrip.current_instruction) ||
          tripEtaMin != null ||
          snapDistKm != null ||
          snapEtaMin != null) && (
        <View
          style={[
            styles.navCard,
            {
              top:
                insets.top +
                52 +
                (activeTrip ? 54 : 72) +
                (routeChangeBanner ? 48 : 0),
            },
          ]}
        >
          <View style={[styles.navAccentBar, { backgroundColor: navAccentColor }]} />
          <View style={[styles.navCardIcon, { borderColor: `${navAccentColor}55` }]}>
            <Ionicons name="navigate-circle" size={40} color={navAccentColor} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {tripNavSteps.length > 1 ? (
              <Text style={styles.navStepMeta}>
                Step {Math.min(navStepIndex + 1, tripNavSteps.length)} of {tripNavSteps.length}
              </Text>
            ) : null}
            {currentNavStep &&
            navRemainingToStepEndM != null &&
            Number.isFinite(navRemainingToStepEndM) ? (
              <Text style={styles.navDistanceTop}>
                {navRemainingToStepEndM < 18
                  ? 'Now'
                  : `This step · ${fmtDistanceDisplay(navRemainingToStepEndM)}`}
              </Text>
            ) : currentNavStep && currentNavStep.distanceM > 0 ? (
              <Text style={styles.navDistanceTop}>
                This step · {fmtDistanceDisplay(currentNavStep.distanceM)}
              </Text>
            ) : activeTrip.distance_to_next_km != null ? (
              <Text style={styles.navDistanceTop}>
                {activeTrip.distance_to_next_km < 1
                  ? `In ${Math.round(activeTrip.distance_to_next_km * 1000)} m`
                  : `In ${activeTrip.distance_to_next_km.toFixed(1)} km`}
              </Text>
            ) : snapDistKm != null ? (
              <Text style={styles.navDistanceTop}>
                {snapDistKm < 1
                  ? `In ${Math.round(snapDistKm * 1000)} m`
                  : `In ${snapDistKm.toFixed(1)} km`}
              </Text>
            ) : tripEtaMin != null ? (
              <Text style={styles.navDistanceTop}>~{tripEtaMin} min away</Text>
            ) : snapEtaMin != null ? (
              <Text style={styles.navDistanceTop}>~{snapEtaMin} min (along route)</Text>
            ) : null}
            <Text style={styles.navInstruction} numberOfLines={4}>
              {currentNavStep?.instruction ||
                activeTrip.current_instruction ||
                (String(activeTrip.status) === 'accepted'
                  ? `Head to the pickup pin. Tap Start navigation below when ready.`
                  : String(activeTrip.status) === 'arrived'
                    ? `Meet your rider at pickup. Tap Start trip after they show the pick-up code.`
                    : `Follow the route to the drop-off.`)}
            </Text>
            {(followingNavStep?.instruction || activeTrip.next_instruction) ? (
              <View style={styles.navThenWrap}>
                <Text style={styles.navThenLabel}>Then</Text>
                <Text style={styles.navThenText} numberOfLines={2}>
                  {followingNavStep?.instruction || activeTrip.next_instruction}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* ── Stats card (tap earnings pill to show/hide) ── */}
      {statsOpen && (
        <Animated.View
          style={[
            styles.statsCard,
            {
              top: showLegacyTopBar
                ? insets.top + 52 + (activeTrip ? 168 : 72)
                : showOnlineIdleChrome
                  ? insets.top + 72
                  : insets.top + 96,
              opacity: statsSlide,
              transform: [
                {
                  translateY: statsSlide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="wallet" size={18} color="#22E5A0" />
              <Text style={styles.statValue}>
                {todayEarnings >= 1000 ? `₦${(todayEarnings / 1000).toFixed(1)}k` : `₦${todayEarnings.toLocaleString()}`}
              </Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="calendar" size={18} color="#3B82F6" />
              <Text style={styles.statValue}>
                {weekEarnings >= 1000 ? `₦${(weekEarnings / 1000).toFixed(1)}k` : `₦${weekEarnings.toLocaleString()}`}
              </Text>
              <Text style={styles.statLabel}>This Week</Text>
            </View>
          </View>
          <Text style={styles.statsEarningsHint}>Trips, hours & rating are in Earnings</Text>
          {surgeActive && (
            <View style={styles.surgeChip}>
              <Ionicons name="flash" size={13} color="#F59E0B" />
              <Text style={styles.surgeChipText}>⚡ Surge {surgeMultiplier}x — Earn more now</Text>
            </View>
          )}
          <TouchableOpacity style={styles.statsCloseBtn} onPress={toggleStats}>
            <Text style={styles.statsCloseText}>Close</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Map controls: left column when idle online; right stack otherwise ── */}
      {showOnlineIdleChrome ? (
        <View
          style={[styles.mapLeftControls, { bottom: floatControlsBottom, left: Math.max(12, flow.padH) }]}
          pointerEvents="box-none"
        >
          {onDestination ? (
            <TouchableOpacity
              style={[styles.oiDestMapFab, destinationActive && styles.oiDestMapFabOn]}
              onPress={onDestination}
              activeOpacity={0.88}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                destinationActive ? 'Trips toward destination — tap to manage' : 'Set trips toward destination'
              }
            >
              <Ionicons
                name={destinationActive ? 'navigate-circle' : 'flag'}
                size={22}
                color={destinationActive ? '#34F5B8' : '#E2E8F0'}
              />
              {destinationActive && destinationTripsRemaining > 0 ? (
                <View style={styles.oiMapFabBadge}>
                  <Text style={styles.oiMapFabBadgeTxt}>{destinationTripsRemaining}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.oiMapFab}
            onPress={handleRecenter}
            activeOpacity={0.88}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Recenter on your live location"
          >
            <Ionicons name="locate" size={20} color="#34F5B8" />
          </TouchableOpacity>
          <View style={styles.zoomStackLeft}>
            <ZoomButton icon="add" onPress={handleZoomIn} />
            <View style={zoomStyles.divider} />
            <ZoomButton icon="remove" onPress={handleZoomOut} />
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.zoomStack, { bottom: floatControlsBottom }]}>
            <ZoomButton icon="add" onPress={handleZoomIn} />
            <View style={zoomStyles.divider} />
            <ZoomButton icon="remove" onPress={handleZoomOut} />
          </View>
          <TouchableOpacity
            style={[
              styles.recenterBtn,
              isHeadingToPickup && styles.recenterBtnLight,
              { bottom: floatControlsBottom + 62 },
            ]}
            onPress={handleRecenter}
            activeOpacity={0.82}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Recenter map on your location"
          >
            <Ionicons name="locate" size={19} color={isHeadingToPickup ? '#2563EB' : '#34D399'} />
          </TouchableOpacity>
          {!isReadyToStartTrip && !isOngoingTrip && onDestination ? (
            <TouchableOpacity
              style={[
                styles.destinationBtn,
                { bottom: floatControlsBottom + 124, right: flow.padH },
                destinationActive && styles.destinationBtnActive,
              ]}
              onPress={onDestination}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={destinationActive ? 'Destination filter on' : 'Set destination filter'}
            >
              <Ionicons name="flag" size={19} color={destinationActive ? '#34D399' : '#94A3B8'} />
              {destinationActive && destinationTripsRemaining > 0 ? (
                <View style={styles.destinationBadge}>
                  <Text style={styles.destinationBadgeText}>{destinationTripsRemaining}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}
        </>
      )}

      {/* Destination strip — legacy bar (hidden when unified idle dock is shown) */}
      {destinationActive && destinationName && !showOnlineIdleChrome ? (
        <TouchableOpacity
          style={[styles.destinationStrip, { bottom: activeTrip ? insets.bottom + 228 : insets.bottom + 80 }]}
          onPress={onDestination}
          activeOpacity={0.88}
        >
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22E5A0' }} />
          <Text style={styles.destinationStripText} numberOfLines={1}>
            Towards: {destinationName}
          </Text>
          <Text style={styles.destinationStripCount}>{destinationTripsRemaining} left</Text>
          <Ionicons name="chevron-forward" size={14} color="#64748B" />
        </TouchableOpacity>
      ) : null}

      {/* ── Active trip dock — stage-first CTAs (I've arrived / Start / Complete) then navigation ── */}
      {isOnline &&
        activeTrip &&
        !suppressTripDock &&
        ((String(activeTrip.status) === 'accepted' ? !!onTripOpenNavigation : true) &&
          (String(activeTrip.status) === 'arrived' && !pickupVerifiedAtPickup ? !!onTripStart : true) &&
          (String(activeTrip.status) === 'arrived' && pickupVerifiedAtPickup ? !!onTripConfirmStart : true) &&
          (String(activeTrip.status) === 'ongoing' ? !!onTripComplete : true)) && (
        <View
          style={[styles.tripDockWrap, { bottom: insets.bottom + 48 }]}
          pointerEvents="box-none"
        >
          {String(activeTrip.status) === 'accepted' && onTripOpenNavigation ? (
              <DriverNavigatePickupDock
                riderName={activeTrip.rider_name || 'Rider'}
                riderPhoto={activeTrip.rider_profile_image ? String(activeTrip.rider_profile_image) : null}
                ratingAvg={activeTrip.rider_reputation_avg ?? null}
                ratingTrips={activeTrip.rider_trip_count ?? null}
                isNewRider={!!activeTrip.rider_new_account}
                distanceKm={distKmForPickupUi}
                etaMin={displayTripEtaMin}
                pickupLineShort={pickupAddrShort}
                pickupAddressLine={pickupAddrLine || ''}
                pickupDetailLine={pickupDetailSubline}
                dropoffAddressLine={dropAddrLine || ''}
                dropoffDetailLine={dropDetailSubline}
                tripDistanceLabel={startTripDistanceLabel}
                tripDurationLabel={startTripDurationLabel}
                arrivalEligible={arrivalEligible}
                tripActionBusy={!!tripActionBusy}
                expanded={pickupNavDockExpanded}
                onToggleExpand={() => setPickupNavDockExpanded((v) => !v)}
                riderPhone={activeTrip.rider_phone ? String(activeTrip.rider_phone) : null}
                canMessage={!!onTripMessageRider}
                onNavigate={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  onTripOpenNavigation();
                }}
                onCall={() => {
                  if (!onTripCallRider) return;
                  if (!activeTrip.rider_phone) {
                    Alert.alert('Call unavailable', 'Rider phone is not available for this trip.');
                    return;
                  }
                  void onTripCallRider();
                }}
                onMessage={() => {
                  if (!onTripMessageRider) {
                    Alert.alert('Chat unavailable', 'Messaging is unavailable from this screen.');
                    return;
                  }
                  void onTripMessageRider();
                }}
                onMarkArrived={handleMarkArrivedPress}
                onCancelTrip={
                  onTripCancel
                    ? () => {
                        if (Platform.OS !== 'web') {
                          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                        }
                        void onTripCancel();
                      }
                    : undefined
                }
              />
          ) : String(activeTrip.status) === 'arrived' && !pickupVerifiedAtPickup && onTripStart ? (
            <DriverArrivedPickupDock
              expanded={arrivedDockExpanded}
              onToggleExpand={() => setArrivedDockExpanded((v) => !v)}
              onStartTrip={
                !pickupCodeRequired && onTripConfirmStart
                  ? () => {
                      if (Platform.OS !== 'web') {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }
                      void onTripConfirmStart();
                    }
                  : undefined
              }
              riderName={activeTrip.rider_name || 'Rider'}
              riderPhoto={activeTrip.rider_profile_image ? String(activeTrip.rider_profile_image) : null}
              ratingAvg={activeTrip.rider_reputation_avg ?? null}
              ratingTrips={activeTrip.rider_trip_count ?? null}
              isNewRider={!!activeTrip.rider_new_account}
              waitingSec={pickupWaitSec}
              pickupAddressLine={pickupAddrLine || pickupAddrShort || ''}
              pickupDetailLine={pickupDetailSubline}
              destinationAddressLine={dropAddrLine || dropAddrShort || ''}
              destinationDetailLine={dropDetailSubline}
              routeDistanceLabel={startTripDistanceLabel}
              routeDurationLabel={startTripDurationLabel}
              pickupCodeRequired={pickupCodeRequired}
              tripActionBusy={!!tripActionBusy}
              riderPhone={activeTrip.rider_phone ? String(activeTrip.rider_phone) : null}
              canMessage={!!onTripMessageRider}
              onVerifyPickupCode={() => {
                if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void onTripStart();
              }}
              onNavigateToPickup={
                onTripOpenNavigation
                  ? () => {
                      if (Platform.OS !== 'web') void Haptics.selectionAsync();
                      onTripOpenNavigation();
                    }
                  : undefined
              }
              onNavigateToDestination={onTripOpenNavigation}
              onCall={() => {
                if (!onTripCallRider) return;
                if (!activeTrip.rider_phone) {
                  Alert.alert('Call unavailable', 'Rider phone is not available for this trip.');
                  return;
                }
                void onTripCallRider();
              }}
              onMessage={() => {
                if (!onTripMessageRider) {
                  Alert.alert('Chat unavailable', 'Messaging is unavailable from this screen.');
                  return;
                }
                void onTripMessageRider();
              }}
              onSafetyPress={() => {
                if (onShieldPress) void onShieldPress();
              }}
              onCancelTrip={
                onTripCancel
                  ? () => {
                      if (Platform.OS !== 'web') {
                        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      }
                      void onTripCancel();
                    }
                  : undefined
              }
            />
          ) : String(activeTrip.status) === 'arrived' && pickupVerifiedAtPickup && onTripConfirmStart ? (
            startTripDockExpanded ? (
              <DriverStartTripDock
                riderName={activeTrip.rider_name || 'Rider'}
                riderPhoto={activeTrip.rider_profile_image ? String(activeTrip.rider_profile_image) : null}
                ratingAvg={activeTrip.rider_reputation_avg ?? null}
                ratingTrips={activeTrip.rider_trip_count ?? null}
                isNewRider={!!activeTrip.rider_new_account}
                routeSummaryLine={startTripRouteSummary}
                distanceLabel={startTripDistanceLabel}
                durationLabel={startTripDurationLabel}
                fareLabel={startTripFareLabel}
                vehicleLine={vehicleDisplayLine}
                tripActionBusy={!!tripActionBusy}
                riderPhone={activeTrip.rider_phone ? String(activeTrip.rider_phone) : null}
                canMessage={!!onTripMessageRider}
                onStartTrip={() => {
                  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  void onTripConfirmStart();
                }}
                onCall={() => {
                  if (!onTripCallRider) return;
                  if (!activeTrip.rider_phone) {
                    Alert.alert('Call unavailable', 'Rider phone is not available for this trip.');
                    return;
                  }
                  void onTripCallRider();
                }}
                onMessage={() => {
                  if (!onTripMessageRider) {
                    Alert.alert('Chat unavailable', 'Messaging is unavailable from this screen.');
                    return;
                  }
                  void onTripMessageRider();
                }}
                onCancelTrip={() => {
                  if (onTripCancel) void onTripCancel();
                }}
              />
            ) : (
              <TouchableOpacity
                style={styles.pickupDockCollapsedBar}
                onPress={() => setStartTripDockExpanded(true)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Expand start trip card"
              >
                <Ionicons name="chevron-up" size={22} color="#94A3B8" />
                <Text style={styles.pickupDockCollapsedTxt}>Ready to start trip</Text>
                <Text style={styles.pickupDockCollapsedEta}>
                  {displayTripEtaMin != null ? `~${displayTripEtaMin} min` : ' '}
                </Text>
                <Ionicons name="play-circle" size={22} color="#34F5B8" />
              </TouchableOpacity>
            )
          ) : String(activeTrip.status) === 'ongoing' && onTripComplete ? (
            ongoingDockExpanded ? (
              <DriverOngoingTripDock
                tripShortId={`Trip ${formatTripShortId(activeTrip.id)}`}
                paymentMethodLabel={formatPaymentLabel(activeTrip.payment_method)}
                riderName={activeTrip.rider_name || 'Rider'}
                riderPhoto={activeTrip.rider_profile_image ? String(activeTrip.rider_profile_image) : null}
                ratingAvg={activeTrip.rider_reputation_avg ?? null}
                ratingTrips={activeTrip.rider_trip_count ?? null}
                isNewRider={!!activeTrip.rider_new_account}
                dropLineShort={dropAddrShort || 'Drop-off'}
                dropDetailLine={dropDetailSubline}
                elapsedSec={tripLegSec}
                distanceToDropLabel={ongoingDistanceLabel}
                etaToDropLabel={ongoingEtaToDropLabel}
                routeSummaryLabel={(() => {
                  const km = activeTrip?.distance_km;
                  const dist =
                    km != null && Number.isFinite(Number(km))
                      ? `${Number(km).toFixed(1)} km`
                      : ongoingDistanceLabel !== '—'
                        ? ongoingDistanceLabel
                        : null;
                  const eta = ongoingEtaToDropLabel !== '—' ? ongoingEtaToDropLabel : null;
                  if (dist && eta) return `${dist} / ${eta}`;
                  return dist || eta || undefined;
                })()}
                fareLabel={ongoingFareDisplayLabel}
                distanceFareLabel={
                  activeTrip?.distance_fee != null && Number.isFinite(Number(activeTrip.distance_fee))
                    ? `₦${Math.round(Number(activeTrip.distance_fee)).toLocaleString()}`
                    : undefined
                }
                fareBreakdownLine={fareBreakdownLineOngoing}
                fareDeltaLabel={ongoingFareDeltaLabel}
                tripProgressPercent={ongoingTripProgressPercent}
                isCompleting={tripActionBusy === 'complete'}
                tripActionBusy={!!tripActionBusy}
                bottomInset={insets.bottom}
                onCollapse={() => setOngoingDockExpanded(false)}
                riderPhone={activeTrip.rider_phone ? String(activeTrip.rider_phone) : null}
                canMessage={!!onTripMessageRider}
                onCompleteTrip={() => void onTripComplete()}
                onNavigate={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  if (!onTripOpenNavigation) return;
                  void onTripOpenNavigation();
                }}
                onCall={() => {
                  if (!onTripCallRider) return;
                  if (!activeTrip.rider_phone) {
                    Alert.alert('Call unavailable', 'Rider phone is not available for this trip.');
                    return;
                  }
                  void onTripCallRider();
                }}
                onMessage={() => {
                  if (!onTripMessageRider) {
                    Alert.alert('Chat unavailable', 'Messaging is unavailable from this screen.');
                    return;
                  }
                  void onTripMessageRider();
                }}
                onSafetyPress={() => {
                  if (onShieldPress) void onShieldPress();
                }}
                onEmergencyPress={() => {
                  if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  if (onShieldPress) void onShieldPress();
                }}
                onPauseTrip={onTripPause}
              />
            ) : (
              <View style={[styles.ongoingCollapsedWrap, { paddingBottom: Math.max(4, insets.bottom) }]}>
                <TouchableOpacity
                  style={styles.pickupDockCollapsedBar}
                  onPress={() => setOngoingDockExpanded(true)}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Expand trip in progress card"
                >
                  <Ionicons name="chevron-up" size={22} color="#94A3B8" />
                  <View style={styles.ongoingCollapsedMid}>
                    <Text style={styles.ongoingCollapsedTitle}>Trip in progress</Text>
                    <Text style={styles.ongoingCollapsedSub} numberOfLines={1}>
                      {ongoingFareDisplayLabel}
                      {ongoingTripProgressPercent > 0
                        ? ` · ${Math.round(ongoingTripProgressPercent)}% done`
                        : ''}
                      {ongoingEtaToDropLabel !== '—' ? ` · ${ongoingEtaToDropLabel}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.pickupDockCollapsedEta}>
                    {tripLegSec > 0 ? formatCountdownMmSs(tripLegSec) : ' '}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.ongoingCollapsedComplete,
                    !!tripActionBusy && styles.ongoingCollapsedCompleteBusy,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    void onTripComplete?.();
                  }}
                  disabled={!!tripActionBusy}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Complete trip"
                  accessibilityHint="Opens confirmation to end the trip"
                >
                  {tripActionBusy === 'complete' ? (
                    <ActivityIndicator color="#022C22" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={20} color="#022C22" />
                      <Text style={styles.ongoingCollapsedCompleteTxt}>COMPLETE TRIP</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )
          ) : (
          <View style={styles.tripDockCard}>
            <View style={styles.tripDockProHeader}>
              <View style={styles.tripDockHeaderLeft}>
                <View style={styles.tripDockLivePill}>
                  <View style={styles.tripDockLiveDot} />
                  <Text style={styles.tripDockLivePillTxt}>LIVE</Text>
                </View>
                <Text style={styles.tripDockTripId} numberOfLines={1}>
                  Trip {formatTripShortId(activeTrip.id)}
                </Text>
              </View>
              <View style={styles.tripDockPayChip}>
                <Text style={styles.tripDockPayChipText}>{formatPaymentLabel(activeTrip.payment_method)}</Text>
              </View>
            </View>
            <TripStageProgress
              status={String(activeTrip.status || '')}
              paymentStatus={activeTrip.payment_status}
            />
            <View style={styles.tripDockTopRow}>
              <TripProfileAvatar
                size={48}
                uri={activeTrip.rider_profile_image ? String(activeTrip.rider_profile_image) : null}
                person={activeTrip as unknown as Record<string, unknown>}
                role="rider"
                borderColor="rgba(96,165,250,0.45)"
                accessibilityLabel={`Photo of ${activeTrip.rider_name || 'rider'}`}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.tripDockRiderEyebrow}>Your rider</Text>
                <Text style={styles.tripDockRiderName} numberOfLines={1}>
                  {activeTrip.rider_name || 'Rider'}
                </Text>
                {(() => {
                  const avg = activeTrip.rider_reputation_avg;
                  const trips = activeTrip.rider_trip_count;
                  const isNew = activeTrip.rider_new_account;
                  if (typeof avg === 'number' && avg > 0) {
                    return (
                      <View style={styles.tripDockRatingRow}>
                        <Ionicons name="star" size={15} color="#FBBF24" />
                        <Text style={styles.tripDockRatingValue}>{avg.toFixed(1)}</Text>
                        {typeof trips === 'number' && trips > 0 ? (
                          <Text style={styles.tripDockRatingMeta}>
                            {' · '}
                            {trips.toLocaleString()} {trips === 1 ? 'trip' : 'trips'}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                  if (isNew) {
                    return (
                      <View style={styles.tripDockRatingRow}>
                        <Ionicons name="sparkles" size={14} color="#94A3B8" />
                        <Text style={styles.tripDockRatingNew}>New rider</Text>
                      </View>
                    );
                  }
                  return null;
                })()}
              </View>
              {tripActionBusy ? (
                <ActivityIndicator color="#22E5A0" style={{ marginLeft: 8 }} />
              ) : null}
            </View>

            {(() => {
              const st = String(activeTrip.status);
              const isDropLeg = st === 'ongoing';
              const addr = isDropLeg ? dropAddrLine : pickupAddrLine;
              const coord = isDropLeg ? dropCoord : pickupCoord;
              if (!addr && !coord) return null;
              const showThumb = Boolean(legStaticMapUri && !routeStaticThumbErr);
              return (
                <View style={styles.tripDockRouteRow}>
                  {showThumb ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      source={{ uri: legStaticMapUri as string }}
                      style={styles.tripDockRouteThumb}
                      resizeMode="cover"
                      onError={() => setRouteStaticThumbErr(true)}
                    />
                  ) : (
                    <View style={styles.tripDockRouteIcon}>
                      <Ionicons name={isDropLeg ? 'flag' : 'navigate'} size={16} color="#22E5A0" />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.tripDockRouteLabel}>{isDropLeg ? 'Drop-off' : 'Pickup'}</Text>
                    {addr ? (
                      <Text style={styles.tripDockRouteAddr} numberOfLines={2}>
                        {addr}
                      </Text>
                    ) : coord ? (
                      <Text style={styles.tripDockRouteAddrMuted} numberOfLines={1}>
                        {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })()}

            {['accepted', 'arrived'].includes(String(activeTrip.status)) &&
            (metersToTarget != null ||
              displayTripEtaMin != null ||
              (String(activeTrip.status) === 'arrived' && pickupWaitSec > 0)) ? (
              <View style={styles.tripDockMetricsCapsule}>
              <View style={styles.tripDockMetricsRow}>
                {metersToTarget != null ? (
                  <Text style={styles.tripDockMetricsText} numberOfLines={1}>
                    {String(activeTrip.status) === 'arrived' && metersToTarget <= 80
                      ? 'At pickup pin'
                      : `${metersToTarget < 1000 ? `${metersToTarget} m` : `${(metersToTarget / 1000).toFixed(1)} km`} to pickup`}
                  </Text>
                ) : null}
                {displayTripEtaMin != null ? (
                  <Text style={styles.tripDockMetricsText} numberOfLines={1}>
                    {metersToTarget != null ? ' · ' : ''}~{displayTripEtaMin} min
                  </Text>
                ) : null}
                {String(activeTrip.status) === 'accepted' &&
                driverLegCountdownSec != null &&
                driverLegCountdownSec > 0 ? (
                  <Text
                    style={[styles.tripDockMetricsCountdown, { color: driverDockCountdownColor }]}
                    numberOfLines={1}
                  >
                    {' · '}
                    Route {formatCountdownMmSs(driverLegCountdownSec)}
                  </Text>
                ) : null}
                {String(activeTrip.status) === 'arrived' && pickupWaitSec > 0 ? (
                  <Text style={styles.tripDockWaitBadge} numberOfLines={1}>
                    {' · '}Waiting {formatPickupWaitLabel(pickupWaitSec)}
                  </Text>
                ) : null}
              </View>
              </View>
            ) : null}

            <ScrollView
              style={styles.tripDockScroll}
              contentContainerStyle={styles.tripDockScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {/* Stage primary — always above navigation so drivers never miss it */}
              {/* Pickup leg: proximity context above arrival CTA */}
              {String(activeTrip.status) === 'accepted' && onTripMarkArrived ? (
                <View
                  style={[
                    styles.pickupProximityBar,
                    arrivalEligible ? styles.pickupProximityBarReady : styles.pickupProximityBarMuted,
                  ]}
                >
                  <View
                    style={[
                      styles.pickupProximityIconWrap,
                      arrivalEligible ? styles.pickupProximityIconReady : styles.pickupProximityIconMuted,
                    ]}
                  >
                    <Ionicons
                      name={arrivalEligible ? 'checkmark-circle' : 'navigate'}
                      size={20}
                      color={arrivalEligible ? '#022C22' : '#FBBF24'}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickupProximityTitle} numberOfLines={1}>
                      {arrivalEligible
                        ? 'You are at the pickup pin'
                        : metersToTarget != null && metersToTarget > PICKUP_ARRIVAL_RADIUS_M
                          ? `~${metersToTarget < 1000 ? `${Math.round(metersToTarget)} m` : `${(metersToTarget / 1000).toFixed(1)} km`} to pin`
                          : 'En route to pickup'}
                    </Text>
                    <Text style={styles.pickupProximitySub} numberOfLines={2}>
                      {arrivalEligible
                        ? 'Park safely, then confirm below — your rider gets an arrival alert.'
                        : `Within ${PICKUP_ARRIVAL_RADIUS_M} m of the pin you can confirm. Already there? Tap "I've arrived" and choose "I'm at pickup".`}
                    </Text>
                  </View>
                </View>
              ) : null}

              {String(activeTrip.status) === 'accepted' && onTripMarkArrived ? (
                <TouchableOpacity
                  style={[
                    styles.tripStagePrimaryTouchable,
                    arrivalEligible ? styles.tripStagePrimaryTouchableReady : styles.tripStagePrimaryTouchableFar,
                  ]}
                  activeOpacity={0.88}
                  disabled={!!tripActionBusy}
                  accessibilityRole="button"
                  accessibilityLabel="I have arrived at pickup"
                  onPress={() => {
                    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (!arrivalEligible && metersToTarget != null && metersToTarget > PICKUP_ARRIVAL_RADIUS_M) {
                      Alert.alert(
                        "I've arrived?",
                        `You're about ${Math.round(metersToTarget)} m from the pickup pin. Confirm only when you're at the pin so the rider gets an accurate alert.`,
                        [
                          { text: 'Not yet', style: 'cancel' },
                          { text: "I'm at pickup", onPress: () => void onTripMarkArrived() },
                        ],
                      );
                      return;
                    }
                    void onTripMarkArrived();
                  }}
                >
                  {arrivalEligible ? (
                    <LinearGradient
                      colors={['#34F5B8', '#22E5A0', '#0D9F6E']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tripStagePrimaryGradFill}
                    >
                      <View style={styles.tripStagePrimaryIconCircle}>
                        <Ionicons name="location" size={24} color="#022C22" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.tripStagePrimaryTitle, styles.tripStagePrimaryTitleOn]}>
                          I've arrived at pickup
                        </Text>
                        <Text style={[styles.tripStagePrimarySub, styles.tripStagePrimarySubOnGrad]} numberOfLines={2}>
                          Your rider gets an alert. The trip clock has not started yet.
                        </Text>
                      </View>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.tripStagePrimaryBtn, styles.tripStagePrimaryBtnFar]}>
                      <View style={styles.tripStagePrimaryIconCircleFar}>
                        <Ionicons name="location-outline" size={24} color="#FBBF24" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.tripStagePrimaryTitle, styles.tripStagePrimaryTitleWarn]}>
                          I've arrived at pickup
                        </Text>
                        <Text
                          style={[styles.tripStagePrimarySub, styles.tripStagePrimarySubFar]}
                          numberOfLines={2}
                        >
                          {`Within ${PICKUP_ARRIVAL_RADIUS_M} m of the pin — or confirm if you're already there.`}
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.tripNavigateOutline}
                activeOpacity={0.88}
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  if (!onTripOpenNavigation) return;
                  void onTripOpenNavigation();
                }}
                disabled={!!tripActionBusy || !onTripOpenNavigation}
                accessibilityRole="button"
                accessibilityLabel={navigatePrimaryTitle}
              >
                <Ionicons name="navigate" size={24} color="#22E5A0" />
                <View style={[styles.tripNavigatePrimaryLabelCol, { gap: 4 }]}>
                  <Text style={styles.tripNavigateOutlineTitle} numberOfLines={1}>
                    {navigatePrimaryTitle}
                  </Text>
                  <Text style={styles.tripNavigateOutlineHint} numberOfLines={1}>
                    {navigatePrimaryHint}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.tripDockCommsRow}>
                <TouchableOpacity
                  style={[
                    styles.tripCommCompactBtn,
                    activeTrip.rider_phone ? styles.tripCommCompactCall : styles.tripCommCompactCallMuted,
                  ]}
                  activeOpacity={0.88}
                  onPress={() => {
                    if (!onTripCallRider) return;
                    if (!activeTrip.rider_phone) {
                      Alert.alert('Call unavailable', 'Rider phone is not available for this trip.');
                      return;
                    }
                    void onTripCallRider();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Call rider"
                >
                  <Ionicons
                    name="call"
                    size={22}
                    color={activeTrip.rider_phone ? '#022C22' : '#94A3B8'}
                  />
                  <Text
                    style={[
                      styles.tripCommCompactLabel,
                      !activeTrip.rider_phone && styles.tripCommCompactLabelMuted,
                    ]}
                  >
                    Call
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tripCommCompactBtn,
                    styles.tripCommCompactChat,
                    !onTripMessageRider && styles.tripCommChatDisabled,
                  ]}
                  activeOpacity={0.88}
                  onPress={() => {
                    if (!onTripMessageRider) {
                      Alert.alert('Chat unavailable', 'Open the trip from the home map to message your rider.');
                      return;
                    }
                    void onTripMessageRider();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Message rider in app"
                >
                  <Ionicons
                    name="chatbubble-ellipses"
                    size={21}
                    color={onTripMessageRider ? '#7DD3FC' : '#64748B'}
                  />
                  <Text style={[styles.tripCommCompactLabel, styles.tripCommCompactChatLabel]}>Chat</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.tripDockLegal} numberOfLines={2}>
                No fare charges until you enter the code and start the trip.
              </Text>
            </ScrollView>
          </View>
          )}
        </View>
      )}

      {/* ── Online idle: unified bottom dock (earnings, metrics, listening, actions) ── */}
      {showOnlineIdleChrome && (
        <>
          <LinearGradient
            colors={['rgba(2,6,23,0)', 'rgba(2,6,23,0.55)', 'rgba(2,6,23,0.88)']}
            locations={[0, 0.45, 1]}
            style={[styles.onlineIdleFade, { height: Math.min(420, onlineIdleMapPadBottom + 48) }]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.onlineIdleRoot,
              { paddingBottom: insets.bottom + 8, paddingHorizontal: Math.max(14, flow.padH) },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.oiDockShell}>
              <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
              <LinearGradient
                colors={['rgba(52,245,184,0.08)', 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.oiDockSheen}
                pointerEvents="none"
              />

              <View style={styles.oiHandleWrap} pointerEvents="none">
                <LinearGradient
                  colors={[...HANDLE_GRADIENT_DEFAULT]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.oiHandle}
                />
              </View>

              <View style={styles.oiHeroRow}>
                <View style={styles.oiOnlinePill}>
                  <View style={styles.oiOnlineDot} />
                  <Text style={styles.oiOnlineTxt}>ONLINE</Text>
                </View>
                <TouchableOpacity
                  style={styles.oiEarnCenter}
                  onPress={toggleStats}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Today earnings, show breakdown"
                >
                  <View style={styles.oiTodayLabelRow}>
                    <Text style={styles.oiTodayLabel}>TODAY</Text>
                    <Ionicons name="chevron-down" size={11} color="#93C5FD" />
                  </View>
                  <Text style={styles.oiTodayAmount} numberOfLines={1}>
                    ₦{todayEarnings > 0 ? earningsDisplay.replace('₦', '') : '0.00'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.oiHeroRight}>
                  <View style={styles.oiLiveChip}>
                    <View style={[styles.oiLiveDot, mapLoaded && styles.oiLiveDotOn]} />
                    <Text style={styles.oiLiveTxt}>LIVE</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.oiInboxBtn}
                    onPress={handleMapInboxPress}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel="Open messages and notifications"
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={19} color="#BFDBFE" />
                    {mapInboxUnread > 0 ? (
                      <View style={styles.oiInboxBadge}>
                        <Text style={styles.oiInboxBadgeTxt}>
                          {mapInboxUnread > 99 ? '99+' : mapInboxUnread}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              </View>

              {destinationActive && destinationName ? (
                <TouchableOpacity style={styles.oiDestBanner} onPress={onDestination} activeOpacity={0.9}>
                  <View style={styles.oiDestBannerIcon}>
                    <Ionicons name="navigate-circle" size={20} color="#34F5B8" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.oiDestBannerEyebrow}>TRIPS TOWARDS</Text>
                    <Text style={styles.oiDestBannerTxt} numberOfLines={2}>
                      {destinationName}
                    </Text>
                    {destinationTripsRemaining > 0 ? (
                      <Text style={styles.oiDestBannerMeta}>{destinationTripsRemaining} matched trips left today</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}

              <View style={styles.oiListenCard}>
                <View style={styles.oiListenRow}>
                  <View style={styles.oiWaitIconCol}>
                    <Animated.View
                      style={[
                        styles.oiWaitSonar,
                        {
                          opacity: sonarAnim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0.15, 0.5, 0.15],
                          }),
                          transform: [
                            {
                              scale: sonarAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [1, 1.28],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                    <LinearGradient
                      colors={['rgba(37,99,235,0.55)', 'rgba(15,23,42,0.95)']}
                      style={styles.oiWaitCarRing}
                    >
                      <Ionicons name="car-sport" size={20} color={THEME_COLORS.accentMuted} />
                    </LinearGradient>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.oiWaitTitle}>
                      {isFindingRide ? 'Listening for rides' : 'Offers paused'}
                    </Text>
                    <Text style={styles.oiWaitSub}>
                      {isFindingRide
                        ? 'Map shows your live position. Use Heatmap in the menu for busy zones.'
                        : 'Complete account steps to receive offers.'}
                    </Text>
                  </View>
                  {isFindingRide ? <SeekingDotsFour /> : null}
                </View>
              </View>

              <View style={styles.oiActionRow}>
                <TouchableOpacity
                  style={styles.oiSideBtn}
                  onPress={onShieldPress}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Safety"
                >
                  <Ionicons name="shield-checkmark" size={22} color="#60A5FA" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.oiGoOfflinePill}
                  onPress={onGoOffline}
                  disabled={toggling}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Go offline"
                >
                  {toggling ? (
                    <ActivityIndicator size="small" color="#FCA5A5" />
                  ) : (
                    <>
                      <Ionicons name="power" size={17} color="#F87171" />
                      <Text style={styles.oiGoOfflineText}>Go Offline</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.oiSideBtn}
                  onPress={onFeatureHub}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Menu"
                >
                  <Ionicons name="menu" size={22} color="#93C5FD" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      )}

      {hasEmbeddedOffer &&
      embeddedOfferTrip &&
      onEmbeddedOfferAcceptRider &&
      onEmbeddedOfferAcceptCounter &&
      onEmbeddedOfferDecline ? (
        <View style={[styles.embeddedOfferWrap, { paddingBottom: insets.bottom + 58 }]} pointerEvents="box-none">
          <DriverMapOfferDock
            trip={embeddedOfferTrip as Record<string, any>}
            countdownSeconds={embeddedOfferCountdown}
            countdownTotal={DRIVER_OFFER_COUNTDOWN_SECONDS}
            fareInput={embeddedOfferFareInput}
            onFareInputChange={onEmbeddedOfferFareInputChange ?? (() => {})}
            accepting={embeddedOfferAccepting}
            onAcceptRiderPrice={onEmbeddedOfferAcceptRider}
            onAcceptCounterPrice={onEmbeddedOfferAcceptCounter}
            onDecline={onEmbeddedOfferDecline}
          />
        </View>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════
          OFFLINE BOTTOM BAR  —  Large GO button, Nexryde green
          ══════════════════════════════════════════════════════════════ */}
      {!isOnline && (
        <>
          {/* "Ready to go?" hint above GO button */}
          {driverApproved && trialReady && (
            <View style={[styles.readyHint, { bottom: insets.bottom + 100 }]}>
              <Ionicons name="arrow-down" size={12} color="#1DFFA0" style={{ opacity: 0.85 }} />
              <Text style={styles.readyHintText}>Tap GO to go online</Text>
            </View>
          )}

          {/* Offline bottom bar */}
          <View style={[styles.offlineBottomBar, { paddingBottom: insets.bottom + 12 }]}>
            {/* Left: Shield */}
            <TouchableOpacity
              style={styles.offlineIconBtn}
              onPress={onShieldPress}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Safety and shield"
            >
              <Ionicons name="shield-checkmark" size={22} color="#34D399" />
            </TouchableOpacity>

            {/* Centre: GO button */}
            {!driverApproved ? (
              <TouchableOpacity style={styles.goPendingBtn} onPress={onFeatureHub} activeOpacity={0.88}>
                <Ionicons name="time-outline" size={22} color="#FBBF24" />
                <Text style={styles.goPendingText}>Pending</Text>
              </TouchableOpacity>
            ) : !trialReady ? (
              <TouchableOpacity style={styles.goActivateBtn} onPress={onFeatureHub} activeOpacity={0.88}>
                <Ionicons name="flash" size={22} color="#FFF" />
                <Text style={styles.goActivateText}>Activate</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                {/* Outer pulse ring */}
                <Animated.View
                  style={[
                    styles.goOuterRing,
                    {
                      opacity: goRingAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.1, 0] }),
                      transform: [{ scale: goRingAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
                    },
                  ]}
                />
                <Animated.View style={{ transform: [{ scale: goPulseAnim }] }}>
                  <TouchableOpacity
                    style={styles.goBtn}
                    onPress={onGoOnline}
                    activeOpacity={0.88}
                    disabled={toggling}
                    accessibilityRole="button"
                    accessibilityLabel={toggling ? 'Connecting' : 'Go online'}
                  >
                    <LinearGradient
                      colors={['#34F5B8', '#22E5A0', '#00C473']}
                      style={styles.goBtnGrad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      {toggling ? (
                        <ActivityIndicator size="small" color="#022C22" />
                      ) : (
                        <>
                          <Ionicons name="car-sport" size={22} color="#022C22" />
                          <Text style={styles.goBtnText}>GO</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}

            {/* Right: Recenter GPS */}
            <TouchableOpacity
              style={styles.offlineIconBtn}
              onPress={handleRecenter}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 10, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Recenter map on your location"
            >
              <Ionicons name="locate" size={22} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          {/* "You're offline" strip */}
          <View style={[styles.offlineStrip, { paddingBottom: insets.bottom + 2 }]}>
            <TouchableOpacity
              onPress={onFeatureHub}
              activeOpacity={0.82}
              style={styles.offlineStripLeft}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Quick settings"
            >
              <Ionicons name="options-outline" size={20} color="#94A3B8" />
            </TouchableOpacity>
            <Text style={styles.offlineStripText}>YOU'RE OFFLINE</Text>
            <TouchableOpacity
              onPress={onFeatureHub}
              activeOpacity={0.82}
              style={styles.offlineStripRight}
              hitSlop={{ top: 10, bottom: 10, left: 12, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
            >
              <Ionicons name="menu" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ONLINE BOTTOM BAR (trip, offer, destination — not idle chrome)
          ══════════════════════════════════════════════════════════════ */}
      {isOnline && !showOnlineIdleChrome && (
        <>
          {/* Gradient fade above bottom bar */}
          <LinearGradient
            colors={['transparent', 'rgba(6,11,24,0.97)']}
            style={[
              styles.bottomGradient,
              {
                bottom: insets.bottom + (activeTrip ? 248 : 64),
                height: activeTrip ? 240 : 80,
              },
            ]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom + 8, paddingHorizontal: Math.max(16, flow.padH) },
            ]}
          >
            {/* Shield */}
            <TouchableOpacity
              style={styles.bottomIconBtn}
              onPress={onShieldPress}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Safety and shield"
            >
              <Ionicons name="shield-checkmark" size={22} color="#60A5FA" />
            </TouchableOpacity>

            {/* Centre: optional on-trip label + Go Offline */}
            <View style={styles.bottomCentre}>
              {!activeTrip ? (
                <TouchableOpacity
                  style={styles.goOfflineBtn}
                  onPress={onGoOffline}
                  activeOpacity={0.82}
                  hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Go offline and stop receiving offers"
                >
                  <Ionicons name="power" size={14} color="#FCA5A5" />
                  <Text style={styles.goOfflineBtnText}>Go Offline</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Menu */}
            <TouchableOpacity
              style={styles.bottomIconBtn}
              onPress={onFeatureHub}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 10, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Menu and features"
            >
              <Ionicons name="menu" size={22} color="#CBD5E1" />
            </TouchableOpacity>
          </View>
        </>
      )}

      {!showOnlineIdleChrome && !activeTrip ? (
      <DriverMapInboxBar
        anchor="dock"
        bottom={
          insets.bottom +
          (hasEmbeddedOffer ? 340 : isFindingRide && !destinationActive ? 220 : 78)
        }
        compact={Boolean(
          (isFindingRide && !destinationActive) || hasEmbeddedOffer,
        )}
        unread={mapInboxUnread}
        onPress={handleMapInboxPress}
      />
      ) : null}
    </View>
  );
}

/** Lower-left (or top-right during trip) inbox — unread pulse, haptics. */
function DriverMapInboxBar({
  bottom,
  cornerTop,
  anchor = 'dock',
  compact,
  unread,
  onPress,
}: {
  bottom: number;
  /** When `anchor` is mapCorner, distance from top safe area to place chip (avoids trip card). */
  cornerTop?: number;
  anchor?: 'dock' | 'mapCorner';
  /** Tighter layout when “Searching for rides” is visible so the chip stays readable. */
  compact?: boolean;
  unread: number;
  onPress: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, {
      toValue: 1,
      friction: 8,
      tension: 78,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrance once per mount
  }, []);

  useEffect(() => {
    if (unread <= 0) {
      badgePulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, {
          toValue: 1.14,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(badgePulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.delay(500),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [unread, badgePulse]);

  const hasUnread = unread > 0;
  const caption =
    unread === 1 ? '1 unread' : unread > 1 ? `${unread > 99 ? '99+' : unread} unread` : 'Policy · trips · alerts';

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={
        anchor === 'mapCorner'
          ? {
              position: 'absolute',
              right: 12,
              top: cornerTop ?? 140,
              zIndex: 12,
              opacity: enter,
              transform: [
                { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
              ],
            }
          : {
              position: 'absolute',
              left: 14,
              bottom,
              zIndex: 11,
              opacity: enter,
              transform: [
                { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) },
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            }
      }
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={hasUnread ? `Messages, ${unread} unread` : 'Messages'}
        accessibilityHint="Opens inbox, policy notices, and trip updates"
      >
        <View
          style={[
            styles.mapInboxOuter,
            compact && styles.mapInboxOuterCompact,
            hasUnread && styles.mapInboxOuterUnread,
          ]}
        >
          <LinearGradient
            colors={
              hasUnread
                ? ['rgba(59,130,246,0.35)', 'rgba(6,11,24,0.97)']
                : ['rgba(30,41,59,0.72)', 'rgba(6,11,24,0.97)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.mapInboxGrad, compact && styles.mapInboxGradCompact]}
          >
            <View style={[styles.mapInboxIconWrap, compact && styles.mapInboxIconWrapCompact]}>
              <Ionicons
                name={hasUnread ? 'mail-unread-outline' : 'mail-outline'}
                size={compact ? 17 : 22}
                color={hasUnread ? '#BFDBFE' : '#CBD5E1'}
              />
              {hasUnread ? (
                <Animated.View
                  style={[
                    styles.mapInboxBadge,
                    compact && styles.mapInboxBadgeCompact,
                    { transform: [{ scale: badgePulse }] },
                  ]}
                >
                  <Text style={[styles.mapInboxBadgeText, compact && styles.mapInboxBadgeTextCompact]}>
                    {unread > 9 ? '9+' : String(unread)}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
            <View style={styles.mapInboxTextCol}>
              <Text style={[styles.mapInboxTitle, compact && styles.mapInboxTitleCompact]} numberOfLines={1}>
                Messages
              </Text>
              <Text
                style={[
                  styles.mapInboxSub,
                  compact && styles.mapInboxSubCompact,
                  hasUnread && styles.mapInboxSubUnread,
                ]}
                numberOfLines={1}
              >
                {caption}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={compact ? 14 : 17}
              color={hasUnread ? 'rgba(191,219,254,0.85)' : 'rgba(148,163,184,0.5)'}
            />
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─────────────────────── Seeking animation (four dots, blue accent) ───────────────────────── */
function SeekingDotsFour() {
  const d0 = useRef(new Animated.Value(0.35)).current;
  const d1 = useRef(new Animated.Value(0.35)).current;
  const d2 = useRef(new Animated.Value(0.35)).current;
  const d3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const seq = (d: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(d, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.35, duration: 280, useNativeDriver: true }),
          Animated.delay(520),
        ])
      );
    const a0 = seq(d0, 0);
    const a1 = seq(d1, 160);
    const a2 = seq(d2, 320);
    const a3 = seq(d3, 480);
    a0.start();
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a0.stop();
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dot = (anim: Animated.Value) => (
    <Animated.View
      style={[
        styles.seekingDot,
        {
          opacity: anim,
          transform: [
            {
              scale: anim.interpolate({ inputRange: [0.35, 1], outputRange: [0.85, 1.15] }),
            },
          ],
        },
      ]}
    />
  );
  return (
    <View style={styles.seekingDotsRow}>
      {dot(d0)}
      {dot(d1)}
      {dot(d2)}
      {dot(d3)}
    </View>
  );
}

/* ─────────────────────── Marker styles ───────────────────────── */
const markerStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
  },
  glowRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(34,229,160,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(34,229,160,0.5)',
  },
  accuracyRing: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'rgba(52,245,184,0.35)',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  glowRingBlue: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(59,130,246,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(96,165,250,0.55)',
  },
  carCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  carCircleBlue: {
    width: 38,
    height: 38,
    borderRadius: 19,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.95,
    shadowRadius: 14,
  },
  destWrap: { alignItems: 'center' },
  destCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  destStem: { width: 2, height: 6 },
  stopLabel: {
    marginTop: 2,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: '#4285F4',
  },
  stopLabelB: {
    backgroundColor: '#ef4444',
  },
  stopLabelLg: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  stopLabelText: { fontSize: 9, fontWeight: '900', color: '#FFF' },
  addrCallout: {
    marginTop: 4,
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  addrCalloutTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  youPill: {
    marginBottom: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(30,64,175,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.45)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 6,
  },
  youPillTxt: { fontSize: 10, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.4 },
});

/* ─────────────────────── Zoom button styles ───────────────────────── */
const zoomStyles = StyleSheet.create({
  btn: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,13,24,0.96)',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
    width: '100%',
  },
});

/* ─────────────────────── Main styles ───────────────────────── */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060B18',
  },

  /** Base map surface — siblings use zIndex ≥ 9 so overlays never obscure the underlying map mistakenly as a plain fill. */
  mapCanvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },

  /* Top gradient overlay */
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 124,
    zIndex: 9,
  },
  bottomMapFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
  },

  brandChromeWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 11,
  },

  mapOnlineBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(37,99,235,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.45)',
    zIndex: 9,
  },
  mapOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F8FAFC',
  },
  mapOnlineText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.8,
  },

  /* ── Online idle reference stack (map chrome) ── */
  onlineIdleFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 13,
  },
  onlineIdleRoot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 14,
  },
  oiDockShell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(52,245,184,0.18)',
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  oiDockSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
  oiHandleWrap: {
    alignItems: 'center',
    paddingBottom: 2,
  },
  oiHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
  },
  oiHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  oiOnlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,212,126,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(0,212,126,0.5)',
    shadowColor: '#00D47E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  oiOnlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#00D47E',
  },
  oiOnlineTxt: {
    fontSize: 12,
    fontWeight: '900',
    color: '#00D47E',
    letterSpacing: 0.8,
  },
  oiEarnCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  oiHeroRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  oiLiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
  },
  oiInboxBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(30,58,138,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oiInboxBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  oiInboxBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFF',
  },
  oiTodayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  oiTodayLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 1.2,
  },
  oiTodayAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  oiDestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(6,78,59,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.38)',
    minHeight: 72,
  },
  oiDestBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(52,245,184,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oiDestBannerEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#34F5B8',
    letterSpacing: 1,
    marginBottom: 2,
  },
  oiDestBannerTxt: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ECFDF5',
    lineHeight: 20,
  },
  oiDestBannerMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#6EE7B7',
  },
  oiDestMapFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(8,13,24,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  oiDestMapFabOn: {
    borderColor: 'rgba(52,245,184,0.55)',
    backgroundColor: 'rgba(6,78,59,0.45)',
  },
  mapLeftControls: {
    position: 'absolute',
    zIndex: 12,
    alignItems: 'center',
    gap: 10,
  },
  zoomStackLeft: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  oiMapFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(8,13,24,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  oiMapFabDestOn: {
    borderColor: 'rgba(52,245,184,0.55)',
    backgroundColor: 'rgba(6,78,59,0.45)',
  },
  oiMapFabBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34F5B8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  oiMapFabBadgeTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#042F1A',
  },
  oiLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#64748B',
  },
  oiLiveDotOn: {
    backgroundColor: '#4ADE80',
    shadowColor: '#4ADE80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  oiLiveTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#86EFAC',
    letterSpacing: 1.2,
  },
  oiMetricsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.14)',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  oiMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  oiMetricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: 'rgba(148,163,184,0.25)',
  },
  oiMetricVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
    fontVariant: ['tabular-nums'],
  },
  oiMetricLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  oiListenCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,212,126,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,126,0.22)',
  },
  oiListenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  oiWaitIconCol: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oiWaitSonar: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: 'rgba(37,99,235,0.1)',
  },
  oiWaitCarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(147,197,253,0.45)',
  },
  oiWaitTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  oiWaitSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
    lineHeight: 17,
  },
  oiActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  oiSideBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.28)',
  },
  oiGoOfflinePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    minHeight: 52,
  },
  oiGoOfflineText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FCA5A5',
    letterSpacing: 0.5,
  },
  onlineNavFab: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    zIndex: 12,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12,
  },
  onlineNavFabGrad: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  seekingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#60A5FA',
  },

  offerRouteKmChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.45)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 6,
  },
  offerRouteKmChipTxt: {
    fontSize: 11,
    fontWeight: '900',
    color: '#E2E8F0',
    letterSpacing: 0.2,
  },
  arrivedMapLegend: {
    position: 'absolute',
    zIndex: 14,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  arrivedLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrivedLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  arrivedLegendTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  arrivedRouteMapChip: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    zIndex: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,197,94,0.45)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  arrivedRouteMapChipTxt: {
    fontSize: 14,
    fontWeight: '900',
    color: '#DCFCE7',
    letterSpacing: 0.1,
  },
  arrivedRouteMapChipSep: {
    fontWeight: '600',
    color: 'rgba(187,247,208,0.65)',
  },

  embeddedOfferWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    zIndex: 20,
  },

  pickupHeadingStrip: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 26,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  arrivedHeadingStrip: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 26,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.38)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 18,
  },
  arrivedHeadingCheckWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34F5B8',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  arrivedHeadingKicker: {
    fontSize: 12,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 1.4,
  },
  arrivedHeadingSubline: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.88)',
  },
  riderInCarHeadingStrip: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 26,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.34)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.26,
    shadowRadius: 16,
    elevation: 17,
  },
  riderInCarIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34F5B8',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  riderInCarKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 1.35,
  },
  riderInCarSubline: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  tripProgressHeadingStrip: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 26,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.38)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 17,
  },
  tripProgressIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#60A5FA',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  tripProgressKicker: {
    fontSize: 11,
    fontWeight: '900',
    color: '#39FF14',
    letterSpacing: 1.35,
  },
  tripProgressStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#39FF14',
    shadowColor: '#39FF14',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 6,
    elevation: 4,
  },
  tripProgressSubline: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  pickupHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  pickupHeadingIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.45)',
  },
  pickupHeadingCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  pickupHeadingTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 1.2,
  },
  pickupHeadingEta: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  pickupDistChipFloat: {
    position: 'absolute',
    left: 16,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.35)',
  },
  pickupDistChipFloatTxt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#86EFAC',
    fontVariant: ['tabular-nums'],
  },
  ongoingDistRemainChip: {
    position: 'absolute',
    left: 14,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(2,6,23,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
    maxWidth: '72%',
  },
  ongoingDistRemainValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  ongoingDistRemainCap: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.95)',
  },
  pickupDockCollapsedBar: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(10,10,12,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 16,
  },
  pickupDockCollapsedTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginLeft: 10,
    letterSpacing: -0.2,
  },
  pickupDockCollapsedEta: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginRight: 8,
  },
  ongoingCollapsedWrap: {
    gap: 8,
  },
  ongoingCollapsedMid: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 8,
  },
  ongoingCollapsedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  ongoingCollapsedSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  ongoingCollapsedComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#22C55E',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.6)',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    minHeight: 56,
  },
  ongoingCollapsedCompleteBusy: {
    opacity: 0.75,
  },
  ongoingCollapsedCompleteTxt: {
    fontSize: 16,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.5,
  },
  pickupDockCollapsedBarLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    marginHorizontal: 4,
  },
  pickupCollapsedLiveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
  },
  pickupDockCollapsedTxtLight: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  pickupDockCollapsedSubLight: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  pickupDockCollapsedEtaLight: {
    fontSize: 14,
    fontWeight: '800',
    color: '#16A34A',
    marginRight: 8,
    fontVariant: ['tabular-nums'],
  },
  pickupMapChromeRow: {
    position: 'absolute',
    right: 14,
    zIndex: 26,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'flex-start',
    maxWidth: '92%',
  },
  pickupMapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  pickupMapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pickupMapLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pickupMapLegendTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  pickupMapEtaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  pickupMapEtaChipTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
    fontVariant: ['tabular-nums'],
  },
  recenterBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.12,
  },

  idleOnlineWrap: {
    position: 'absolute',
    zIndex: 12,
    gap: 10,
  },
  idleStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  idleStatCell: {
    flex: 1,
    backgroundColor: 'rgba(30,41,59,0.92)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  idleStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  idleStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    marginTop: 4,
  },
  idleWaitCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
  },
  idlePulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60A5FA',
  },
  idleWaitTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#BFDBFE',
  },
  idleWaitSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
  },

  /* Top bar — three columns so center earnings never sit under a floating “Map live” chip */
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 10,
  },
  topBarTrip: {
    paddingBottom: 6,
  },
  topBarLeftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    minWidth: 0,
    zIndex: 12,
    elevation: 14,
  },
  topBarRightCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 0,
    zIndex: 12,
    elevation: 14,
  },
  topBarCenter: {
    flexShrink: 1,
    maxWidth: '42%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    zIndex: 10,
    minWidth: 0,
  },
  mapHealthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.42)',
    maxWidth: 96,
  },
  mapHealthChipTrip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    maxWidth: 88,
  },
  mapHealthChipWarn: {
    borderColor: 'rgba(251,191,36,0.5)',
    backgroundColor: 'rgba(55,35,12,0.72)',
  },
  mapHealthChipLoading: {
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(15,23,42,0.88)',
  },
  mapHealthChipText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E2E8F0',
    letterSpacing: 0.45,
  },
  mapHealthChipTextTrip: {
    fontSize: 9,
    letterSpacing: 0.35,
  },

  topIconBtnOuter: {
    borderRadius: 24,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  topIconBtnOuterTrip: {
    borderRadius: 22,
  },
  topIconBtnGrad: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topIconBtnGradTrip: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  topIconGlyphShadow: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  earningsPillOuter: {
    alignSelf: 'center',
    maxWidth: '100%',
    flexShrink: 1,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(29,255,160,0.4)',
    shadowColor: '#1DFFA0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 12,
  },
  earningsPillOuterTrip: {
    borderRadius: 24,
  },
  earningsPillGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingLeft: 8,
    paddingRight: 10,
    gap: 7,
  },
  earningsPillGradTrip: {
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 10,
    gap: 8,
  },
  earningsWalletBadge: {
    shadowColor: '#1DFFA0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  earningsWalletBadgeInner: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  earningsWalletBadgeInnerTrip: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  earningsTextCol: {
    minWidth: 0,
    gap: 1,
  },
  earningsTodayLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 1.05,
    textTransform: 'uppercase',
  },
  earningsTodayLabelTrip: {
    fontSize: 8,
    letterSpacing: 0.85,
  },
  earningsAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  earningsCurrency: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 0.25,
  },
  earningsCurrencyTrip: {
    fontSize: 11,
  },
  earningsValue: {
    fontSize: 19,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.45,
    fontVariant: ['tabular-nums'],
  },
  earningsValueTrip: {
    fontSize: 16,
    letterSpacing: -0.35,
  },

  routeChangeBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(69,26,3,0.94)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    zIndex: 11,
  },
  routeChangeBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#FEF3C7',
    lineHeight: 16,
  },

  /* Navigation card */
  navStepMeta: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  navCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: 'rgba(6,10,20,0.98)',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 14,
    zIndex: 10,
    overflow: 'hidden',
  },
  navAccentBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: '#1DFFA0',
  },
  navCardIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(29,255,160,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(29,255,160,0.38)',
  },
  navDistanceTop: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1DFFA0',
    letterSpacing: 0.35,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  navInstruction: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F1F5F9',
    lineHeight: 28,
    letterSpacing: -0.32,
  },
  navThenWrap: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.35)',
  },
  navThenLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  navThenText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
    lineHeight: 19,
  },
  navDistancePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(29,255,160,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  navDistance: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1DFFA0',
  },
  navNext: {
    alignItems: 'center',
    gap: 3,
    paddingLeft: 8,
  },
  navNextLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.2,
  },

  /* Zoom stack */
  zoomStack: {
    position: 'absolute',
    right: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 10,
  },

  /* Recenter */
  recenterBtn: {
    position: 'absolute',
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(8,13,24,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.5)',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 10,
  },

  mapInboxOuter: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  mapInboxOuterCompact: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  mapInboxOuterUnread: {
    borderColor: 'rgba(96,165,250,0.55)',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.35,
  },
  mapInboxGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 10,
    minWidth: 158,
  },
  mapInboxGradCompact: {
    gap: 6,
    paddingVertical: 7,
    paddingLeft: 9,
    paddingRight: 8,
    minWidth: 118,
  },
  mapInboxIconWrap: {
    position: 'relative',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapInboxIconWrapCompact: {
    width: 24,
    height: 24,
  },
  mapInboxTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mapInboxTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F1F5F9',
    letterSpacing: 0.2,
  },
  mapInboxTitleCompact: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  mapInboxSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.15,
  },
  mapInboxSubCompact: {
    fontSize: 9,
    letterSpacing: 0.05,
  },
  mapInboxSubUnread: {
    color: '#93C5FD',
  },
  mapInboxBadge: {
    position: 'absolute',
    top: -4,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#0b1220',
  },
  mapInboxBadgeCompact: {
    top: -3,
    right: -4,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
  },
  mapInboxBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFF',
  },
  mapInboxBadgeTextCompact: {
    fontSize: 8,
  },

  /* Finding trips chip */
  findingChip: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(6,10,20,0.96)',
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(52,211,153,0.45)',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 11,
    zIndex: 14,
    overflow: 'visible',
  },
  sonarRing: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#1DFFA0',
    left: 15,
  },
  sonarCore: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(29,255,160,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(29,255,160,0.55)',
  },
  findingText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 0.4,
  },
  dot: {
    fontSize: 14,
    color: '#1DFFA0',
    fontWeight: '900',
  },

  tripDockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 11,
    maxHeight: '88%',
  },
  tripDockCard: {
    backgroundColor: 'rgba(6,10,20,0.98)',
    borderRadius: 28,
    padding: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.2)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(52,245,184,0.42)',
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.42,
    shadowRadius: 28,
    elevation: 20,
  },
  tripDockProHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: -2,
  },
  tripDockHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  tripDockLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(34,229,160,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.35)',
  },
  tripDockLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22E5A0',
  },
  tripDockLivePillTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#86EFAC',
    letterSpacing: 1.1,
  },
  tripDockTripId: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.55,
    fontVariant: ['tabular-nums'],
  },
  tripDockPayChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.22)',
  },
  tripDockPayChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#86EFAC',
    letterSpacing: 0.35,
  },
  tripDockRouteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.45)',
  },
  tripDockRouteIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(34,229,160,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tripDockRouteLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.85,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  tripDockRouteAddr: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E2E8F0',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  tripDockRouteAddrMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: -0.1,
    fontVariant: ['tabular-nums'],
  },
  tripDockRouteThumb: {
    width: 76,
    height: 76,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.35)',
  },
  tripDockMetricsCapsule: {
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.14)',
    marginTop: 2,
  },
  tripStageWrap: {
    marginBottom: 4,
    paddingBottom: 12,
    paddingTop: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.22)',
  },
  tripStageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  tripStageSeg: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  tripStageSegOff: {
    backgroundColor: 'rgba(51,65,85,0.72)',
  },
  tripStageTitle: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: '#F1F5F9',
    letterSpacing: -0.25,
    lineHeight: 21,
    paddingHorizontal: 6,
  },
  tripDockScroll: {
    maxHeight: 420,
  },
  tripDockScrollContent: {
    gap: 12,
    paddingBottom: 8,
    paddingTop: 2,
  },
  pickupProximityBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  pickupProximityBarReady: {
    backgroundColor: 'rgba(34,229,160,0.1)',
    borderColor: 'rgba(34,229,160,0.35)',
  },
  pickupProximityBarMuted: {
    backgroundColor: 'rgba(30,41,59,0.65)',
    borderColor: 'rgba(71,85,105,0.55)',
  },
  pickupProximityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupProximityIconReady: {
    backgroundColor: 'rgba(34,229,160,0.35)',
  },
  pickupProximityIconMuted: {
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  pickupProximityTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#F1F5F9',
    letterSpacing: -0.25,
  },
  pickupProximitySub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 17,
  },
  tripStagePrimaryTouchable: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  tripStagePrimaryTouchableReady: {
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  tripStagePrimaryTouchableFar: {
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.42)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  tripStagePrimaryGradFill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    minHeight: 72,
  },
  tripStagePrimaryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(2,44,34,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripStagePrimaryIconCircleFar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripStagePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  tripStagePrimaryBtnFar: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 0,
  },
  tripStagePrimaryTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  tripStagePrimaryTitleOn: {
    color: '#022C22',
  },
  tripStagePrimaryTitleWarn: {
    color: '#FDE68A',
  },
  tripStagePrimarySub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(2,44,34,0.78)',
    letterSpacing: 0.08,
    lineHeight: 18,
  },
  tripStagePrimarySubOnGrad: {
    color: 'rgba(2,44,34,0.82)',
  },
  tripStagePrimarySubFar: {
    color: 'rgba(254,243,199,0.9)',
  },
  arrivedMeetBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 2,
    backgroundColor: 'rgba(14,116,144,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.38)',
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  arrivedMeetTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME_COLORS.accentMuted,
    letterSpacing: -0.15,
  },
  arrivedMeetSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.95)',
    lineHeight: 17,
  },
  tripStartPrimaryTouchable: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 0,
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
  tripStartPrimaryGradFill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  tripStartPrimaryIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(15,23,42,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tripStartPrimaryTextOn: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.28,
  },
  tripStartPrimarySubOn: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(240,249,255,0.88)',
    lineHeight: 18,
    letterSpacing: 0.04,
  },
  tripStartFlowHint: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.88)',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  tripNavigateOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(34,229,160,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(34,229,160,0.32)',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  tripNavigateOutlineTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#F1F5F9',
    letterSpacing: 0.4,
  },
  tripNavigateOutlineHint: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.88)',
    letterSpacing: 0.12,
  },
  tripCompletePrimaryTouchable: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 0,
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 10,
  },
  tripCompletePrimaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 74,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  tripCompletePrimaryIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(2,44,34,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(2,44,34,0.25)',
  },
  tripCompleteFlowHint: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.88)',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  dropoffLegBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(34,229,160,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.22)',
  },
  dropoffLegTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#86EFAC',
    letterSpacing: 0.2,
  },
  dropoffLegSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 17,
  },
  tripCompletePrimaryText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.3,
  },
  tripCompletePrimarySub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(2,44,34,0.82)',
    lineHeight: 18,
  },
  tripDockWaitBadge: {
    fontSize: 15,
    fontWeight: '800',
    color: '#38BDF8',
    fontVariant: ['tabular-nums'],
  },
  tripDockMeterLine: {
    fontSize: 15,
    fontWeight: '800',
    color: '#22E5A0',
    fontVariant: ['tabular-nums'],
  },
  tripDockLegal: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.82)',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 6,
    paddingHorizontal: 10,
  },
  tripDockTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.1)',
  },
  tripDockAvatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#22E5A0',
  },
  tripDockAvatarPh: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  tripDockRiderEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(148,163,184,0.95)',
    letterSpacing: 0.85,
    textTransform: 'uppercase',
  },
  tripDockRiderName: {
    fontSize: 21,
    fontWeight: '900',
    color: '#F8FAFC',
    marginTop: 3,
    letterSpacing: -0.45,
  },
  tripDockRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 4,
  },
  tripDockRatingValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.2,
  },
  tripDockRatingMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tripDockRatingNew: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    marginLeft: 2,
    letterSpacing: 0.2,
  },
  tripDockEtaLine: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tripDockMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  tripDockMetricsText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: -0.08,
  },
  tripDockMetricsCountdown: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tripArrivedPrimary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#22C55E',
    borderWidth: 1,
    borderColor: '#15803D',
  },
  tripArrivedPrimaryText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.2,
  },
  tripDockCommsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  tripCommCompactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  tripCommCompactCall: {
    backgroundColor: '#22E5A0',
    borderColor: '#0D9F6E',
  },
  tripCommCompactCallMuted: {
    backgroundColor: 'rgba(30,41,59,0.92)',
    borderColor: 'rgba(71,85,105,0.55)',
  },
  tripCommCompactChat: {
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderColor: 'rgba(56,189,248,0.38)',
  },
  tripCommCompactLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.2,
  },
  tripCommCompactLabelMuted: {
    color: '#94A3B8',
  },
  tripCommCompactChatLabel: {
    color: '#BAE6FD',
    fontWeight: '800',
  },
  tripCommBig: {
    flex: 1,
    minHeight: 80,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
  },
  tripCommCall: {
    backgroundColor: '#22E5A0',
    borderColor: '#15803D',
  },
  tripCommCallMuted: {
    backgroundColor: 'rgba(51,65,85,0.9)',
    borderColor: 'rgba(148,163,184,0.3)',
  },
  tripCommChat: {
    backgroundColor: '#38BDF8',
    borderColor: THEME_COLORS.accentGreen,
  },
  tripCommChatDisabled: {
    opacity: 0.55,
  },
  tripCommBigTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  tripCommBigTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.35,
  },
  tripCommBigTitleMuted: {
    color: '#94A3B8',
  },
  tripCommBigSub: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(2,44,34,0.72)',
    letterSpacing: 0.08,
  },
  tripCommBigSubMuted: {
    color: 'rgba(148,163,184,0.85)',
  },
  tripCommChatTitle: {
    color: '#F8FAFC',
  },
  tripCommChatSub: {
    color: 'rgba(248,250,252,0.88)',
  },
  tripCommPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#22E5A0',
    borderWidth: 1,
    borderColor: '#15803d',
  },
  tripCommPillMuted: {
    backgroundColor: 'rgba(51,65,85,0.85)',
    borderColor: 'rgba(148,163,184,0.28)',
  },
  tripCommPillText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.2,
  },
  tripCommPillTextMuted: {
    color: '#94A3B8',
  },
  tripNavigatePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#00D46A',
    borderWidth: 1,
    borderColor: '#16A34A',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tripNavigatePrimaryLabelCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tripNavigatePrimaryText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 0.35,
  },
  tripNavigatePrimaryHint: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.72)',
    letterSpacing: 0.2,
  },
  tripSecondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
  },
  tripSecondaryBtnSoft: {
    opacity: 0.72,
  },
  tripSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FBBF24',
  },

  /* Bottom gradient overlay (online state) */
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 80,
    zIndex: 9,
  },

  /* Bottom bar */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    backgroundColor: 'rgba(5,9,20,0.99)',
    zIndex: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomIconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  bottomCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomCentre: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  goOfflineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  goOfflineBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FCA5A5',
    letterSpacing: 0.25,
  },

  /* Destination button */
  destinationBtn: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(8,13,24,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 10,
  },
  destinationBtnActive: {
    borderColor: 'rgba(52,211,153,0.55)',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  destinationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1DFFA0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#060B18',
  },
  destinationStrip: {
    position: 'absolute',
    left: 16,
    right: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(8,13,24,0.96)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.3)',
    zIndex: 10,
  },
  destinationStripText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  destinationStripCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1DFFA0',
  },
  /* Stats card */
  statsCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(8,13,24,0.99)',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 16,
    zIndex: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#E2E8F0',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  surgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  surgeChipText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
  },
  statsEarningsHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  statsCloseBtn: {
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statsCloseText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '800',
  },

  /* ── Offline bottom bar ──────────────────────────────────────── */
  offlineBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 14,
    backgroundColor: 'rgba(5,9,20,0.99)',
    zIndex: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34,229,160,0.18)',
  },
  offlineIconBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  /* Big GO button — circle */
  goBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    shadowColor: '#1DFFA0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 16,
  },
  goBtnGrad: {
    width: 72,
    height: 72,
    borderRadius: 36,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    gap: 0,
  },
  goBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 1.2,
    marginTop: -2,
  },
  goOuterRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#1DFFA0',
  },

  /* Pending / Activate states */
  goPendingBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 2,
    borderColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  goPendingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  goActivateBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    elevation: 10,
  },
  goActivateText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },

  /* "You're offline" strip */
  offlineStrip: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: 'rgba(6,11,24,0.98)',
    zIndex: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(34,229,160,0.12)',
  },
  offlineStripText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 2.2,
  },
  offlineStripLeft: { padding: 8 },
  offlineStripRight: { padding: 8 },

  /* "Ready to go?" hint */
  readyHint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(29,255,160,0.12)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(29,255,160,0.35)',
    zIndex: 10,
  },
  readyHintText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#86EFAC',
    letterSpacing: 0.2,
  },

  /* Web fallback */
  webFallback: {
    flex: 1,
    backgroundColor: '#060B18',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  webText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '700',
  },
  mapErrorBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(120,53,15,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 1002,
    elevation: 12,
  },
  mapErrorTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  mapErrorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FDE68A',
    lineHeight: 16,
  },
  mapErrorDetail: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(253,230,138,0.85)',
    lineHeight: 14,
  },
  mapErrorAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(253,230,138,0.45)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  mapErrorActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 0.2,
  },
  mapRetryAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.5)',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  mapRetryActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BFDBFE',
    letterSpacing: 0.2,
  },
});

// Wrap in React.memo to prevent re-renders from parent state changes
// that do not affect driver map state, and in TripMapErrorBoundary so
// a native map crash cannot kill the entire driver screen.
import { TripMapErrorBoundary } from '@/src/components/TripMapErrorBoundary';

const DriverLiveMapViewMemo = memo(DriverLiveMapViewInner);

export default function DriverLiveMapView(props: Parameters<typeof DriverLiveMapViewInner>[0]) {
  return (
    <TripMapErrorBoundary>
      <DriverLiveMapViewMemo {...props} />
    </TripMapErrorBoundary>
  );
}
