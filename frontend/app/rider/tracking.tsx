import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Modal,
  StatusBar,
  ActionSheetIOS,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { RIDER_MAP_PRIMARY_CTA_GRADIENT } from '@/src/constants/riderRideChrome';
import { RIDER_DRIVER_FOUND_HANDOFF_MS } from '@/src/constants/riderTripHandoff';
import { useETACountdown } from '@/src/hooks/useETACountdown';
import { fetchTripEta, fetchTripRoute } from '@/src/services/tripTrackingApi';
import {
  RiderFindingStatusHero,
  RiderFindingStrip,
} from '@/src/components/rider/RiderFindingDriverChrome';
import { RiderLiveTripDock, RiderLiveTripDockFade } from '@/src/components/rider/RiderLiveTripDock';
import {
  RiderOnTripRadiantDock,
  RiderOnTripRadiantDockFade,
} from '@/src/components/rider/RiderOnTripRadiantDock';
import {
  RiderTrackingMapChrome,
  RiderTrackingRecenterButton,
} from '@/src/components/rider/RiderTrackingMapChrome';
import { RiderFindingTripDock } from '@/src/components/rider/RiderFindingTripDock';
import { RiderPaymentDock } from '@/src/components/rider/RiderPaymentDock';
import { AddFavoriteDriverModal } from '@/src/components/rider/AddFavoriteDriverModal';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import {
  BACKEND_URL,
  activateInvisibleShieldMode,
  confirmInvisibleShieldSafeArrival,
  confirmSafeArrival,
  getAuthHeaders,
  respondToSafetyCheck,
  runFakeDriverAlertCheck,
  setGeoFenceTripLock,
  triggerSOS,
  uploadInvisibleShieldAudio,
  verifyRiderFaceAtPickup,
  confirmTripPayment,
} from '@/src/services/api';
import {
  formatPaymentMetaDisplay,
  isCashPaymentMethod,
  paymentChecklistPayLabel,
  paymentDockPayButtonLabel,
  riderFinancialPaymentPending,
} from '@/src/utils/tripPaymentMethod';
import { normalizeTripStatus } from '@/src/utils/tripStatus';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import {
  riderTripStatusPollIntervalMs,
  isRiderMapLiveTripStatus,
  isRiderMapFirstTripStatus,
  riderTripEtaFallbackPollMs,
} from '@/src/constants/tripRealtimeRhythm';
import { useTripSafetyRecording } from '@/src/hooks/useTripSafetyRecording';
import MapComponent from '@/src/components/MapComponent';
import RideMap from '@/src/components/RideMap';
import {
  parseTripCoords,
  normalizeDriverInfo,
  formatDriverDisplayField,
  mergeTripFromStatusPayload,
} from '@/src/utils/tripCoords';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { driverPingMovedEnough, parseTrackingPing } from '@/src/utils/riderTripLiveSync';
import { driverAvatarSources } from '@/src/utils/tripProfilePhotos';
import { openShareTrip } from '@/src/utils/openShareTrip';
import { setTripDriverCache, clearTripDriverCache } from '@/src/utils/tripDriverCache';
import { getActiveTrip } from '@/src/services/api';
import { TrafficAI, type TrafficRoute } from '@/src/services/trafficAI';
import { fetchDirections } from '@/src/navigation/navUtils';
import notificationService from '@/src/services/notifications';
import { RideRecordingService } from '@/src/services/rideRecording';
import DriverArrivalIdentityModal, {
  DriverMismatchModal,
} from '@/src/components/DriverArrivalIdentityModal';
import { Image } from 'react-native';

function resolveTrackingColorDot(color: string): string {
  const c = (color || '').toLowerCase();
  if (c.includes('black'))  return '#1a1a1a';
  if (c.includes('white'))  return '#f0f0f0';
  if (c.includes('silver') || c.includes('grey') || c.includes('gray')) return '#9ca3af';
  if (c.includes('red'))    return '#ef4444';
  if (c.includes('blue'))   return '#3b82f6';
  if (c.includes('green'))  return '#22c55e';
  if (c.includes('gold') || c.includes('yellow')) return '#eab308';
  if (c.includes('orange')) return '#f97316';
  if (c.includes('brown'))  return '#92400e';
  if (c.includes('maroon')) return '#9f1239';
  if (c.includes('purple') || c.includes('violet')) return '#9333ea';
  return '#94a3b8';
}

