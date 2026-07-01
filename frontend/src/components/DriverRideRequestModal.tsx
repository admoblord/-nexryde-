/**
 * DriverRideRequestModal — Nexryde 2030 Edition
 *
 * Full-screen assignment layout for incoming ride offers.
 *   • Map fills the whole screen — A→B route clearly visible
 *   • Rider avatar (human-head) at pickup A
 *   • Flag marker at destination B
 *   • Auto-zoom fitToCoordinates with bottom-card padding
 *   • Floating timer + request header at top
 *   • Bottom sheet with fare, rider info, routes, Accept / Ignore
 *   • Expandable counter-bid section
 */

import React, {
  useMemo, useCallback, useRef, useState, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, ScrollView, Platform, KeyboardAvoidingView,
  Image, Animated, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { DS_COLOR, DS_SPACE } from '@/src/design/designSystem';
import { DRIVER_OFFER_COUNTDOWN_SECONDS } from '@/src/constants/driverOffer';
import * as Haptics from 'expo-haptics';
import RideRequestMap from '@/src/components/RideRequestMap';
import Constants from 'expo-constants';
import { fetchGoogleDrivingRoutes, DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';
import { isShortTripFare } from '@/src/utils/farePresentation';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';

const C = DS_COLOR;

/* ─────────────────────── helpers ─────────────────────── */
export type FairTier = 'good' | 'fair' | 'low';

export function computeFairTier(
  baseFare: number, riderOffer: number, minPrice?: number | null
): FairTier {
  if (baseFare <= 0) return 'fair';
  if (minPrice != null && minPrice > 0 && riderOffer < minPrice - 0.5) return 'low';
  const r = riderOffer / baseFare;
  if (r >= 0.97) return 'good';
  if (r >= 0.88) return 'fair';
  return 'low';
}

function roundFare(n: number) { return Math.max(0, Math.round(n / 50) * 50); }
function parseFareInput(s: string) {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

type TripOffer = Record<string, any>;

type Props = {
  visible: boolean;
  trip: TripOffer | null;
  countdownSeconds: number;
  countdownTotal?: number;
  fareInput: string;
  onFareInputChange: (v: string) => void;
  accepting: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  driverLat?: number | null;
  driverLng?: number | null;
};

const CHIP_PRESETS = [
  { label: '+5%',  pct: 0.05 },
  { label: '+10%', pct: 0.10 },
  { label: '+15%', pct: 0.15 },
] as const;

/** Robust lat/lng from pickup/drop payload variants */
function readLatLng(loc: unknown): { lat: number | null; lng: number | null } {
  if (loc == null) return { lat: null, lng: null };
  if (typeof loc === 'object') {
    const o = loc as Record<string, unknown>;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return { lat: null, lng: null };
}

const RIDE_PREFERENCE_LABELS: Record<string, string> = {
  quiet_ride: 'Quiet Ride',
  chatty_driver: 'Chatty Driver',
  music_on: 'Music On',
  cold_ac: 'AC Must Be Cold',
};

/* ─────────────────────── Animated timer arc ─────────────────────── */
function TimerBar({
  progress, urgent,
}: { progress: number; urgent: boolean }) {
  const w = `${Math.max(0, progress * 100)}%` as `${number}%`;
  return (
    <View style={tb.track}>
      <View style={[tb.fillClip, { width: w }]}>
        <LinearGradient
          colors={urgent ? ['#fb7185', '#ef4444', '#b91c1c'] : ['#34F5B8', '#22E5A0', '#0D9F6E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={tb.fillGrad}
        />
      </View>
    </View>
  );
}
const tb = StyleSheet.create({
  track: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', borderRadius: 2 },
  fillClip: { height: 4, overflow: 'hidden', borderRadius: 2 },
  fillGrad: { flex: 1, height: 4 },
});

/* ─────────────────────── Main modal ─────────────────────── */
export default function DriverRideRequestModal({
  visible,
  trip,
  countdownSeconds,
  countdownTotal = DRIVER_OFFER_COUNTDOWN_SECONDS,
  fareInput,
  onFareInputChange,
  accepting,
  onAccept,
  onIgnore,
  driverLat,
  driverLng,
}: Props) {
  const insets = useSafeAreaInsets();
  const fareInputRef = useRef<TextInput>(null);
  const [counterMode, setCounterMode] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [googleTripRoutes, setGoogleTripRoutes] = useState<
    Array<{
      overview: Array<{ latitude: number; longitude: number }>;
      distanceM: number;
      durationSec: number;
    }>
  >([]);

  // Sheet slide animation
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const SHEET_COLLAPSED = 260;
  const SHEET_EXPANDED  = 540;

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: expanded ? SHEET_EXPANDED : SHEET_COLLAPSED,
      tension: 55, friction: 11, useNativeDriver: false,
    }).start();
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on close / new offer
  useEffect(() => {
    if (!visible) {
      setCounterMode(false);
      setExpanded(false);
    }
  }, [visible, trip?.id]);

  /* ── Fare math ── */
  const baseFare   = Math.round(Number(trip?.base_price ?? trip?.recommended_fare ?? trip?.base_fare ?? 0));
  const riderOffer = Math.round(Number(trip?.offered_fare ?? trip?.fare ?? 0));
  const maxFare    = trip?.max_price  != null ? Math.round(Number(trip.max_price))  : null;
  const minFare    = trip?.min_price  != null ? Math.round(Number(trip.min_price))  : null;
  const distanceKm = trip?.distance_km   != null ? Number(trip.distance_km)   : null;
  const durationMins = trip?.duration_mins != null ? Number(trip.duration_mins) : null;
  const surgeMul   = trip?.surge_multiplier != null ? Number(trip.surge_multiplier) : 1;
  const highDemand = surgeMul > 1.04;
  const shortTripRate = isShortTripFare(trip?.fare_bucket, distanceKm);

  const fairTier = useMemo(() => computeFairTier(baseFare || riderOffer, riderOffer, minFare), [baseFare, riderOffer, minFare]);
  const fairConfig = {
    good: { label: 'Strong offer', color: C.success,  icon: 'trending-up'          as const },
    fair: { label: 'Fair offer',   color: '#EAB308',  icon: 'remove-outline'        as const },
    low:  { label: 'Low offer',    color: C.danger,   icon: 'alert-circle-outline'  as const },
  }[fairTier];

  /* ── Rider info ── */
  const riderName  = trip?.rider_name || trip?.rider?.name || (trip?.shield?.rider_display_name as string)?.trim() || 'Rider';
  const riderPhotoRaw = useMemo(() => {
    const rawTrip = trip as Record<string, unknown> | undefined;
    const rider = rawTrip?.rider as Record<string, unknown> | undefined;
    const candidates = [
      rawTrip?.rider_photo,
      rider?.profile_image,
      rider?.photo,
      rawTrip?.rider_avatar,
      rawTrip?.rider_profile_image,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) return c.trim();
    }
    return null;
  }, [trip]);

  const rating     = trip?.shield?.rider_reputation_avg != null ? Number(trip.shield.rider_reputation_avg).toFixed(1) : null;
  const ratingCount = trip?.shield?.rider_reputation_trip_count ?? null;
  const riderRiskBand = String(trip?.shield?.rider_risk_band || '').toLowerCase();
  const riderRiskConfig =
    riderRiskBand === 'green'  ? { label: 'Safe',    color: C.success, icon: 'shield-checkmark' as const } :
    riderRiskBand === 'yellow' ? { label: 'Caution', color: '#EAB308', icon: 'shield-half'       as const } :
    riderRiskBand === 'red'    ? { label: 'Risk',    color: C.danger,  icon: 'shield-outline'    as const } :
    null;
  const riskColor = riderRiskConfig?.color ?? C.success;

  /* ── Locations ── */
  const pl = trip?.pickup_location;
  const dl = trip?.dropoff_location;
  const sl = (trip as { stop_location?: unknown })?.stop_location;
  let { lat: pLat, lng: pLng } = readLatLng(pl);
  let { lat: dLat, lng: dLng } = readLatLng(dl);
  const { lat: sLat, lng: sLng } = readLatLng(sl);
  const rawTrip = trip as Record<string, unknown> | undefined;
  if (pLat == null || pLng == null) {
    const fb = readLatLng(rawTrip?.pickup_coordinates);
    if (fb.lat != null && fb.lng != null) {
      pLat = fb.lat;
      pLng = fb.lng;
    }
  }
  if (dLat == null || dLng == null) {
    const fb = readLatLng(rawTrip?.destination_coordinates ?? rawTrip?.dropoff_coordinates);
    if (fb.lat != null && fb.lng != null) {
      dLat = fb.lat;
      dLng = fb.lng;
    }
  }
  const rpcPrev = trip?.route_preview_coordinates;
  if (Array.isArray(rpcPrev) && rpcPrev.length >= 2) {
    if (pLat == null || pLng == null) {
      const a = rpcPrev[0] as Record<string, unknown>;
      const lat = Number(a?.lat ?? a?.latitude);
      const lng = Number(a?.lng ?? a?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        pLat = lat;
        pLng = lng;
      }
    }
    if (dLat == null || dLng == null) {
      const b = rpcPrev[rpcPrev.length - 1] as Record<string, unknown>;
      const lat = Number(b?.lat ?? b?.latitude);
      const lng = Number(b?.lng ?? b?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        dLat = lat;
        dLng = lng;
      }
    }
  }
  const pickupLine = typeof pl === 'string' ? pl : (pl as { address?: string })?.address || 'Pickup location';
  const stopLine =
    typeof sl === 'string'
      ? sl
      : (sl as { address?: string } | undefined)?.address || '';
  const dropLine =
    typeof dl === 'string'
      ? dl
      : (dl as { address?: string })?.address ||
        (typeof trip?.destination === 'string'
          ? trip.destination
          : (trip?.destination as { address?: string })?.address || 'Destination');

  const directionsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    (Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined) ||
    '';

  useEffect(() => {
    if (!visible || !trip?.id || !directionsApiKey) {
      setGoogleTripRoutes([]);
      return;
    }
    if (
      pLat == null ||
      pLng == null ||
      dLat == null ||
      dLng == null ||
      !Number.isFinite(pLat) ||
      !Number.isFinite(pLng) ||
      !Number.isFinite(dLat) ||
      !Number.isFinite(dLng)
    ) {
      setGoogleTripRoutes([]);
      return;
    }
    let cancelled = false;
    fetchGoogleDrivingRoutes(pLat, pLng, dLat, dLng, directionsApiKey, {
      stop:
        sLat != null && sLng != null && Number.isFinite(sLat) && Number.isFinite(sLng)
          ? { lat: sLat, lng: sLng }
          : null,
    })
      .then((res) => {
        if (cancelled || !res?.routes?.length) return;
        setGoogleTripRoutes(res.routes);
      })
      .catch(() => {
        if (!cancelled) setGoogleTripRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, trip?.id, directionsApiKey, pLat, pLng, dLat, dLng, sLat, sLng]);

  const rideRequestRouteCoords = useMemo(() => {
    const prev =
      Array.isArray(trip?.route_preview_coordinates) && trip!.route_preview_coordinates!.length >= 2
        ? (trip!.route_preview_coordinates as Array<{ lat: number; lng: number }>)
        : null;
    const g0 = googleTripRoutes[0]?.overview;
    if (g0 && g0.length >= 2) {
      const mapped = g0.map((p) => ({ lat: p.latitude, lng: p.longitude }));
      if (mapped.length >= DIRECTIONS_ROUTE_MIN_POINTS) return mapped;
      if (prev && prev.length >= DIRECTIONS_ROUTE_MIN_POINTS && prev.length > mapped.length) {
        return prev;
      }
      return mapped.length >= 2 ? mapped : prev;
    }
    if (prev && prev.length >= 2) return prev;
    return null;
  }, [googleTripRoutes, trip?.route_preview_coordinates]);

  const displayTripKm =
    googleTripRoutes[0] != null ? googleTripRoutes[0].distanceM / 1000 : distanceKm;
  const displayTripMin =
    googleTripRoutes[0] != null ? Math.ceil(googleTripRoutes[0].durationSec / 60) : durationMins;
  const tripKmForFare = displayTripKm ?? distanceKm;
  const pricePerKm =
    tripKmForFare != null && tripKmForFare > 0 && riderOffer > 0
      ? Math.round(riderOffer / tripKmForFare)
      : null;
  const distPickup = trip?.distance_to_pickup != null ? Number(trip.distance_to_pickup) : null;
  const etaPickupMin = distPickup != null && distPickup >= 0 ? Math.max(1, Math.round(distPickup * 2.2)) : null;
  const paymentRaw   = (trip?.payment_method || 'cash') as string;
  const paymentLabel = paymentRaw === 'cash' ? 'Cash' : paymentRaw.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  const rawCat  = String(trip?.service_type || trip?.vehicle_type || 'economy').toLowerCase();
  const normCat = rawCat === 'standard' ? 'economy' : rawCat;
  const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
    economy:     { label: 'Standard',   color: '#00D46A', icon: 'car-outline' },
    comfort:     { label: 'Comfort',    color: '#0EA5E9', icon: 'car-sport-outline' },
    xl:          { label: 'XL',         color: '#FFB800', icon: 'bus-outline' },
    premium:     { label: 'Premium',    color: '#9333EA', icon: 'rocket-outline' },
    female_only: { label: 'Women Only', color: '#EC4899', icon: 'woman-outline' },
  };
  const catMeta = CATEGORY_META[normCat] ?? { label: normCat.toUpperCase(), color: '#94A3B8', icon: 'car-outline' };
  const ridePreferences = Array.isArray(trip?.ride_preferences)
    ? (trip.ride_preferences as string[]).map((item) => RIDE_PREFERENCE_LABELS[item] || item.replace(/_/g, ' ')).slice(0, 4)
    : [];

  /* ── Counter bid ── */
  const applyChip = useCallback(
    (pct: number) => {
      const base = riderOffer > 0 ? riderOffer : baseFare;
      if (!base) return;
      let next = roundFare(base * (1 + pct));
      if (maxFare != null && maxFare > 0) next = Math.min(next, maxFare);
      if (minFare != null && minFare > 0) next = Math.max(next, minFare);
      if (riderOffer > 0) next = Math.max(next, riderOffer);
      onFareInputChange(String(next));
    },
    [riderOffer, baseFare, maxFare, minFare, onFareInputChange]
  );

  const recommendedChipIndex = useMemo(() => {
    const target = baseFare > 0 ? baseFare : riderOffer;
    if (!target || !riderOffer) return 1;
    let bestI = 0, bestScore = Infinity;
    CHIP_PRESETS.forEach((c, i) => {
      let v = roundFare(riderOffer * (1 + c.pct));
      if (maxFare != null && maxFare > 0) v = Math.min(v, maxFare);
      const score = Math.abs(v - target);
      if (score < bestScore) { bestScore = score; bestI = i; }
    });
    return bestI;
  }, [baseFare, riderOffer, maxFare]);

  const selectedFare = parseFareInput(fareInput);
  const hasCounter   = Number.isFinite(selectedFare) && selectedFare > 0 && selectedFare !== riderOffer;
  const acceptLabelFare = Number.isFinite(selectedFare) && selectedFare > 0 ? selectedFare : riderOffer || baseFare;

  /* ── Smart Mode ── */
  const [smartEnabled, setSmartEnabled] = useState(false);
  const [smartResult, setSmartResult]   = useState<{ match: boolean; reasons: string[]; warnings: string[] } | null>(null);

  useEffect(() => {
    if (!visible) return;
    void AsyncStorage.getItem('nexryde_smart_mode_settings').then((raw) => {
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        if (!s?.enabled) return;
        setSmartEnabled(true);
        const warnings: string[] = [], reasons: string[] = [];
        let match = true;
        if (distanceKm != null) {
          if (distanceKm < (s.minDistance ?? 0))        { match = false; warnings.push('Below min distance'); }
          else if (distanceKm > (s.maxDistance ?? 999)) { match = false; warnings.push('Exceeds max distance'); }
          else reasons.push(`${distanceKm.toFixed(1)} km in range`);
        }
        const riderRating = Number(trip?.shield?.rider_reputation_avg ?? 0);
        if (s.avoidLowRated && riderRating > 0) {
          if (riderRating < (s.minRating ?? 0)) { match = false; warnings.push('Rider rating too low'); }
          else reasons.push(`${riderRating.toFixed(1)}★ rider`);
        }
        if (s.acceptSurge && surgeMul > 1.05) {
          if (surgeMul < (s.minSurgeMultiplier ?? 1)) { match = false; warnings.push('Surge too low'); }
          else reasons.push(`${surgeMul.toFixed(1)}× surge`);
        }
        setSmartResult({ match, reasons, warnings });
      } catch { /* ignore */ }
    });
  }, [visible, distanceKm, surgeMul, trip?.shield?.rider_reputation_avg]);

  /* ── Mood badges ── */
  const moodBadges = useMemo(() => {
    const mood = (trip as any)?.rider_mood as Record<string, string> | undefined;
    const badges: { label: string; icon: string; color: string }[] = [];
    if (!mood) return badges;
    if (mood.conversation === 'quiet')   badges.push({ label: 'Quiet Ride',   icon: 'volume-mute',  color: '#3B82F6' });
    if (mood.conversation === 'chatty')  badges.push({ label: 'Chatty Rider', icon: 'chatbubbles',  color: '#22C55E' });
    if (mood.music === 'on')             badges.push({ label: 'Music On',     icon: 'musical-notes',color: '#F59E0B' });
    if (mood.music === 'off')            badges.push({ label: 'No Music',     icon: 'musical-notes-outline', color: '#64748B' });
    if (mood.temperature === 'cold')     badges.push({ label: 'Cold AC',      icon: 'snow',         color: '#3B82F6' });
    if (mood.driving_style === 'smooth') badges.push({ label: 'Smooth Drive', icon: 'car',          color: '#22C55E' });
    if (mood.driving_style === 'fast')   badges.push({ label: 'Quick Drive',  icon: 'speedometer',  color: '#EF4444' });
    return badges;
  }, [trip?.rider_mood]); // eslint-disable-line react-hooks/exhaustive-deps

  const offerExpired = countdownSeconds <= 0;
  const progress   = Math.max(0, Math.min(1, countdownSeconds / countdownTotal));
  const timerUrgent = !offerExpired && countdownSeconds <= 5;

  if (!trip) return null;

  const BOTTOM_INNER = Math.max(insets.bottom, DS_SPACE.sm) + 6;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      <View style={s.root}>
        <StatusBar style="light" />

        {/* ── FULL-SCREEN MAP ── */}
        <View style={StyleSheet.absoluteFillObject}>
          <RideRequestMap
            pickupLat={pLat}    pickupLng={pLng}
            dropLat={dLat}      dropLng={dLng}
            routeCoords={rideRequestRouteCoords ?? trip?.route_preview_coordinates}
            riderPhoto={resolvePublicMediaUri(riderPhotoRaw)}
            riderInitial={riderName.charAt(0).toUpperCase() || 'R'}
            riderRiskColor={riskColor}
            driverLat={driverLat}
            driverLng={driverLng}
            bottomPad={expanded ? SHEET_EXPANDED + 20 : SHEET_COLLAPSED + 20}
            topPad={insets.top + 82}
            showTraffic
          />
        </View>

        {/* ── TOP FLOATING HEADER ── */}
        <View style={[s.topHeader, { paddingTop: insets.top + 8 }]}>
          {/* Timer bar */}
          <TimerBar progress={progress} urgent={timerUrgent} />
          <View style={s.topInner}>
            <View>
              <Text style={s.topEyebrow}>NEW RIDE REQUEST</Text>
              <Text style={s.topTitle}>Review this trip</Text>
            </View>
            <View
              style={[
                s.timerBadge,
                timerUrgent && !offerExpired && s.timerBadgeUrgent,
                offerExpired && { borderColor: '#475569', backgroundColor: '#0f172a' },
              ]}
            >
              <Ionicons
                name={offerExpired ? 'hourglass-outline' : 'time-outline'}
                size={14}
                color={offerExpired ? '#94a3b8' : timerUrgent ? '#ef4444' : '#EAB308'}
              />
              <Text
                style={[
                  s.timerText,
                  timerUrgent && !offerExpired && s.timerTextUrgent,
                  offerExpired && { color: '#94a3b8' },
                ]}
              >
                {offerExpired ? 'Expired' : `${countdownSeconds}s`}
              </Text>
            </View>
          </View>
        </View>

        {/* ── FARE FLOATING CHIP (top-right over map) ── */}
        <View style={[s.fareBubble, { top: insets.top + 72 }]}>
          <Text style={s.fareBubbleAmount}>₦{riderOffer.toLocaleString()}</Text>
          {displayTripKm != null && Number.isFinite(displayTripKm) ? (
            <Text style={s.fareBubbleSub}>
              {displayTripKm.toFixed(displayTripKm >= 10 ? 0 : 1)} km trip
              {displayTripMin != null && Number.isFinite(displayTripMin) ? ` · ~${displayTripMin} min` : ''}
            </Text>
          ) : displayTripMin != null && Number.isFinite(displayTripMin) ? (
            <Text style={s.fareBubbleSub}>~{displayTripMin} min trip</Text>
          ) : null}
          {baseFare > 0 && Math.abs(baseFare - riderOffer) >= 50 && (
            <Text style={s.fareBubbleHint}>Suggested ₦{baseFare.toLocaleString()}</Text>
          )}
        </View>

        {/* ── DISTANCE TO PICKUP chip ── */}
        {distPickup != null && (
          <View style={[s.pickupChip, { top: insets.top + 72 }]}>
            <Ionicons name="navigate" size={12} color="#0ea5e9" />
            <Text style={s.pickupChipText}>
              {distPickup < 1
                ? `${Math.round(distPickup * 1000)}m`
                : `${distPickup.toFixed(1)} km`}
              {' to pickup'}
              {etaPickupMin != null ? ` · ~${etaPickupMin} min` : ''}
            </Text>
          </View>
        )}

        {/* ── BOTTOM SHEET ── */}
        <KeyboardAvoidingView
          style={s.kvWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <Animated.View style={[s.sheet, { height: sheetAnim }]}>
            {/* Drag handle + expand toggle */}
            <TouchableOpacity
              style={s.sheetHandle}
              onPress={() => setExpanded((v) => !v)}
              activeOpacity={0.8}
            >
              <View style={s.handleBar} />
              <Text style={s.handleHint}>
                {expanded ? 'Tap to collapse' : 'Tap for more details'}
              </Text>
              <Ionicons
                name={expanded ? 'chevron-down' : 'chevron-up'}
                size={14}
                color="#64748B"
              />
            </TouchableOpacity>

            <ScrollView
              style={s.sheetScroll}
              contentContainerStyle={[s.sheetScrollContent, { paddingBottom: BOTTOM_INNER }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={expanded}
            >

              {/* ── HERO ROW: Fare + Rider ── */}
              <View style={s.heroRow}>
                {/* Fare block */}
                <View style={s.heroFare}>
                  <Text style={s.heroFareAmount}>₦{riderOffer.toLocaleString()}</Text>
                  <View style={s.heroMetaRow}>
                    {displayTripKm != null && Number.isFinite(displayTripKm) && (
                      <View style={s.metaChip}>
                        <Ionicons name="navigate-outline" size={11} color="#0ea5e9" />
                        <Text style={s.metaChipText}>{displayTripKm.toFixed(displayTripKm >= 10 ? 0 : 1)} km</Text>
                      </View>
                    )}
                    {displayTripMin != null && Number.isFinite(displayTripMin) && (
                      <View style={s.metaChip}>
                        <Ionicons name="time-outline" size={11} color="#0ea5e9" />
                        <Text style={s.metaChipText}>~{displayTripMin} min</Text>
                      </View>
                    )}
                    <View style={[s.fairPill, { backgroundColor: fairConfig.color + '18', borderColor: fairConfig.color + '55' }]}>
                      <Ionicons name={fairConfig.icon} size={11} color={fairConfig.color} />
                      <Text style={[s.fairPillText, { color: fairConfig.color }]}>{fairConfig.label}</Text>
                    </View>
                  </View>
                </View>

                {/* Rider avatar block */}
                <View style={s.heroRider}>
                  <View style={[s.heroAvatarWrap, { borderColor: riskColor }]}>
                    <TripProfileAvatar
                      size={56}
                      uri={riderPhotoRaw}
                      borderColor={riskColor}
                      borderWidth={3}
                      accessibilityLabel={`Photo of ${riderName}`}
                      showOnlineDot
                    />
                  </View>
                  <Text style={s.heroRiderName} numberOfLines={1}>{riderName}</Text>
                  {rating != null && (
                    <View style={s.ratingRow}>
                      <Ionicons name="star" size={11} color="#EAB308" />
                      <Text style={s.ratingText}>{rating}{ratingCount != null ? ` (${ratingCount})` : ''}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* ── ROUTE CARD ── */}
              <View style={s.routeCard}>
                {/* Pickup A */}
                <View style={s.routeRow}>
                  <View style={s.dotA} />
                  <View style={s.routeText}>
                    <Text style={s.routeLabel}>PICKUP A</Text>
                    <Text style={s.routeAddr} numberOfLines={2}>{pickupLine}</Text>
                    {etaPickupMin != null && (
                      <Text style={s.routeMeta}>~{etaPickupMin} min away</Text>
                    )}
                  </View>
                </View>

                {stopLine ? (
                  <>
                    <View style={s.connRow}>
                      <View style={s.connDashes} />
                      <View style={s.connLabel}>
                        <Ionicons name="ellipse" size={8} color="#f59e0b" />
                        <Text style={s.connLabelText}>Stop</Text>
                      </View>
                      <View style={s.connDashes} />
                    </View>
                    <View style={s.routeRow}>
                      <View style={[s.dotA, { backgroundColor: '#f59e0b' }]} />
                      <View style={s.routeText}>
                        <Text style={[s.routeLabel, { color: '#f59e0b' }]}>STOP</Text>
                        <Text style={s.routeAddr} numberOfLines={2}>{stopLine}</Text>
                      </View>
                    </View>
                  </>
                ) : null}

                {/* Connector */}
                <View style={s.connRow}>
                  <View style={s.connDashes} />
                  <View style={s.connLabel}>
                    <Ionicons name="arrow-down" size={11} color="#0ea5e9" />
                    <Text style={s.connLabelText}>
                      {displayTripKm != null && Number.isFinite(displayTripKm)
                        ? `${displayTripKm.toFixed(displayTripKm >= 10 ? 0 : 1)} km`
                        : ''}
                      {displayTripMin != null && Number.isFinite(displayTripMin)
                        ? ` · ~${displayTripMin} min`
                        : ''}
                    </Text>
                  </View>
                  <View style={s.connDashes} />
                </View>

                {/* Destination B */}
                <View style={[s.routeRow, s.destHighlight]}>
                  <View style={s.dotB} />
                  <View style={s.routeText}>
                    <Text style={[s.routeLabel, { color: '#f87171' }]}>DESTINATION B</Text>
                    <Text style={[s.routeAddr, s.destAddr]} numberOfLines={2}>{dropLine}</Text>
                    <View style={s.destMeta}>
                      {pricePerKm != null && (
                        <View style={s.destChip}>
                          <Ionicons name="speedometer-outline" size={10} color={C.primary} />
                          <Text style={s.destChipText}>₦{pricePerKm}/km</Text>
                        </View>
                      )}
                      <View style={s.destChip}>
                        <Ionicons name={paymentRaw === 'cash' ? 'cash-outline' : 'wallet-outline'} size={10} color={C.primary} />
                        <Text style={s.destChipText}>{paymentLabel}</Text>
                      </View>
                      {highDemand && (
                        <View style={[s.destChip, { borderColor: '#f59e0b55' }]}>
                          <Ionicons name="flash" size={10} color="#f59e0b" />
                          <Text style={[s.destChipText, { color: '#f59e0b' }]}>{surgeMul.toFixed(1)}× surge</Text>
                        </View>
                      )}
                      {shortTripRate && (
                        <View style={[s.destChip, { borderColor: 'rgba(14,165,233,0.45)' }]}>
                          <Ionicons name="map-outline" size={10} color="#38bdf8" />
                          <Text style={[s.destChipText, { color: '#38bdf8' }]}>Short trip</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>

              {/* ── Extended details (visible when expanded) ── */}
              {expanded && (
                <>
                  {/* Rider badges */}
                  <View style={s.badgeRow}>
                    {riderRiskConfig && (
                      <View style={[s.badge, { backgroundColor: riderRiskConfig.color + '18', borderColor: riderRiskConfig.color + '44' }]}>
                        <Ionicons name={riderRiskConfig.icon} size={12} color={riderRiskConfig.color} />
                        <Text style={[s.badgeText, { color: riderRiskConfig.color }]}>{riderRiskConfig.label}</Text>
                      </View>
                    )}
                    <View style={[s.badge, { backgroundColor: catMeta.color + '18', borderColor: catMeta.color + '44' }]}>
                      <Ionicons name={catMeta.icon as any} size={12} color={catMeta.color} />
                      <Text style={[s.badgeText, { color: catMeta.color }]}>{catMeta.label}</Text>
                    </View>
                    {highDemand && (
                      <View style={[s.badge, { backgroundColor: '#f59e0b18', borderColor: '#f59e0b44' }]}>
                        <Ionicons name="flash" size={12} color="#f59e0b" />
                        <Text style={[s.badgeText, { color: '#f59e0b' }]}>Surge {surgeMul.toFixed(1)}×</Text>
                      </View>
                    )}
                  </View>

                  {/* Nexryde Shield */}
                  {trip?.shield && (
                    <View style={[s.shield, trip.shield.rider_flagged_low_reputation && s.shieldWarn]}>
                      <Ionicons name="shield-checkmark" size={16} color={trip.shield.rider_flagged_low_reputation ? C.danger : C.success} />
                      <Text style={s.shieldText}>
                        {trip.shield.rider_new_account
                          ? 'New rider — limited history'
                          : `Rated ${trip.shield.rider_reputation_avg != null ? `${Number(trip.shield.rider_reputation_avg).toFixed(1)}★` : '—'} · ${trip.shield.rider_reputation_trip_count ?? 0} trips`}
                        {riderRiskConfig ? ` · ${riderRiskConfig.label}` : ''}
                      </Text>
                    </View>
                  )}

                  {/* Mood badges */}
                  {(moodBadges.length > 0 || ridePreferences.length > 0) && (
                    <View style={s.moodWrap}>
                      <Text style={s.moodLabel}>Rider mood & preferences</Text>
                      <View style={s.moodRow}>
                        {moodBadges.map((b, i) => (
                          <View key={i} style={[s.moodChip, { borderColor: b.color, backgroundColor: b.color + '18' }]}>
                            <Ionicons name={b.icon as any} size={12} color={b.color} />
                            <Text style={[s.moodChipText, { color: b.color }]}>{b.label}</Text>
                          </View>
                        ))}
                        {ridePreferences.map((p, i) => (
                          <View key={`pref-${i}`} style={s.moodChip}>
                            <Ionicons name="sparkles-outline" size={12} color={C.primary} />
                            <Text style={s.moodChipText}>{p}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Smart Mode */}
                  {smartEnabled && smartResult && (
                    <View style={[s.smart, smartResult.match ? s.smartMatch : s.smartMiss]}>
                      <Ionicons name={smartResult.match ? 'flash' : 'flash-off'} size={14} color={smartResult.match ? '#00D46A' : '#F59E0B'} />
                      <Text style={[s.smartText, { color: smartResult.match ? '#00D46A' : '#F59E0B' }]}>
                        {smartResult.match ? 'Smart Match ✓' : 'Outside your filters'}
                        {(smartResult.match ? smartResult.reasons : smartResult.warnings).length > 0 &&
                          ` · ${(smartResult.match ? smartResult.reasons : smartResult.warnings).join(', ')}`}
                      </Text>
                    </View>
                  )}

                  {/* Counter section */}
                  {counterMode && (
                    <View style={s.counterBox}>
                      <Text style={s.counterBoxLabel}>Your counter fare</Text>
                      <View style={s.chipsRow}>
                        {CHIP_PRESETS.map((c, idx) => {
                          const best = idx === recommendedChipIndex;
                          return (
                            <TouchableOpacity
                              key={c.label}
                              style={[s.chip, best && s.chipBest, offerExpired && { opacity: 0.45 }]}
                              onPress={() => {
                                if (offerExpired) return;
                                applyChip(c.pct);
                              }}
                              disabled={offerExpired}
                              activeOpacity={0.85}
                            >
                              {best && <Ionicons name="flash-outline" size={12} color={C.primary} />}
                              <Text style={[s.chipText, best && s.chipTextBest]}>{c.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[s.chip, s.chipCustom, offerExpired && { opacity: 0.45 }]}
                          onPress={() => {
                            if (offerExpired) return;
                            fareInputRef.current?.focus();
                          }}
                          disabled={offerExpired}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="create-outline" size={13} color={C.primary} />
                          <Text style={s.chipCustomText}>Custom</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        ref={fareInputRef}
                        style={s.fareInput}
                        keyboardType="number-pad"
                        editable={!offerExpired}
                        value={fareInput}
                        onChangeText={onFareInputChange}
                        placeholder={`Your fare — rider offered ₦${riderOffer.toLocaleString()}`}
                        placeholderTextColor={C.muted}
                      />
                      {hasCounter && (
                        <Text style={s.counterHint}>
                          Counter: ₦{riderOffer.toLocaleString()} → ₦{Number(fareInput.replace(/,/g, '')).toLocaleString()}
                          {' '}(+₦{(Number(fareInput.replace(/,/g, '')) - riderOffer).toLocaleString()})
                        </Text>
                      )}
                    </View>
                  )}
                </>
              )}

            </ScrollView>

            {/* ── STICKY ACTION BUTTONS ── */}
            <View style={[s.actions, { paddingBottom: BOTTOM_INNER }]}>
              {/* Accept */}
              <TouchableOpacity
                style={[
                  s.acceptBtn,
                  (accepting || offerExpired || (counterMode && !hasCounter)) && { opacity: 0.65 },
                ]}
                onPress={() => {
                  if (offerExpired || accepting) return;
                  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onAccept();
                }}
                disabled={accepting || offerExpired || (counterMode && !hasCounter)}
                activeOpacity={0.92}
                accessibilityRole="button"
                accessibilityLabel={
                  offerExpired
                    ? 'Offer expired'
                    : accepting
                      ? 'Accepting ride'
                      : counterMode && hasCounter
                        ? `Send counter offer ${acceptLabelFare} naira`
                        : `Accept ride for ${acceptLabelFare} naira`
                }
              >
                <LinearGradient
                  colors={
                    counterMode && hasCounter
                      ? ['#FBBF24', '#F59E0B', '#D97706']
                      : ['#34F5B8', '#22E5A0', '#0D9F6E']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.acceptGrad}
                >
                  <Ionicons
                    name={counterMode && hasCounter ? 'send' : 'checkmark-circle'}
                    size={20}
                    color={counterMode && hasCounter ? '#000' : C.primaryInk}
                  />
                  <Text style={[s.acceptText, counterMode && hasCounter && { color: '#000' }]}>
                    {offerExpired
                      ? 'Offer expired'
                      : accepting
                        ? 'Accepting…'
                        : counterMode && hasCounter
                          ? `Send Counter · ₦${acceptLabelFare.toLocaleString()}`
                          : `Accept · ₦${acceptLabelFare.toLocaleString()}`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Secondary row */}
              <View style={s.secRow}>
                <TouchableOpacity
                  style={[
                    s.counterBtn,
                    counterMode && s.counterBtnActive,
                    offerExpired && { opacity: 0.45 },
                  ]}
                  onPress={() => {
                    if (offerExpired) return;
                    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCounterMode((v) => !v);
                    setExpanded(true);
                    if (!counterMode) {
                      const base = riderOffer > 0 ? riderOffer : baseFare;
                      onFareInputChange(base > 0 ? String(base) : '');
                      setTimeout(() => fareInputRef.current?.focus(), 300);
                    }
                  }}
                  disabled={offerExpired}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={counterMode ? 'Close counter bid editor' : 'Counter or rebid fare'}
                >
                  <Ionicons name="swap-vertical" size={16} color={counterMode ? '#F59E0B' : C.text} />
                  <Text style={[s.secBtnText, counterMode && { color: '#F59E0B' }]}>
                    {counterMode ? 'Editing bid' : 'Counter / Rebid'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.ignoreBtn}
                  onPress={() => {
                    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onIgnore();
                  }}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Ignore this ride request"
                >
                  <Ionicons name="close-circle-outline" size={16} color={C.danger} />
                  <Text style={s.ignoreBtnText}>Ignore</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>

      </View>
    </Modal>
  );
}

export { DRIVER_OFFER_COUNTDOWN_SECONDS as DRIVER_OFFER_TIMER_SECONDS };

/* ─────────────────────── Styles ─────────────────────── */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0f1e' },

  /* Top header */
  topHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: 'rgba(6,10,20,0.92)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(34,229,160,0.18)',
  },
  topInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10,
  },
  topEyebrow: { fontSize: 10, fontWeight: '800', color: '#22E5A0', letterSpacing: 1.5, textTransform: 'uppercase' },
  topTitle:   { fontSize: 20, fontWeight: '900', color: '#E2E8F0', letterSpacing: -0.3 },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: '#334155',
  },
  timerBadgeUrgent: { borderColor: '#ef444455', backgroundColor: '#1f1010' },
  timerText:        { fontSize: 15, fontWeight: '800', color: '#E2E8F0' },
  timerTextUrgent:  { color: '#ef4444' },

  /* Fare bubble */
  fareBubble: {
    position: 'absolute', right: 14, zIndex: 15,
    backgroundColor: 'rgba(6,10,20,0.94)',
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'rgba(34,229,160,0.38)',
    alignItems: 'center',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  fareBubbleAmount: { fontSize: 20, fontWeight: '900', color: '#22E5A0' },
  fareBubbleSub:    { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 1, textAlign: 'center' },
  fareBubbleHint:   { fontSize: 10, fontWeight: '700', color: '#475569', marginTop: 4, textAlign: 'center' },

  /* Pickup distance chip */
  pickupChip: {
    position: 'absolute', left: 14, zIndex: 15,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(8,12,22,0.88)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(14,165,233,0.4)',
    maxWidth: '58%',
  },
  pickupChipText: { fontSize: 12, fontWeight: '700', color: '#0ea5e9', flexShrink: 1 },

  /* KV wrapper */
  kvWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30 },

  /* Bottom sheet */
  sheet: {
    backgroundColor: 'rgba(6,11,24,0.99)',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(34,229,160,0.2)',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.55, shadowRadius: 24, elevation: 24,
  },
  sheetHandle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, paddingHorizontal: 16,
  },
  handleBar:  { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  handleHint: { fontSize: 11, fontWeight: '600', color: '#475569' },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingHorizontal: 14, paddingTop: 2, gap: 10 },

  /* Hero row */
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroFare: { flex: 1 },
  heroFareAmount: { fontSize: 36, fontWeight: '900', color: '#22E5A0', lineHeight: 42 },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(14,165,233,0.12)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
    borderWidth: 0.5, borderColor: 'rgba(14,165,233,0.3)',
  },
  metaChipText: { fontSize: 12, fontWeight: '700', color: '#0ea5e9' },
  fairPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5,
  },
  fairPillText: { fontSize: 11, fontWeight: '700' },
  heroRider: { alignItems: 'center', gap: 4, minWidth: 72 },
  heroAvatarWrap: {
    width: 56, height: 56, borderRadius: 28,
    overflow: 'hidden', borderWidth: 2.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
  },
  heroAvatar: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarInitial: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: '#22E5A0', borderWidth: 2, borderColor: '#0D1420',
  },
  heroRiderName: { fontSize: 13, fontWeight: '800', color: '#CBD5E1', textAlign: 'center', maxWidth: 76 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 11, fontWeight: '700', color: '#EAB308' },

  /* Route card */
  routeCard: {
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: 'rgba(34,229,160,0.14)',
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dotA:  { width: 12, height: 12, borderRadius: 6, backgroundColor: '#22E5A0', marginTop: 4, flexShrink: 0 },
  dotB:  { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ef4444', marginTop: 4, flexShrink: 0 },
  routeText: { flex: 1 },
  routeLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  routeAddr:  { fontSize: 14, fontWeight: '700', color: '#E2E8F0', lineHeight: 20 },
  routeMeta:  { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },
  connRow:    { flexDirection: 'row', alignItems: 'center', marginLeft: 6, marginVertical: 6, gap: 6 },
  connDashes: { flex: 1, height: 1, backgroundColor: 'rgba(148,163,184,0.15)' },
  connLabel:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(14,165,233,0.12)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 0.5, borderColor: 'rgba(14,165,233,0.3)',
  },
  connLabelText: { fontSize: 11, fontWeight: '800', color: '#0ea5e9' },
  destHighlight: { backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 10, padding: 8, marginTop: 2 },
  destAddr: { fontSize: 15, fontWeight: '800', color: '#f1f5f9' },
  destMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  destChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,212,106,0.1)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, borderWidth: 0.5, borderColor: 'rgba(0,212,106,0.3)',
  },
  destChipText: { fontSize: 11, fontWeight: '700', color: '#00D46A' },

  /* Badges row */
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  /* Shield */
  shield: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
  },
  shieldWarn: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' },
  shieldText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#94a3b8' },

  /* Mood */
  moodWrap: { gap: 6 },
  moodLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.8, textTransform: 'uppercase' },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,212,106,0.08)', paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,212,106,0.2)',
  },
  moodChipText: { fontSize: 11, fontWeight: '700', color: '#00D46A' },

  /* Smart Mode */
  smart: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  smartMatch: { backgroundColor: 'rgba(0,212,106,0.08)', borderColor: 'rgba(0,212,106,0.25)' },
  smartMiss:  { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' },
  smartText:  { fontSize: 12, fontWeight: '700', flex: 1 },

  /* Counter bid */
  counterBox: {
    backgroundColor: '#111827', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
  },
  counterBoxLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  chipsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  chipBest:   { borderColor: '#00D46A', backgroundColor: 'rgba(0,212,106,0.1)' },
  chipText:   { fontSize: 13, fontWeight: '800', color: '#E2E8F0' },
  chipTextBest: { color: '#00D46A' },
  chipCustom: { borderColor: 'rgba(0,212,106,0.45)', backgroundColor: 'rgba(0,212,106,0.08)', gap: 4 },
  chipCustomText: { fontSize: 13, fontWeight: '800', color: '#00D46A' },
  fareInput: {
    backgroundColor: '#0D1420', borderRadius: 12, borderWidth: 1.5, borderColor: '#F59E0B',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '800', color: '#E2E8F0',
    marginBottom: 6,
  },
  counterHint: { fontSize: 12, fontWeight: '700', color: '#F59E0B', textAlign: 'center' },

  /* Action buttons */
  actions: {
    borderTopWidth: 1, borderTopColor: 'rgba(34,229,160,0.12)',
    paddingHorizontal: 14, paddingTop: 12, gap: 10,
    backgroundColor: 'rgba(6,11,24,0.98)',
  },
  acceptBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 10,
  },
  acceptGrad: { paddingVertical: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  acceptText: { fontSize: 17, fontWeight: '900', color: '#022C22' },
  secRow: { flexDirection: 'row', gap: 8 },
  counterBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#1e293b', paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
    minHeight: 48,
  },
  counterBtnActive: { borderColor: 'rgba(245,158,11,0.5)', backgroundColor: 'rgba(245,158,11,0.1)' },
  ignoreBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(239,68,68,0.1)', paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    minHeight: 48,
  },
  secBtnText:  { fontSize: 13, fontWeight: '800', color: '#CBD5E1' },
  ignoreBtnText: { fontSize: 13, fontWeight: '800', color: '#ef4444' },
});
