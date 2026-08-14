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
import { resolveDriverPhotoUri } from '@/src/utils/tripProfilePhotos';
import FindingDriverScreenV2 from '@/src/components/finding/FindingDriverScreenV2';
import { TrackingPaymentView } from '@/src/components/tracking/TrackingPaymentView';
import { TripMapErrorBoundary } from '@/src/components/TripMapErrorBoundary';
import CancellationReasonModal from '@/src/components/shared/CancellationReasonModal';
import { PickupWaitTimerCard } from '@/src/components/shared/PickupWaitTimerCard';
import { ChangeTripRouteModal } from '@/src/components/tracking/live/ChangeTripRouteModal';
import { useThrottledValue } from '@/src/hooks/useThrottledValue';
import { RIDER_TRACKING_DISPLAY_THROTTLE_MS } from '@/src/constants/tripRealtimeRhythm';
import { useDevDriverMovementSim } from '@/src/components/tracking/hooks/useDevDriverMovementSim';
import { DIRECTIONS_ROUTE_MIN_POINTS } from '@/src/navigation/navUtils';
import { getAvailableDrivers } from '@/src/services/api';
import { setForegroundInterval } from '@/src/utils/foregroundInterval';
import { trackVerifyPing } from '@/src/components/tracking/map/trackVerifyLog';
import { TrackingLiveDebugPanel } from '@/src/components/tracking/v2/TrackingLiveDebugPanel';
import {
  riderCancelFeePreviewNgn,
  riderTripCanCancel,
} from '@/src/constants/riderActiveTripDisplay';
import type { NormalizedTripStatus } from '@/src/utils/tripStatus';
import { CURRENCY } from '@/src/constants/theme';

// After this many seconds searching with no driver matched, the finding screen
// shows a clear "no drivers available" message instead of spinning forever.
const NO_DRIVERS_TIMEOUT_SEC = 120;

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
        <Text style={ratingStyles.headline}>You arrived</Text>
        <Text style={ratingStyles.sub}>Fare {fare}</Text>
        <Text style={ratingStyles.prompt}>How was your ride with {driverName}?</Text>
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

