/**
 * NEXRYDE Live Tracking — premium Uber-standard rider "en route to completion" screen.
 *
 * Phase-aware UI:
 *   finding    → FindingDriverScreenV2 (radar, searching)
 *   accepted   → green ETA card, driver sheet, "Driver on the way" banner
 *   arrived    → amber pulsing "Your driver is here" banner + haptic alert
 *   ongoing    → blue destination ETA, trip timer, trip progress
 *   payment    → TrackingPaymentView
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  InteractionManager,
  Alert,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRiderTrackingSession } from '@/src/components/tracking/hooks/useRiderTrackingSession';
import { LiveTrackingMapShell } from '@/src/components/tracking/live/LiveTrackingMapShell';
import type { LiveTrackingMapHandle } from '@/src/components/tracking/live/LiveTrackingMap';
import { LiveEtaTopCard } from '@/src/components/tracking/live/LiveEtaTopCard';
import type { EtaPhase } from '@/src/components/tracking/live/LiveEtaTopCard';
import { LiveDriverSheet } from '@/src/components/tracking/live/LiveDriverSheet';
import { LiveMapFabs } from '@/src/components/tracking/live/LiveMapFabs';
import { LiveTrackingSkeleton } from '@/src/components/tracking/live/LiveTrackingSkeleton';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';
import { LIVE_LAYOUT } from '@/src/components/tracking/live/liveTrackingLayout';
import FindingDriverScreenV2 from '@/src/components/finding/FindingDriverScreenV2';
import { TrackingPaymentView } from '@/src/components/tracking/TrackingPaymentView';
import { TripMapErrorBoundary } from '@/src/components/TripMapErrorBoundary';
import CancellationReasonModal from '@/src/components/shared/CancellationReasonModal';
import { useThrottledValue } from '@/src/hooks/useThrottledValue';
import { RIDER_TRACKING_DISPLAY_THROTTLE_MS } from '@/src/constants/tripRealtimeRhythm';
import { useDevDriverMovementSim } from '@/src/components/tracking/hooks/useDevDriverMovementSim';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';
import { getAvailableDrivers } from '@/src/services/api';
import { trackVerifyPing } from '@/src/components/tracking/map/trackVerifyLog';
import { TrackingLiveDebugPanel } from '@/src/components/tracking/v2/TrackingLiveDebugPanel';

// After this many seconds searching with no driver matched, the finding screen
// shows a clear "no drivers available" message instead of spinning forever.
const NO_DRIVERS_TIMEOUT_SEC = 120;

// ─── DriverArrivedBanner ─────────────────────────────────────────────────────
// A persistent amber pulsing alert shown when tripStatus === 'arrived'.
// Dismissed once the rider has seen it (after first haptic pulse cycle).
function DriverArrivedBanner({ visible, vehicle, plate }: {
  visible: boolean;
  vehicle: string;
  plate: string | null;
}) {
  const scale  = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const borderGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1,    useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
    const borderLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(borderGlow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(borderGlow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    borderLoop.start();
    return () => borderLoop.stop();
  }, [visible, scale, opacity, borderGlow]);

  if (!visible) return null;

  const vehicleLabel = vehicle && vehicle !== 'Vehicle' ? vehicle : null;
  const plateLabel = plate ? ` · ${plate.toUpperCase()}` : '';
  const identifyLine = vehicleLabel ? `${vehicleLabel}${plateLabel}` : null;

  return (
    <Animated.View style={[bannerStyles.wrap, { opacity, transform: [{ scale }] }]} pointerEvents="none">
      <Animated.View
        style={[
          bannerStyles.card,
          {
            borderColor: borderGlow.interpolate({
              inputRange: [0, 1],
              outputRange: ['rgba(245,158,11,0.45)', 'rgba(245,158,11,0.9)'],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(30,18,0,0.98)', 'rgba(20,12,0,0.98)']}
          style={bannerStyles.grad}
        >
          <View style={bannerStyles.iconWrap}>
            <Ionicons name="location" size={22} color="#F59E0B" />
          </View>
          <View style={bannerStyles.textCol}>
            <Text style={bannerStyles.headline}>Your driver is here</Text>
            {identifyLine ? (
              <Text style={bannerStyles.sub} numberOfLines={1}>{identifyLine}</Text>
            ) : (
              <Text style={bannerStyles.sub}>Walk out to meet your driver</Text>
            )}
          </View>
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Post-trip rating modal ───────────────────────────────────────────────────
// Shows immediately when the trip completes — Uber-style emotional closure.
function TripRatingModal({
  visible, driverName, fare, onSubmit, onSkip,
}: {
  visible: boolean;
  driverName: string;
  fare: string;
  onSubmit: (stars: number, comment?: string) => void;
  onSkip: () => void;
}) {
  const [stars, setStars] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStars(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 7 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  if (!visible) return null;

  return (
    <Animated.View style={[ratingStyles.backdrop, { opacity: opacityAnim }]}>
      <Animated.View style={[ratingStyles.card, { transform: [{ scale: scaleAnim }] }]}>
        <View style={ratingStyles.iconRow}>
          <View style={ratingStyles.checkCircle}>
            <Ionicons name="checkmark" size={28} color="#FFF" />
          </View>
        </View>
        <Text style={ratingStyles.headline}>You arrived safely</Text>
        <Text style={ratingStyles.sub}>Fare: {fare}</Text>
        <Text style={ratingStyles.prompt}>Rate your ride with {driverName}</Text>
        <View style={ratingStyles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => setStars(n)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${n} star`}
            >
              <Ionicons
                name={n <= stars ? 'star' : 'star-outline'}
                size={38}
                color={n <= stars ? '#FBBF24' : '#475569'}
              />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[ratingStyles.submitBtn, stars === 0 && { opacity: 0.45 }]}
          onPress={() => stars > 0 && onSubmit(stars)}
          disabled={stars === 0}
          activeOpacity={0.85}
        >
          <Text style={ratingStyles.submitTxt}>Submit Rating</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ratingStyles.skipBtn} onPress={onSkip} activeOpacity={0.7}>
          <Text style={ratingStyles.skipTxt}>Skip for now</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}
const ratingStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconRow: { marginBottom: 16 },
  checkCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center',
  },
  headline: { fontSize: 22, fontWeight: '900', color: '#F1F5F9', textAlign: 'center' },
  sub: { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginTop: 4 },
  prompt: { fontSize: 15, fontWeight: '700', color: '#CBD5E1', marginTop: 18, marginBottom: 8, textAlign: 'center' },
  starsRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  submitBtn: {
    width: '100%', backgroundColor: '#22C55E', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  submitTxt: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 20, marginTop: 4 },
  skipTxt: { fontSize: 14, fontWeight: '600', color: '#64748B' },
});

const bannerStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: LIVE.edge,
    right: LIVE.edge,
    zIndex: 57,
    alignItems: 'stretch',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  grad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(245,158,11,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  textCol: { flex: 1 },
  headline: { fontSize: 16, fontWeight: '900', color: '#FFF', letterSpacing: -0.2 },
  sub: { fontSize: 12.5, fontWeight: '600', color: '#CBD5E1', marginTop: 2 },
});

// ─── TripAcceptBanner ────────────────────────────────────────────────────────
// Auto-dismiss banner on driver acceptance.
function TripAcceptBanner({ visible, driverName, etaMin }: {
  visible: boolean;
  driverName: string;
  etaMin: number | null;
}) {
  const slideY  = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.parallel([
        Animated.timing(slideY,  { toValue: -20, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0,   duration: 200, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.spring(slideY,  { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible, slideY, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[acceptStyles.wrap, { opacity, transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={['rgba(4,38,28,0.97)', 'rgba(2,28,18,0.97)']}
        style={acceptStyles.card}
      >
        <Ionicons name="checkmark-circle" size={20} color={LIVE.greenBright} />
        <View style={{ flex: 1 }}>
          <Text style={acceptStyles.title}>
            {driverName && driverName !== 'Driver' ? `${driverName} is on the way` : 'Driver confirmed'}
          </Text>
          {etaMin != null && etaMin > 0 ? (
            <Text style={acceptStyles.sub}>Arriving in about {etaMin} min</Text>
          ) : null}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const acceptStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: LIVE.edge,
    right: LIVE.edge,
    zIndex: 56,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.35)',
    shadowColor: '#00D084',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  title: { fontSize: 14, fontWeight: '900', color: '#D9FBEC' },
  sub:   { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 1 },
});

// ─── TripTimer ───────────────────────────────────────────────────────────────
// Counts elapsed seconds from started_at (server) or falls back to local start.
function useTripTimer(active: boolean, startedAtIso: string | null): string {
  const [elapsed, setElapsed] = useState(0);
  const anchorRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) { anchorRef.current = null; setElapsed(0); return; }
    // Prefer server-provided started_at for accuracy across re-renders
    if (startedAtIso) {
      const serverMs = new Date(startedAtIso).getTime();
      if (Number.isFinite(serverMs)) {
        anchorRef.current = serverMs;
      }
    }
    if (anchorRef.current == null) anchorRef.current = Date.now();
    const anchor = anchorRef.current;
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [active, startedAtIso]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function LiveTrackingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const session = useRiderTrackingSession();
  const {
    loading,
    isFindingPhase,
    isLivePhase,
    isPaymentPhase,
    acceptedBanner,
    mapModel,
    statusSubline,
    driverInfo,
    driverHydrated,
    fareDisplay,
    callAllowed,
    isFavoriteDriver,
    startedAtIso,
    distanceRemainingKm,
    liveEta,
    tripStatus,
    tripPaymentMethod,
    paymentStatus,
    financialPaymentPending,
    pickupLabel,
    destinationLabel,
    effectiveTripId,
    currentTrip,
    cancelModalOpen,
    cancellingRide,
    wsConnected,
    syncError,
    liveDebug,
    assignedDriverId,
    isDriverAssigned,
    awaitingDriverGps,
    lastSyncAt,
    riderId,
    actions,
  } = session;

  type NearbyDriverRow = {
    driver_id: string;
    name?: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
  };
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriverRow[]>([]);

  const showConnecting = awaitingDriverGps && tripStatus !== 'arrived';

  const tripSyncDebug = useMemo(
    () => ({
      ...liveDebug,
      tripId: effectiveTripId,
      tripStatus,
      driverId: assignedDriverId,
      riderId: riderId ?? null,
      lastBackendUpdate: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
      driverAssigned: isDriverAssigned,
    }),
    [liveDebug, effectiveTripId, tripStatus, assignedDriverId, riderId, lastSyncAt, isDriverAssigned],
  );

  const mapRef = useRef<LiveTrackingMapHandle>(null);
  const [mapMountReady, setMapMountReady] = useState(false);
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [trafficOn, setTrafficOn] = useState(true);
  const [devSimEnabled, setDevSimEnabled] = useState(false);

  const devSimRoute = useMemo(() => {
    if (mapModel.routePolyline.length >= DIRECTIONS_ROUTE_MIN_POINTS) return mapModel.routePolyline;
    return [];
  }, [mapModel.routePolyline]);

  const devSim = useDevDriverMovementSim(devSimRoute, devSimEnabled && isLivePhase);

  const displayMapModel = useMemo(() => {
    if (!__DEV__ || !devSimEnabled || !devSim.position) return mapModel;
    return {
      ...mapModel,
      driver: devSim.position,
      driverHeading: devSim.heading,
    };
  }, [mapModel, devSimEnabled, devSim.position, devSim.heading]);

  const trackPingRef = useRef(0);
  useEffect(() => {
    if (!__DEV__) return;
    const d = displayMapModel.driver;
    if (!d || d.lat == null || d.lng == null) return;
    trackPingRef.current += 1;
    trackVerifyPing(
      trackPingRef.current,
      d.lat,
      d.lng,
      displayMapModel.driverHeading,
      devSimEnabled && devSim.position ? 'sim' : 'stream',
    );
  }, [
    displayMapModel.driver?.lat,
    displayMapModel.driver?.lng,
    displayMapModel.driverHeading,
    devSimEnabled,
    devSim.position,
  ]);

  // ── Post-trip rating modal ────────────────────────────────────────────────
  // Show immediately when payment phase begins — Uber's "trip done" moment.
  const [ratingDone, setRatingDone] = useState(false);
  const ratedTripIdRef = useRef<string | null>(null);
  // Reset when effectiveTripId changes so rating shows fresh for each trip
  useEffect(() => {
    if (effectiveTripId && ratedTripIdRef.current !== effectiveTripId) {
      setRatingDone(false);
    }
  }, [effectiveTripId]);
  const showRatingModal = isPaymentPhase && !ratingDone;

  const handleRatingSubmit = useCallback(async (stars: number) => {
    if (!effectiveTripId || !riderId) { setRatingDone(true); return; }
    try {
      const { rateTrip } = require('@/src/services/api');
      await rateTrip(effectiveTripId, riderId, stars);
    } catch { /* silent — rating is best-effort */ }
    // Mark done after API attempt (success or fail) so user isn't blocked
    ratedTripIdRef.current = effectiveTripId;
    setRatingDone(true);
  }, [effectiveTripId, riderId]);

  // ── Finding phase elapsed timer ───────────────────────────────────────────
  const findingStartRef = useRef<number | null>(null);
  const [searchElapsedSec, setSearchElapsedSec] = useState(0);
  useEffect(() => {
    if (!isFindingPhase) {
      findingStartRef.current = null;
      setSearchElapsedSec(0);
      return;
    }
    if (findingStartRef.current == null) findingStartRef.current = Date.now();
    const anchor = findingStartRef.current;
    const id = setInterval(() => {
      setSearchElapsedSec(Math.floor((Date.now() - anchor) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isFindingPhase]);

  // Real nearby supply on the finding map (same poll as book screen).
  useEffect(() => {
    const lat = mapModel.pickup?.lat;
    const lng = mapModel.pickup?.lng;
    if (!isFindingPhase || lat == null || lng == null) {
      setNearbyDrivers([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const res = await getAvailableDrivers({ lat, lng });
        const rows = Array.isArray(res.data?.drivers) ? res.data.drivers : [];
        if (cancelled) return;
        setNearbyDrivers(
          rows
            .map((d: Record<string, unknown>) => ({
              driver_id: String(d.driver_id || ''),
              name: String(d.name || 'Driver'),
              lat: Number((d.current_location as { lat?: number } | undefined)?.lat),
              lng: Number((d.current_location as { lng?: number } | undefined)?.lng),
              status: d.is_online ? 'online' : 'offline',
              vehicle: String(d.vehicle_model || d.vehicle_type || 'Car'),
            }))
            .filter((d: NearbyDriverRow) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
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
  }, [isFindingPhase, mapModel.pickup?.lat, mapModel.pickup?.lng]);

  const canMountMap = Boolean(mapModel.pickup);
  const pickupKey = mapModel.pickup
    ? `${mapModel.pickup.lat.toFixed(5)},${mapModel.pickup.lng.toFixed(5)}`
    : '';

  useEffect(() => {
    if (!canMountMap) {
      setMapMountReady(false);
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => setMapMountReady(true));
    return () => task.cancel();
  }, [canMountMap, pickupKey, mapRetryKey]);

  // Haptics on key phase transitions
  const prevStatusRef = useRef(tripStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = tripStatus;
    if (Platform.OS === 'web' || prev === tripStatus) return;
    if (tripStatus === 'arrived') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (tripStatus === 'ongoing' && prev !== 'ongoing') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [tripStatus]);

  const displayDistanceKm   = useThrottledValue(distanceRemainingKm, RIDER_TRACKING_DISPLAY_THROTTLE_MS);
  const displayEtaMinutes   = useThrottledValue(liveEta.etaMinutes,  RIDER_TRACKING_DISPLAY_THROTTLE_MS);

  // Driver info derivations
  const driverName = String(driverInfo?.name || 'Driver');
  const driverPhoto = (typeof driverInfo?.profile_image === 'string' && driverInfo.profile_image)
    || (typeof driverInfo?.face_image === 'string' && driverInfo.face_image)
    || null;
  const driverRating = (() => {
    const r = Number(driverInfo?.rating);
    return Number.isFinite(r) && r > 0 ? r : null;
  })();
  const totalTrips = (() => {
    const t = Number(driverInfo?.total_trips ?? driverInfo?.trips_completed);
    return Number.isFinite(t) && t > 0 ? t : null;
  })();
  const verified = Boolean(
    driverInfo?.verified || driverInfo?.is_verified ||
    driverInfo?.face_verified || driverInfo?.driver_verified,
  );
  const vehicle = String(driverInfo?.vehicle || 'Vehicle');
  const plate   = typeof driverInfo?.plate === 'string' ? driverInfo.plate : null;
  const vehicleColor = typeof driverInfo?.color === 'string' ? driverInfo.color : null;

  const pickupCode = (() => {
    const c = (currentTrip as { pickup_code?: string } | null)?.pickup_code;
    return typeof c === 'string' && c.trim() ? c.trim() : null;
  })();
  const showPickupCode =
    isDriverAssigned &&
    (tripStatus === 'accepted' || tripStatus === 'arrived') &&
    (currentTrip as { pickup_code_required?: boolean } | null)?.pickup_code_required === true;

  // Phase for ETA card & driver sheet
  const etaPhase: EtaPhase = tripStatus === 'arrived'
    ? 'arrived'
    : tripStatus === 'ongoing'
      ? 'ongoing'
      : 'accepted';

  const etaCardTitle = !isDriverAssigned
    ? 'Confirming assignment'
    : tripStatus === 'arrived'
      ? 'Driver Arrived'
      : tripStatus === 'ongoing'
        ? 'On Trip'
        : 'Driver Arriving';

  // Trip timer — anchored on server started_at for accuracy across re-renders
  const tripTimer = useTripTimer(tripStatus === 'ongoing', startedAtIso ?? null);

  const fabBottom = LIVE_LAYOUT.sheetCollapsedH + insets.bottom + 18;

  // Arrived banner top position — clear of back button + ETA card
  const arrivedBannerTop = insets.top + LIVE_LAYOUT.topEtaTop + LIVE_LAYOUT.topEtaCardH + 12;
  const acceptBannerTop  = insets.top + LIVE_LAYOUT.topEtaTop + LIVE_LAYOUT.topEtaCardH + 12;

  const onRecenter = useCallback(() => mapRef.current?.recenter(), []);
  const onToggleLayers = useCallback(() => {
    mapRef.current?.toggleLayers();
    setTrafficOn((v) => !v);
  }, []);

  const handleUpdateBid = useCallback(() => {
    Alert.alert(
      'Update your bid',
      'To change your bid we need to cancel this request and take you back to booking. Continue?',
      [
        { text: 'Keep searching', style: 'cancel' },
        {
          text: 'Update bid',
          onPress: () => {
            void (async () => {
              await actions.onCancelRide('Updating my bid');
              router.push('/rider/book' as never);
            })();
          },
        },
      ],
    );
  }, [actions, router]);

  const cancelSheet = (
    <CancellationReasonModal
      visible={cancelModalOpen}
      role="rider"
      cancelling={cancellingRide}
      onKeepTrip={actions.closeCancelModal}
      onConfirm={(reason) => void actions.onCancelRide(reason)}
    />
  );

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!effectiveTripId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredTxt}>No active trip</Text>
        <TouchableOpacity onPress={actions.onBack}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Finding phase ───────────────────────────────────────────────────────────
  if (isFindingPhase) {
    const raw = currentTrip as {
      fare?: number; offered_fare?: number;
      distance_km?: number; duration_mins?: number;
    } | null;
    const bid   = raw?.fare ?? raw?.offered_fare;
    const parts = pickupLabel.split(',').map((s) => s.trim()).filter(Boolean);
    // Never let the finding phase spin forever in silence: after this many
    // seconds with no driver matched, surface a clear "no drivers available"
    // state so the rider can keep waiting, raise their offer, or cancel.
    const connLost = syncError && !wsConnected;
    const noDriversTimedOut = !connLost && searchElapsedSec >= NO_DRIVERS_TIMEOUT_SEC;
    const findingPhase  = (connLost || noDriversTimedOut) ? 'error' : 'searching';
    const findingErrMsg = connLost
      ? 'Connection lost. Check your network and try again.'
      : noDriversTimedOut
      ? "No drivers are available right now. You can keep waiting, raise your offer, or cancel and try again shortly."
      : null;
    const onFindingTryAgain = connLost
      ? actions.retrySync
      : noDriversTimedOut
      ? () => {
          // Reset the search clock and keep looking.
          findingStartRef.current = Date.now();
          setSearchElapsedSec(0);
        }
      : undefined;
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <FindingDriverScreenV2
          pickupCoords={mapModel.pickup ?? null}
          destinationCoords={mapModel.dropoff ?? null}
          routePolyline={mapModel.routePolyline}
          pickup={pickupLabel}
          pickupAddress={parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : parts[0] || 'Pickup'}
          destinationAddress={destinationLabel || null}
          bidNgn={Number(bid) > 0 ? Math.round(Number(bid)) : 0}
          routeKmLabel={raw?.distance_km != null ? `${Number(raw.distance_km).toFixed(1)} km` : null}
          routeMinLabel={raw?.duration_mins != null ? `~${Math.round(Number(raw.duration_mins))} min` : null}
          phase={findingPhase}
          errorMessage={findingErrMsg}
          timeElapsedSec={searchElapsedSec}
          onCancel={actions.promptCancelRide}
          onTryAgain={onFindingTryAgain}
          onUpdateBid={handleUpdateBid}
          nearbyDrivers={nearbyDrivers}
        />
        {cancelSheet}
      </View>
    );
  }

  // ── Payment phase ───────────────────────────────────────────────────────────
  if (isPaymentPhase) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />

        {/* Map faded behind payment — keeps geographic context like Uber */}
        {canMountMap ? (
          <View style={styles.paymentMapBg} pointerEvents="none">
            <LiveTrackingMapShell ref={mapRef} model={mapModel} />
          </View>
        ) : null}

        {/* Dim overlay */}
        <View style={styles.paymentDim} pointerEvents="none" />

        {/* Payment dock — slides up from bottom */}
        <TrackingPaymentView
          tripId={effectiveTripId}
          loading={loading}
          fareDisplay={fareDisplay}
          financialPaymentPending={financialPaymentPending}
          paymentMethod={tripPaymentMethod}
          paymentStatus={paymentStatus}
          onClose={actions.onCancelRide}
        />

        {/* Rating modal — shown first, before payment checklist */}
        <TripRatingModal
          visible={showRatingModal}
          driverName={driverName}
          fare={fareDisplay ?? ''}
          onSubmit={handleRatingSubmit}
          onSkip={() => setRatingDone(true)}
        />
      </View>
    );
  }

  // ── Skeleton while live phase loads ────────────────────────────────────────
  if (!isLivePhase) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={LIVE.bg} />
        <LiveTrackingSkeleton />
        {cancelSheet}
      </View>
    );
  }

  // ── Live phase ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={LIVE.bg} />

      {/* Map */}
      <View style={styles.mapLayer}>
        {mapMountReady && canMountMap ? (
          <TripMapErrorBoundary
            key={`live-map-${mapRetryKey}`}
            onRetry={() => setMapRetryKey((k) => k + 1)}
          >
            <LiveTrackingMapShell
              ref={mapRef}
              model={displayMapModel}
              connectingToDriver={showConnecting}
            />
          </TripMapErrorBoundary>
        ) : (
          <LiveTrackingSkeleton />
        )}
      </View>

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={actions.onBack}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={22} color={LIVE.text} />
      </TouchableOpacity>

      {/* DEV ONLY — remove before production pilot */}
      {__DEV__ ? (
        <TouchableOpacity
          style={[styles.devSimBtn, { top: insets.top + 52 }]}
          onPress={() => setDevSimEnabled((v) => !v)}
          activeOpacity={0.88}
        >
          <Text style={styles.devSimBtnText}>
            {devSimEnabled ? '⏹ Stop sim driver' : '▶ Sim driver move'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* ETA top card — phase-aware */}
      <LiveEtaTopCard
        topInset={insets.top}
        title={etaCardTitle}
        phase={etaPhase}
        connecting={showConnecting}
        etaMinutes={showConnecting || tripStatus === 'arrived' ? null : displayEtaMinutes}
        distanceKm={showConnecting || tripStatus === 'arrived' ? null : displayDistanceKm}
        arrived={tripStatus === 'arrived'}
        destEtaMinutes={showConnecting ? null : tripStatus === 'ongoing' ? displayEtaMinutes : null}
      />

      {/* Driver Arrived alert banner */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: arrivedBannerTop, zIndex: 57 }}>
        <DriverArrivedBanner
          visible={tripStatus === 'arrived'}
          vehicle={vehicle}
          plate={plate}
        />
      </View>

      {/* Driver accepted banner (auto-dismiss) */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: acceptBannerTop, zIndex: 56 }}>
        <TripAcceptBanner
          visible={acceptedBanner && tripStatus !== 'arrived' && tripStatus !== 'ongoing'}
          driverName={driverName}
          etaMin={showConnecting ? null : displayEtaMinutes}
        />
      </View>

      {/* Trip timer — visible when ongoing */}
      {tripStatus === 'ongoing' ? (
        <View
          style={[styles.tripTimerPill, { top: arrivedBannerTop }]}
          pointerEvents="none"
        >
          <Ionicons name="time-outline" size={14} color={LIVE.blue} />
          <Text style={styles.tripTimerTxt}>{tripTimer}</Text>
          <Text style={styles.tripTimerLabel}>TRIP TIME</Text>
        </View>
      ) : null}

      {/* FABs */}
      <LiveMapFabs
        bottomOffset={fabBottom}
        onSos={actions.onEmergency}
        onRecenter={onRecenter}
        onToggleLayers={onToggleLayers}
        trafficOn={trafficOn}
      />

      {/* Sync error toast */}
      {syncError && !wsConnected ? (
        <View style={[styles.syncToast, { top: insets.top + LIVE_LAYOUT.topEtaTop + LIVE_LAYOUT.topEtaCardH + 72 }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={LIVE.gold} />
          <Text style={styles.syncToastTxt}>Live updates interrupted</Text>
          <TouchableOpacity style={styles.syncRetryBtn} onPress={() => void actions.retrySync()}>
            <Text style={styles.syncRetryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Driver sheet */}
      <LiveDriverSheet
        bottomInset={insets.bottom}
        tripPhase={etaPhase}
        driverName={driverName}
        vehicle={vehicle}
        plate={plate}
        vehicleColor={vehicleColor}
        photoUri={driverPhoto}
        rating={driverRating}
        totalTrips={totalTrips}
        verified={verified}
        etaMinutes={showConnecting || tripStatus === 'arrived' ? 0 : displayEtaMinutes}
        distanceKm={showConnecting || tripStatus === 'arrived' ? 0 : displayDistanceKm}
        arrived={tripStatus === 'arrived'}
        hydrated={driverHydrated}
        pickupCode={pickupCode}
        showPickupCode={showPickupCode}
        callEnabled={callAllowed}
        isFavorite={isFavoriteDriver}
        onToggleFavorite={actions.onToggleFavorite}
        onCall={actions.onCallDriver}
        onChat={actions.onChatDriver}
        onShare={actions.onShareTrip}
        onPickupCode={actions.onOpenPickupCode}
        onSos={actions.onEmergency}
        destEtaMinutes={showConnecting ? null : tripStatus === 'ongoing' ? displayEtaMinutes : null}
        destAddress={tripStatus === 'ongoing' ? destinationLabel : null}
      />

      {/* Status subline pill */}
      {statusSubline ? (
        <View
          style={[styles.statusPill, { bottom: LIVE_LAYOUT.sheetCollapsedH + insets.bottom + 6 }]}
          pointerEvents="none"
        >
          <View style={[styles.liveDot, wsConnected && styles.liveDotOn]} />
          <Text style={styles.statusTxt} numberOfLines={1}>{statusSubline}</Text>
        </View>
      ) : null}

      <TrackingLiveDebugPanel debug={tripSyncDebug} />
      {cancelSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LIVE.bg },
  mapLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: LIVE.mapBg },
  paymentMapBg: { ...StyleSheet.absoluteFillObject, opacity: 0.45 },
  paymentDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  backBtn: {
    position: 'absolute',
    left: LIVE.edge,
    zIndex: 60,
    width: LIVE_LAYOUT.backBtn,
    height: LIVE_LAYOUT.backBtn,
    borderRadius: LIVE_LAYOUT.backBtn / 2,
    backgroundColor: LIVE.glass,
    borderWidth: 1,
    borderColor: LIVE.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  devSimBtn: {
    position: 'absolute',
    left: LIVE.edge,
    zIndex: 61,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(127,29,29,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.65)',
  },
  devSimBtnText: {
    color: '#FEE2E2',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tripTimerPill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: LIVE.radiusPill,
    backgroundColor: 'rgba(4,14,28,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  tripTimerTxt: {
    fontSize: 18, fontWeight: '900', color: LIVE.blue, fontVariant: ['tabular-nums'],
  },
  tripTimerLabel: { fontSize: 10, fontWeight: '700', color: LIVE.faint, letterSpacing: 0.5 },
  syncToast: {
    position: 'absolute',
    left: LIVE.edge,
    right: LIVE.edge,
    zIndex: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 11,
    borderRadius: LIVE.radiusSm,
    backgroundColor: 'rgba(50,28,4,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,201,60,0.4)',
  },
  syncToastTxt: { color: LIVE.gold, fontWeight: '800', flex: 1, fontSize: 12.5 },
  syncRetryBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: LIVE.radiusPill,
    backgroundColor: 'rgba(255,201,60,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,201,60,0.5)',
  },
  syncRetryTxt: { color: '#FFE08A', fontWeight: '900', fontSize: 12 },
  statusPill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: LIVE.radiusPill,
    backgroundColor: 'rgba(6,12,22,0.82)',
    borderWidth: 1,
    borderColor: LIVE.hairline,
    maxWidth: '88%',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE.faint },
  liveDotOn: { backgroundColor: LIVE.green },
  statusTxt: { color: LIVE.sub, fontSize: 11, fontWeight: '700' },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: LIVE.bg, gap: 12,
  },
  centeredTxt: { color: LIVE.sub, fontWeight: '600' },
  link: { color: LIVE.green, fontWeight: '800' },
});