export default function TrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId?: string;
    pickup?: string;
    destination?: string;
    fromBook?: string;
  }>();
  const fromBookHandoff = params.fromBook === 'true' || params.fromBook === '1';
  const { currentTrip, setCurrentTrip } = useAppStore();
  const { user, userId: riderId, token } = useAuthedUserId();
  const [loading, setLoading] = useState(true);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [tripStatus, setTripStatus] = useState<string>(() => {
    const tripIdParam = typeof params.tripId === 'string' ? params.tripId : '';
    const fromBook =
      params.fromBook === 'true' || params.fromBook === '1';
    if (tripIdParam && currentTrip?.id === tripIdParam) {
      return normalizeTripStatus(currentTrip.status, currentTrip.payment_status);
    }
    if (fromBook && tripIdParam) {
      return 'accepted';
    }
    if (!currentTrip?.id) return 'pending';
    if (tripIdParam && currentTrip.id !== tripIdParam) return 'pending';
    return normalizeTripStatus(currentTrip.status, currentTrip.payment_status);
  });
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [securityPromptShown, setSecurityPromptShown] = useState(false);
  const [driverLocation, setDriverLocation] = useState<any>(null);
  const [serverEtaSeconds, setServerEtaSeconds] = useState<number | null>(null);
  const [distanceRemainingKm, setDistanceRemainingKm] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<string | null>(null);
  const [locationStale, setLocationStale] = useState(false);
  const lastLocationAtRef = useRef<number>(Date.now());
  const [guardianAlert, setGuardianAlert] = useState<any>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<TrafficRoute | null>(null);
  // Road-snapped polyline from Google Directions (fetched once per trip segment)
  const [snappedPolyline, setSnappedPolyline] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const snappedPolylineKeyRef = useRef('');
  /** Google Directions ETA (prefers traffic-aware duration when API returns it). */
  const [directionsEtaMin, setDirectionsEtaMin] = useState<number | null>(null);
  /** Bumps on an interval so we re-fetch Directions during live trips (reroute / traffic refresh). */
  const [routeRefreshTick, setRouteRefreshTick] = useState(0);
  const [faceVerifiedAtStart, setFaceVerifiedAtStart] = useState(false);
  const [silentProtecting, setSilentProtecting] = useState(false);
  const [checkingDriverFace, setCheckingDriverFace] = useState(false);
  const [verifyingPickupFace, setVerifyingPickupFace] = useState(false);
  const [riderFaceVerifiedAtPickup, setRiderFaceVerifiedAtPickup] = useState(false);
  const [geoFenceLock, setGeoFenceLock] = useState<any>(null);
  const [armingGeoFence, setArmingGeoFence] = useState(false);
  const [invisibleShieldMode, setInvisibleShieldMode] = useState<any>(null);
  const [speedSpikeAlert, setSpeedSpikeAlert] = useState<any>(null);
  const [gpsSpoofingAlert, setGpsSpoofingAlert] = useState<any>(null);
  const [safeArrivalCheck, setSafeArrivalCheck] = useState<any>(null);
  const [armingInvisibleShield, setArmingInvisibleShield] = useState(false);
  const [confirmingShieldSafe, setConfirmingShieldSafe] = useState(false);
  const [confirmingSafeArrival, setConfirmingSafeArrival] = useState(false);
  const [respondingSafety, setRespondingSafety] = useState<'safe' | 'need_help' | null>(null);
  const [driverStopReason, setDriverStopReason] = useState<{ reason?: string; submitted_at?: string } | null>(null);
  const [isFavoriteDriver, setIsFavoriteDriver] = useState(false);
  const [checkingFavorite, setCheckingFavorite] = useState(false);
  const [showFavoritePrompt, setShowFavoritePrompt] = useState(false);
  const [addingFavorite, setAddingFavorite] = useState(false);
  const [acceptedBanner, setAcceptedBanner] = useState(false);
  const favoritePromptShownRef = useRef<string | null>(null);
  const acceptedBannerShownRef = useRef(false);
  const pickupAlertSentRef = useRef(false);
  const geoFenceAlertShownRef = useRef<string | null>(null);
  const speedSpikeAlertShownRef = useRef<string | null>(null);
  const gpsSpoofingAlertShownRef = useRef<string | null>(null);
  const shieldUploadTripIdRef = useRef<string | null>(null);
  const safeArrivalPromptShownRef = useRef<string | null>(null);
  const nativeMapRef = useRef(null);
  const navigationLockRef = useRef<string | null>(null);
  /** Prior Directions duration for same trip segment — detect material ETA/route changes. */
  const riderRoutePrevRef = useRef<{ legKey: string; durationSec: number } | null>(null);
  const riderRouteAlertAtRef = useRef(0);
  const lastRouteBumpRef = useRef(0);
  const tripStatusRef = useRef(tripStatus);
  const cashPaymentHealRef = useRef(false);
  const driverInfoRef = useRef<any>(null);
  const lastDriverPingRef = useRef<{ lat: number; lng: number } | null>(null);
  tripStatusRef.current = tripStatus;
  driverInfoRef.current = driverInfo;

  useEffect(() => {
    if (driverInfo && Object.keys(driverInfo).length > 0) {
      setTripDriverCache(driverInfo);
    }
  }, [driverInfo]);

  useEffect(() => {
    if (!isRiderMapLiveTripStatus(tripStatus)) {
      clearTripDriverCache();
    }
  }, [tripStatus]);
  // Identity verification states
  const [showIdentityModal, setShowIdentityModal]   = useState(false);
  const [showMismatchModal, setShowMismatchModal]   = useState(false);
  const [identityConfirmed, setIdentityConfirmed]   = useState(false);
  const [vehicleLocked, setVehicleLocked]           = useState(false);
  const [riderCurrentCoords, setRiderCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Map-first: hide dense trip panels until rider expands trip details. */
  const [tripDetailsExpanded, setTripDetailsExpanded] = useState(false);
  const identityModalShownRef = useRef<string | null>(null);
  const arrivedPromptShownRef = useRef<string | null>(null);
  const navigateOnce = useCallback(
    (key: string, run: () => void) => {
      if (navigationLockRef.current === key) return;
      navigationLockRef.current = key;
      run();
    },
    []
  );

  const getCoords = useCallback((value: unknown) => parseTripCoords(value), []);

  const effectiveTripId = params.tripId || currentTrip?.id || '';
  const { recordingStatus, currentRecording, reportSafetyIncident } = useTripSafetyRecording(currentTrip);

  // Helpers for active-call-permitted states
  const ACTIVE_CALL_STATES = ['accepted', 'arrived', 'ongoing', 'pending_payment'];
  const isActiveRide = ACTIVE_CALL_STATES.includes(tripStatus);
  const callAllowed = isActiveRide || isFavoriteDriver;

  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const riderMapFirst = isRiderMapFirstTripStatus(tripStatus);
  const mapFirstPanelHeight = useMemo(
    () => Math.min(Math.max(Math.round(flow.height * 0.8), 360), 640),
    [flow.height],
  );

  const showTripDetailsPanel = !riderMapFirst || tripDetailsExpanded;
  const showMapFirstCriticalAlerts =
    riderMapFirst &&
    !tripDetailsExpanded &&
    Boolean(
      speedSpikeAlert?.active ||
        gpsSpoofingAlert?.active ||
        (safeArrivalCheck?.required && !safeArrivalCheck?.confirmed_at),
    );
  const riderMapFareDisplay = useMemo(() => {
    const f = currentTrip?.fare;
    if (f == null || !Number.isFinite(Number(f))) return null;
    return `₦${Number(f).toLocaleString('en-NG')}`;
  }, [currentTrip?.fare]);

  const tripPaymentMethod = currentTrip?.payment_method ?? 'cash';

  /** Unpaid fare on the post-trip screen (safety-only `pending_payment` stays false when fare is settled). */
  const financialPaymentPending = useMemo(() => {
    if (tripStatus !== 'pending_payment') return false;
    return riderFinancialPaymentPending('completed', paymentStatus);
  }, [tripStatus, paymentStatus]);

  const paymentMetaDisplay = useMemo(
    () => formatPaymentMetaDisplay(tripPaymentMethod, paymentStatus),
    [tripPaymentMethod, paymentStatus],
  );

  const isFindingDriverPhase = useMemo(
    () => tripStatus === 'pending' || tripStatus === 'pending_driver_offers',
    [tripStatus],
  );

  const showStatusCard = !riderMapFirst || showTripDetailsPanel || showMapFirstCriticalAlerts;
  const showMapFirstFindingDock =
    riderMapFirst && isFindingDriverPhase && !tripDetailsExpanded && !fromBookHandoff;
  const showMapFirstPaymentDock =
    riderMapFirst && tripStatus === 'pending_payment' && !tripDetailsExpanded;
  const showMapFirstLiveDock =
    riderMapFirst && isRiderMapLiveTripStatus(tripStatus) && !tripDetailsExpanded;
  const showMapFirstOverlayDock =
    showMapFirstFindingDock || showMapFirstPaymentDock || showMapFirstLiveDock;
  const hideMapFirstScrollPanel = showMapFirstOverlayDock && !tripDetailsExpanded;
  const mapOverlayMode = Boolean(showMapFirstOverlayDock && !tripDetailsExpanded);
  const mapFirstScrollPadBottom =
    insets.bottom +
    (showMapFirstPaymentDock
      ? 360
      : showMapFirstLiveDock && tripStatus === 'ongoing'
        ? 420
        : showMapFirstLiveDock
          ? 380
          : showMapFirstFindingDock
            ? 300
            : 220);

  /** Short area line for assignment sheet (e.g. neighbourhood, city). */
  const pickupVicinityLabel = useMemo(() => {
    const raw = String(currentTrip?.pickup_location?.address || (params.pickup as string) || '').trim();
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    if (parts.length >= 3) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
    return `${parts[0]}, ${parts[1]}`;
  }, [currentTrip?.pickup_location?.address, params.pickup]);

  const rideAcceptedSubtitle = useMemo(() => {
    const n = driverInfo?.name || 'Driver';
    return `${n} accepted your ride`;
  }, [driverInfo?.name]);

  useEffect(() => {
    setTripDetailsExpanded(false);
  }, [effectiveTripId]);

  /** Book → tracking handoff: align UI with persisted trip before first status poll. */
  useEffect(() => {
    if (!effectiveTripId || !currentTrip || currentTrip.id !== effectiveTripId) return;
    const hydrated = normalizeTripStatus(currentTrip.status, currentTrip.payment_status);
    setTripStatus((prev) => {
      if (isRiderMapLiveTripStatus(hydrated)) return hydrated;
      if (
        (prev === 'pending' || prev === 'pending_driver_offers') &&
        isRiderMapFirstTripStatus(hydrated)
      ) {
        return hydrated;
      }
      return prev;
    });
  }, [effectiveTripId, currentTrip?.id, currentTrip?.status, currentTrip?.payment_status]);

  useEffect(() => {
    riderRoutePrevRef.current = null;
    riderRouteAlertAtRef.current = 0;
  }, [effectiveTripId]);

  useEffect(() => {
    if (!riderMapFirst) setTripDetailsExpanded(false);
  }, [riderMapFirst]);

  useEffect(() => {
    const active = isRiderMapLiveTripStatus(tripStatus);
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!active || !key || Platform.OS === 'web') return;
    const id = setInterval(() => setRouteRefreshTick((n) => n + 1), 90_000);
    return () => clearInterval(id);
  }, [tripStatus, effectiveTripId]);

  const handleCallDriverPress = useCallback(() => {
    if (!driverInfo?.phone) {
      Alert.alert('Call unavailable', 'Phone number is not available for this driver yet.');
      return;
    }
    if (!callAllowed && !isFavoriteDriver) {
      Alert.alert(
        'Call unavailable',
        'You can call while the trip is active, or add this driver to favorites for future calls.',
      );
      return;
    }
    const phone = (driverInfo.phone as string).replace(/\s+/g, '');
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Cannot call', 'Unable to open the phone app on this device.'),
    );
  }, [driverInfo?.phone, callAllowed, isFavoriteDriver]);

  // Mask a phone number for display: 08012345678 → 0801***5678
  const maskPhone = (phone: string | null | undefined): string => {
    if (!phone) return '';
    const d = phone.replace(/\s+/g, '').replace(/-/g, '');
    if (d.length >= 8) return d.slice(0, 4) + '***' + d.slice(-4);
    return phone;
  };

  // Check if this driver is favorited
  const checkIsFavorite = useCallback(async (driverId: string) => {
    if (!riderId || !driverId) return;
    setCheckingFavorite(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/users/${riderId}/favorite-drivers/${driverId}/check`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setIsFavoriteDriver(Boolean(data?.is_favorite));
      }
    } catch { /* silent */ }
    finally { setCheckingFavorite(false); }
  }, [riderId]);

  // Add driver to favorites
  const handleAddFavorite = useCallback(async (driverId: string) => {
    if (!riderId || !driverId) return;
    setAddingFavorite(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/users/${riderId}/favorite-drivers`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id: driverId }),
        }
      );
      if (res.ok) {
        setIsFavoriteDriver(true);
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch {
      Alert.alert('Error', 'Could not add driver to favorites.');
    } finally {
      setAddingFavorite(false);
      setShowFavoritePrompt(false);
    }
  }, [riderId]);
  /* ── Rider GPS for auto-confirm ── */
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 8000 },
          (loc) => setRiderCurrentCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude })
        );
      } catch { /* ignore */ }
    })();
    return () => { sub?.remove(); };
  }, []);

  const haversineM = useCallback((a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }, []);

  const riderNearPickup = useMemo(() => {
    if (!riderCurrentCoords) return false;
    const pc = getCoords(currentTrip?.pickup_location);
    if (!pc) return false;
    return haversineM(riderCurrentCoords, pc) <= 150;
  }, [riderCurrentCoords, currentTrip?.pickup_location, haversineM, getCoords]);

  /* ── Lock vehicle data on identity confirm ── */
  const handleIdentityConfirmed = useCallback(async () => {
    setIdentityConfirmed(true);
    setShowIdentityModal(false);
    if (!vehicleLocked && effectiveTripId) {
      try {
        await fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/lock-vehicle`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        setVehicleLocked(true);
      } catch { /* non-critical */ }
    }
  }, [vehicleLocked, effectiveTripId]);

  /* ── Report vehicle mismatch ── */
  const handleReportMismatch = useCallback(async () => {
    setShowMismatchModal(false);
    setShowIdentityModal(false);
    try {
      await fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/report-mismatch`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported_at: new Date().toISOString(), type: 'vehicle_mismatch' }),
      });
    } catch { /* non-critical */ }
    Alert.alert(
      'Report Submitted',
      'Nexryde has been notified. Do not enter the vehicle. You can cancel this ride safely.',
      [{ text: 'Cancel Ride', onPress: () => {
        void fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/cancel`, {
          method: 'POST', headers: getAuthHeaders(),
        }).then(() => router.replace('/(rider-tabs)/rider-home'));
      }}, { text: 'Stay on screen', style: 'cancel' }]
    );
  }, [effectiveTripId, router]);

  const pickupCoords = getCoords(currentTrip?.pickup_location);
  const dropoffCoords = getCoords(currentTrip?.dropoff_location);
  const liveDriverCoords = getCoords(driverLocation);

  const handleRecenterMap = useCallback(() => {
    const m = nativeMapRef.current as {
      animateCamera?: (c: object, o?: object) => void;
      fitToCoordinates?: (c: object[], o?: object) => void;
    } | null;
    if (!m) return;
    try {
      if (liveDriverCoords && m.animateCamera) {
        m.animateCamera(
          {
            center: { latitude: liveDriverCoords.lat, longitude: liveDriverCoords.lng },
            zoom: 16,
            pitch: 0,
          },
          { duration: 500 },
        );
        return;
      }
      if (pickupCoords && dropoffCoords && m.fitToCoordinates) {
        m.fitToCoordinates(
          [
            { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
            { latitude: dropoffCoords.lat, longitude: dropoffCoords.lng },
          ],
          {
            edgePadding: { top: 100, right: 48, bottom: mapFirstScrollPadBottom, left: 48 },
            animated: true,
          },
        );
      }
    } catch {
      /* map ref not ready */
    }
  }, [liveDriverCoords, pickupCoords, dropoffCoords, mapFirstScrollPadBottom]);

  const liveEta = useETACountdown(serverEtaSeconds, trackingStatus);

  const driverPickupApproach = useMemo(() => {
    if (tripStatus !== 'accepted' || !liveDriverCoords || !pickupCoords) return null;
    const m = haversineM(liveDriverCoords, pickupCoords);
    if (!Number.isFinite(m)) return null;
    const km =
      distanceRemainingKm != null && Number.isFinite(Number(distanceRemainingKm))
        ? Number(distanceRemainingKm)
        : m / 1000;
    const min =
      liveEta.etaMinutes != null && liveEta.etaMinutes > 0
        ? liveEta.etaMinutes
        : Math.max(1, Math.round((km / 28) * 60));
    return { km, min, meters: m };
  }, [
    tripStatus,
    liveDriverCoords,
    pickupCoords,
    haversineM,
    liveEta.etaMinutes,
    distanceRemainingKm,
  ]);
  // Prefer road-snapped Google Directions polyline; fall back to straight-segment heuristic
  const routePolyline =
    snappedPolyline.length > 0
      ? snappedPolyline
      : pickupCoords && dropoffCoords
      ? [
          { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
          ...(liveDriverCoords && isRiderMapLiveTripStatus(tripStatus)
            ? [{ latitude: liveDriverCoords.lat, longitude: liveDriverCoords.lng }]
            : []),
          { latitude: dropoffCoords.lat, longitude: dropoffCoords.lng },
        ]
      : [];
  useEffect(() => {
    let active = true;
    const loadOptimizedRoute = async () => {
      if (!pickupCoords || !dropoffCoords) {
        if (active) setOptimizedRoute(null);
        return;
      }
      const routes = await TrafficAI.getOptimizedRoutes(
        { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
        { latitude: dropoffCoords.lat, longitude: dropoffCoords.lng },
        { prioritizeTime: true, avoidTolls: false }
      );
      if (active) setOptimizedRoute(routes[0] || null);
    };
    void loadOptimizedRoute();
    return () => {
      active = false;
    };
  }, [pickupCoords?.lat, pickupCoords?.lng, dropoffCoords?.lat, dropoffCoords?.lng, routeRefreshTick]);

  // Directions polyline refresh (expensive) — decoupled from per-second driver GPS; backend ETA is primary.
  useEffect(() => {
    const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
    if (!GOOGLE_KEY) {
      setDirectionsEtaMin(null);
      return;
    }
    if (!isRiderMapLiveTripStatus(tripStatus)) {
      setDirectionsEtaMin(null);
      snappedPolylineKeyRef.current = '';
      return;
    }
    if (tripStatus === 'accepted' && serverEtaSeconds != null) {
      setDirectionsEtaMin(null);
      return;
    }
    const originCoords = tripStatus === 'ongoing' ? pickupCoords : pickupCoords;
    const destCoords = tripStatus === 'ongoing' ? dropoffCoords : pickupCoords;
    if (!originCoords || !destCoords) {
      setDirectionsEtaMin(null);
      return;
    }
    const key = `${tripStatus}|${originCoords.lat.toFixed(4)},${originCoords.lng.toFixed(4)}|${destCoords.lat.toFixed(4)},${destCoords.lng.toFixed(4)}|t${routeRefreshTick}`;
    if (key === snappedPolylineKeyRef.current) return;
    snappedPolylineKeyRef.current = key;
    fetchDirections(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng, GOOGLE_KEY)
      .then((res) => {
        if (!res) {
          setDirectionsEtaMin(null);
          return;
        }
        setSnappedPolyline(res.overviewCoords);
        const sec = res.totalDurationInTrafficSec ?? res.totalDurationSec;
        const min = Math.ceil(sec / 60);
        setDirectionsEtaMin(min >= 1 && min <= 180 ? min : null);

        if (effectiveTripId) {
          const legKey = `${effectiveTripId}|${tripStatus}`;
          const prev = riderRoutePrevRef.current;
          if (prev && prev.legKey === legKey && prev.durationSec >= 45) {
            const dSec = Math.abs(sec - prev.durationSec);
            if (dSec >= 120 && Date.now() - riderRouteAlertAtRef.current > 80000) {
              riderRouteAlertAtRef.current = Date.now();
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              void notificationService.sendLocalNotification({
                type: 'rider_route_updated',
                title: 'Route updated',
                body: `Your trip path or ETA changed (often due to traffic). About ${min} min on the latest route.`,
                data: { trip_id: effectiveTripId },
              });
            }
          }
          riderRoutePrevRef.current = { legKey, durationSec: sec };
        }
      })
      .catch(() => {
        setDirectionsEtaMin(null);
      });
  }, [tripStatus, routeRefreshTick, effectiveTripId, pickupCoords?.lat, pickupCoords?.lng, dropoffCoords?.lat, dropoffCoords?.lng, serverEtaSeconds]);

  const mapTitle =
    tripStatus === 'accepted'
      ? 'Driver is on the way'
      : tripStatus === 'arrived'
        ? 'Driver is at pickup'
        : tripStatus === 'ongoing'
          ? 'Live Trip Tracking'
          : tripStatus === 'pending_payment'
            ? financialPaymentPending
              ? 'Trip ended — payment due'
              : 'Trip ended — confirm safety'
            : tripStatus === 'cancelled'
              ? 'Trip has been cancelled'
              : 'Searching Nearby Drivers';
  const mapSubtitle =
    tripStatus === 'accepted'
      ? 'Your driver has accepted. Get ready for pickup.'
      : tripStatus === 'arrived'
        ? 'Driver arrived — tap "Show Pick-up Code" and hand your phone to the driver'
        : tripStatus === 'ongoing'
          ? 'Your trip is currently in progress'
          : tripStatus === 'pending_payment'
            ? financialPaymentPending
              ? isCashPaymentMethod(tripPaymentMethod)
                ? 'Pay your driver in cash, then confirm on the receipt.'
                : `Settle your fare · ${paymentMetaDisplay.line}`
              : 'Confirm safe arrival or Invisible Shield steps so we can finalize your trip.'
            : tripStatus === 'cancelled'
              ? 'Your trip was cancelled.'
              : 'Live tracking will appear once a driver accepts';

  const fetchStatus = useCallback(async () => {
    if (!effectiveTripId || !riderId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/status`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) return;

      const normalizedStatus = normalizeTripStatus(data.status, data.payment_status);
      const shieldPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(data.invisible_shield_mode?.active) &&
        !data.invisible_shield_mode?.confirmed_safe_at &&
        !data.invisible_shield_mode?.auto_escalated_at;
      const safeArrivalPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(data.safe_arrival_check?.required) &&
        !data.safe_arrival_check?.confirmed_at;
      const screenStatus = shieldPendingConfirmation || safeArrivalPendingConfirmation ? 'pending_payment' : normalizedStatus;
      setTripStatus(screenStatus);
      setPaymentStatus(data.payment_status || 'pending');
      const normalizedDriver = normalizeDriverInfo(data.driver_info);
      setDriverInfo(normalizedDriver);
      setTripDriverCache(normalizedDriver);
      const le = data.live_eta as Record<string, unknown> | undefined;
      const rawDl = data.driver_location as Record<string, unknown> | undefined;
      const statusPing = parseTrackingPing({
        driver_location: data.driver_location,
        eta_seconds:
          le?.eta_seconds != null
            ? Number(le.eta_seconds)
            : rawDl?.eta_seconds != null
              ? Number(rawDl.eta_seconds)
              : undefined,
        distance_remaining_km:
          le?.distance_km != null
            ? Number(le.distance_km)
            : rawDl?.distance_km != null
              ? Number(rawDl.distance_km)
              : undefined,
        speed_kmh:
          data.current_speed_kmh != null
            ? Number(data.current_speed_kmh)
            : rawDl?.speed_kmh != null
              ? Number(rawDl.speed_kmh)
              : le?.average_speed_kmh != null
                ? Number(le.average_speed_kmh)
                : undefined,
      });
      if (statusPing.etaSeconds != null) {
        setServerEtaSeconds(Math.max(0, Math.floor(statusPing.etaSeconds)));
      }
      if (statusPing.distanceKm != null) setDistanceRemainingKm(statusPing.distanceKm);
      if (statusPing.trackingStatus) setTrackingStatus(statusPing.trackingStatus);
      if (statusPing.speedKmh != null) setSpeedKmh(statusPing.speedKmh);
      if (statusPing.location) {
        const loc = statusPing.location;
        lastDriverPingRef.current = loc;
        lastLocationAtRef.current = Date.now();
        setLocationStale(false);
        setDriverLocation(loc);
      }
      setGuardianAlert(data.guardian_alert || null);
      setFaceVerifiedAtStart(Boolean(data.face_verified_at_start));
      setRiderFaceVerifiedAtPickup(Boolean(data.rider_face_verified_at_pickup));
      setGeoFenceLock(data.geo_fence_trip_lock || null);
      setSpeedSpikeAlert(data.speed_spike_alert || null);
      setGpsSpoofingAlert(data.gps_spoofing_alert || null);
      setDriverStopReason(data.driver_stop_reason || null);
      setInvisibleShieldMode(data.invisible_shield_mode || null);
      setSafeArrivalCheck(data.safe_arrival_check || null);

      {
        const prev = useAppStore.getState().currentTrip;
        setCurrentTrip(
          mergeTripFromStatusPayload(
            prev?.id === effectiveTripId ? prev : null,
            effectiveTripId,
            riderId,
            data as Record<string, unknown>,
            screenStatus,
          ),
        );
      }

      if (
        screenStatus === 'arrived' &&
        !pickupAlertSentRef.current &&
        !securityPromptShown &&
        arrivedPromptShownRef.current !== effectiveTripId
      ) {
        pickupAlertSentRef.current   = true;
        arrivedPromptShownRef.current = effectiveTripId;
        setSecurityPromptShown(true);
        if (identityModalShownRef.current !== effectiveTripId) {
          identityModalShownRef.current = effectiveTripId;
          setShowIdentityModal(true);
        }
      }

      if (screenStatus === 'cancelled') {
        setCurrentTrip(null);
        navigateOnce(`cancelled-${effectiveTripId}`, () => router.replace('/(rider-tabs)/rider-home'));
        return;
      }

      if (screenStatus === 'completed') {
        navigateOnce(`receipt-${effectiveTripId}`, () =>
          router.replace({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)
        );
      }
    } catch {
      /* network */
    } finally {
      setLoading(false);
    }
  }, [effectiveTripId, riderId, router, securityPromptShown, setCurrentTrip]);

  /** Legacy cash trips may still have payment_status pending after drop-off — heal once. */
  useEffect(() => {
    if (!effectiveTripId || tripStatus !== 'pending_payment') return;
    if (!isCashPaymentMethod(tripPaymentMethod)) return;
    const ps = String(paymentStatus || '').toLowerCase();
    if (ps === 'completed' || ps === 'paid') return;
    if (cashPaymentHealRef.current) return;
    cashPaymentHealRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await confirmTripPayment(effectiveTripId);
        if (cancelled) return;
        setPaymentStatus('completed');
        setCurrentTrip((prev) =>
          prev?.id === effectiveTripId ? { ...prev, payment_status: 'completed' } : prev,
        );
        void fetchStatus();
      } catch {
        cashPaymentHealRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    effectiveTripId,
    tripStatus,
    tripPaymentMethod,
    paymentStatus,
    fetchStatus,
    setCurrentTrip,
  ]);

  const handleTripWs = useCallback(
    (msg: RiderTripWsMessage) => {
      if (!riderId) return;
      const t = (msg.trip || {}) as Record<string, any>;
      const hasTripBlob = Boolean(msg.trip && Object.keys(t).length > 0);
      const normalizedStatus = normalizeTripStatus(msg.status ?? tripStatusRef.current, t.payment_status);
      const shieldPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(t.invisible_shield_mode?.active) &&
        !t.invisible_shield_mode?.confirmed_safe_at &&
        !t.invisible_shield_mode?.auto_escalated_at;
      const safeArrivalPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(t.safe_arrival_check?.required) &&
        !t.safe_arrival_check?.confirmed_at;
      const screenStatus = shieldPendingConfirmation || safeArrivalPendingConfirmation ? 'pending_payment' : normalizedStatus;
      const statusChanged = screenStatus !== tripStatusRef.current;

      const trackingPing = parseTrackingPing({
        driver_location: msg.driver_location,
        eta_seconds: msg.eta_seconds,
        distance_remaining_km: msg.distance_remaining_km,
        distance_remaining: (msg as Record<string, unknown>).distance_remaining as
          | number
          | undefined,
        speed_kmh: (msg as Record<string, unknown>).speed_kmh as number | undefined,
      });

      if (trackingPing.etaSeconds != null) {
        setServerEtaSeconds(Math.max(0, Math.floor(trackingPing.etaSeconds)));
      }
      if (trackingPing.distanceKm != null) {
        setDistanceRemainingKm(trackingPing.distanceKm);
      }
      if (trackingPing.trackingStatus) {
        setTrackingStatus(trackingPing.trackingStatus);
      }
      if (trackingPing.speedKmh != null) {
        setSpeedKmh(trackingPing.speedKmh);
      }

      if (trackingPing.location) {
        const loc = trackingPing.location;
        if (driverPingMovedEnough(lastDriverPingRef.current, loc)) {
          lastDriverPingRef.current = loc;
          lastLocationAtRef.current = Date.now();
          setLocationStale(false);
          setDriverLocation(loc);
          const now = Date.now();
          if (now - lastRouteBumpRef.current > 45000) {
            lastRouteBumpRef.current = now;
            setRouteRefreshTick((n) => n + 1);
          }
        }
      }

      if (!statusChanged && !hasTripBlob) {
        return;
      }

      setTripStatus(screenStatus);
      if (t.payment_status) setPaymentStatus(String(t.payment_status));
      setFaceVerifiedAtStart(Boolean(t.face_verified_at_start));
      setRiderFaceVerifiedAtPickup(Boolean(t.rider_face_verified_at_pickup));
      setGeoFenceLock(t.geo_fence_trip_lock || null);
      setSpeedSpikeAlert(t.speed_spike_alert || null);
      setGpsSpoofingAlert(t.gps_spoofing_alert || null);
      setDriverStopReason((t.driver_stop_reason as any) || null);
      setInvisibleShieldMode(t.invisible_shield_mode || null);
      setSafeArrivalCheck(t.safe_arrival_check || null);

      if (t.driver_id) {
        setDriverInfo((prev: any) =>
          normalizeDriverInfo({
            ...(prev || {}),
            driver_id: t.driver_id,
            name: t.driver_name || prev?.name || 'Driver',
            rating: prev?.rating ?? prev?.avg_rating ?? t.driver_rating ?? null,
            vehicle: t.vehicle_model || prev?.vehicle || 'Vehicle',
            plate: t.vehicle_plate || prev?.plate || '',
            color: t.vehicle_color || prev?.color || '',
            profile_image: prev?.profile_image || null,
            face_image: prev?.face_image || null,
            total_trips: prev?.total_trips ?? t.total_trips,
            completed_trips: prev?.completed_trips ?? t.completed_trips,
          }),
        );
      }

      if (hasTripBlob) {
        const prev = useAppStore.getState().currentTrip;
        const priorDriver = normalizeDriverInfo(driverInfoRef.current);
        setCurrentTrip(
          mergeTripFromStatusPayload(
            prev?.id === effectiveTripId ? prev : null,
            effectiveTripId,
            riderId,
            {
              ...t,
              status: screenStatus,
              driver_info:
                t.driver_id || priorDriver
                  ? {
                      ...(priorDriver || {}),
                      driver_id: t.driver_id || priorDriver?.driver_id,
                      name: t.driver_name || priorDriver?.name,
                      vehicle_model: t.vehicle_model || priorDriver?.vehicle,
                      vehicle_plate: t.vehicle_plate || priorDriver?.plate,
                      vehicle_color: t.vehicle_color || priorDriver?.color,
                      driver_rating: t.driver_rating ?? priorDriver?.rating,
                    }
                  : undefined,
            },
            screenStatus,
          ),
        );
      }

      if (
        screenStatus === 'arrived' &&
        !pickupAlertSentRef.current &&
        arrivedPromptShownRef.current !== effectiveTripId
      ) {
        pickupAlertSentRef.current = true;
        arrivedPromptShownRef.current = effectiveTripId;
        setSecurityPromptShown(true);
        if (identityModalShownRef.current !== effectiveTripId) {
          identityModalShownRef.current = effectiveTripId;
          setShowIdentityModal(true);
        }
      }

      if (screenStatus === 'cancelled') {
        setCurrentTrip(null);
        navigateOnce(`cancelled-${effectiveTripId}`, () => router.replace('/(rider-tabs)/rider-home'));
        return;
      }
      if (screenStatus === 'completed') {
        navigateOnce(`receipt-${effectiveTripId}`, () =>
          router.replace({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)
        );
        return;
      }
      if (statusChanged) {
        void fetchStatus();
      }
    },
    [effectiveTripId, riderId, router, setCurrentTrip, fetchStatus, navigateOnce]
  );

  useFocusEffect(
    useCallback(() => {
      if (!effectiveTripId || !riderId) return;
      void fetchStatus();
    }, [effectiveTripId, riderId, fetchStatus]),
  );

  useEffect(() => {
    if (!effectiveTripId || !riderId) return;
    const prev = useAppStore.getState().currentTrip;
    if (prev?.id === effectiveTripId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await getActiveTrip(riderId);
        if (cancelled) return;
        const payload = res?.data;
        if (payload?.active && payload?.trip?.id === effectiveTripId) {
          const trip = payload.trip as Record<string, unknown>;
          const st = normalizeTripStatus(
            String(trip.status || ''),
            String(trip.payment_status || ''),
          );
          setCurrentTrip(
            mergeTripFromStatusPayload(null, effectiveTripId, riderId, trip, st),
          );
          setTripStatus(st);
        }
      } catch {
        /* keep polling */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveTripId, riderId, setCurrentTrip]);

  const { connected: riderWsConnected } = useRiderTripRealtime({
    riderId,
    token,
    enabled: Boolean(effectiveTripId && riderId && token),
    watchTripId: effectiveTripId || null,
    onTripUpdate: handleTripWs,
  });

  useEffect(() => {
    if (!__DEV__ || !['accepted', 'ongoing'].includes(tripStatus)) return;
    const label = tripStatus === 'ongoing' ? 'ON TRIP REAL-TIME SYNC' : 'TRACKING STATE SYNC';
    console.log(`=== ${label} ===`);
    console.log('Driver location:', driverLocation);
    console.log('Distance remaining (km):', distanceRemainingKm);
    console.log('Speed (km/h):', speedKmh);
    console.log('Server ETA (s):', serverEtaSeconds);
    console.log('Display ETA (s):', liveEta.etaSeconds);
    console.log('Tracking status:', trackingStatus);
    console.log('WS connected:', riderWsConnected);
    console.log('========================');
  }, [
    tripStatus,
    driverLocation,
    distanceRemainingKm,
    speedKmh,
    serverEtaSeconds,
    liveEta.etaSeconds,
    trackingStatus,
    riderWsConnected,
  ]);

  useEffect(() => {
    if (!effectiveTripId || !riderId) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await fetchStatus();
    };
    void run();
    const pollMs = riderTripStatusPollIntervalMs(riderWsConnected, tripStatus);
    const interval = setInterval(() => {
      if (mounted) void fetchStatus();
    }, pollMs);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [effectiveTripId, riderId, fetchStatus, riderWsConnected, tripStatus]);

  useEffect(() => {
    if (!effectiveTripId || !isRiderMapLiveTripStatus(tripStatus)) return;
    let cancelled = false;
    void (async () => {
      const route = await fetchTripRoute(effectiveTripId);
      if (cancelled || !route?.waypoints?.length) return;
      setSnappedPolyline(
        route.waypoints.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      );
    })();
    const pullEta = () => {
      void fetchTripEta(effectiveTripId).then((eta) => {
        if (!eta) return;
        setServerEtaSeconds(eta.eta_seconds);
        setTrackingStatus(eta.status);
        if (Number.isFinite(eta.distance_km)) setDistanceRemainingKm(eta.distance_km);
        if (Number.isFinite(eta.average_speed) && eta.average_speed > 0) {
          setSpeedKmh(eta.average_speed);
        }
      });
    };
    if (!riderWsConnected) pullEta();
    const etaIv = setInterval(pullEta, riderTripEtaFallbackPollMs(riderWsConnected));
    return () => {
      cancelled = true;
      clearInterval(etaIv);
    };
  }, [effectiveTripId, tripStatus, riderWsConnected]);

  useEffect(() => {
    if (!isRiderMapLiveTripStatus(tripStatus)) return;
    const staleIv = setInterval(() => {
      setLocationStale(Date.now() - lastLocationAtRef.current > 22000);
    }, 4000);
    return () => clearInterval(staleIv);
  }, [tripStatus]);

  // Check favorite status whenever driverInfo.driver_id becomes known
  useEffect(() => {
    const driverId = driverInfo?.driver_id;
    if (!driverId) return;
    void checkIsFavorite(driverId);
  }, [driverInfo?.driver_id, checkIsFavorite]);

  // Show "Add to Favorites" prompt once when ride reaches completed/pending_payment
  useEffect(() => {
    const driverId = driverInfo?.driver_id;
    if (!driverId) return;
    if (isFavoriteDriver) return; // already favorited
    const shouldPrompt = ['completed', 'pending_payment'].includes(tripStatus);
    if (shouldPrompt && favoritePromptShownRef.current !== effectiveTripId) {
      favoritePromptShownRef.current = effectiveTripId;
      // Small delay so receipt navigation has time to happen first
      const t = setTimeout(() => setShowFavoritePrompt(true), 1200);
      return () => clearTimeout(t);
    }
  }, [tripStatus, driverInfo?.driver_id, isFavoriteDriver, effectiveTripId]);

  useEffect(() => {
    if (!fromBookHandoff || acceptedBannerShownRef.current) return;
    if (!isRiderMapLiveTripStatus(tripStatus)) return;
    acceptedBannerShownRef.current = true;
    setAcceptedBanner(true);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const t = setTimeout(() => setAcceptedBanner(false), RIDER_DRIVER_FOUND_HANDOFF_MS);
    return () => clearTimeout(t);
  }, [fromBookHandoff, tripStatus]);

  const handleCancelRide = async () => {
    if (!effectiveTripId || !riderId) return;
    if (['ongoing', 'pending_payment', 'completed', 'cancelled'].includes(tripStatus)) {
      router.back();
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/cancel`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ cancelled_by: riderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Cannot cancel', data?.detail || 'Unable to cancel this trip.');
        return;
      }
      setCurrentTrip(null);
      router.back();
    } catch {
      Alert.alert('Error', 'Could not cancel ride.');
    }
  };

  const promptCancelRide = useCallback(() => {
    if (['ongoing', 'pending_payment', 'completed', 'cancelled'].includes(tripStatus)) {
      void handleCancelRide();
      return;
    }
    Alert.alert('Cancel this ride?', 'Cancellation fees may apply depending on how close your driver is.', [
      { text: 'Keep ride', style: 'cancel' },
      { text: 'Cancel ride', style: 'destructive', onPress: () => void handleCancelRide() },
    ]);
  }, [tripStatus]);

  const handleRideTripMenu = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
    const openDetails = () => setTripDetailsExpanded(true);
    const openShare = () => openShareTrip(router, effectiveTripId);
    const openSupport = () => router.push('/support' as any);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Trip details & safety', 'Share live trip', 'Support', 'Cancel trip', 'Dismiss'],
          cancelButtonIndex: 4,
          destructiveButtonIndex: 3,
        },
        (idx) => {
          if (idx === 0) openDetails();
          else if (idx === 1) openShare();
          else if (idx === 2) openSupport();
          else if (idx === 3) promptCancelRide();
        },
      );
    } else {
      Alert.alert('Trip options', 'Choose an action', [
        { text: 'Trip details & safety', onPress: openDetails },
        { text: 'Share live trip', onPress: openShare },
        { text: 'Support', onPress: openSupport },
        { text: 'Cancel trip', style: 'destructive', onPress: () => promptCancelRide() },
        { text: 'Close', style: 'cancel' },
      ]);
    }
  }, [effectiveTripId, router, promptCancelRide]);

  const handleReportBadPickup = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    Alert.alert(
      'Report pickup issue',
      'Wrong location, unsafe spot, or driver not at the pin? We will prioritise your report. You can also contact Support.',
      [
        { text: 'Open support', onPress: () => router.push('/support' as any) },
        { text: 'OK', style: 'cancel' },
      ],
    );
  }, [router]);

  const handleReportIncident = async (incidentType: 'harassment' | 'dispute' | 'other') => {
    if (!currentRecording?.id) {
      Alert.alert('Recording unavailable', 'Safety recording has not started yet for this trip.');
      return;
    }
    try {
      await reportSafetyIncident(
        currentRecording.id,
        'rider',
        incidentType,
        `Reported from trip tracking while status=${tripStatus}`,
      );
      Alert.alert('Incident logged', 'Your trip safety recording will be preserved for review.');
    } catch {
      Alert.alert('Could not save report', 'Please try again in a moment.');
    }
  };

  const handleSilentDangerMode = async () => {
    if (!effectiveTripId || !riderId) return;
    setSilentProtecting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location Required', 'Enable location permission so protected silent safety can work.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (currentRecording?.id) {
        await reportSafetyIncident(
          currentRecording.id,
          'rider',
          'other',
          `Silent danger mode triggered while status=${tripStatus}`,
        );
      }
      await triggerSOS({
        trip_id: effectiveTripId,
        location_lat: location.coords.latitude,
        location_lng: location.coords.longitude,
        auto_triggered: true,
      });
      Alert.alert(
        'Route refreshed',
        'Trip monitoring has been updated in the background and trusted safety recipients have your live trip context.',
      );
    } catch (error: any) {
      Alert.alert('Could not refresh route', error?.response?.data?.detail || 'Please try again in a moment.');
    } finally {
      setSilentProtecting(false);
    }
  };

  const promptInTripEmergency = () => {
    Alert.alert(
      'Emergency',
      'This will alert Nexryde safety with your live GPS. Only use in a real emergency.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send alert', style: 'destructive', onPress: () => void handleSilentDangerMode() },
      ],
    );
  };

  const handleArmGeoFence = async () => {
    if (!effectiveTripId) return;
    const routePoints =
      (((currentTrip as any)?.route_preview_coordinates || []) as Array<{ lat?: number; lng?: number; latitude?: number; longitude?: number }>)
        .map((point) => ({
          lat: typeof point.lat === 'number' ? point.lat : Number(point.latitude),
          lng: typeof point.lng === 'number' ? point.lng : Number(point.longitude),
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (routePoints.length < 2) {
      Alert.alert('Route unavailable', 'Approved route is not ready yet. Please wait a moment and try again.');
      return;
    }
    setArmingGeoFence(true);
    try {
      const res = await setGeoFenceTripLock(effectiveTripId, {
        threshold_meters: 200,
        approved_route: routePoints,
      });
      setGeoFenceLock(res.data?.geo_fence_trip_lock || null);
      Alert.alert(
        'Approved route locked',
        'If the driver moves more than 200 metres away, Nexryde will alert you loudly, notify your emergency contacts and keep recording protected evidence.',
      );
    } catch (error: any) {
      Alert.alert('Could not lock route', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setArmingGeoFence(false);
    }
  };

  const handleActivateInvisibleShield = async () => {
    if (!effectiveTripId) return;
    setArmingInvisibleShield(true);
    try {
      const etaMinutes = Math.max(
        10,
        optimizedRoute?.estimatedTimeMinutes || Number((currentTrip as any)?.duration_mins) || 20
      );
      const res = await activateInvisibleShieldMode(effectiveTripId, etaMinutes);
      setInvisibleShieldMode(res.data?.invisible_shield_mode || null);
      Alert.alert(
        'Invisible Shield Armed',
        'Late-night shield mode is now active. Protected trip audio will be preserved securely unless you confirm safe arrival.',
      );
    } catch (error: any) {
      Alert.alert('Could not arm shield', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setArmingInvisibleShield(false);
    }
  };

  const handleConfirmShieldSafe = async () => {
    if (!effectiveTripId) return;
    setConfirmingShieldSafe(true);
    try {
      const res = await confirmInvisibleShieldSafeArrival(effectiveTripId);
      setInvisibleShieldMode(res.data?.invisible_shield_mode || null);
      if (currentRecording?.id) {
        await RideRecordingService.deleteRecording(currentRecording.id);
      }
      Alert.alert('Shield cleared', res.data?.message || 'Safe arrival confirmed.');
    } catch (error: any) {
      Alert.alert('Could not confirm safe arrival', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setConfirmingShieldSafe(false);
    }
  };

  const handleConfirmSafeArrival = async () => {
    if (!effectiveTripId) return;
    setConfirmingSafeArrival(true);
    try {
      const res = await confirmSafeArrival(effectiveTripId);
      setSafeArrivalCheck(res.data?.safe_arrival_check || null);
      Alert.alert('Thanks', 'Safe arrival confirmed. Nexryde has closed the post-trip safety check.');
    } catch (error: any) {
      Alert.alert('Could not confirm', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setConfirmingSafeArrival(false);
    }
  };

  const handleSafetyCheckResponse = async (response: 'safe' | 'need_help') => {
    const checkId = guardianAlert?.check_id;
    if (!checkId) {
      Alert.alert('Unavailable', 'Safety check ID is missing. Please try again in a few seconds.');
      return;
    }
    setRespondingSafety(response);
    try {
      await respondToSafetyCheck(checkId, response);
      await fetchStatus();
      if (response === 'safe') {
        Alert.alert('Thanks', 'Great. We will continue monitoring quietly in the background.');
      } else {
        Alert.alert('Safety team alerted', 'Emergency support has been escalated and your trip is being monitored.');
      }
    } catch (error: any) {
      Alert.alert('Could not submit', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setRespondingSafety(null);
    }
  };

  const handleFakeDriverAlertCheck = async () => {
    if (!effectiveTripId) return;
    setCheckingDriverFace(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to verify the driver face.');
        return;
      }
      const capture = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
        cameraType: ImagePicker.CameraType.front,
      });
      if (capture.canceled || !capture.assets?.[0]?.base64) {
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const payload = {
        observed_face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
        location_lat: location.coords.latitude,
        location_lng: location.coords.longitude,
      };
      const res = await runFakeDriverAlertCheck(effectiveTripId, payload);
      const data = res.data || {};
      if (data.matched) {
        Alert.alert('Driver verified', data.alert_message || 'Driver face matches the registered profile.');
      } else {
        await triggerSOS({
          trip_id: effectiveTripId,
          location_lat: location.coords.latitude,
          location_lng: location.coords.longitude,
          auto_triggered: true,
        });
        Alert.alert('Fake Driver Alert', data.alert_message || 'Face mismatch detected. Do not enter the vehicle.');
      }
    } catch (error: any) {
      Alert.alert('Face check unavailable', error?.response?.data?.detail || 'Could not run fake driver alert right now.');
    } finally {
      setCheckingDriverFace(false);
    }
  };

  const handleVerifyMyPickupFace = async () => {
    if (!effectiveTripId) return;
    setVerifyingPickupFace(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to verify your face at pickup.');
        return;
      }
      const capture = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
        cameraType: ImagePicker.CameraType.front,
      });
      if (capture.canceled || !capture.assets?.[0]?.base64) return;
      await verifyRiderFaceAtPickup(effectiveTripId, {
        observed_face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
      });
      setRiderFaceVerifiedAtPickup(true);
      Alert.alert('Identity confirmed', 'Your pickup face verification is complete. Driver can now proceed to code check.');
    } catch (error: any) {
      Alert.alert('Face verification failed', error?.response?.data?.detail || 'Please re-scan your face.');
    } finally {
      setVerifyingPickupFace(false);
    }
  };

  useEffect(() => {
    const alert = guardianAlert || {};
    if (!alert?.active || alert.type !== 'geo_fence_deviation') return;
    const alertKey = String(alert.triggered_at || alert.deviation_meters || 'geo-fence');
    if (geoFenceAlertShownRef.current === alertKey) return;
    geoFenceAlertShownRef.current = alertKey;
    void notificationService.sendLocalNotification({
      type: 'geo_fence_deviation',
      title: 'Route Lock Breach',
      body: 'Driver left your approved route. Safety escalation is active now.',
      data: { trip_id: effectiveTripId },
    });
    Alert.alert(
      'Approved Route Alert',
      alert.message || 'Driver moved away from your approved route. Emergency monitoring is now active.',
    );
  }, [effectiveTripId, guardianAlert]);

  useEffect(() => {
    const alert = speedSpikeAlert || {};
    if (!alert?.active) return;
    const alertKey = String(alert.triggered_at || alert.speed_kmh || 'speed-spike');
    if (speedSpikeAlertShownRef.current === alertKey) return;
    speedSpikeAlertShownRef.current = alertKey;
    void notificationService.sendLocalNotification({
      type: 'speed_spike_alert',
      title: 'Speed Spike Alert',
      body: `Driver speed reached ${Math.round(alert.speed_kmh || 0)} km/h. Nexryde has warned the driver.`,
      data: { trip_id: effectiveTripId },
    });
    Alert.alert(
      'Speed Spike Alert',
      `Your driver reached ${Math.round(alert.speed_kmh || 0)} km/h. Nexryde has logged a safety violation and warned the driver.`,
    );
  }, [effectiveTripId, speedSpikeAlert]);

  useEffect(() => {
    const alert = gpsSpoofingAlert || {};
    if (!alert?.active) return;
    const alertKey = String(alert.triggered_at || alert.jump_km || 'gps-spoofing');
    if (gpsSpoofingAlertShownRef.current === alertKey) return;
    gpsSpoofingAlertShownRef.current = alertKey;
    Alert.alert(
      'GPS Fraud Protection',
      alert.message || 'Suspected GPS spoofing detected. Your fare has been frozen and the driver was suspended for review.',
    );
  }, [gpsSpoofingAlert]);

  useEffect(() => {
    const mode = invisibleShieldMode || {};
    const uploadReady =
      Boolean(
        effectiveTripId &&
          mode.active &&
          !mode.server_audio_uploaded &&
          currentRecording?.audioUri &&
          recordingStatus === 'stopped' &&
          tripStatus === 'pending_payment'
      );
    if (!uploadReady || shieldUploadTripIdRef.current === effectiveTripId) return;

    shieldUploadTripIdRef.current = effectiveTripId;
    const run = async () => {
      try {
        const audioBase64 = await FileSystem.readAsStringAsync(currentRecording!.audioUri!, {
          encoding: 'base64',
        });
        await uploadInvisibleShieldAudio(effectiveTripId, audioBase64, 'audio/mp4');
        await fetchStatus();
      } catch (error) {
        console.log('Invisible Shield upload failed:', error);
        shieldUploadTripIdRef.current = null;
      }
    };
    void run();
  }, [currentRecording?.audioUri, effectiveTripId, fetchStatus, invisibleShieldMode, recordingStatus, tripStatus]);

  useEffect(() => {
    const mode = invisibleShieldMode || {};
    if (!mode.auto_escalated_at) return;
    void notificationService.sendLocalNotification({
      type: 'geo_fence_deviation',
      title: 'Invisible Shield Escalated',
      body: 'You did not confirm safe arrival. Emergency contacts and Nexryde Safety have been alerted.',
      data: { trip_id: effectiveTripId },
    });
  }, [effectiveTripId, invisibleShieldMode?.auto_escalated_at]);

  useEffect(() => {
    const check = safeArrivalCheck || {};
    if (!check?.required || check?.confirmed_at) return;
    const promptKey = String(check.trip_completed_at || check.confirm_deadline_at || effectiveTripId);
    if (safeArrivalPromptShownRef.current === promptKey) return;
    safeArrivalPromptShownRef.current = promptKey;
    void notificationService.sendLocalNotification({
      type: 'safe_arrival_checkin',
      title: 'Confirm Safe Arrival',
      body: 'Please confirm you arrived safely. Nexryde will check in automatically if you do not respond.',
      data: { trip_id: effectiveTripId },
    });
  }, [effectiveTripId, safeArrivalCheck]);

  const paymentChecklist = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      completed: boolean;
      onPress?: () => void;
    }> = [];
    if (financialPaymentPending) {
      items.push({
        id: 'pay',
        label: paymentChecklistPayLabel(tripPaymentMethod),
        completed: false,
        onPress: () =>
          router.push({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any),
      });
    }
    items.push({
      id: 'rate',
      label: 'Rate your driver on receipt',
      completed: tripStatus === 'completed',
      onPress: () =>
        router.push({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any),
    });
    if (safeArrivalCheck?.required) {
      items.push({
        id: 'safe',
        label: 'Confirm safe arrival',
        completed: Boolean(safeArrivalCheck?.confirmed_at),
        onPress: safeArrivalCheck?.confirmed_at ? undefined : () => void handleConfirmSafeArrival(),
      });
    }
    if (invisibleShieldMode?.active && !invisibleShieldMode?.auto_escalated_at) {
      items.push({
        id: 'shield',
        label: 'Confirm safe after shield mode',
        completed: Boolean(invisibleShieldMode?.confirmed_safe_at),
        onPress: invisibleShieldMode?.confirmed_safe_at
          ? undefined
          : () => void handleConfirmShieldSafe(),
      });
    }
    return items;
  }, [
    financialPaymentPending,
    tripPaymentMethod,
    tripStatus,
    safeArrivalCheck,
    invisibleShieldMode,
    effectiveTripId,
    router,
  ]);

  const findingBidNgn = useMemo(() => {
    const raw = currentTrip as Record<string, unknown> | null;
    const f = raw?.fare ?? raw?.offered_fare;
    return Number(f) > 0 ? Math.round(Number(f)) : 0;
  }, [currentTrip]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0F1A" />
      <SafeAreaView style={styles.safeArea} edges={mapOverlayMode ? [] : undefined}>
        {!mapOverlayMode ? (
          <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              {riderMapFirst && tripStatus === 'ongoing' ? (
                <View style={styles.headerWordmarkRow} pointerEvents="none">
                  <Text style={styles.headerWordNex}>NEX</Text>
                  <Text style={styles.headerWordRyde}>RYDE</Text>
                </View>
              ) : (
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {tripStatus === 'accepted'
                    ? 'Driver on the way'
                    : tripStatus === 'arrived'
                      ? 'Driver is here'
                      : tripStatus === 'ongoing'
                        ? 'Trip in Progress'
                        : tripStatus === 'pending_payment'
                          ? financialPaymentPending
                            ? 'Trip completed — pay driver'
                            : 'Trip completed — safety check'
                          : tripStatus === 'cancelled'
                            ? 'Trip Cancelled'
                            : 'Finding Driver'}
                </Text>
              )}
            </View>
            {riderMapFirst ? (
              <TouchableOpacity
                style={styles.headerMenuBtn}
                onPress={handleRideTripMenu}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Trip menu"
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.lightTextPrimary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.placeholder} />
            )}
          </View>
        ) : (
          <RiderTrackingMapChrome
            topInset={insets.top}
            padH={flow.padH}
            onBack={() => router.back()}
            onMenu={handleRideTripMenu}
            phaseLabel={tripStatus === 'ongoing' ? 'On trip' : null}
          />
        )}

        {acceptedBanner && !mapOverlayMode ? (
          <View
            style={[styles.acceptedToast, { top: insets.top + 52 }]}
            pointerEvents="none"
            accessibilityLiveRegion="polite"
          >
            <LinearGradient
              colors={['#064E3B', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.acceptedToastGrad}
            >
              <Ionicons name="checkmark-circle" size={22} color="#6EE7B7" />
              <View style={{ flex: 1 }}>
                <Text style={styles.acceptedToastTitle}>Driver on the way</Text>
                <Text style={styles.acceptedToastSub} numberOfLines={1}>
                  {rideAcceptedSubtitle}
                </Text>
              </View>
            </LinearGradient>
          </View>
        ) : null}

        <View
          style={[
            styles.content,
            { paddingHorizontal: riderMapFirst ? 0 : flow.padH },
            riderMapFirst && styles.mapFirstContentWrap,
            mapOverlayMode && styles.contentMapOverlay,
          ]}
        >
          {!riderMapFirst && isFindingDriverPhase ? (
            <RiderFindingStrip
              title="Finding your driver"
              subtitle={pickupVicinityLabel || 'Your request is live · usually under 2 min'}
            />
          ) : !riderMapFirst ? (
            <View style={styles.liveTripHero}>
              <View style={styles.liveTripHeroLeft}>
                <Text style={styles.liveTripHeroTitle}>Trip Intelligence</Text>
                <Text style={styles.liveTripHeroText}>
                  Live vehicle state, safety checks, and transparent driver activity in one place.
                </Text>
              </View>
              <View style={styles.liveTripChip}>
                <Ionicons name="pulse-outline" size={14} color={COLORS.info} />
                <Text style={styles.liveTripChipText}>LIVE</Text>
              </View>
            </View>
          ) : null}

          {/* Map Area */}
          {pickupCoords && dropoffCoords ? (
            Platform.OS === 'web' ? (
              <MapComponent
                style={styles.mapPlaceholder}
                pickup={{
                  latitude: pickupCoords.lat,
                  longitude: pickupCoords.lng,
                  address: currentTrip?.pickup_location?.address,
                }}
                dropoff={{
                  latitude: dropoffCoords.lat,
                  longitude: dropoffCoords.lng,
                  address: currentTrip?.dropoff_location?.address,
                }}
                driverLocation={
                  liveDriverCoords
                    ? {
                        latitude: liveDriverCoords.lat,
                        longitude: liveDriverCoords.lng,
                        address: driverInfo?.name || 'Driver live location',
                      }
                    : undefined
                }
                routeCoordinates={routePolyline}
              />
            ) : (
                  <View
                    style={
                      mapOverlayMode
                        ? styles.mapFullBleed
                        : riderMapFirst
                          ? {
                              height: mapFirstPanelHeight,
                              width: '100%',
                              marginBottom: SPACING.sm,
                              paddingHorizontal: Math.max(SPACING.sm, Math.round(flow.padH * 0.85)),
                            }
                          : { flex: 1, minHeight: 260, marginBottom: SPACING.lg }
                    }
                  >
                    <RideMap
                      mapRef={nativeMapRef}
                      pickupCoords={pickupCoords}
                      destinationCoords={dropoffCoords}
                      routePolyline={routePolyline}
                      directionsEtaMin={directionsEtaMin}
                      pickup={currentTrip?.pickup_location?.address || (params.pickup as string) || 'Pickup'}
                      destination={currentTrip?.dropoff_location?.address || (params.destination as string) || 'Destination'}
                      activeDriverLocation={
                        liveDriverCoords
                          ? {
                              ...liveDriverCoords,
                              heading:
                                Number(driverLocation?.heading) ||
                                undefined,
                            }
                          : null
                      }
                      activeDriverMoving={
                        Boolean(driverInfo?.is_moving) ||
                        (liveDriverCoords != null && !locationStale)
                      }
                      serverEtaSeconds={serverEtaSeconds}
                      activeDriverMeta={{
                        name: driverInfo?.name,
                        vehicle: driverInfo?.vehicle,
                        plate: driverInfo?.plate,
                        rating: driverInfo?.rating ?? driverInfo?.avg_rating ?? undefined,
                        profileImage:
                          driverInfo?.face_image || driverInfo?.profile_image || null,
                        tripCount:
                          typeof driverInfo?.total_trips === 'number'
                            ? driverInfo.total_trips
                            : typeof driverInfo?.completed_trips === 'number'
                              ? driverInfo.completed_trips
                              : null,
                      }}
                      tripStatus={tripStatus}
                      embedded={riderMapFirst}
                      /** Map-first tracking uses `RiderLiveTripDock` only — never stack RideMap's embedded assignment sheet. */
                      suppressDriverOverlay={riderMapFirst}
                      vehicleColor={driverInfo?.color ?? null}
                      onCallDriver={handleCallDriverPress}
                      onChatDriver={() =>
                        router.push({ pathname: '/chat', params: { tripId: effectiveTripId } } as any)
                      }
                      callAvailable={Boolean(callAllowed && driverInfo?.phone)}
                      onVerifyIdentity={() => setShowIdentityModal(true)}
                      identityConfirmed={identityConfirmed}
                      fareDisplay={riderMapFareDisplay}
                      onReportBadPickup={handleReportBadPickup}
                      onOpenTripMenu={handleRideTripMenu}
                      onShowPickupCode={() =>
                        router.push({
                          pathname: '/rider/security-code',
                          params: { trip_id: effectiveTripId },
                        } as any)
                      }
                      pickupVicinityLabel={pickupVicinityLabel}
                      rideAcceptedSubtitle={
                        tripStatus === 'accepted' || tripStatus === 'arrived'
                          ? rideAcceptedSubtitle
                          : undefined
                      }
                      tripStartedAtIso={currentTrip?.started_at ?? null}
                      onPauseRide={handleRideTripMenu}
                      onEmergencyRide={promptInTripEmergency}
                      onCancelRide={promptCancelRide}
                    />
                  </View>
            )
          ) : (
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapOverlay}>
                <Ionicons name="navigate" size={40} color={COLORS.accentGreen} />
                <Text style={styles.mapTitle}>{mapTitle}</Text>
                <Text style={styles.mapSubtitle}>{mapSubtitle}</Text>
              </View>
            </View>
          )}

          <ScrollView
            style={riderMapFirst ? { flex: hideMapFirstScrollPanel ? 0 : 1 } : undefined}
            scrollEnabled={!hideMapFirstScrollPanel}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: flow.padH,
              flexGrow: hideMapFirstScrollPanel ? 0 : 1,
              maxWidth: flow.maxContentWidth,
              alignSelf: 'center',
              width: '100%',
              paddingBottom: riderMapFirst ? mapFirstScrollPadBottom : SPACING.md,
              paddingTop: riderMapFirst && !hideMapFirstScrollPanel ? SPACING.xs : 0,
              gap: Math.round(flow.sectionGap * 0.35),
            }}
          >
          {!hideMapFirstScrollPanel ? (
          <>
          {/* ── DRIVER IDENTITY CARD (accepted + arrived) — below map on non–map-first layout ── */}
          {!riderMapFirst && (tripStatus === 'accepted' || tripStatus === 'arrived') && driverInfo && (
            <View style={[styles.identityCard, tripStatus === 'arrived' && styles.identityCardArrived]}>
              {/* Row: avatar + info */}
              <View style={styles.identityRow}>
                {/* Avatar */}
                <View style={[styles.idAvatarWrap, { borderColor: tripStatus === 'arrived' ? '#22E5A0' : '#334155' }]}>
                  <TripProfileAvatar
                    size={56}
                    faceUri={driverAvatarSources(driverInfo).face}
                    profileUri={driverAvatarSources(driverInfo).profile}
                    borderWidth={0}
                    borderColor="transparent"
                    accessibilityLabel={`Photo of ${formatDriverDisplayField(driverInfo.name) || 'driver'}`}
                    showOnlineDot={tripStatus === 'arrived'}
                    onlineDotColor="#22E5A0"
                  />
                  {tripStatus === 'arrived' && (
                    <View style={styles.idArrivedDot}>
                      <Ionicons name="location" size={10} color="#022C22" />
                    </View>
                  )}
                </View>

                {/* Driver name + vehicle */}
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.idName}>{formatDriverDisplayField(driverInfo.name) || 'Your Driver'}</Text>
                  <Text style={styles.idVehicle}>{formatDriverDisplayField(driverInfo.vehicle) || 'Vehicle'}</Text>
                  {formatDriverDisplayField(driverInfo.color) ? (
                    <View style={styles.idColorRow}>
                      <View style={[styles.idColorDot, { backgroundColor: resolveTrackingColorDot(formatDriverDisplayField(driverInfo.color)) }]} />
                      <Text style={styles.idColorText}>{formatDriverDisplayField(driverInfo.color)}</Text>
                    </View>
                  ) : null}
                  {driverInfo.rating != null && (
                    <View style={styles.idRatingRow}>
                      <Ionicons name="star" size={12} color="#EAB308" />
                      <Text style={styles.idRatingText}>{Number(driverInfo.rating).toFixed(1)}</Text>
                    </View>
                  )}
                </View>

                {/* Identity check chip */}
                {identityConfirmed ? (
                  <View style={styles.idVerifiedChip}>
                    <Ionicons name="shield-checkmark" size={14} color="#022C22" />
                    <Text style={styles.idVerifiedText}>Verified</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.idVerifyBtn}
                    onPress={() => setShowIdentityModal(true)}
                    activeOpacity={0.88}
                  >
                    <Ionicons name="eye-outline" size={14} color="#0ea5e9" />
                    <Text style={styles.idVerifyBtnText}>Verify</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* PLATE NUMBER — large and prominent */}
              {driverInfo.plate ? (
                <View style={styles.idPlateWrap}>
                  <View style={styles.idPlateInner}>
                    <View style={styles.idPlateFlag}>
                      <View style={{ flex: 1, backgroundColor: '#006600' }} />
                      <View style={{ flex: 1, backgroundColor: '#FFF' }} />
                      <View style={{ flex: 1, backgroundColor: '#006600' }} />
                    </View>
                    <Text style={styles.idPlateNumber}>{formatDriverDisplayField(driverInfo.plate)}</Text>
                  </View>
                  <Text style={styles.idPlateSub}>Verify this number on the vehicle</Text>
                </View>
              ) : null}

              {/* Arrived CTA */}
              {tripStatus === 'arrived' && (
                <TouchableOpacity
                  style={styles.idCodeBanner}
                  onPress={() => router.push({ pathname: '/rider/security-code', params: { trip_id: effectiveTripId } } as any)}
                  activeOpacity={0.88}
                >
                  <LinearGradient
                    colors={[...RIDER_MAP_PRIMARY_CTA_GRADIENT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.idCodeBannerGrad}
                  >
                    <Ionicons name="keypad" size={20} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '900', flex: 1 }}>
                      {identityConfirmed ? 'Tap to show pick-up code' : 'Driver arrived — verify identity first'}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.9)" />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Status Card — map-first: critical alerts only until expanded; full intel in trip details */}
          {showStatusCard ? (
          <View
            style={[
              styles.statusCard,
              riderMapFirst && styles.mapFirstStatusCardWrap,
              isFindingDriverPhase && styles.statusCardFinding,
            ]}
          >
            {speedSpikeAlert?.active ? (
              <View style={styles.speedSpikeCard}>
                <View style={styles.speedSpikeHeader}>
                  <Ionicons name="warning-outline" size={18} color={COLORS.error} />
                  <Text style={styles.speedSpikeTitle}>Speed Spike Alert</Text>
                </View>
                <Text style={styles.speedSpikeText}>
                  Driver speed reached {Math.round(speedSpikeAlert.speed_kmh || 0)} km/h. Nexryde warned the driver and logged a permanent safety violation.
                </Text>
                <Text style={styles.speedSpikeMeta}>
                  Violations on record: {Number(speedSpikeAlert.violation_count || 0)}
                  {speedSpikeAlert.driver_suspended ? ' • Driver suspended automatically' : ''}
                </Text>
              </View>
            ) : null}

            {gpsSpoofingAlert?.active ? (
              <View style={styles.speedSpikeCard}>
                <View style={styles.speedSpikeHeader}>
                  <Ionicons name="locate-outline" size={18} color={COLORS.error} />
                  <Text style={styles.speedSpikeTitle}>Anti-Spoofing GPS</Text>
                </View>
                <Text style={styles.speedSpikeText}>
                  Suspected fake GPS activity detected. Fare is frozen and the driver account is suspended pending investigation.
                </Text>
                <Text style={styles.speedSpikeMeta}>
                  Jump: {Number(gpsSpoofingAlert.jump_km || 0).toFixed(2)} km
                  {typeof gpsSpoofingAlert.estimated_speed_kmh === 'number'
                    ? ` • ${Math.round(gpsSpoofingAlert.estimated_speed_kmh)} km/h`
                    : ''}
                </Text>
              </View>
            ) : null}

            {safeArrivalCheck?.required && !safeArrivalCheck?.confirmed_at ? (
              <View style={styles.safeArrivalCard}>
                <View style={styles.safeArrivalHeader}>
                  <Ionicons name="home-outline" size={18} color={COLORS.success} />
                  <Text style={styles.safeArrivalTitle}>Safe Arrival Confirmation</Text>
                </View>
                <Text style={styles.safeArrivalText}>
                  Tap to confirm you arrived safely. No response may trigger a check-in and contact your emergency list.
                </Text>
                {safeArrivalCheck?.confirm_deadline_at ? (
                  <Text style={styles.safeArrivalMeta}>
                    Confirm by {new Date(safeArrivalCheck.confirm_deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}
                {safeArrivalCheck?.call_attempted_at ? (
                  <Text style={styles.safeArrivalMeta}>Safety check-in call step started. Please confirm now.</Text>
                ) : null}
              </View>
            ) : null}

            {showTripDetailsPanel ? (
              <>
            <View style={isFindingDriverPhase && !riderMapFirst ? styles.findingHeroSlot : styles.loadingContainer}>
              {isFindingDriverPhase && !riderMapFirst ? (
                <RiderFindingStatusHero />
              ) : loading ? (
                <ActivityIndicator size="large" color={COLORS.accentGreen} />
              ) : !riderMapFirst ? (
                <Ionicons
                  name={
                    tripStatus === 'accepted'
                      ? 'car-sport'
                      : tripStatus === 'arrived'
                        ? 'location'
                        : tripStatus === 'ongoing'
                          ? 'navigate'
                          : tripStatus === 'pending_payment'
                            ? 'card'
                            : tripStatus === 'cancelled'
                              ? 'close-circle'
                              : 'search'
                  }
                  size={36}
                  color={COLORS.accentGreen}
                />
              ) : (
                <View style={{ height: 4 }} />
              )}
            </View>
            {!riderMapFirst && (
              <>
                <Text style={styles.statusTitle}>
                  {isFindingDriverPhase
                    ? 'Finding your driver'
                    : tripStatus === 'accepted'
                      ? `${driverInfo?.name || 'Your driver'} accepted your ride`
                      : tripStatus === 'arrived'
                        ? `${driverInfo?.name || 'Your driver'} has arrived`
                        : tripStatus === 'ongoing'
                          ? 'Ride in progress'
                          : tripStatus === 'pending_payment'
                            ? financialPaymentPending
                              ? 'Settle your fare'
                              : 'Safety confirmation'
                            : tripStatus === 'cancelled'
                              ? 'Trip cancelled'
                              : 'Finding your driver...'}
                </Text>
                <Text style={[styles.statusSubtitle, isFindingDriverPhase && styles.statusSubtitleFinding]}>
                  {isFindingDriverPhase
                    ? 'Usually under two minutes · we will notify you when someone accepts'
                    : tripStatus === 'accepted'
                      ? `${driverInfo?.vehicle || 'Vehicle'}${driverInfo?.plate ? ` • ${driverInfo.plate}` : ''}`
                      : tripStatus === 'arrived'
                        ? `${driverInfo?.name || 'Driver'} is waiting for you at pickup`
                        : tripStatus === 'ongoing'
                          ? 'You can contact your driver using chat or call'
                          : tripStatus === 'pending_payment'
                            ? financialPaymentPending
                              ? isCashPaymentMethod(tripPaymentMethod)
                                ? 'Pay your driver in cash, then confirm below.'
                                : `Settle your fare · ${paymentMetaDisplay.line}`
                              : 'Confirm the safety prompts below — payment may already be recorded.'
                            : tripStatus === 'cancelled'
                              ? 'You can return to home and book another ride'
                              : 'This usually takes 1-2 minutes'}
                </Text>
              </>
            )}

            {!isFindingDriverPhase && driverLocation && (
              <View style={styles.driverLocationBadge}>
                <Ionicons
                  name={driverInfo?.is_moving ? 'navigate' : 'pause-circle'}
                  size={16}
                  color={driverInfo?.is_moving ? COLORS.success : COLORS.warning}
                />
                <Text style={styles.driverLocationText}>
                  {driverInfo?.is_moving ? 'Driver moving live' : 'Driver paused on map'}
                </Text>
              </View>
            )}

            {driverStopReason?.reason ? (
              <View style={styles.safeArrivalCard}>
                <View style={styles.safeArrivalHeader}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.info} />
                  <Text style={[styles.safeArrivalTitle, { color: COLORS.info }]}>Driver stop reason</Text>
                </View>
                <Text style={styles.safeArrivalText}>{driverStopReason.reason}</Text>
              </View>
            ) : null}

            {!isFindingDriverPhase && optimizedRoute ? (
              <View style={styles.aiRouteBadge}>
                <Ionicons name="navigate-circle" size={16} color={COLORS.info} />
                <Text style={styles.aiRouteBadgeText}>
                  Route: {TrafficAI.formatDelay(optimizedRoute.trafficDelay)} traffic
                </Text>
              </View>
            ) : null}

            {(tripStatus === 'arrived' || tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
              <View style={[styles.faceMatchBadge, faceVerifiedAtStart ? styles.faceMatchBadgeOk : styles.faceMatchBadgePending]}>
                <Ionicons
                  name={faceVerifiedAtStart ? 'scan-circle-outline' : 'person-circle-outline'}
                  size={16}
                  color={faceVerifiedAtStart ? COLORS.success : COLORS.warning}
                />
                <Text style={[styles.faceMatchBadgeText, { color: faceVerifiedAtStart ? COLORS.success : COLORS.warning }]}>
                  {faceVerifiedAtStart
                    ? 'Driver face matched with registered profile'
                    : 'Waiting for live driver face match before trip start'}
                </Text>
              </View>
            )}

            {!isFindingDriverPhase && (
            <View style={styles.recordingBanner}>
              <View style={styles.recordingRow}>
                <Ionicons
                  name={recordingStatus === 'recording' ? 'radio' : 'mic-outline'}
                  size={18}
                  color={recordingStatus === 'recording' ? COLORS.error : COLORS.gray500}
                />
                <Text style={styles.recordingTitle}>
                  {recordingStatus === 'recording' ? 'Recording on' : 'Recording standby'}
                </Text>
              </View>
              <Text style={styles.recordingText}>
                {recordingStatus === 'recording'
                  ? 'Protected trip audio is on.'
                  : 'Turns on automatically during protected trip phases.'}
              </Text>
              {currentRecording ? (
                <>
                  <Text style={styles.recordingMeta}>
                    Protected capture started {Math.max(0, Math.floor((Date.now() - currentRecording.startTime) / 1000))}s ago
                  </Text>
                  {currentRecording.metadata?.lastKnownLocation ? (
                    <Text style={styles.recordingMeta}>
                      GPS snapshot active at {Number(currentRecording.metadata.lastKnownLocation.latitude || 0).toFixed(4)},{' '}
                      {Number(currentRecording.metadata.lastKnownLocation.longitude || 0).toFixed(4)}
                      {typeof currentRecording.metadata.lastKnownLocation.speedKph === 'number'
                        ? ` • ${Math.round(currentRecording.metadata.lastKnownLocation.speedKph)} km/h`
                        : ''}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
            )}

            {(isRiderMapLiveTripStatus(tripStatus) || tripStatus === 'pending_payment') && (
              <View style={[styles.shieldCard, invisibleShieldMode?.active ? styles.shieldCardActive : null]}>
                <View style={styles.shieldHeader}>
                  <Ionicons
                    name={invisibleShieldMode?.active ? 'moon-outline' : 'shield-half-outline'}
                    size={18}
                    color={invisibleShieldMode?.active ? COLORS.success : COLORS.primary}
                  />
                  <Text style={styles.shieldTitle}>
                    {invisibleShieldMode?.active ? 'Invisible Shield Mode Active' : 'Invisible Shield Mode'}
                  </Text>
                </View>
                <Text style={styles.shieldText}>
                  {invisibleShieldMode?.active
                    ? 'Late-night shield protection is armed. Confirm safe arrival after the trip or Nexryde will escalate the protected audio automatically.'
                    : 'Arm shield mode before entering the car for silent audio protection and delayed emergency escalation if you do not confirm safe arrival.'}
                </Text>
                {invisibleShieldMode?.confirm_deadline_at ? (
                  <Text style={styles.shieldMeta}>
                    Confirm by {new Date(invisibleShieldMode.confirm_deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}
                {invisibleShieldMode?.server_audio_uploaded ? (
                  <Text style={styles.shieldMeta}>Protected audio synced to Nexryde secure server.</Text>
                ) : null}
              </View>
            )}

            {isRiderMapLiveTripStatus(tripStatus) && (
              <View style={[styles.geoFenceCard, geoFenceLock?.active ? styles.geoFenceCardActive : null]}>
                <View style={styles.geoFenceHeader}>
                  <Ionicons
                    name={geoFenceLock?.active ? 'shield-checkmark-outline' : 'navigate-circle-outline'}
                    size={18}
                    color={geoFenceLock?.active ? COLORS.success : COLORS.primary}
                  />
                  <Text style={styles.geoFenceTitle}>
                    {geoFenceLock?.active ? 'Approved Route Locked' : 'Geo Fence Trip Lock'}
                  </Text>
                </View>
                <Text style={styles.geoFenceText}>
                  {geoFenceLock?.active
                    ? `Deviation threshold is ${Math.round(geoFenceLock.threshold_meters || 200)}m. The driver is expected to stay on your approved route.`
                    : 'Lock the approved route before the trip starts so Nexryde can escalate automatically if the vehicle deviates.'}
                </Text>
                {geoFenceLock?.last_deviation_meters ? (
                  <Text style={styles.geoFenceMeta}>
                    Latest deviation: {Math.round(geoFenceLock.last_deviation_meters)}m
                  </Text>
                ) : null}
              </View>
            )}

            {/* Route Info — sticky dock shows this for map-first active trips */}
            {!riderMapFirst && (
              <View style={styles.routeInfo}>
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, { backgroundColor: COLORS.accentGreen }]} />
                  <Text style={styles.routeText} numberOfLines={1}>{(params.pickup as string) || 'Your location'}</Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, { backgroundColor: COLORS.accentBlue }]} />
                  <Text style={styles.routeText} numberOfLines={1}>{(params.destination as string) || 'Destination'}</Text>
                </View>
              </View>
            )}
            {riderMapFirst && tripDetailsExpanded ? (
              <TouchableOpacity
                style={styles.tripDetailsCloseRow}
                onPress={() => setTripDetailsExpanded(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.tripDetailsCloseText}>Hide trip details</Text>
                <Ionicons name="chevron-up" size={18} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
              </>
            ) : null}
          </View>
          ) : null}

          {guardianAlert?.active && (
            <View style={styles.guardianCard}>
              <Ionicons name="shield-outline" size={20} color={COLORS.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.guardianTitle}>Safety Check</Text>
                <Text style={styles.guardianText}>{guardianAlert.message || 'We are monitoring this trip for safety.'}</Text>
                {guardianAlert?.type === 'abnormal_stop' && guardianAlert?.check_id ? (
                  <View style={styles.guardianActions}>
                    <TouchableOpacity
                      style={[styles.guardianActionBtn, styles.guardianSafeBtn]}
                      onPress={() => void handleSafetyCheckResponse('safe')}
                      disabled={respondingSafety !== null}
                    >
                      <Text style={styles.guardianSafeBtnText}>
                        {respondingSafety === 'safe' ? 'Sending...' : "I'm Safe"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.guardianActionBtn, styles.guardianHelpBtn]}
                      onPress={() => void handleSafetyCheckResponse('need_help')}
                      disabled={respondingSafety !== null}
                    >
                      <Text style={styles.guardianHelpBtnText}>
                        {respondingSafety === 'need_help' ? 'Alerting...' : 'Need Help'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {driverInfo &&
            (tripStatus === 'accepted' ||
              tripStatus === 'arrived' ||
              tripStatus === 'ongoing' ||
              tripStatus === 'pending_payment') &&
            showTripDetailsPanel && (
            <>
              <View style={styles.actionsCard}>
                {/* Call/chat live on map overlay when using map-first layout */}
                {!riderMapFirst && (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => router.push({ pathname: '/chat', params: { tripId: effectiveTripId } } as any)}
                    >
                      <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.actionBtnText}>Chat Driver</Text>
                    </TouchableOpacity>

                    {callAllowed && driverInfo?.phone ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#dcfce7' }]}
                        onPress={() => {
                          const phone = (driverInfo.phone as string).replace(/\s+/g, '');
                          Linking.openURL(`tel:${phone}`).catch(() =>
                            Alert.alert('Cannot call', 'Unable to open the dialler on this device.'),
                          );
                        }}
                      >
                        <Ionicons name="call" size={20} color="#16a34a" />
                        <View>
                          <Text style={[styles.actionBtnText, { color: '#16a34a' }]}>Call Driver</Text>
                          {driverInfo?.phone_masked && (
                            <Text style={{ fontSize: 10, color: '#16a34a', opacity: 0.7 }}>
                              {maskPhone(driverInfo.phone)}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ) : !isActiveRide && !isFavoriteDriver && driverInfo ? (
                      <View style={[styles.actionBtn, { backgroundColor: '#f1f5f9', opacity: 0.6 }]}>
                        <Ionicons name="call-outline" size={20} color="#94a3b8" />
                        <View>
                          <Text style={[styles.actionBtnText, { color: '#94a3b8' }]}>Call Unavailable</Text>
                          <Text style={{ fontSize: 10, color: '#94a3b8' }}>Favorite driver to re-enable</Text>
                        </View>
                      </View>
                    ) : null}
                  </>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, riderFaceVerifiedAtPickup ? styles.actionBtnSuccess : null]}
                    onPress={() => void handleVerifyMyPickupFace()}
                    disabled={verifyingPickupFace || riderFaceVerifiedAtPickup}
                  >
                    <Ionicons name="person-circle-outline" size={20} color={riderFaceVerifiedAtPickup ? COLORS.success : COLORS.primary} />
                    <Text style={styles.actionBtnText}>
                      {riderFaceVerifiedAtPickup
                        ? 'Face Verified'
                        : verifyingPickupFace
                          ? 'Verifying...'
                          : 'Verify My Face'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, tripStatus === 'arrived' && { borderColor: '#00D46A', backgroundColor: 'rgba(0,212,106,0.08)' }]}
                    onPress={() => router.push({ pathname: '/rider/security-code', params: { trip_id: effectiveTripId } } as any)}
                  >
                    <Ionicons name="keypad-outline" size={20} color={tripStatus === 'arrived' ? '#00D46A' : COLORS.primary} />
                    <Text style={[styles.actionBtnText, tripStatus === 'arrived' && { color: '#00D46A', fontWeight: '800' }]}>
                      {tripStatus === 'arrived' ? 'Show Pick-up Code' : 'Pick-up Code'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, invisibleShieldMode?.active ? styles.actionBtnSuccess : null]}
                    onPress={() => void handleActivateInvisibleShield()}
                    disabled={armingInvisibleShield}
                  >
                    <Ionicons name="moon-outline" size={20} color={invisibleShieldMode?.active ? COLORS.success : COLORS.primary} />
                    <Text style={styles.actionBtnText}>
                      {armingInvisibleShield ? 'Arming...' : invisibleShieldMode?.active ? 'Shield Armed' : 'Shield Mode'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, geoFenceLock?.active ? styles.actionBtnSuccess : null]}
                    onPress={() => void handleArmGeoFence()}
                    disabled={armingGeoFence}
                  >
                    <Ionicons name="navigate-circle-outline" size={20} color={geoFenceLock?.active ? COLORS.success : COLORS.primary} />
                    <Text style={styles.actionBtnText}>
                      {armingGeoFence ? 'Locking...' : geoFenceLock?.active ? 'Route Locked' : 'Lock Route'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleFakeDriverAlertCheck()}
                    disabled={checkingDriverFace}
                  >
                    <Ionicons name="scan-outline" size={20} color={COLORS.error} />
                    <Text style={styles.actionBtnText}>
                      {checkingDriverFace ? 'Checking...' : 'Verify Driver Face'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => router.push({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)}
                  >
                    <Ionicons name="card-outline" size={20} color={COLORS.primary} />
                    <Text style={styles.actionBtnText}>Payment Info</Text>
                  </TouchableOpacity>
                )}
                {tripStatus === 'pending_payment' && financialPaymentPending ? (
                  <TouchableOpacity
                    style={styles.actionBtnPayFareShell}
                    onPress={() => router.push({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={paymentDockPayButtonLabel(tripPaymentMethod)}
                  >
                    <LinearGradient
                      colors={[...RIDER_MAP_PRIMARY_CTA_GRADIENT]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.actionBtn, styles.actionBtnPayFareGrad]}
                    >
                      <Ionicons
                        name={isCashPaymentMethod(tripPaymentMethod) ? 'cash' : 'wallet'}
                        size={20}
                        color="#022C22"
                      />
                      <Text style={[styles.actionBtnText, styles.actionBtnPayFareText]}>
                        {paymentDockPayButtonLabel(tripPaymentMethod)}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : null}
              </View>

              {(tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
                <View style={styles.actionsCard}>
                  {tripStatus === 'pending_payment' && safeArrivalCheck?.required && !safeArrivalCheck?.confirmed_at ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSuccess]}
                      onPress={() => void handleConfirmSafeArrival()}
                      disabled={confirmingSafeArrival}
                    >
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.success} />
                      <Text style={styles.actionBtnText}>
                        {confirmingSafeArrival ? 'Confirming...' : 'I Am Safe'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {tripStatus === 'pending_payment' && invisibleShieldMode?.active && !invisibleShieldMode?.confirmed_safe_at && !invisibleShieldMode?.auto_escalated_at ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSuccess]}
                      onPress={() => void handleConfirmShieldSafe()}
                      disabled={confirmingShieldSafe}
                    >
                      <Ionicons name="checkmark-done-outline" size={20} color={COLORS.success} />
                      <Text style={styles.actionBtnText}>
                        {confirmingShieldSafe ? 'Confirming...' : 'Confirm Safe'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#fef2f2' }]}
                    onPress={() => void handleSilentDangerMode()}
                    disabled={silentProtecting}
                  >
                    <Ionicons name="alert-circle" size={20} color="#dc2626" />
                    <Text style={[styles.actionBtnText, { color: '#dc2626', fontWeight: '700' }]}>
                      {silentProtecting ? 'Alerting...' : 'Silent SOS'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleReportIncident('harassment')}
                  >
                    <Ionicons name="shield-outline" size={20} color={COLORS.error} />
                    <Text style={styles.actionBtnText}>Safety Issue</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleReportIncident('dispute')}
                  >
                    <Ionicons name="document-text-outline" size={20} color={COLORS.info} />
                    <Text style={styles.actionBtnText}>Preserve Record</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
          </>
          ) : null}
          </ScrollView>
        </View>

        {showMapFirstOverlayDock ? (
          <>
            {showMapFirstLiveDock ? (
              <RiderTrackingRecenterButton
                bottom={mapFirstScrollPadBottom + 12}
                right={flow.padH + 8}
                onPress={handleRecenterMap}
              />
            ) : null}
            {tripStatus === 'ongoing' ? (
              <RiderOnTripRadiantDockFade height={Math.min(340, mapFirstScrollPadBottom + 48)} />
            ) : (
              <RiderLiveTripDockFade height={Math.min(300, mapFirstScrollPadBottom + 40)} />
            )}
            {showMapFirstFindingDock ? (
              <RiderFindingTripDock
                loading={loading}
                pickupVicinityLabel={pickupVicinityLabel}
                bidNgn={findingBidNgn}
                routeKmLabel={
                  currentTrip?.distance_km != null
                    ? `${Number(currentTrip.distance_km).toFixed(1)} km`
                    : null
                }
                routeMinLabel={
                  directionsEtaMin != null
                    ? `~${directionsEtaMin} min`
                    : currentTrip?.duration_mins != null
                      ? `~${Math.round(Number(currentTrip.duration_mins))} min`
                      : null
                }
                onCancel={() => void handleCancelRide()}
                bottomInset={insets.bottom}
              />
            ) : null}
            {showMapFirstPaymentDock ? (
              <RiderPaymentDock
                loading={loading}
                fareDisplay={riderMapFareDisplay}
                financialPaymentPending={financialPaymentPending}
                paymentMethod={tripPaymentMethod}
                paymentStatus={paymentStatus}
                checklist={paymentChecklist}
                onPay={() =>
                  router.push({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)
                }
                onOpenReceipt={() =>
                  router.push({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)
                }
                onClose={() => void handleCancelRide()}
                onOpenTripDetails={() => setTripDetailsExpanded(true)}
                bottomInset={insets.bottom}
              />
            ) : null}
            {showMapFirstLiveDock && tripStatus === 'ongoing' ? (
              <RiderOnTripRadiantDock
                loading={loading}
                driverInfo={driverInfo}
                fareDisplay={riderMapFareDisplay}
                totalTripKm={currentTrip?.distance_km ?? null}
                distanceRemainingKm={distanceRemainingKm}
                speedKmh={speedKmh ?? driverLocation?.speed_kmh ?? null}
                serverEtaSeconds={serverEtaSeconds}
                trackingStatus={trackingStatus}
                locationStale={locationStale}
                wsConnected={riderWsConnected}
                callAllowed={callAllowed}
                onCallDriver={handleCallDriverPress}
                onChatDriver={() =>
                  router.push({ pathname: '/chat', params: { tripId: effectiveTripId } } as any)
                }
                onShare={() => openShareTrip(router, effectiveTripId)}
                onOpenTripDetails={() => setTripDetailsExpanded(true)}
                bottomInset={insets.bottom}
              />
            ) : null}
            {showMapFirstLiveDock && tripStatus !== 'ongoing' ? (
              <RiderLiveTripDock
                tripStatus={tripStatus}
                loading={loading}
                driverInfo={driverInfo}
                driverPickupApproach={driverPickupApproach}
                identityConfirmed={identityConfirmed}
                driverLocation={driverLocation}
                driverMoving={Boolean(driverInfo?.is_moving)}
                fareDisplay={riderMapFareDisplay}
                distanceKm={distanceRemainingKm}
                etaMin={
                  serverEtaSeconds != null
                    ? liveEta.etaMinutes
                    : liveEta.etaMinutes ?? directionsEtaMin
                }
                serverEtaSeconds={serverEtaSeconds}
                trackingStatus={trackingStatus}
                locationStale={locationStale}
                wsConnected={riderWsConnected}
                durationMins={currentTrip?.duration_mins ?? null}
                pickupLabel={
                  (params.pickup as string) ||
                  currentTrip?.pickup_location?.address ||
                  'Your pickup'
                }
                destinationLabel={
                  (params.destination as string) ||
                  currentTrip?.dropoff_location?.address ||
                  'Destination'
                }
                callAllowed={callAllowed}
                onCallDriver={handleCallDriverPress}
                onChatDriver={() =>
                  router.push({ pathname: '/chat', params: { tripId: effectiveTripId } } as any)
                }
                pickupCodeEnabled={currentTrip?.pickup_code_required !== false}
                onShowPickupCode={() =>
                  router.push({
                    pathname: '/rider/security-code',
                    params: { trip_id: effectiveTripId },
                  } as any)
                }
                onVerifyIdentity={() => setShowIdentityModal(true)}
                onOpenTripDetails={() => setTripDetailsExpanded(true)}
                onCancelRide={() => void handleCancelRide()}
                onHelp={() => router.push('/support' as any)}
                onWallet={() => router.push('/(rider-tabs)/rider-wallet' as any)}
                onShare={() => openShareTrip(router, effectiveTripId)}
                bottomInset={insets.bottom}
                isFavoriteDriver={isFavoriteDriver}
                favoriteLoading={addingFavorite || checkingFavorite}
                onToggleFavorite={
                  driverInfo?.driver_id && !isFavoriteDriver
                    ? () => setShowFavoritePrompt(true)
                    : undefined
                }
              />
            ) : null}
          </>
        ) : null}

        {/* Cancel — hidden when map-first dock is shown */}
        {!riderMapFirst && (
          <View style={styles.bottomContainer}>
            <TouchableOpacity
              style={[styles.cancelButton, isFindingDriverPhase && styles.cancelButtonFinding]}
              onPress={handleCancelRide}
            >
              <Text style={styles.cancelText}>
                {['ongoing', 'pending_payment', 'completed', 'cancelled'].includes(tripStatus)
                  ? 'Close Tracking'
                  : 'Cancel Ride'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* ── Driver Identity Verification Modal ── */}
      <DriverArrivalIdentityModal
        visible={showIdentityModal}
        driver={driverInfo ? {
          driver_id: String(driverInfo.driver_id || ''),
          name: formatDriverDisplayField(driverInfo.name) || 'Driver',
          rating: driverInfo.rating ?? driverInfo.avg_rating ?? null,
          profile_image: driverInfo.profile_image || null,
          face_image: driverInfo.face_image || null,
          vehicle: formatDriverDisplayField(driverInfo.vehicle) || 'Vehicle',
          plate: formatDriverDisplayField(driverInfo.plate) || '',
          color: formatDriverDisplayField(driverInfo.color) || '',
          vehicle_type:
            formatDriverDisplayField(driverInfo.vehicle_type) ||
            formatDriverDisplayField(driverInfo.vehicle) ||
            '',
        } : null}
        riderNearPickup={riderNearPickup}
        pickupCodeVerified={riderFaceVerifiedAtPickup}
        onConfirmDriver={handleIdentityConfirmed}
        onReportMismatch={() => { setShowIdentityModal(false); setShowMismatchModal(true); }}
        onDismiss={() => setShowIdentityModal(false)}
        onShowPickupCode={() => {
          setShowIdentityModal(false);
          router.push({ pathname: '/rider/security-code', params: { trip_id: effectiveTripId } } as any);
        }}
      />

      {/* ── Driver Mismatch Warning Modal ── */}
      <DriverMismatchModal
        visible={showMismatchModal}
        onReport={handleReportMismatch}
        onCancelRide={() => {
          setShowMismatchModal(false);
          void fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/cancel`, {
            method: 'POST', headers: getAuthHeaders(),
          }).then(() => router.replace('/(rider-tabs)/rider-home' as any));
        }}
        onClose={() => setShowMismatchModal(false)}
      />

      <AddFavoriteDriverModal
        visible={showFavoritePrompt}
        driverName={driverInfo?.name}
        driverVehicle={driverInfo?.vehicle}
        driverPlate={driverInfo?.plate}
        profileImage={driverInfo?.profile_image || driverInfo?.face_image}
        saving={addingFavorite}
        onDismiss={() => setShowFavoritePrompt(false)}
        onAdd={() => void handleAddFavorite(driverInfo?.driver_id || '')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1A',
  },
  safeArea: {
    flex: 1,
  },
  acceptedToast: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 40,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.35)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  acceptedToastGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
  },
  acceptedToastTitle: {
    color: '#ECFDF5',
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  acceptedToastSub: {
    color: 'rgba(236,253,245,0.85)',
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  headerWordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  headerWordNex: {
    fontSize: 19,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.6,
  },
  headerWordRyde: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FF8A00',
    letterSpacing: -0.35,
  },
  placeholder: {
    width: 44,
  },
  headerMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  content: {
    flex: 1,
  },
  mapFirstContentWrap: {
    paddingHorizontal: 0,
  },
  contentMapOverlay: {
    flex: 1,
  },
  mapFullBleed: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  tripLiveStripOuter: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  tripLiveStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(17,24,39,0.96)',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tripLiveStripText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: -0.2,
  },
  tripLiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(34,229,160,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.4)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  tripLiveChipText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: '#22E5A0',
    letterSpacing: 0.5,
  },
  mapFirstStatusCardWrap: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    alignItems: 'stretch',
  },
  tripQuietWrap: {
    width: '100%',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  tripFindingDock: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: 6,
  },
  tripFindingTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  tripFindingSub: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: SPACING.sm,
  },
  tripQuietLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  tripQuietLoadingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: 'rgba(248,250,252,0.75)',
  },
  tripPrimaryActions: {
    width: '100%',
    gap: SPACING.sm,
  },
  tripPrimaryCtaShell: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,212,106,0.42)',
  },
  tripPrimaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: SPACING.md,
  },
  tripPrimaryCtaText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.2,
  },
  tripSecondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.45)',
    backgroundColor: 'rgba(56,189,248,0.1)',
  },
  tripSecondaryCtaText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#38BDF8',
    textAlign: 'center',
  },
  tripLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tripLivePillText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  tripDetailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tripDetailsToggleTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  tripDetailsToggleSub: {
    marginTop: 2,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.95)',
    lineHeight: 16,
  },
  tripDetailsCloseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tripDetailsCloseText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#94A3B8',
  },
  tripDockBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  tripDockLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripDockLogoTxt: { fontSize: 11, fontWeight: '900', color: '#022C22', letterSpacing: -0.3 },
  tripDockBrand: { fontSize: 15, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.5 },
  tripDockLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  tripDockLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  tripDockLiveTxt: { fontSize: 10, fontWeight: '900', color: '#E2E8F0', letterSpacing: 0.6 },
  tripDockHeroGreen: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: -0.5,
    lineHeight: 28,
    marginTop: 6,
  },
  tripDockSubMuted: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(148,163,184,0.95)',
    lineHeight: 20,
    marginTop: 2,
    marginBottom: 4,
  },
  tripDriverHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
    marginTop: 4,
  },
  tripDriverHeroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(34,197,94,0.45)',
  },
  tripDriverHeroAvatarPh: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripDriverHeroAvatarLetter: { fontSize: 22, fontWeight: '900', color: '#86EFAC' },
  tripDriverHeroName: { fontSize: 17, fontWeight: '900', color: '#F8FAFC' },
  tripDriverHeroVehicle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 18,
  },
  tripDriverHeroRate: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  tripDriverHeroRateTxt: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  tripMetricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  tripMetricCell: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.45)',
    alignItems: 'center',
  },
  tripMetricK: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  tripMetricV: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F1F5F9',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  tripMetricVGreen: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  tripCommRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tripCommBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(30,41,59,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  tripCommBtnMuted: { opacity: 0.55 },
  tripCommBtnTxt: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
  tripCommBtnTxtMuted: { color: '#94A3B8' },
  tripStickyDock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: 'rgba(8,11,22,0.98)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 20,
  },
  tripStickyDockInner: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: 12,
  },
  tripStickyHeadline: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.45,
    lineHeight: 24,
  },
  tripStickyVehicle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: 'rgba(226,232,240,0.92)',
    lineHeight: 20,
  },
  tripPayWideCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.xxl,
    paddingVertical: 16,
    marginTop: 4,
  },
  tripPayWideCtaTxt: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#022C22',
  },
  tripRouteBrief: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  tripRouteBriefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tripRouteDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  tripRouteBriefLine: {
    width: 2,
    height: 14,
    backgroundColor: 'rgba(148,163,184,0.38)',
    marginLeft: 3,
    marginVertical: 3,
    borderRadius: 2,
  },
  tripRouteBriefText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#F1F5F9',
    lineHeight: 20,
  },
  tripCancelOutline: {
    marginTop: 2,
    minHeight: 50,
    borderRadius: BORDER_RADIUS.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: COLORS.error,
    backgroundColor: 'transparent',
  },
  tripCancelOutlineText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.error,
  },
  tripEcosystemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 2,
  },
  tripEcoLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tripEcoLinkText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#CBD5E1',
  },
  arrivedCodeBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#00D46A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  arrivedCodeBannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
  },
  findingStrip: {
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.28)',
  },
  findingStripGrad: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  findingStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  findingStripDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accentGreen,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  findingStripTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  findingStripSub: {
    marginTop: 2,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: 'rgba(226,232,240,0.65)',
  },
  findingStripPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(0,208,132,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.45)',
  },
  findingStripPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.accentGreen,
    letterSpacing: 1.2,
  },
  liveTripHero: {
    backgroundColor: '#111827',
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: SPACING.md,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  liveTripHeroLeft: { flex: 1 },
  liveTripHeroTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  liveTripHeroText: {
    marginTop: 4,
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    fontWeight: '600',
  },
  liveTripChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.infoSoft,
    borderWidth: 1,
    borderColor: COLORS.info,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  liveTripChipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.info,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: '#1A2332',
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mapOverlay: {
    flex: 1,
    backgroundColor: 'rgba(58, 209, 115, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  mapSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
  },
  statusCard: {
    backgroundColor: '#111827',
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  statusCardFinding: {
    backgroundColor: 'rgba(8,12,22,0.94)',
    borderColor: 'rgba(52,245,184,0.24)',
    shadowColor: '#34F5B8',
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  actionsCard: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  actionBtn: {
    minWidth: '47%',
    backgroundColor: '#111827',
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnSuccess: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successSoft,
  },
  actionBtnPayFareShell: {
    minWidth: '100%',
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,212,106,0.45)',
  },
  actionBtnPayFareGrad: {
    minWidth: '100%',
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  actionBtnPayFareText: {
    color: '#022C22',
  },
  actionBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  driverLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.sm,
  },
  driverLocationText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.info,
  },
  aiRouteBadge: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  aiRouteBadgeText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.info,
  },
  faceMatchBadge: {
    width: '100%',
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  faceMatchBadgeOk: {
    backgroundColor: COLORS.successSoft,
  },
  faceMatchBadgePending: {
    backgroundColor: COLORS.warningSoft,
  },
  faceMatchBadgeText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  recordingBanner: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  recordingTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  recordingText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  recordingMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  speedSpikeCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  speedSpikeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  speedSpikeTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.error,
  },
  speedSpikeText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: 'rgba(255,255,255,0.65)',
  },
  speedSpikeMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.error,
  },
  safeArrivalCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: COLORS.successSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  safeArrivalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  safeArrivalTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.success,
  },
  safeArrivalText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: 'rgba(255,255,255,0.65)',
  },
  safeArrivalMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.success,
  },
  shieldCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: COLORS.primarySoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  shieldCardActive: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.success,
  },
  shieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  shieldTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  shieldText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: 'rgba(255,255,255,0.55)',
  },
  shieldMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.primary,
  },
  geoFenceCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: COLORS.infoSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.info,
  },
  geoFenceCardActive: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.success,
  },
  geoFenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  geoFenceTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  geoFenceText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: 'rgba(255,255,255,0.55)',
  },
  geoFenceMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.warning,
  },
  guardianCard: {
    marginTop: SPACING.lg,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  guardianTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.warning,
    marginBottom: 2,
  },
  guardianText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 18,
  },
  guardianActions: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  guardianActionBtn: {
    flex: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.xs + 2,
    alignItems: 'center',
    borderWidth: 1,
  },
  guardianSafeBtn: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.success,
  },
  guardianHelpBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: COLORS.error,
  },
  guardianSafeBtnText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.success,
  },
  guardianHelpBtnText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.error,
  },
  loadingContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  findingHeroSlot: {
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  findingRingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  findingRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,208,132,0.55)',
    backgroundColor: 'rgba(0,208,132,0.08)',
    shadowColor: '#00D46A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  statusTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: SPACING.lg,
  },
  statusSubtitleFinding: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.md,
    color: 'rgba(226,232,240,0.62)',
  },
  routeInfo: {
    width: '100%',
    paddingHorizontal: SPACING.lg,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeText: {
    fontSize: FONT_SIZE.md,
    color: '#F8FAFC',
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginLeft: 5,
    marginVertical: 4,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  cancelButton: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.error,
  },
  cancelButtonFinding: {
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(248,113,113,0.42)',
  },
  cancelText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.error,
  },

  /* ── Driver Identity Card styles ── */
  identityCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: '#111827',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  identityCardArrived: {
    borderColor: 'rgba(34,229,160,0.5)',
    shadowColor: '#22E5A0',
    shadowOpacity: 0.2,
  },
  identityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16,
  },
  idAvatarWrap: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 3, overflow: 'hidden',
    position: 'relative',
  },
  idAvatar: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  idArrivedDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#22E5A0', borderWidth: 2, borderColor: '#111827',
    alignItems: 'center', justifyContent: 'center',
  },
  idName:    { fontSize: 17, fontWeight: '900', color: '#E2E8F0' },
  idVehicle: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  idColorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  idColorDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  idColorText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  idRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  idRatingText: { fontSize: 12, fontWeight: '700', color: '#EAB308' },
  idVerifiedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#22E5A0', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  idVerifiedText: { fontSize: 12, fontWeight: '900', color: '#022C22' },
  idVerifyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(14,165,233,0.12)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(14,165,233,0.3)',
  },
  idVerifyBtnText: { fontSize: 12, fontWeight: '800', color: '#0ea5e9' },
  /* Plate */
  idPlateWrap: {
    marginHorizontal: 16, marginBottom: 14, alignItems: 'center', gap: 5,
  },
  idPlateInner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0f172a', borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)',
    width: '100%',
    shadowColor: '#22E5A0', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  idPlateFlag: {
    width: 14, height: 40, borderRadius: 2,
    overflow: 'hidden', marginRight: 14,
  },
  idPlateNumber: {
    flex: 1, fontSize: 28, fontWeight: '900',
    color: '#FFFFFF', letterSpacing: 5,
    textAlign: 'center',
    textShadowColor: 'rgba(34,229,160,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  idPlateSub: { fontSize: 11, fontWeight: '600', color: '#475569' },
  /* Arrived CTA */
  idCodeBanner: { marginHorizontal: 12, marginBottom: 14, borderRadius: 14, overflow: 'hidden' },
  idCodeBannerGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 16,
  },
});