// ─── TripAcceptBanner ────────────────────────────────────────────────────────
// Auto-dismiss banner on driver acceptance.
function TripAcceptBanner({ visible, driverName, etaMin, finishing }: {
  visible: boolean;
  driverName: string;
  etaMin: number | null;
  finishing?: boolean;
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
            {finishing
              ? (driverName && driverName !== 'Driver'
                ? `${driverName} is finishing a trip nearby`
                : 'Your driver is finishing a trip nearby')
              : (driverName && driverName !== 'Driver' ? `${driverName} is on the way` : 'Driver confirmed')}
          </Text>
          {finishing ? (
            <Text style={acceptStyles.sub}>They'll join you shortly.</Text>
          ) : etaMin != null && etaMin > 0 ? (
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
    pickupWait,
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
    cancelError,
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

  const [routeEditMode, setRouteEditMode] = useState<'destination' | 'stop' | null>(null);
  const phaseForCancel = (tripStatus || 'pending') as NormalizedTripStatus;
  const canCancelLive = riderTripCanCancel(phaseForCancel);
  const cancelFeeNgn = riderCancelFeePreviewNgn(
    phaseForCancel,
    (currentTrip as { cancellation_fee?: number } | null)?.cancellation_fee,
  );
  const cancelFeeNote =
    cancelFeeNgn == null
      ? null
      : cancelFeeNgn <= 0
        ? 'No cancellation fee while searching for a driver.'
        : `A cancellation fee of about ${CURRENCY}${cancelFeeNgn.toLocaleString()} may apply.`;

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
  /** Brief Uber-style "matched" beat between finding → live tracking. */
  const [matchedBeat, setMatchedBeat] = useState<{ name: string; finishing?: boolean } | null>(null);
  const wasFindingRef = useRef(false);
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
    const stop = setForegroundInterval(() => {
      void run();
    }, 20000);
    return () => {
      cancelled = true;
      stop();
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
  const driverFinishingPriorTrip = Boolean(
    (currentTrip as { driver_finishing_prior_trip?: boolean } | null)?.driver_finishing_prior_trip,
  );

  // Matched beat: hold finding UI ~1.5s with celebration before live map.
  useEffect(() => {
    if (isFindingPhase) {
      wasFindingRef.current = true;
      return;
    }
    if (!wasFindingRef.current || !isDriverAssigned) return;
    wasFindingRef.current = false;
    const name = driverName && driverName !== 'Driver' ? driverName : 'Your driver';
    setMatchedBeat({ name, finishing: driverFinishingPriorTrip });
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const t = setTimeout(() => setMatchedBeat(null), 700);
    return () => clearTimeout(t);
  }, [isFindingPhase, isDriverAssigned, driverName, driverFinishingPriorTrip]);

  // Resolve across profile / face / face URL on both driverInfo and trip payload (Uber-visible).
  const driverPhoto = resolveDriverPhotoUri({
    ...(currentTrip as Record<string, unknown> | null),
    ...(driverInfo as Record<string, unknown> | null),
  });
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
    ? 'Connecting'
    : tripStatus === 'arrived'
      ? 'Driver is here'
      : tripStatus === 'ongoing'
        ? 'On trip'
        : driverFinishingPriorTrip
          ? 'Finishing nearby'
          : 'Driver arriving';

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
      errorMessage={cancelError}
      feePreviewNote={cancelFeeNote}
      onKeepTrip={actions.closeCancelModal}
      onConfirm={(reason) => void actions.onCancelRide(reason)}
    />
  );

  const routeEditSheet = (
    <ChangeTripRouteModal
      visible={routeEditMode != null}
      tripId={effectiveTripId}
      mode={routeEditMode || 'destination'}
      driverLat={mapModel.driver?.lat}
      driverLng={mapModel.driver?.lng}
      onClose={() => setRouteEditMode(null)}
      onSuccess={() => void actions.retrySync()}
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

  // ── Finding phase (+ brief matched celebration) ─────────────────────────────
  if (isFindingPhase || matchedBeat) {
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
    const noDriversTimedOut = !connLost && !matchedBeat && searchElapsedSec >= NO_DRIVERS_TIMEOUT_SEC;
    const findingPhase = matchedBeat
      ? 'matched'
      : (connLost || noDriversTimedOut) ? 'error' : 'searching';
    const findingErrMsg = matchedBeat
      ? null
      : connLost
      ? 'Connection lost. Check your network and try again.'
      : noDriversTimedOut
      ? "No drivers are available right now. You can keep waiting, raise your offer, or cancel and try again shortly."
      : null;
    const onFindingTryAgain = matchedBeat
      ? undefined
      : connLost
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
          matchedDriverName={matchedBeat?.name ?? null}
          driverFinishingPriorTrip={Boolean(matchedBeat?.finishing || driverFinishingPriorTrip)}
          errorMessage={findingErrMsg}
          timeElapsedSec={searchElapsedSec}
          onCancel={matchedBeat ? () => undefined : actions.promptCancelRide}
          onTryAgain={onFindingTryAgain}
          onUpdateBid={matchedBeat ? undefined : handleUpdateBid}
          nearbyDrivers={nearbyDrivers}
        />
        {matchedBeat ? null : cancelSheet}
        {routeEditSheet}
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

  // ── Escape hatch: not live after load (completed/cancelled/unknown) ─────────
  // Previously this spun LiveTrackingSkeleton forever when phase never became live.
  if (!isLivePhase) {
    if (loading) {
      return (
        <View style={styles.root}>
          <StatusBar barStyle="light-content" backgroundColor={LIVE.bg} />
          <LiveTrackingSkeleton />
          {cancelSheet}
          {routeEditSheet}
        </View>
      );
    }
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <StatusBar barStyle="light-content" backgroundColor={LIVE.bg} />
        <Ionicons name="map-outline" size={48} color="#64748B" />
        <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>
          This trip isn&apos;t live
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
          It may have ended or been cancelled. You can open the receipt or go back home.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, backgroundColor: '#22C55E', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}
          onPress={() => void actions.retrySync()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading trip"
        >
          <Text style={{ color: '#022C22', fontWeight: '800' }}>Retry</Text>
        </TouchableOpacity>
        {effectiveTripId ? (
          <TouchableOpacity
            style={{ marginTop: 12, paddingVertical: 10 }}
            onPress={() =>
              router.replace({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)
            }
          >
            <Text style={{ color: '#22C55E', fontWeight: '700' }}>View receipt</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={{ marginTop: 4, paddingVertical: 10 }} onPress={actions.onBack}>
          <Text style={{ color: '#94A3B8', fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
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

      {/* Accept banner only — arrived is already clear on the ETA card */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: acceptBannerTop, zIndex: 56 }}>
        <TripAcceptBanner
          visible={acceptedBanner && tripStatus !== 'arrived' && tripStatus !== 'ongoing'}
          driverName={driverName}
          etaMin={showConnecting ? null : displayEtaMinutes}
          finishing={driverFinishingPriorTrip}
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
          <Text style={styles.tripTimerLabel}>Trip time</Text>
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
        etaMinutes={showConnecting || tripStatus === 'arrived' ? null : displayEtaMinutes}
        distanceKm={showConnecting || tripStatus === 'arrived' ? null : displayDistanceKm}
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
        driverFinishingPriorTrip={driverFinishingPriorTrip}
        canCancel={canCancelLive}
        onCancel={actions.promptCancelRide}
        cancelFeeNote={cancelFeeNote}
        canEditRoute={tripStatus === 'ongoing'}
        onChangeDestination={() => setRouteEditMode('destination')}
        onAddStop={() => setRouteEditMode('stop')}
        canSplitFare={tripStatus === 'ongoing'}
        onSplitFare={() => {
          const fare = Number(currentTrip?.fare ?? fareDisplay ?? 0);
          router.push({
            pathname: '/rider/split-fare',
            params: {
              tripId: effectiveTripId,
              fare: String(Number.isFinite(fare) && fare > 0 ? Math.round(fare) : ''),
            },
          } as never);
        }}
        waitCard={
          tripStatus === 'arrived' ? (
            <PickupWaitTimerCard
              wait={pickupWait}
              variant="rider"
              compact
              pickupCodeRequired={showPickupCode}
            />
          ) : null
        }
      />

      {/* Status subline — skip when ETA card already owns the message */}
      {statusSubline && tripStatus !== 'arrived' && tripStatus !== 'ongoing' ? (
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
      {routeEditSheet}
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
