import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  saveDriverState,
  updateDriverOnlineStatus,
  updateDriverLastScreen,
} from '@/src/services/driverStateService';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  AppState,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useAppStore, type Trip, type DriverProfile } from '@/src/store/appStore';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SupportedLanguage } from '@/src/i18n/translations';
import { driverOffersFallbackPollIntervalMs } from '@/src/constants/tripRealtimeRhythm';
import { flushTripLocationQueue } from '@/src/utils/tripLocationQueue';
import {
  BACKEND_URL,
  getAuthHeaders,
  getDriverSubscriptionStatus,
  reportDriverSimSwapSignal,
  formatApiDetail,
  messageFromAxiosError,
  getDriverWithdrawals,
  getTrip,
  arriveTrip,
  startTrip,
  cancelTrip,
  completeTrip,
  rateTrip,
} from '@/src/services/api';


import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useDriverOfferAlert } from '@/src/hooks/useDriverOfferAlert';
import {
  driverTermsRouteParams,
  driverDocumentsRouteParams,
  driverProfileRouteParams,
} from '@/src/utils/driverOnboardingNav';
import {
  checkOnlineStatus,
  getQueueSize,
  initializeOfflineMode,
  queueDriverRideAcceptance,
  syncQueuedRequests,
} from '@/src/services/offlineMode';
import * as Haptics from 'expo-haptics';
import { DRIVER_OFFER_COUNTDOWN_SECONDS } from '@/src/constants/driverOffer';
import { buildDriverPriorityFeatures, buildDriverToolFeatures } from '@/src/config/driverHomeFeatures';
import DriverRideRequestModal from '@/src/components/DriverRideRequestModal';
import { FeatureHubDrawer } from '@/src/components/FeatureHubDrawer';
import { PrayerStripWidget } from '@/src/components/PrayerStripWidget';
import { SkeletonBlock } from '@/src/components/SkeletonBlock';
import { COLORS } from '@/src/constants/theme';
import { HOME_PALETTE } from '@/src/constants/designSystem';
import { useFlowLayout } from '@/src/constants/flowLayout';
import DriverLiveMapView, {
  NEXRYDE_MAP_STYLE,
  type ActiveTrip,
} from '@/src/components/DriverLiveMapView';
import DriverTripCompletionPanel, {
  type TripCompletionPayload,
} from '@/src/components/driver/DriverTripCompletionPanel';
import DriverCompleteTripConfirmModal from '@/src/components/driver/DriverCompleteTripConfirmModal';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const { width } = Dimensions.get('window');

const getWsBaseUrl = () => {
  const url = BACKEND_URL.replace(/\/$/, '');
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  return `wss://${url}`;
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function normalizeRoutePreview(raw: unknown): Array<{ lat: number; lng: number }> | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const out: Array<{ lat: number; lng: number }> = [];
  for (const p of raw) {
    const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
    if (!o) continue;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ lat, lng });
  }
  return out.length >= 2 ? out : null;
}

function readTripShield(raw: Record<string, unknown>): Record<string, unknown> | null {
  const s = raw.shield;
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
}

function tripToActiveTrip(trip: Trip | null, driverProfile: DriverProfile | null): ActiveTrip | null {
  if (!trip?.id) return null;
  const st = trip.status;
  if (!['accepted', 'arrived', 'ongoing', 'pending_payment'].includes(st)) return null;
  const raw = trip as unknown as Record<string, unknown>;
  const route =
    normalizeRoutePreview(raw.route_preview_coordinates) ??
    normalizeRoutePreview(raw.polyline_coords);
  const sh = readTripShield(raw);
  let rider_reputation_avg: number | null = null;
  if (sh) {
    const a = sh.rider_reputation_avg;
    const n = typeof a === 'number' ? a : typeof a === 'string' ? parseFloat(a) : NaN;
    if (Number.isFinite(n) && n > 0 && n <= 5) rider_reputation_avg = Math.round(n * 10) / 10;
  }
  const tcRaw = sh?.rider_reputation_trip_count;
  const tcNum = typeof tcRaw === 'number' ? tcRaw : typeof tcRaw === 'string' ? parseInt(tcRaw, 10) : NaN;
  const rider_trip_count = Number.isFinite(tcNum) && tcNum >= 0 ? tcNum : null;
  const rider_new_account = sh ? !!sh.rider_new_account : false;
  return {
    id: trip.id,
    pickup_location: trip.pickup_location,
    dropoff_location: trip.dropoff_location,
    route_preview_coordinates: route,
    status: trip.status,
    rider_name: (raw.rider_name as string) || null,
    rider_profile_image: (raw.rider_profile_image as string) || null,
    rider_phone: (raw.rider_phone as string) || null,
    pickup_code_verified: trip.pickup_code_verified,
    security_code_verified: trip.security_code_verified,
    pickup_code_required: trip.pickup_code_required !== false,
    arrived_at: trip.arrived_at ?? null,
    started_at: trip.started_at ?? null,
    fare: Number.isFinite(trip.fare) ? trip.fare : null,
    payment_method: trip.payment_method ?? null,
    payment_status: trip.payment_status ?? null,
    rider_reputation_avg,
    rider_trip_count,
    rider_new_account,
    distance_to_next_km: (() => {
      const d = raw.distance_to_next_km ?? raw.distance_to_pickup_km ?? raw.distance_to_pickup;
      if (d == null) return null;
      const n = Number(d);
      return Number.isFinite(n) ? n : null;
    })(),
    distance_km: Number.isFinite(Number(trip.distance_km)) ? Number(trip.distance_km) : null,
    duration_mins: Number.isFinite(Number(trip.duration_mins)) ? Number(trip.duration_mins) : null,
    base_fare: (() => {
      const v = Number(raw.base_fare);
      return Number.isFinite(v) ? v : null;
    })(),
    distance_fee: (() => {
      const v = Number(raw.distance_fee);
      return Number.isFinite(v) ? v : null;
    })(),
    time_fee: (() => {
      const v = Number(raw.time_fee);
      return Number.isFinite(v) ? v : null;
    })(),
    vehicle_model: (raw.vehicle_model as string) || driverProfile?.vehicle_model || null,
    vehicle_plate: (raw.vehicle_plate as string) || driverProfile?.vehicle_plate || null,
    vehicle_color: (raw.vehicle_color as string) || driverProfile?.vehicle_color || null,
  };
}

function formatTripShortIdForUi(id: string | undefined | null): string {
  if (!id || typeof id !== 'string') return '—';
  const tail = id.replace(/-/g, '').slice(-6).toUpperCase();
  return tail.length >= 4 ? tail : id.slice(0, 6).toUpperCase();
}

function tripToCompletionPayload(merged: Trip & Record<string, unknown>): TripCompletionPayload {
  const raw = merged as Record<string, unknown>;
  const rr = merged.rider_rating;
  const alreadyRated = typeof rr === 'number' && rr > 0 && rr <= 5;
  const riderName =
    typeof raw.rider_name === 'string' && raw.rider_name.trim().length > 0
      ? raw.rider_name.trim()
      : 'Your rider';
  const riderPhoto = typeof raw.rider_profile_image === 'string' ? raw.rider_profile_image : null;
  const mb = raw.mystery_bonus_ngn;
  const sh = readTripShield(raw);
  let riderRatingAvg: number | null = null;
  if (sh) {
    const a = sh.rider_reputation_avg;
    const n = typeof a === 'number' ? a : typeof a === 'string' ? parseFloat(a) : NaN;
    if (Number.isFinite(n) && n > 0 && n <= 5) riderRatingAvg = Math.round(n * 10) / 10;
  }
  const tcRaw = sh?.rider_reputation_trip_count;
  const tcNum = typeof tcRaw === 'number' ? tcRaw : typeof tcRaw === 'string' ? parseInt(tcRaw, 10) : NaN;
  const riderTripCount = Number.isFinite(tcNum) && tcNum >= 0 ? tcNum : null;
  const baseFareNgn = (() => {
    const v = Number(raw.base_fare);
    return Number.isFinite(v) && v >= 0 ? v : null;
  })();
  const distanceFareNgn = (() => {
    const v = Number(raw.distance_fee);
    return Number.isFinite(v) && v >= 0 ? v : null;
  })();
  const timeFareNgn = (() => {
    const v = Number(raw.time_fee);
    return Number.isFinite(v) && v >= 0 ? v : null;
  })();
  return {
    tripId: merged.id,
    tripDisplayId: `Trip ${formatTripShortIdForUi(merged.id)}`,
    riderName,
    riderPhoto,
    fare: Number(merged.fare ?? 0),
    paymentMethod: String(merged.payment_method ?? 'cash'),
    paymentPending: String(merged.payment_status || '').toLowerCase() === 'pending',
    alreadyRated,
    mysteryBonusNgn: mb != null && Number.isFinite(Number(mb)) ? Number(mb) : null,
    riderRatingAvg,
    riderTripCount,
    baseFareNgn,
    distanceFareNgn,
    timeFareNgn,
  };
}

function openGoogleNavigation(lat: number | null, lng: number | null, addressFallback?: string) {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const url =
      Platform.select({
        ios: `maps:0,0?q=${lat},${lng}`,
        android: `google.navigation:q=${lat},${lng}`,
      }) || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
    });
  } else if (addressFallback) {
    const encoded = encodeURIComponent(addressFallback);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
  }
}

/** Map backend `ride_offer` WebSocket payload to the trip shape used by the offer modal + accept API. */
function mapWsRideOfferToTrip(data: Record<string, unknown>) {
  const riderOffer = data.rider_offer_price;
  const rec = data.recommended_fare;
  const pickup = (data.pickup ?? data.pickup_coordinates) as Record<string, unknown> | string | undefined;
  const dropoff = (data.dropoff ?? data.destination_coordinates) as Record<string, unknown> | string | undefined;
  return {
    id: String(data.trip_id ?? ''),
    offer_id: String(data.offer_id ?? ''),
    pickup_location: pickup,
    dropoff_location: dropoff,
    offered_fare: riderOffer,
    fare: riderOffer,
    min_price: data.minimum_allowed_price,
    max_price: data.maximum_allowed_price,
    distance_km: data.distance_km,
    duration_mins: data.estimated_time_mins,
    distance_to_pickup: data.distance_to_pickup_km ?? data.distance_to_pickup,
    base_price: rec,
    recommended_fare: rec,
    ride_preferences: Array.isArray(data.ride_preferences) ? data.ride_preferences : [],
    rider_mood: data.rider_mood ?? {},
    rider_name: data.rider_name ?? '',
    rider_photo: data.rider_photo ?? null,
    shield: data.shield as Record<string, unknown> | undefined,
    status: data.status,
    preferred: data.preferred,
    offer_expires_at: data.expires_at,
    // Map preview data — forwarded so DriverOfferRoutePreview renders correctly
    route_preview_coordinates: data.route_preview_coordinates ?? data.polyline_coords ?? null,
    map_preview_region: data.map_preview_region ?? null,
    area_summary_line: data.area_summary_line ?? data.area_label ?? null,
    surge_multiplier: data.surge_multiplier ?? 1,
    payment_method: data.payment_method ?? 'cash',
  };
}

// Feature arrays built inside component to use translations

export default function ModernDriverHome() {
  const router = useRouter();
  const {
    user,
    token,
    currentTrip,
    setCurrentTrip,
    setCurrentLocation,
    setIsOnline: setStoreIsOnline,
    driverProfile,
  } = useAppStore();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();

  // ── Quick-access action (from widget tap or app shortcut) ─────────────────
  const { action: rawAction } = useLocalSearchParams<{ action?: string }>();
  const pendingAction = typeof rawAction === 'string' ? rawAction : '';
  const autoActionFiredRef = useRef(false);
  const { language, setLanguage, availableLanguages, t } = useLanguage();
  const [isOnline, setIsOnline] = useState(false);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  // Sync to global store so _layout can style the tab bar for map mode
  useEffect(() => { setStoreIsOnline(isOnline); }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load destination mode state whenever driver comes online
  useEffect(() => {
    if (!isOnline || !driverId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/destination`, { headers: getAuthHeaders() });
        if (res.ok && mounted) {
          const data = await res.json();
          setDestinationActive(!!data.active);
          setDestinationName(data.destination_name || '');
          setDestinationTripsRemaining(Number(data.trips_remaining ?? 0));
        }
      } catch { /* silent */ }
    })();
    return () => { mounted = false; };
  }, [isOnline, driverId]); // eslint-disable-line react-hooks/exhaustive-deps

  const priorityFeatures = useMemo(
    () => buildDriverPriorityFeatures(t),
    [language, t.home.myTrips, t.home.support, t.wallet.payment]
  );
  const toolFeatures = useMemo(
    () => buildDriverToolFeatures(t),
    [language, t.verification.vehicleVerified, t.verification.uploadDocuments, t.safety.safetyTips, t.driver.rating]
  );
  const [earnings, setEarnings] = useState({
    today: 0,
    week: 0,
    trips: 0,
    tripHoursToday: 0,
  });
  const [surgePricing, setSurgePricing] = useState<any>(null);

  // Load real earnings from backend
  useEffect(() => {
    if (!driverId) return;
    let mounted = true;
    const fetchEarnings = async (isInitial = false) => {
      if (isInitial) { setEarningsLoading(true); setEarningsError(false); }
      try {
        const [todayRes, weekRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/driver/earnings/${driverId}?period=today`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${BACKEND_URL}/api/driver/earnings/${driverId}?period=week`, {
            headers: getAuthHeaders(),
          }),
        ]);
        if (!mounted) return;
        if (!todayRes.ok) { if (isInitial) setEarningsError(true); return; }
        const todayData = await todayRes.json();
        const weekData = weekRes.ok ? await weekRes.json() : null;
        const todaySummary = todayData?.summary || {};
        const weekSummary = weekData?.summary || {};
        if (mounted && todayData) {
          const todayEarnings = Number(
            todaySummary.total_earnings ?? todayData.today_earnings ?? todayData?.projections?.daily ?? 0
          );
          const weekEarnings = Number(weekSummary.total_earnings ?? weekData?.projections?.weekly ?? 0);
          const tripMins = Number(todaySummary.total_time_mins ?? 0);
          const tripHoursToday = tripMins > 0 ? Math.round((tripMins / 60) * 10) / 10 : 0;
          setEarnings({
            today: todayEarnings,
            week: weekEarnings,
            trips: Number(todaySummary.total_trips ?? 0),
            tripHoursToday,
          });
          setSurgePricing(todayData.surge || null);
          setEarningsError(false);
        }
      } catch {
        if (mounted && isInitial) setEarningsError(true);
      } finally {
        if (mounted && isInitial) setEarningsLoading(false);
      }
    };
    fetchEarnings(true);
    const interval = setInterval(() => fetchEarnings(false), 60000);
    // Fetch wallet balance in background
    getDriverWithdrawals(driverId).then(r => {
      if (mounted) setWalletBalance(r.data.wallet_balance ?? 0);
    }).catch(() => {});
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [driverId, user?.total_trips]);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [trialTripsCompleted, setTrialTripsCompleted] = useState<number>(0);
  const [trialTripsTarget, setTrialTripsTarget] = useState<number>(20);
  const [trialExtended, setTrialExtended] = useState<boolean>(false);
  const driverApproved = verificationStatus === 'approved';
  const trialReady = subscriptionStatus ? ['trial', 'active', 'grace_period'].includes(subscriptionStatus) : false;
  const trialRemaining = Math.max(0, trialTripsTarget - trialTripsCompleted);
  const showTrialProgress = driverApproved && subscriptionStatus === 'trial' && trialTripsTarget > 0;
  const driverCanReceiveOffers = driverApproved && trialReady;
  const verificationLocked = Boolean(verificationStatus && !driverApproved);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [incomingRide, setIncomingRide] = useState<any>(null);
  const incomingOfferAlertKey =
    incomingRide?.offer_id != null
      ? String(incomingRide.offer_id)
      : incomingRide?.id != null
        ? String(incomingRide.id)
        : null;
  useDriverOfferAlert(Platform.OS !== 'web' && Boolean(incomingRide), incomingOfferAlertKey);
  const [driverOffersWsConnected, setDriverOffersWsConnected] = useState(false);
  const driverOffersWsRef = useRef<WebSocket | null>(null);
  const driverOffersReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driverOffersReconnectAttemptsRef = useRef(0);
  const [rideCountdown, setRideCountdown] = useState(DRIVER_OFFER_COUNTDOWN_SECONDS);
  const [counterFareInput, setCounterFareInput] = useState('');
  const [acceptingRide, setAcceptingRide] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [featureHubOpen, setFeatureHubOpen] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [driverCoords, setDriverCoords] = useState<{
    lat: number;
    lng: number;
    heading?: number;
    speedKmh?: number;
  } | null>(null);
  const lastLocationPushAtRef = useRef<number>(0);
  const lastLocationPushCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [simSignalSent, setSimSignalSent] = useState(false);
  const onlineToggleInFlightRef = useRef(false);
  const [toggleSyncing, setToggleSyncing] = useState(false);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earningsError, setEarningsError] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  // ── Destination mode state ──────────────────────────────────────────────
  const [destinationActive, setDestinationActive] = useState(false);
  const [destinationName, setDestinationName] = useState('');
  const [destinationTripsRemaining, setDestinationTripsRemaining] = useState(0);

  const [tripActionBusy, setTripActionBusy] = useState<string | null>(null);
  const [tripCompletion, setTripCompletion] = useState<TripCompletionPayload | null>(null);
  const [completeTripConfirmOpen, setCompleteTripConfirmOpen] = useState(false);

  // ─── Ride category selection ─────────────────────────────────────────────
  const CATEGORY_OPTIONS = [
    { id: 'economy', label: 'Standard', icon: 'car-outline' as const, color: '#00D46A', desc: 'Affordable rides' },
    { id: 'comfort', label: 'Comfort', icon: 'car-sport-outline' as const, color: '#0EA5E9', desc: 'More space & style' },
    { id: 'xl', label: 'XL', icon: 'bus-outline' as const, color: '#FFB800', desc: '6-seat vehicles' },
    { id: 'premium', label: 'Premium', icon: 'rocket-outline' as const, color: '#9333EA', desc: 'Luxury experience' },
  ] as const;
  const [activeCategories, setActiveCategories] = useState<string[]>(['economy']);
  const [categorySyncing, setCategorySyncing] = useState(false);
  const [idleBoostVisible, setIdleBoostVisible] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load driver categories on mount
  useEffect(() => {
    if (!driverId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/categories`, {
          headers: getAuthHeaders(),
        });
        if (res.ok && mounted) {
          const data = await res.json();
          if (Array.isArray(data.active_categories) && data.active_categories.length > 0) {
            setActiveCategories(data.active_categories);
          }
        }
      } catch { /* silent — default to economy */ }
    })();
    return () => { mounted = false; };
  }, [driverId]);

  const toggleCategory = async (catId: string) => {
    if (categorySyncing || !driverId || !canCallAuthedApi) return;
    let next: string[];
    if (activeCategories.includes(catId)) {
      if (activeCategories.length === 1) {
        Alert.alert('At least one category required', 'You must stay active in at least one ride category.');
        return;
      }
      next = activeCategories.filter((c) => c !== catId);
    } else {
      next = [...activeCategories, catId];
    }
    setActiveCategories(next);
    setCategorySyncing(true);
    try {
      await fetch(`${BACKEND_URL}/api/drivers/${driverId}/categories`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_categories: next }),
      });
    } catch { /* revert on failure */ setActiveCategories(activeCategories); }
    finally { setCategorySyncing(false); }
  };

  // Smart idle boost — suggest enabling more categories after 8 min idle while online
  useEffect(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (isOnline && !incomingRide && activeCategories.length < CATEGORY_OPTIONS.length) {
      idleTimerRef.current = setTimeout(() => setIdleBoostVisible(true), 8 * 60 * 1000);
    } else {
      setIdleBoostVisible(false);
    }
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [isOnline, incomingRide, activeCategories.length]);
  // ─────────────────────────────────────────────────────────────────────────

  const tabPad = useTabBottomPad(8);
  const navigationInFlightRef = useRef(false);
  const guardedPush = useCallback(
    (route: Href) => {
      if (navigationInFlightRef.current) return;
      navigationInFlightRef.current = true;
      router.push(route);
      setTimeout(() => {
        navigationInFlightRef.current = false;
      }, 700);
    },
    [router]
  );

  const activeTripForMap = useMemo(
    () => tripToActiveTrip(currentTrip, driverProfile),
    [currentTrip, driverProfile],
  );

  const handleTripOpenNavigation = useCallback(() => {
    if (!currentTrip) return;
    const st = currentTrip.status;
    const pick = currentTrip.pickup_location;
    const drop = currentTrip.dropoff_location;
    const pv = !!(currentTrip.pickup_code_verified || currentTrip.security_code_verified);
    if (st === 'accepted' && pick) {
      openGoogleNavigation(Number(pick.lat), Number(pick.lng), pick.address);
    } else if (st === 'arrived' && pv && drop) {
      openGoogleNavigation(Number(drop.lat), Number(drop.lng), drop.address);
    } else if (st === 'arrived' && pick) {
      openGoogleNavigation(Number(pick.lat), Number(pick.lng), pick.address);
    } else if (st === 'ongoing' && drop) {
      openGoogleNavigation(Number(drop.lat), Number(drop.lng), drop.address);
    }
  }, [currentTrip]);

  const handleTripMarkArrived = useCallback(async () => {
    if (!currentTrip?.id || !driverId) return;
    setTripActionBusy('arrive');
    try {
      const res = await arriveTrip(currentTrip.id, driverId);
      setCurrentTrip(res.data as Trip);
    } catch (e: unknown) {
      let msg = 'Try again.';
      if (typeof e === 'object' && e !== null && 'response' in e) {
        const d = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
        if (typeof d === 'string') msg = d;
      }
      Alert.alert('Could not update', msg);
    } finally {
      setTripActionBusy(null);
    }
  }, [currentTrip?.id, driverId, setCurrentTrip]);

  const handleTripStart = useCallback(() => {
    if (!currentTrip?.id || !driverId) return;
    guardedPush(
      `/driver/verify-rider-code?trip_id=${encodeURIComponent(currentTrip.id)}&driver_id=${encodeURIComponent(driverId)}&auto=0`
    );
  }, [currentTrip?.id, driverId, guardedPush]);

  const handleTripConfirmStart = useCallback(async () => {
    if (!currentTrip?.id) return;
    setTripActionBusy('start');
    try {
      const res = await startTrip(currentTrip.id);
      setCurrentTrip((res?.data as Trip) || currentTrip);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: unknown) {
      Alert.alert('Could not start trip', messageFromAxiosError(e, 'Try again in a moment.'));
    } finally {
      setTripActionBusy(null);
    }
  }, [currentTrip, setCurrentTrip]);

  const handleTripCancelFromDock = useCallback(async () => {
    if (!currentTrip?.id || !driverId) return;
    setTripActionBusy('cancel');
    try {
      await cancelTrip(currentTrip.id, driverId);
      setCurrentTrip(null);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (e: unknown) {
      Alert.alert('Could not cancel', messageFromAxiosError(e, 'Try again in a moment.'));
    } finally {
      setTripActionBusy(null);
    }
  }, [currentTrip?.id, driverId, setCurrentTrip]);

  const handleTripPauseFromDock = useCallback(() => {
    Alert.alert(
      'Pause trip',
      'Full trip pause from here is not available yet. Pull over safely, then use Chat or Call if you need a moment with your rider.',
    );
  }, []);

  const performCompleteTrip = useCallback(async () => {
    if (!currentTrip?.id) return;
    setTripActionBusy('complete');
    try {
      const response = await completeTrip(currentTrip.id);
      const tripAfter = (response?.data || {}) as Trip & Record<string, unknown>;
      const statusAfter =
        tripAfter.status === 'completed' && tripAfter.payment_status === 'pending'
          ? 'pending_payment'
          : tripAfter.status;
      const merged = {
        ...(currentTrip || ({} as Trip)),
        ...tripAfter,
        id: (tripAfter as Trip).id || currentTrip.id,
        ...(statusAfter === 'pending_payment' ? { status: 'pending_payment' as const } : {}),
      } as Trip & Record<string, unknown>;
      setCompleteTripConfirmOpen(false);
      setTripCompletion(tripToCompletionPayload(merged));
      if (statusAfter === 'pending_payment') {
        setCurrentTrip(merged as Trip);
      } else {
        setCurrentTrip(null);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: unknown) {
      Alert.alert('Could not complete', messageFromAxiosError(e, 'Try again in a moment.'));
    } finally {
      setTripActionBusy(null);
    }
  }, [currentTrip, setCurrentTrip]);

  const handleTripComplete = useCallback(() => {
    if (!currentTrip?.id) return;
    setCompleteTripConfirmOpen(true);
  }, [currentTrip?.id]);

  const completeModalRiderName = useMemo(() => {
    const raw = currentTrip as unknown as Record<string, unknown> | null;
    const n = raw?.rider_name;
    return typeof n === 'string' && n.trim() ? n.trim() : 'Your rider';
  }, [currentTrip]);

  const completeModalFare = useMemo(() => {
    if (!currentTrip || currentTrip.fare == null) return null;
    const f = Number(currentTrip.fare);
    return Number.isFinite(f) ? f : null;
  }, [currentTrip]);

  const handleCompletionRate = useCallback(
    async (stars: number, comment: string) => {
      if (!driverId) throw new Error('Not signed in');
      const tid = tripCompletion?.tripId;
      if (!tid) throw new Error('Missing trip');
      await rateTrip(tid, driverId, stars, comment);
    },
    [driverId, tripCompletion?.tripId],
  );

  const handleTripCallRider = useCallback(() => {
    const raw = currentTrip as unknown as Record<string, unknown> | null;
    const phone = raw?.rider_phone;
    if (typeof phone !== 'string' || !phone.trim()) {
      Alert.alert('Call unavailable', 'Rider phone will appear here once the trip syncs.');
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  }, [currentTrip]);

  const handleTripMessageRider = useCallback(() => {
    if (!currentTrip?.id) return;
    guardedPush({ pathname: '/chat', params: { tripId: String(currentTrip.id) } });
  }, [currentTrip?.id, guardedPush]);

  const hydrateOnlineState = async () => {
    if (!driverId) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/profile`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return;
      const profile = await response.json();
      const serverOnline = Boolean(profile?.is_online);
      setIsOnline(serverOnline);
      // Persist authoritative server state so the widget and smart-resume reflect reality
      void updateDriverOnlineStatus(serverOnline, driverId);
    } catch {}
  };
  const fetchIncomingRide = useCallback(async () => {
    if (!driverId || !canCallAuthedApi) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/trips/offers/${driverId}`,
        { headers: getAuthHeaders() }
      );
      const trips = await res.json();
      if (Array.isArray(trips) && trips.length > 0) {
        setIncomingRide((prev: any) => prev || trips[0]);
        setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
      }
    } catch (e) {
      if (__DEV__) console.warn('Offer polling error', e);
    }
  }, [driverId, canCallAuthedApi]);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();

    initializeOfflineMode();
    void getQueueSize().then(setOfflineQueueCount);
  }, []);

  useEffect(() => {
    if (!driverId) return;

    // Check onboarding status first — this is the verification gate
    checkOnboardingStatus();
    hydrateOnlineState();

    void saveDriverState({
      isOnline: isOnlineRef.current,
      lastScreen: 'home',
      activeTripId: null,
      userId: driverId,
    });
  }, [driverId]);

  // ── Auto go-online from widget / shortcut / notification ─────────────────
  useEffect(() => {
    if (!pendingAction || autoActionFiredRef.current) return;
    if (pendingAction !== 'go_online') return;
    autoActionFiredRef.current = true;
    // Wait for hydrateOnlineState to complete (≈ 400 ms on fast networks)
    const t = setTimeout(() => {
      if (!isOnlineRef.current) {
        void (async () => {
          try {
            // Use the same toggle path so all guards (approval, trial) run normally
            await handleToggleOnline();
          } catch {}
        })();
      }
    }, 600);
    return () => clearTimeout(t);
  }, [pendingAction]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        hydrateOnlineState();
        void getQueueSize().then(setOfflineQueueCount);
        void syncQueuedRequests();
        // Re-check verification status when app comes to foreground — reflects admin approval instantly
        void checkOnboardingStatus();
      }
    });
    return () => {
      sub.remove();
    };
  }, [driverId]);

  useEffect(() => {
    let mounted = true;
    let locationSub: Location.LocationSubscription | null = null;

    const bootstrapLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (mounted && lastKnown) {
          const c = {
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
            heading: lastKnown.coords.heading ?? 0,
            speedKmh: lastKnown.coords.speed != null ? (lastKnown.coords.speed * 3.6) : undefined,
          };
          setDriverCoords(c);
          setCurrentLocation({ latitude: c.lat, longitude: c.lng, address: '' });
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (mounted) {
          const c = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            heading: loc.coords.heading ?? 0,
            speedKmh: loc.coords.speed != null ? (loc.coords.speed * 3.6) : undefined,
          };
          setDriverCoords(c);
          setCurrentLocation({ latitude: c.lat, longitude: c.lng, address: '' });
        }

        locationSub = await Location.watchPositionAsync(
          {
            // 5 s interval when online (for map follow), 12 s when offline
            // Backend push is further debounced (15 s + 50 m) so no extra API calls
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (update) => {
            if (mounted) {
              const c = {
                lat: update.coords.latitude,
                lng: update.coords.longitude,
                heading: update.coords.heading ?? 0,
                speedKmh: update.coords.speed != null ? (update.coords.speed * 3.6) : undefined,
              };
              setDriverCoords(c);
              setCurrentLocation({ latitude: c.lat, longitude: c.lng, address: '' });
            }
          }
        );
      } catch (e) {
      }
    };
    bootstrapLocation();
    return () => {
      mounted = false;
      if (locationSub) locationSub.remove();
    };
  }, []);

  // Push live location to backend — smart throttle to minimise API calls
  useEffect(() => {
    if (!isOnline || !driverId || !driverCoords) return;
    const now = Date.now();
    const lastAt = lastLocationPushAtRef.current;
    const lastCoords = lastLocationPushCoordsRef.current;

    // While moving: update every 15 s if moved >30 m
    // While idle  : update at most every 30 s (heartbeat only)
    const movedKm = lastCoords
      ? Math.abs(calculateDistance(driverCoords.lat, driverCoords.lng, lastCoords.lat, lastCoords.lng))
      : 999;
    const isIdle = movedKm < 0.03; // <30 m = idle
    const minIntervalMs = isIdle ? 30000 : 15000;
    const minMoveKm = 0.03; // 30 m movement threshold

    if (lastAt && now - lastAt < minIntervalMs) return;
    if (lastCoords && movedKm < minMoveKm && now - lastAt < 60000) return;

    const pushLocation = async () => {
      try {
        await fetch(`${BACKEND_URL}/api/drivers/${driverId}/location`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ latitude: driverCoords.lat, longitude: driverCoords.lng }),
        });
        lastLocationPushAtRef.current = Date.now();
        lastLocationPushCoordsRef.current = { lat: driverCoords.lat, lng: driverCoords.lng };
      } catch {}
    };
    pushLocation();
  }, [isOnline, driverId, driverCoords?.lat, driverCoords?.lng]);

  useEffect(() => {
    if (AppState.currentState === 'active') void flushTripLocationQueue();
  }, [currentTrip?.id]);

  // SIM Swap Protection — runs at most once per 24h per device, never blocks UI
  const [simSwapAlert, setSimSwapAlert] = useState(false);
  useEffect(() => {
    if (!driverId || simSignalSent) return;
    const sendSimRiskSignal = async () => {
      try {
        const fpKey = `nexryde_sim_fp_${driverId}`;
        const cooldownKey = `nexryde_sim_check_ts_${driverId}`;

        // Local 24h cooldown — skip if checked within the last 24 hours
        const lastCheckTs = await SecureStore.getItemAsync(cooldownKey);
        if (lastCheckTs && Date.now() - Number(lastCheckTs) < 86_400_000) {
          return; // Not due yet
        }

        // Generate or retrieve stable device fingerprint
        let fingerprint = await SecureStore.getItemAsync(fpKey);
        if (!fingerprint) {
          // First-time: generate a stable ID based on user + platform (no random)
          fingerprint = `simfp_${driverId.slice(-8)}_${Platform.OS}_${String(Platform.Version).replace(/\./g, '')}_v1`;
          await SecureStore.setItemAsync(fpKey, fingerprint);
        }

        // NOTE: we do NOT send phone — the backend already has the registered phone.
        // Sending app-state phone caused false positives due to format differences
        // (e.g. "08012345678" vs "+2348012345678" for the same number).
        await reportDriverSimSwapSignal(driverId, {
          sim_fingerprint: fingerprint,
          carrier_name: 'unknown',
        });

        // Record successful check time
        await SecureStore.setItemAsync(cooldownKey, String(Date.now()));
      } catch (error: any) {
        if (error?.response?.status === 423) {
          // Show a non-blocking in-app banner instead of a modal Alert
          setSimSwapAlert(true);
        }
        // Any other error (network etc.) — silently ignore, try again next session
      } finally {
        setSimSignalSent(true);
      }
    };
    void sendSimRiskSignal();
  }, [simSignalSent, driverId]);

  // Real-time ride offers via WebSocket; HTTP polling only as fallback (slower when WS is up).
  useEffect(() => {
    if (!isOnline || !driverId || !token) {
      setDriverOffersWsConnected(false);
      if (driverOffersReconnectTimerRef.current) {
        clearTimeout(driverOffersReconnectTimerRef.current);
        driverOffersReconnectTimerRef.current = null;
      }
      if (driverOffersWsRef.current) {
        try {
          driverOffersWsRef.current.close();
        } catch {
          /* ignore */
        }
        driverOffersWsRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const scheduleReconnect = () => {
      if (cancelled || !isOnlineRef.current) return;
      const attempt = driverOffersReconnectAttemptsRef.current;
      const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 6)));
      driverOffersReconnectAttemptsRef.current = attempt + 1;
      driverOffersReconnectTimerRef.current = setTimeout(() => connect(), delay);
    };

    const connect = () => {
      if (cancelled || !isOnlineRef.current || !driverId || !token) return;
      if (driverOffersReconnectTimerRef.current) {
        clearTimeout(driverOffersReconnectTimerRef.current);
        driverOffersReconnectTimerRef.current = null;
      }
      if (driverOffersWsRef.current) {
        try {
          driverOffersWsRef.current.close();
        } catch {
          /* ignore */
        }
        driverOffersWsRef.current = null;
      }

      const base = getWsBaseUrl();
      const wsUrl = `${base}/api/ws/driver/offers/${encodeURIComponent(driverId)}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      driverOffersWsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        driverOffersReconnectAttemptsRef.current = 0;
        setDriverOffersWsConnected(true);
        void fetchIncomingRide();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type !== 'ride_offer') return;
          const mapped = mapWsRideOfferToTrip(data);
          if (!mapped.id || !mapped.offer_id) return;
          setIncomingRide((prev: any) => {
            if (prev?.offer_id === mapped.offer_id) return prev;
            setTimeout(() => {
              setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
            }, 0);
            return mapped;
          });
        } catch (e) {
          if (__DEV__) console.warn('Driver offers WS message error', e);
        }
      };

      ws.onerror = () => {
        /* onclose handles reconnect */
      };

      ws.onclose = () => {
        if (cancelled) return;
        driverOffersWsRef.current = null;
        setDriverOffersWsConnected(false);
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (driverOffersReconnectTimerRef.current) {
        clearTimeout(driverOffersReconnectTimerRef.current);
        driverOffersReconnectTimerRef.current = null;
      }
      if (snoozeTimerRef.current) {
        clearTimeout(snoozeTimerRef.current);
        snoozeTimerRef.current = null;
      }
      if (driverOffersWsRef.current) {
        try {
          driverOffersWsRef.current.close();
        } catch {
          /* ignore */
        }
        driverOffersWsRef.current = null;
      }
      setDriverOffersWsConnected(false);
    };
  }, [isOnline, driverId, token, fetchIncomingRide]);

  // Fallback polling when no active modal; slow interval while WebSocket is healthy.
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    if (isOnline && !incomingRide) {
      void fetchIncomingRide();
      const pollMs = driverOffersFallbackPollIntervalMs(driverOffersWsConnected);
      pollInterval = setInterval(() => {
        void fetchIncomingRide();
      }, pollMs);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOnline, incomingRide, driverId, driverOffersWsConnected, fetchIncomingRide]);

  // Restore accepted / in-progress trip when driver goes online (resume after kill or refresh).
  useEffect(() => {
    if (!isOnline || !driverId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/trips/active/${driverId}`, {
          headers: getAuthHeaders(),
        });
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!payload?.active || !payload?.trip || cancelled) return;
        const trip = payload.trip as Record<string, unknown>;
        const status = String(trip.status ?? '');
        let normalized: Trip['status'] | null = status as Trip['status'];
        if (status === 'pickup') normalized = 'arrived';
        if (status === 'completed' && trip.payment_status === 'pending') normalized = 'pending_payment';
        const allow: Trip['status'][] = ['accepted', 'arrived', 'ongoing', 'pending_payment'];
        if (!normalized || !allow.includes(normalized)) return;
        setCurrentTrip({
          ...(trip as unknown as Trip),
          status: normalized,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, driverId, setCurrentTrip]);

  // Keep trip snapshot fresh (pickup coords, rider phone, status transitions).
  useEffect(() => {
    if (!driverId || !currentTrip?.id) return;
    let cancelled = false;
    const tripId = currentTrip.id;

    const sync = async () => {
      try {
        const res = await getTrip(tripId);
        const d = res.data as Trip & { status?: string; payment_status?: string };
        if (cancelled) return;
        const st = String(d.status ?? '');
        if (st === 'completed') {
          const pst = String(d.payment_status ?? '');
          if (pst === 'pending') {
            setCurrentTrip({ ...d, status: 'pending_payment' });
          } else {
            setCurrentTrip(null);
          }
          return;
        }
        if (st === 'cancelled') {
          setCurrentTrip(null);
          return;
        }
        setCurrentTrip(d as Trip);
      } catch {
        /* ignore */
      }
    };

    void sync();
    const iv = setInterval(sync, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [currentTrip?.id, driverId, setCurrentTrip]);

  useEffect(() => {
    if (!incomingRide?.id) return;
    const r = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    setCounterFareInput(r > 0 ? String(r) : '');
  }, [incomingRide?.id]);

  const declineHandlerRef = useRef<() => Promise<void>>(async () => {});
  const offerTimerExpiredRef = useRef(false);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Formal decline — driver tapped "Ignore" explicitly. Calls backend, records violation.
  const handleDeclineRide = useCallback(async () => {
    const ride = incomingRide;
    if (!ride) return;
    try {
      if (ride.offer_id && driverId) {
        await fetch(`${BACKEND_URL}/api/trips/offers/${ride.offer_id}/decline`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ driver_id: driverId }),
        });
      }
    } catch {}
    setIncomingRide(null);
    setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
  }, [incomingRide, driverId]);

  // Snooze — timer ran out without explicit action. Hide modal, re-poll in 4s.
  // Does NOT call the backend decline endpoint so the offer stays alive and repeats.
  const handleSnoozeOffer = useCallback(() => {
    setIncomingRide(null);
    setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    snoozeTimerRef.current = setTimeout(() => {
      void fetchIncomingRide();
    }, 4000);
  }, [fetchIncomingRide]);

  // Keep snooze ref in sync
  const snoozeHandlerRef = useRef<() => void>(() => {});
  useEffect(() => {
    snoozeHandlerRef.current = handleSnoozeOffer;
  }, [handleSnoozeOffer]);

  useEffect(() => {
    declineHandlerRef.current = handleDeclineRide;
  }, [handleDeclineRide]);

  useEffect(() => {
    if (!incomingRide?.id) {
      offerTimerExpiredRef.current = false;
      return;
    }
    offerTimerExpiredRef.current = false;
    setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
    const id = setInterval(() => {
      setRideCountdown((p) => {
        if (p <= 1) {
          if (!offerTimerExpiredRef.current) {
            offerTimerExpiredRef.current = true;
            clearInterval(id);
            // Snooze (not decline) — offer repeats after 4 seconds
            snoozeHandlerRef.current();
          }
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [incomingRide?.id]);

  const submitIncomingAcceptance = useCallback(
    async (proposed: number) => {
      if (!incomingRide) return;
      if (!driverId) {
        Alert.alert('Profile Required', 'Please login again to accept rides.');
        return;
      }
      setAcceptingRide(true);
      const fallbackProposed = Math.round(
        Number.isFinite(proposed) && proposed > 0
          ? proposed
          : Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0)
      );
      try {
        const tripId = incomingRide.id;
        const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
        const maxP = incomingRide.max_price != null ? Math.round(Number(incomingRide.max_price)) : null;
        const minP = incomingRide.min_price != null ? Math.round(Number(incomingRide.min_price)) : null;
        if (!Number.isFinite(proposed) || proposed < 1) {
          Alert.alert('Fare', 'Enter a valid fare.');
          setAcceptingRide(false);
          return;
        }
        if (riderOffer > 0 && proposed < riderOffer) {
          Alert.alert('Fare', 'Your counter cannot be below the rider’s offer.');
          setAcceptingRide(false);
          return;
        }
        if (minP != null && minP > 0 && proposed < minP) {
          Alert.alert('Minimum fare', `Minimum allowed price is ₦${minP.toLocaleString()}`);
          setAcceptingRide(false);
          return;
        }
        if (maxP != null && maxP > 0 && proposed > maxP) {
          Alert.alert('Maximum fare', `Maximum allowed price is ₦${maxP.toLocaleString()}`);
          setAcceptingRide(false);
          return;
        }
        const networkReady = await checkOnlineStatus();
        if (!networkReady) {
          await queueDriverRideAcceptance(
            tripId,
            {
              driver_id: driverId,
              offer_id: incomingRide?.offer_id,
              proposed_fare: proposed,
            },
            token
          );
          setOfflineQueueCount(await getQueueSize());
          setIncomingRide(null);
          return;
        }
        const res = await fetch(`${BACKEND_URL}/api/trips/${tripId}/accept`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            driver_id: driverId,
            offer_id: incomingRide?.offer_id,
            proposed_fare: proposed,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          if (Platform.OS !== 'web') {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          const drec = data as Record<string, unknown>;
          const apiRoute = normalizeRoutePreview(drec.route_preview_coordinates);
          const offerRoute = normalizeRoutePreview(incomingRide?.route_preview_coordinates);
          const incomingRec = incomingRide as Record<string, unknown> | null | undefined;
          const mergedTrip = {
            ...data,
            route_preview_coordinates: apiRoute ?? offerRoute ?? null,
            rider_profile_image:
              (typeof drec.rider_profile_image === 'string' ? drec.rider_profile_image : undefined) ??
              (incomingRide?.rider_photo != null ? String(incomingRide.rider_photo) : undefined),
            rider_name:
              (typeof drec.rider_name === 'string' && drec.rider_name.trim()
                ? drec.rider_name
                : undefined) ??
              (typeof incomingRide?.rider_name === 'string' ? incomingRide.rider_name : undefined),
            shield:
              (drec.shield as Record<string, unknown> | undefined) ??
              (incomingRec?.shield as Record<string, unknown> | undefined),
          } as Trip;

          setCurrentTrip(mergedTrip);
          setIncomingRide(null);
        } else {
          Alert.alert('Could not accept', formatApiDetail(data?.detail) || 'This offer may have expired. Try the next one.');
        }
      } catch (e) {
        await queueDriverRideAcceptance(
          incomingRide.id,
          {
            driver_id: driverId,
            offer_id: incomingRide?.offer_id,
            proposed_fare: fallbackProposed,
          },
          token
        );
        setOfflineQueueCount(await getQueueSize());
        setIncomingRide(null);
      } finally {
        setAcceptingRide(false);
      }
    },
    [incomingRide, driverId, token]
  );

  const handleAcceptRide = useCallback(() => {
    if (!incomingRide) return;
    const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    const proposed = Math.round(Number(String(counterFareInput).replace(/,/g, '').trim()) || riderOffer);
    void submitIncomingAcceptance(proposed);
  }, [incomingRide, counterFareInput, submitIncomingAcceptance]);

  const handleAcceptIncomingAtRiderOffer = useCallback(() => {
    if (!incomingRide) return;
    const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    void submitIncomingAcceptance(riderOffer);
  }, [incomingRide, submitIncomingAcceptance]);

  const handleAcceptIncomingAtCounterFare = useCallback(() => {
    if (!incomingRide) return;
    const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    const proposed = Math.round(Number(String(counterFareInput).replace(/,/g, '').trim()) || riderOffer);
    void submitIncomingAcceptance(proposed);
  }, [incomingRide, counterFareInput, submitIncomingAcceptance]);

  const handleToggleOnline = async () => {
    if (onlineToggleInFlightRef.current) return;
    if (!driverId) {
      Alert.alert('Profile Required', 'Please login again to continue.');
      return;
    }

    const nextStatus = !isOnline;
    if (nextStatus && !driverApproved) {
      Alert.alert(
        'Verification in review',
        'Your documents are saved with NEXRYDE. You can use the dashboard now, but you can go online and receive rides only after approval. You get a free 20-trip activity trial once approved.',
      );
      return;
    }
    if (nextStatus && !trialReady) {
      Alert.alert(
        'Activation needed',
        'Your driver account is approved, but your ride access is not active yet. Start the verified-driver trial or complete payment before going online.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Open activation', onPress: () => guardedPush('/driver/subscription') },
        ],
      );
      return;
    }
    onlineToggleInFlightRef.current = true;
    setToggleSyncing(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/drivers/${driverId}/online?is_online=${nextStatus}`,
        { method: 'PUT', headers: getAuthHeaders() }
      );
      const data = await res.json();
      if (!res.ok) {
        const detail: string = formatApiDetail(data?.detail) || 'Could not change online status.';
        // Route driver to the right fix based on what the server says is missing
        const lower = detail.toLowerCase();
        if (lower.includes('subscription') || lower.includes('plan') || lower.includes('payment')) {
          Alert.alert('Subscription Required', 'You need an active plan to go online.', [
            { text: 'Later', style: 'cancel' },
            { text: 'View Plans', onPress: () => guardedPush('/driver/subscription') },
          ]);
        } else if (lower.includes('bank detail') || lower.includes('bank account') || lower.includes('payout') || lower.includes('account number')) {
          Alert.alert('Add Bank Details', 'Add your bank account so you can receive payouts.', [
            { text: 'Later', style: 'cancel' },
            { text: 'Add Now', onPress: () => guardedPush('/driver/bank') },
          ]);
        } else if (lower.includes('expired') || lower.includes('document')) {
          Alert.alert('Documents Expired', detail, [
            { text: 'Later', style: 'cancel' },
            { text: 'Update Docs', onPress: () => guardedPush('/driver/documents') },
          ]);
        } else if (lower.includes('approval') || lower.includes('pending') || lower.includes('not yet approved')) {
          Alert.alert(
            'Verification Pending',
            'Your documents are still being reviewed by the NEXRYDE team. You will be notified once approved.',
          );
        } else if (lower.includes('ghost') || lower.includes('lock')) {
          Alert.alert('Account Locked', detail, [
            { text: 'OK', style: 'cancel' },
            { text: 'Unlock', onPress: () => guardedPush('/driver/safety-alerts') },
          ]);
        } else {
          Alert.alert('Cannot Go Online', detail);
        }
        return;
      }
      setIsOnline(nextStatus);
      if (nextStatus) {
        fetchIncomingRide();
      } else {
        setIncomingRide(null);
      }
      // Persist so widget and smart-resume reflect the new status instantly
      if (driverId) {
        void updateDriverOnlineStatus(nextStatus, driverId);
      }
    } catch {
      Alert.alert('Network Error', 'Could not update online status. Check your connection.');
    } finally {
      onlineToggleInFlightRef.current = false;
      setToggleSyncing(false);
    }
  };
  
  const checkOnboardingStatus = async (retryCount = 0) => {
    try {
      if (!driverId || !user) {
        setCheckingOnboarding(false);
        return;
      }

      // Check if driver has completed onboarding
      const response = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/onboarding-status`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        // Retry up to 2 times on transient server errors before giving up gracefully
        if (response.status >= 500 && retryCount < 2) {
          await new Promise(r => setTimeout(r, 1500 * (retryCount + 1)));
          return checkOnboardingStatus(retryCount + 1);
        }
        // 4xx or exhausted retries: show dashboard with limited state, don't trap driver
        if (__DEV__) console.warn('onboarding-status fetch failed', response.status);
        setVerificationStatus('pending_review');
        setCheckingOnboarding(false);
        return;
      }

      if (response.ok) {
        const status = await response.json();
        const lockedPendingApproval =
          status.completed === true && status.can_go_online === false;

        setVerificationStatus(
          status.verification_status ||
            (status.completed && !lockedPendingApproval ? 'approved' : 'pending_review'),
        );

        if (lockedPendingApproval) {
          setSubscriptionStatus('locked_until_approval');
          setIsOnline(false);
        }

        if (!status.completed) {
          // Redirect driver to the appropriate onboarding step
          if (status.step === 'terms') {
            router.replace({
              pathname: '/(auth)/driver-terms',
              params: driverTermsRouteParams(user),
            });
            return;
          } else if (status.step === 'documents') {
            router.replace({
              pathname: '/(auth)/driver-documents',
              params: driverDocumentsRouteParams(user),
            });
            return;
          } else if (status.step === 'documents_rejected') {
            router.replace({
              pathname: '/(auth)/driver-verification-status',
              params: driverDocumentsRouteParams(user),
            });
            return;
          } else if (status.step === 'documents_review') {
            setSubscriptionStatus('locked_until_approval');
            setIsOnline(false);
            setCheckingOnboarding(false);
            return;
          } else if (status.step === 'profile') {
            router.replace({
              pathname: '/(auth)/driver-profile',
              params: driverProfileRouteParams(user),
            });
            return;
          }
          // Incomplete but unknown step (e.g. not_found, error) — do NOT run subscription "approved" path
          if (__DEV__) console.warn('[driver-home] onboarding incomplete unhandled step', status.step);
          setVerificationStatus(status.verification_status || 'pending_review');
          setCheckingOnboarding(false);
          return;
        }

        // Driver completed onboarding API flow — verification may still be pending until admin approves
        setVerificationStatus(
          status.verification_status || (lockedPendingApproval ? 'pending_review' : 'approved'),
        );
        try {
          const subRes = await getDriverSubscriptionStatus();
          const sub = subRes.data || {};
          setSubscriptionStatus(sub.status || 'none');
          setTrialTripsCompleted(sub.trial_trips_completed ?? 0);
          setTrialTripsTarget(sub.trial_trips_target ?? 20);
          setTrialExtended(sub.trial_extended ?? false);
        } catch {
          if (!lockedPendingApproval) {
            setSubscriptionStatus('none');
          }
        }
        if (lockedPendingApproval) {
          setSubscriptionStatus('locked_until_approval');
          setIsOnline(false);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('Error checking onboarding status', error);
    } finally {
      setCheckingOnboarding(false);
    }
  };
  
  // Show loading while checking onboarding
  if (checkingOnboarding) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, width: '100%' }}>
          <ActivityIndicator size="large" color={COLORS.accentGreen} />
          <Text style={{ marginTop: 16, color: COLORS.lightTextSecondary, fontSize: 16, fontWeight: '600' }}>
            Checking your status...
          </Text>
          <View style={{ marginTop: 24, width: '100%', gap: 12 }}>
            <SkeletonBlock height={18} width="55%" />
            <SkeletonBlock height={14} width="100%" />
            <SkeletonBlock height={14} width="88%" />
          </View>
        </View>
      </SafeAreaView>
    );
  }
  
  /* ── LIVE MAP MODE: full-screen when driver is online ── */
  if (isOnline) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0f1e' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        <DriverLiveMapView
          driverCoords={driverCoords}
          isOnline={isOnline}
          driverCanReceiveOffers={driverCanReceiveOffers}
          todayEarnings={earnings.today}
          todayTrips={earnings.trips}
          todayTripHours={earnings.tripHoursToday}
          driverRating={typeof user?.rating === 'number' ? user.rating : null}
          weekEarnings={earnings.week}
          driverOffersWsConnected={driverOffersWsConnected}
          surgeActive={!!(surgePricing?.is_surge)}
          surgeMultiplier={Number(surgePricing?.multiplier ?? 1)}
          destinationActive={destinationActive}
          destinationName={destinationName}
          destinationTripsRemaining={destinationTripsRemaining}
          onGoOnline={handleToggleOnline}
          onGoOffline={handleToggleOnline}
          toggling={toggleSyncing}
          driverApproved={driverApproved}
          trialReady={trialReady}
          onFeatureHub={() => setFeatureHubOpen(true)}
          onSearch={() => guardedPush('/driver/heatmap')}
          onShieldPress={() => guardedPush('/(driver-tabs)/driver-safety')}
          onInboxPress={() => guardedPush('/(driver-tabs)/driver-notifications')}
          onDestination={() => guardedPush('/driver/destination')}
          activeTrip={activeTripForMap}
          embeddedOfferTrip={incomingRide}
          embeddedOfferCountdown={rideCountdown}
          embeddedOfferFareInput={counterFareInput}
          onEmbeddedOfferFareInputChange={setCounterFareInput}
          onEmbeddedOfferAcceptRider={() => void handleAcceptIncomingAtRiderOffer()}
          onEmbeddedOfferAcceptCounter={() => void handleAcceptIncomingAtCounterFare()}
          onEmbeddedOfferDecline={() => void handleDeclineRide()}
          embeddedOfferAccepting={acceptingRide}
          onTripOpenNavigation={handleTripOpenNavigation}
          onTripMarkArrived={handleTripMarkArrived}
          onTripStart={handleTripStart}
          onTripConfirmStart={handleTripConfirmStart}
          onTripCancel={handleTripCancelFromDock}
          onTripComplete={handleTripComplete}
          onTripPause={handleTripPauseFromDock}
          onTripCallRider={handleTripCallRider}
          onTripMessageRider={handleTripMessageRider}
          tripActionBusy={tripActionBusy}
          suppressTripDock={!!tripCompletion || completeTripConfirmOpen}
        />

        <DriverCompleteTripConfirmModal
          visible={completeTripConfirmOpen}
          riderName={completeModalRiderName}
          fare={completeModalFare}
          confirming={tripActionBusy === 'complete'}
          onCancel={() => setCompleteTripConfirmOpen(false)}
          onConfirm={() => void performCompleteTrip()}
        />

        {tripCompletion ? (
          <DriverTripCompletionPanel
            payload={tripCompletion}
            onDismiss={() => setTripCompletion(null)}
            onSubmitRating={handleCompletionRate}
            onViewDetails={() => {
              setTripCompletion(null);
              guardedPush('/(driver-tabs)/driver-trips' as Href);
            }}
          />
        ) : null}
        {/* Ride request: on-map dock while online; full modal when offline */}
        <DriverRideRequestModal
          visible={!!incomingRide && !isOnline}
          trip={incomingRide}
          countdownSeconds={rideCountdown}
          countdownTotal={DRIVER_OFFER_COUNTDOWN_SECONDS}
          fareInput={counterFareInput}
          onFareInputChange={setCounterFareInput}
          accepting={acceptingRide}
          onAccept={handleAcceptRide}
          onIgnore={handleDeclineRide}
          driverLat={driverCoords?.lat}
          driverLng={driverCoords?.lng}
        />

        {/* Feature hub drawer */}
        <FeatureHubDrawer visible={featureHubOpen} onClose={() => setFeatureHubOpen(false)} role="driver" />

        {/* SIM Swap Banner */}
        {simSwapAlert && (
          <View style={[styles.simSwapBanner, { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 }]}>
            <View style={styles.simSwapBannerIconWrap}>
              <Ionicons name="shield-half-outline" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.simSwapBannerTitle}>Security Alert: New SIM Detected</Text>
              <Text style={styles.simSwapBannerText}>
                Your account has been temporarily secured. If this wasn't you, contact support immediately.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSimSwapAlert(false)} style={{ padding: 6, alignSelf: 'flex-start' }}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     OFFLINE HOME — reference go-online layout (map, stats, GO above tabs)
     ═══════════════════════════════════════════════════════════════════ */
  return <DriverOfflineHome
    driverCoords={driverCoords}
    earnings={earnings}
    profileImageUri={user?.profile_image ?? null}
    driverRating={typeof user?.rating === 'number' && Number.isFinite(user.rating) ? user.rating : 0}
    surgeActive={!!(surgePricing?.is_surge)}
    surgePricing={surgePricing}
    driverApproved={driverApproved}
    trialReady={trialReady}
    subscriptionStatus={subscriptionStatus}
    trialTripsCompleted={trialTripsCompleted}
    trialTripsTarget={trialTripsTarget}
    trialExtended={trialExtended}
    verificationStatus={verificationStatus}
    simSwapAlert={simSwapAlert}
    toggling={toggleSyncing}
    featureHubOpen={featureHubOpen}
    onGoOnline={handleToggleOnline}
    onFeatureHub={() => setFeatureHubOpen(true)}
    onShield={() => guardedPush('/(driver-tabs)/driver-safety')}
    onHeatmap={() => guardedPush('/driver/heatmap')}
    onDestination={() => guardedPush('/driver/destination')}
    onEarnings={() => guardedPush('/(driver-tabs)/driver-earnings')}
    onTrips={() => guardedPush('/(driver-tabs)/driver-trips')}
    onProfile={() => guardedPush('/(driver-tabs)/driver-profile')}
    onOpenSubscription={() => guardedPush('/driver/subscription')}
    onDismissSimSwap={() => setSimSwapAlert(false)}
    rideRequestModal={
      <DriverRideRequestModal
        visible={!!incomingRide}
        trip={incomingRide}
        countdownSeconds={rideCountdown}
        countdownTotal={DRIVER_OFFER_COUNTDOWN_SECONDS}
        fareInput={counterFareInput}
        onFareInputChange={setCounterFareInput}
        accepting={acceptingRide}
        onAccept={handleAcceptRide}
        onIgnore={handleDeclineRide}
        driverLat={driverCoords?.lat}
        driverLng={driverCoords?.lng}
      />
    }
    featureHubDrawer={
      <FeatureHubDrawer visible={featureHubOpen} onClose={() => setFeatureHubOpen(false)} role="driver" />
    }
  />;
}


/* ═══════════════════════════════════════════════════════════════════════════
   OFFLINE HOME COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
function DriverOfflineHome({
  driverCoords,
  earnings,
  profileImageUri,
  driverRating,
  surgeActive,
  surgePricing,
  driverApproved,
  trialReady,
  subscriptionStatus,
  trialTripsCompleted,
  trialTripsTarget,
  trialExtended,
  verificationStatus,
  simSwapAlert,
  toggling,
  featureHubOpen: _featureHubOpen,
  onGoOnline,
  onFeatureHub,
  onShield: _onShield,
  onHeatmap,
  onDestination: _onDestination,
  onEarnings,
  onTrips,
  onProfile,
  onOpenSubscription,
  onDismissSimSwap,
  rideRequestModal,
  featureHubDrawer,
}: {
  driverCoords: { lat: number; lng: number; heading?: number } | null;
  earnings: { today: number; trips: number; week: number; tripHoursToday?: number };
  profileImageUri: string | null;
  driverRating: number;
  surgeActive: boolean;
  surgePricing: { driver_message?: string; is_peak_window?: boolean; heatmap?: { top_zone?: string } } | null;
  driverApproved: boolean;
  trialReady: boolean;
  subscriptionStatus: string | null;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  verificationStatus: string | null;
  simSwapAlert: boolean;
  toggling: boolean;
  featureHubOpen: boolean;
  onGoOnline: () => void;
  onFeatureHub: () => void;
  onShield: () => void;
  onHeatmap: () => void;
  onDestination: () => void;
  onEarnings: () => void;
  onTrips: () => void;
  onProfile: () => void;
  onOpenSubscription: () => void;
  onDismissSimSwap: () => void;
  rideRequestModal: React.ReactNode;
  featureHubDrawer: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();
  const mapRef = useRef<MapView | null>(null);
  const goPulse = useRef(new Animated.Value(1)).current;

  /* Time-based greeting */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  /* LIVE badge pulse */
  const livePulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* GO button outer ring */
  const goRingOuter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!driverApproved || !trialReady) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goRingOuter, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(goRingOuter, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [driverApproved, trialReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Slow pulse on GO button */
  useEffect(() => {
    if (!driverApproved || !trialReady) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(goPulse, { toValue: 1.06, duration: 1000, useNativeDriver: true }),
        Animated.timing(goPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [driverApproved, trialReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapRegion = useMemo(
    () =>
      driverCoords
        ? {
            latitude: driverCoords.lat,
            longitude: driverCoords.lng,
            latitudeDelta: 0.055,
            longitudeDelta: 0.055,
          }
        : { latitude: 6.5244, longitude: 3.3792, latitudeDelta: 0.1, longitudeDelta: 0.1 },
    [driverCoords?.lat, driverCoords?.lng],
  );

  useEffect(() => {
    if (!driverCoords || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: driverCoords.lat,
        longitude: driverCoords.lng,
        latitudeDelta: 0.055,
        longitudeDelta: 0.055,
      },
      480,
    );
  }, [driverCoords?.lat, driverCoords?.lng]);

  const fmtNGN = (n: number) =>
    n >= 1000 ? `₦${(n / 1000).toFixed(1)}k` : `₦${Math.round(n).toLocaleString()}`;

  const ratingLabel =
    driverRating > 0 && driverRating <= 5 ? driverRating.toFixed(1) : '—';

  const notApproved = !driverApproved;
  const needsSubscription = driverApproved && !trialReady;
  const trialRemaining = Math.max(0, trialTripsTarget - trialTripsCompleted);
  const showTrialProgress = driverApproved && subscriptionStatus === 'trial' && trialTripsTarget > 0;
  const profileReadyDot = driverApproved && trialReady;

  const goHalftoneDots = useMemo(
    () => Array.from({ length: 42 }, (_, i) => <View key={i} style={ohStyles.goHalftoneDot} />),
    [],
  );

  return (
    <View style={ohStyles.screenRoot}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: tabPad + 112,
          paddingHorizontal: flow.padH,
          gap: Math.round(flow.sectionGap * 0.28),
        }}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={{ width: '100%', maxWidth: flow.maxContentWidth, alignSelf: 'center' }}>
        {/* Driver offline — go-online (reference UI) */}
        <View style={[ohStyles.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={ohStyles.topIconBtn} onPress={onFeatureHub} activeOpacity={0.8}>
            <Ionicons name="menu" size={22} color="#E2E8F0" />
          </TouchableOpacity>

          <View style={ohStyles.topBarCenterSlot} pointerEvents="box-none">
            <View style={ohStyles.offlinePill}>
              <View style={ohStyles.offlineDot} />
              <Text style={ohStyles.offlinePillText}>OFFLINE</Text>
            </View>
          </View>

          <TouchableOpacity style={ohStyles.profileTap} onPress={onProfile} activeOpacity={0.82}>
            <View style={ohStyles.profileRing}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={ohStyles.profileImg} />
              ) : (
                <Ionicons name="person" size={20} color="#94A3B8" />
              )}
              <View
                style={[
                  ohStyles.profileStatusDot,
                  !profileReadyDot && ohStyles.profileStatusDotMuted,
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        <View style={ohStyles.heroWrap}>
          <Text style={ohStyles.heroGreeting}>{greeting}</Text>
          <Text style={ohStyles.heroTitle}>You're offline</Text>
          <Text style={ohStyles.heroSub}>Tap GO to start receiving trips</Text>
        </View>

        {showTrialProgress && (
          <TouchableOpacity
            style={ohStyles.trialProgressChip}
            activeOpacity={0.86}
            onPress={onOpenSubscription}
          >
            <View style={ohStyles.trialProgressDot} />
            <Text style={ohStyles.trialProgressText}>
              Free trial: {trialTripsCompleted}/{trialTripsTarget} • {trialRemaining} left
            </Text>
            {trialExtended && (
              <View style={ohStyles.trialExtBadge}>
                <Text style={ohStyles.trialExtText}>Extended</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color="#64748B" />
          </TouchableOpacity>
        )}

        <View style={ohStyles.mapCard}>
          <View style={ohStyles.mapMapLayer}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              customMapStyle={NEXRYDE_MAP_STYLE}
              initialRegion={mapRegion}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsCompass={false}
              showsPointsOfInterest
              showsBuildings={false}
              showsTraffic={false}
              toolbarEnabled={false}
              liteMode={Platform.OS === 'android'}
            >
              {driverCoords && (
                <Marker
                  coordinate={{ latitude: driverCoords.lat, longitude: driverCoords.lng }}
                  anchor={{ x: 0.5, y: 1 }}
                >
                  <View style={ohStyles.mapPinWrap} collapsable={false}>
                    <Ionicons name="location" size={44} color="#22E5A0" />
                  </View>
                </Marker>
              )}
            </MapView>

            <LinearGradient
              colors={['rgba(6,11,20,0.2)', 'transparent', 'rgba(6,11,20,0.88)']}
              locations={[0, 0.45, 1]}
              style={ohStyles.mapVignette}
              pointerEvents="none"
            />

            <View style={ohStyles.liveBadge} pointerEvents="none">
              <Ionicons name="radio" size={11} color="#F87171" />
              <Animated.View style={[ohStyles.liveDot, { opacity: livePulse }]} />
              <Text style={ohStyles.liveBadgeText}>LIVE</Text>
            </View>

            {driverCoords ? (
              <View style={ohStyles.mapLocBadge} pointerEvents="none">
                <Text style={ohStyles.mapLocText}>Your location</Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={ohStyles.mapFooterCta}
            onPress={onHeatmap}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="See ride opportunities in your area"
          >
            <Ionicons name="scan-outline" size={18} color="#22E5A0" />
            <Text style={ohStyles.mapFooterCtaText}>See ride opportunities in your area</Text>
          </TouchableOpacity>
        </View>

        <View style={ohStyles.statsStrip}>
          <TouchableOpacity style={ohStyles.statChip} onPress={onEarnings} activeOpacity={0.78}>
            <View style={[ohStyles.statIconWrap, ohStyles.statIconWrapGreen]}>
              <Ionicons name="wallet-outline" size={17} color="#22E5A0" />
            </View>
            <Text style={ohStyles.statChipValue}>{fmtNGN(earnings.today)}</Text>
            <Text style={ohStyles.statChipLabel}>Earnings</Text>
          </TouchableOpacity>
          <View style={ohStyles.statDivider} />
          <TouchableOpacity style={ohStyles.statChip} onPress={onTrips} activeOpacity={0.78}>
            <View style={[ohStyles.statIconWrap, ohStyles.statIconWrapGreen]}>
              <Ionicons name="car-outline" size={17} color="#22E5A0" />
            </View>
            <Text style={ohStyles.statChipValue}>{earnings.trips}</Text>
            <Text style={ohStyles.statChipLabel}>Trips</Text>
          </TouchableOpacity>
          <View style={ohStyles.statDivider} />
          <TouchableOpacity style={ohStyles.statChip} onPress={onProfile} activeOpacity={0.78}>
            <View style={[ohStyles.statIconWrap, ohStyles.statIconWrapGreen]}>
              <Ionicons name="stats-chart" size={17} color="#22E5A0" />
            </View>
            <Text style={ohStyles.statChipValue}>{ratingLabel}</Text>
            <Text style={ohStyles.statChipLabel}>Rating</Text>
          </TouchableOpacity>
        </View>

        {surgeActive || surgePricing?.is_peak_window ? (
          <TouchableOpacity
            style={ohStyles.surgeStrip}
            onPress={onHeatmap}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open demand heatmap"
          >
            <Ionicons name={surgeActive ? 'flash' : 'time'} size={15} color="#FBBF24" />
            <Text style={ohStyles.surgeStripText} numberOfLines={2}>
              {typeof surgePricing?.driver_message === 'string' && surgePricing.driver_message.trim().length > 0
                ? surgePricing.driver_message
                : surgeActive
                  ? 'Surge is on — open Heatmap for the best zones'
                  : 'Peak hour — open Heatmap to position for more trips'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#FCD34D" />
          </TouchableOpacity>
        ) : null}

        <View style={ohStyles.prayerSlot}>
          <PrayerStripWidget />
        </View>

        {/* ── Verification / approval banner ── */}
        {notApproved && (
          <View style={ohStyles.bannerWarn}>
            <Ionicons name="time-outline" size={18} color="#FBBF24" />
            <View style={{ flex: 1 }}>
              <Text style={ohStyles.bannerTitle}>Verification Pending</Text>
              <Text style={ohStyles.bannerBody}>
                {verificationStatus === 'pending'
                  ? 'Your documents are being reviewed. You can drive once approved.'
                  : 'Complete your document verification to start driving.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#FBBF24" />
          </View>
        )}
        {needsSubscription && (
          <View style={ohStyles.bannerInfo}>
            <Ionicons name="flash-outline" size={18} color="#3B82F6" />
            <View style={{ flex: 1 }}>
              <Text style={[ohStyles.bannerTitle, { color: '#93C5FD' }]}>Activate Trial</Text>
              <Text style={ohStyles.bannerBody}>Start your free trial to receive ride requests.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
          </View>
        )}

        {/* SIM Swap banner */}
        {simSwapAlert && (
          <View style={[ohStyles.bannerDanger, { marginBottom: 14 }]}>
            <Ionicons name="shield-half-outline" size={18} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={[ohStyles.bannerTitle, { color: '#FCA5A5' }]}>Security Alert</Text>
              <Text style={ohStyles.bannerBody}>New SIM detected. Contact support if this wasn't you.</Text>
            </View>
            <TouchableOpacity onPress={onDismissSimSwap} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        )}
        </View>
      </ScrollView>

      {/* Primary CTA — sits above driver tab bar */}
      <View style={[ohStyles.goBar, { bottom: tabPad, paddingBottom: 10 }]}>
        <LinearGradient
          colors={['transparent', 'rgba(6,11,20,0.92)']}
          style={ohStyles.goBarTopGradient}
          pointerEvents="none"
        />
        {driverApproved && trialReady ? (
          <View style={{ width: '100%', maxWidth: flow.maxContentWidth, alignSelf: 'center', alignItems: 'center' }}>
            <Animated.View
              style={[
                ohStyles.goBtnOuterRing,
                {
                  opacity: goRingOuter.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.12, 0] }),
                  transform: [{ scale: goRingOuter.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale: goPulse }], width: '100%' }}>
              <TouchableOpacity
                style={ohStyles.goBtn}
                onPress={onGoOnline}
                activeOpacity={0.88}
                disabled={toggling}
                accessibilityRole="button"
                accessibilityLabel={toggling ? 'Connecting to go online' : 'Go online and receive ride requests'}
              >
                <LinearGradient
                  colors={['#2BFFB1', '#22E5A0', '#0BB87A']}
                  style={[ohStyles.goBtnGrad, ohStyles.goBtnGradClip]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <View style={ohStyles.goBtnInner}>
                    {toggling ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="radio" size={22} color="rgba(255,255,255,0.95)" />
                    )}
                    <Text style={ohStyles.goBtnTextLight}>
                      {toggling ? 'Connecting…' : 'GO ONLINE'}
                    </Text>
                  </View>
                  {!toggling ? (
                    <View style={ohStyles.goHalftone} pointerEvents="none">
                      {goHalftoneDots}
                    </View>
                  ) : null}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : notApproved ? (
          <TouchableOpacity style={ohStyles.goBtnPending} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={20} color="#FBBF24" />
            <Text style={ohStyles.goBtnPendingText}>Waiting for Approval</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={ohStyles.goBtnActivate}
            activeOpacity={0.85}
            onPress={() => {
              Alert.alert(
                'Activate Your Account',
                'Your documents are approved! Start your free trial to receive ride requests.',
                [
                  { text: 'Later', style: 'cancel' },
                  {
                    text: 'Activate Now',
                    onPress: onOpenSubscription,
                  },
                ]
              );
            }}
          >
            <Ionicons name="flash" size={20} color="#FFF" />
            <Text style={ohStyles.goBtnActivateText}>Activate to Drive</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Overlays */}
      {rideRequestModal}
      {featureHubDrawer}
    </View>
  );
}

/* ── Offline home styles ─────────────────────────────────────── */
const ohStyles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: '#050A12' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  topIconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.055)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  topCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  topBarCenterSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileTap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  profileRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(148,163,184,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  profileImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b' },
  profileStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22E5A0',
    borderWidth: 2,
    borderColor: '#060B14',
  },
  profileStatusDotMuted: { backgroundColor: '#64748B' },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 22,
    paddingHorizontal: 17,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  offlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#64748B' },
  offlinePillText: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 2 },

  /* Hero */
  heroWrap: { paddingTop: 6, paddingBottom: 18 },
  heroGreeting: { fontSize: 11, fontWeight: '700', color: '#94A3B8', marginBottom: 6, letterSpacing: 1.4, textTransform: 'uppercase' },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -1.6,
    lineHeight: 38,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSub: { fontSize: 15, fontWeight: '600', color: '#78869B', marginTop: 8, letterSpacing: 0.12, lineHeight: 22 },
  trialProgressChip: {
    marginBottom: 12,
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.32)',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  trialProgressDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1DFFA0' },
  trialProgressText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#CFECDD' },
  trialExtBadge: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  trialExtText: { fontSize: 10, fontWeight: '800', color: '#F59E0B' },

  /* Map card — preview + heatmap entry (matches reference layout) */
  mapCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.26)',
    marginBottom: 16,
    backgroundColor: '#080E18',
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 14,
  },
  mapMapLayer: {
    height: 208,
    width: '100%',
    position: 'relative',
    backgroundColor: '#0c1220',
  },
  mapPinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  mapVignette: { ...StyleSheet.absoluteFillObject },
  mapLocBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: 'center',
  },
  mapLocText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4ADE80',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(5,10,18,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.4)',
    overflow: 'hidden',
  },
  mapFooterCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(5,10,18,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(34,229,160,0.2)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  mapFooterCtaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#CBD5E1',
    letterSpacing: 0.2,
  },
  liveBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(5,10,18,0.92)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.38)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F87171' },
  liveBadgeText: { fontSize: 10, fontWeight: '900', color: '#F87171', letterSpacing: 1.2 },

  /* Stats — earnings / trips / rating */
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 0,
    marginBottom: 14,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
  },
  statChip: { flex: 1, alignItems: 'center', gap: 4 },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  statChipValue: { fontSize: 18, fontWeight: '900', color: '#E2E8F0', letterSpacing: -0.5 },
  statChipLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.55, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.07)' },
  statIconWrapGreen: {
    backgroundColor: 'rgba(34,229,160,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.2)',
  },
  surgeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
  },
  surgeStripText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FCD34D', lineHeight: 17 },
  prayerSlot: { marginBottom: 12 },

  /* Banners */
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 0,
    marginBottom: 14,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 0,
    marginBottom: 14,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  bannerDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(153,27,27,0.5)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  bannerTitle: { fontSize: 13, fontWeight: '800', color: '#FBBF24', marginBottom: 2 },
  bannerBody: { fontSize: 12, fontWeight: '400', color: '#94A3B8', lineHeight: 16 },

  /* Feature grid */
  gridWrap: { marginBottom: 14 },
  gridTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  gridIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  gridLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.3 },

  /* GO bar */
  goBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: 'rgba(4,8,16,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(34,229,160,0.18)',
  },
  goBarTopGradient: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    height: 40,
  },
  goBtn: {
    width: '100%',
    borderRadius: 28,
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 16,
  },
  goBtnOuterRing: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(34,229,160,0.55)',
  },
  goBtnGrad: {
    borderRadius: 28,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  goBtnGradClip: {
    overflow: 'hidden',
    position: 'relative',
  },
  goBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  goBtnTextLight: {
    fontSize: 19,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  goHalftone: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 76,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignContent: 'center',
    paddingRight: 8,
    opacity: 0.22,
  },
  goHalftoneDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    margin: 3,
  },
  goBtnIconChip: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(2,44,34,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(2,44,34,0.18)',
  },
  goBtnText: { fontSize: 18, fontWeight: '900', color: '#022C22', letterSpacing: 2 },
  goBtnSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.72)',
    letterSpacing: 0.2,
  },
  goBarHint: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  goBtnPending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    paddingVertical: 20,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.4)',
    width: '100%',
  },
  goBtnPendingText: { fontSize: 16, fontWeight: '800', color: '#FBBF24' },
  goBtnActivate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    paddingVertical: 20,
    backgroundColor: '#F59E0B',
    width: '100%',
  },
  goBtnActivateText: { fontSize: 16, fontWeight: '900', color: '#FFF' },
});


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  simSwapBanner: {
    backgroundColor: '#991B1B',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#7F1D1D',
  },
  simSwapBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  simSwapBannerTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  simSwapBannerText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 17,
  },
  simSwapContactBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  simSwapContactBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  driverName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  profileButton: {
    width: 48,
    height: 48,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  statusCardOnlineGlow: {
    shadowColor: '#00D46A',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    borderColor: 'rgba(0, 212, 106, 0.45)',
  },
  statusDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,58,95,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotOnline: {
    backgroundColor: 'rgba(0,212,106,0.12)',
  },
  statusDotLocked: {
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  statusLeft: {
    flex: 1,
  },
  statusText: {
    flex: 1,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pendingBadgeText: { fontSize: 12, fontWeight: '800', color: '#D97706' },
  activateBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  activateBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  statusTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  statusSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  // Trial progress bar inside status card
  trialBarBg: {
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trialBarFill: {
    height: 5,
    borderRadius: 3,
  },
  toggleButton: {
    width: 72,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    padding: 4,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  toggleButtonActive: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreenDark,
    shadowColor: '#00D46A',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  toggleButtonDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#FBBF24',
    opacity: 0.75,
  },
  toggleThumb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  headerPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  verificationRoadmap: {
    marginTop: 18,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  activationRoadmap: {
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
  },
  roadmapHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  roadmapIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roadmapIconGrad: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activationIcon: {
    backgroundColor: '#FEF3C7',
  },
  roadmapBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.accentGreen,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  roadmapTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  roadmapSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.lightTextSecondary,
  },
  roadmapSteps: {
    marginTop: 16,
    gap: 10,
  },
  roadmapStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roadmapStepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roadmapStepLine: {
    width: 2,
    height: 12,
    backgroundColor: '#E2E8F0',
    marginLeft: 10,
  },
  roadmapStepText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  roadmapActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  roadmapPrimary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: COLORS.accentGreen,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roadmapPrimaryText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '900',
  },
  roadmapSecondary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    paddingVertical: 12,
    alignItems: 'center',
  },
  roadmapSecondaryText: {
    color: COLORS.lightTextPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  offlineSyncCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FCD34D',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  offlineSyncIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineSyncTextWrap: {
    flex: 1,
  },
  // ── Surge Pricing Card ──────────────────────────────────────────────
  surgeCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  surgeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  surgeTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  surgeReason: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 15,
  },
  surgeBadge: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  surgeBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  // kept for any accidental refs — can be cleaned up later
  guaranteeClaimBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  trialCompleteBanner: {
    marginTop: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  trialCompleteBannerGrad: {
    padding: 16,
  },
  offlineSyncTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  offlineSyncSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.lightTextSecondary,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolsHint: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.lightTextSecondary,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  walletWithdrawStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#052e16', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
  },
  walletWithdrawLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletWithdrawLabel: { fontSize: 10, fontWeight: '800', color: '#86efac', letterSpacing: 1, textTransform: 'uppercase' },
  walletWithdrawAmount: { fontSize: 15, fontWeight: '900', color: '#22c55e' },
  walletWithdrawBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  walletWithdrawBtnText: { fontSize: 12, fontWeight: '900', color: '#022C22' },
  seeAll: {
    fontSize: 15,
    color: COLORS.accentGreen,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  earningsGradientWrap: {
    borderRadius: 22,
    padding: 12,
    overflow: 'hidden',
  },
  earningsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  earningCard: {
    width: (width - 56) / 3,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  earningIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  earningLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.lightTextSecondary,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  earningValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    letterSpacing: 1,
  },
  earningCardOnGreen: {
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  earningLabelLight: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  earningValueLight: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  priorityCard: {
    width: (width - 52) / 2,
    height: 100,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  priorityGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  priorityLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  featureCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  allFeaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    justifyContent: 'space-between',
  },
  featureCard: {
    width: (width - 56) / 2,
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  featureIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
  moreList: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  moreIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  moreLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  // ── Category selector ───────────────────────────────────────────────────
  catCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  catCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 14,
    gap: 6,
  },
  catCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginLeft: 4,
  },
  catCardHint: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
    textAlign: 'right',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  catTile: {
    width: '47%',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
    position: 'relative',
  },
  catTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  catTileLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  catTileDesc: {
    fontSize: 11,
    color: '#94A3B8',
  },
  catCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Idle boost banner ──────────────────────────────────────────────────
  idleBoostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFB80040',
  },
  idleBoostText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
});
