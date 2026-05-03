import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Vibration,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '@/src/store/appStore';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SupportedLanguage } from '@/src/i18n/translations';
import {
  BACKEND_URL,
  getAuthHeaders,
  getDriverSubscriptionStatus,
  reportDriverSimSwapSignal,
  formatApiDetail,
} from '@/src/services/api';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
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
import { DRIVER_TRIPS_TAB_HREF } from '@/src/constants/driverNavigation';
import { buildDriverPriorityFeatures, buildDriverToolFeatures } from '@/src/config/driverHomeFeatures';
import DriverRideRequestModal from '@/src/components/DriverRideRequestModal';
import { FeatureHubDrawer } from '@/src/components/FeatureHubDrawer';
import { SkeletonBlock } from '@/src/components/SkeletonBlock';
import { COLORS } from '@/src/constants/theme';
import { HOME_PALETTE } from '@/src/constants/designSystem';

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
  const { user, token, setCurrentTrip, setCurrentLocation } = useAppStore();
  const { language, setLanguage, availableLanguages, t } = useLanguage();
  const [isOnline, setIsOnline] = useState(false);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const priorityFeatures = useMemo(
    () => buildDriverPriorityFeatures(t),
    [language, t.home.myTrips, t.home.support, t.wallet.payment]
  );
  const toolFeatures = useMemo(
    () => buildDriverToolFeatures(t),
    [language, t.verification.vehicleVerified, t.verification.uploadDocuments, t.safety.safetyTips, t.driver.rating]
  );
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });
  const [earningsGuarantee, setEarningsGuarantee] = useState<any>(null);

  // Load real earnings from backend
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const fetchEarnings = async (isInitial = false) => {
      if (isInitial) { setEarningsLoading(true); setEarningsError(false); }
      try {
        const [todayRes, weekRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/driver/earnings/${user.id}?period=today`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${BACKEND_URL}/api/driver/earnings/${user.id}?period=week`, {
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
          setEarnings({
            today: todayEarnings,
            week: weekEarnings,
            trips: Number(user?.total_trips ?? todaySummary.total_trips ?? 0),
          });
          setEarningsGuarantee(todayData.guarantee || null);
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
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.id, user?.total_trips]);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [trialTripsCompleted, setTrialTripsCompleted] = useState<number>(0);
  const [trialTripsTarget, setTrialTripsTarget] = useState<number>(20);
  const [trialExtended, setTrialExtended] = useState<boolean>(false);
  const driverApproved = verificationStatus === 'approved';
  const trialReady = subscriptionStatus ? ['trial', 'active', 'grace_period'].includes(subscriptionStatus) : false;
  const driverCanReceiveOffers = driverApproved && trialReady;
  const verificationLocked = Boolean(verificationStatus && !driverApproved);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [incomingRide, setIncomingRide] = useState<any>(null);
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
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastLocationPushAtRef = useRef<number>(0);
  const lastLocationPushCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [simSignalSent, setSimSignalSent] = useState(false);
  const onlineToggleInFlightRef = useRef(false);
  const [toggleSyncing, setToggleSyncing] = useState(false);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earningsError, setEarningsError] = useState(false);

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
    if (!user?.id) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/categories`, {
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
  }, [user?.id]);

  const toggleCategory = async (catId: string) => {
    if (categorySyncing) return;
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
      await fetch(`${BACKEND_URL}/api/drivers/${user!.id}/categories`, {
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

  const tabPad = useTabBottomPad(16);
  const navigationInFlightRef = useRef(false);
  const guardedPush = useCallback(
    (route: string) => {
      if (navigationInFlightRef.current) return;
      navigationInFlightRef.current = true;
      router.push(route as any);
      setTimeout(() => {
        navigationInFlightRef.current = false;
      }, 700);
    },
    [router]
  );
  const hydrateOnlineState = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/profile`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return;
      const profile = await response.json();
      const serverOnline = Boolean(profile?.is_online);
      setIsOnline(serverOnline);
    } catch {}
  };
  const fetchIncomingRide = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/trips/offers/${user.id}`,
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
  }, [user?.id]);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
    
    // Check onboarding status first — this is the verification gate
    initializeOfflineMode();
    checkOnboardingStatus();
    hydrateOnlineState();
    void getQueueSize().then(setOfflineQueueCount);
  }, []);

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
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    let locationSub: Location.LocationSubscription | null = null;

    const bootstrapLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (mounted && lastKnown) {
          const c = { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
          setDriverCoords(c);
          setCurrentLocation({ latitude: c.lat, longitude: c.lng, address: '' });
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (mounted) {
          const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setDriverCoords(c);
          setCurrentLocation({ latitude: c.lat, longitude: c.lng, address: '' });
        }

        locationSub = await Location.watchPositionAsync(
          {
            // 12 s interval + 40 m movement threshold — reduces battery drain ~60%
            // Backend push is further debounced (15 s + 50 m) so no extra API calls
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 12000,
            distanceInterval: 40,
          },
          (update) => {
            if (mounted) {
              const c = { lat: update.coords.latitude, lng: update.coords.longitude };
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
    if (!isOnline || !user?.id || !driverCoords) return;
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
        await fetch(`${BACKEND_URL}/api/drivers/${user.id}/location`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ latitude: driverCoords.lat, longitude: driverCoords.lng }),
        });
        lastLocationPushAtRef.current = Date.now();
        lastLocationPushCoordsRef.current = { lat: driverCoords.lat, lng: driverCoords.lng };
      } catch {}
    };
    pushLocation();
  }, [isOnline, user?.id, driverCoords?.lat, driverCoords?.lng]);

  // SIM Swap Protection — runs at most once per 24h per device, never blocks UI
  const [simSwapAlert, setSimSwapAlert] = useState(false);
  useEffect(() => {
    if (!user?.id || simSignalSent) return;
    const sendSimRiskSignal = async () => {
      try {
        const fpKey = `nexryde_sim_fp_${user.id}`;
        const cooldownKey = `nexryde_sim_check_ts_${user.id}`;

        // Local 24h cooldown — skip if checked within the last 24 hours
        const lastCheckTs = await SecureStore.getItemAsync(cooldownKey);
        if (lastCheckTs && Date.now() - Number(lastCheckTs) < 86_400_000) {
          return; // Not due yet
        }

        // Generate or retrieve stable device fingerprint
        let fingerprint = await SecureStore.getItemAsync(fpKey);
        if (!fingerprint) {
          // First-time: generate a stable ID based on user + platform (no random)
          fingerprint = `simfp_${user.id.slice(-8)}_${Platform.OS}_${String(Platform.Version).replace(/\./g, '')}_v1`;
          await SecureStore.setItemAsync(fpKey, fingerprint);
        }

        // NOTE: we do NOT send phone — the backend already has the registered phone.
        // Sending app-state phone caused false positives due to format differences
        // (e.g. "08012345678" vs "+2348012345678" for the same number).
        await reportDriverSimSwapSignal(user.id, {
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
  }, [simSignalSent, user?.id]);

  // Real-time ride offers via WebSocket; HTTP polling only as fallback (slower when WS is up).
  useEffect(() => {
    if (!isOnline || !user?.id || !token) {
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
      if (cancelled || !isOnlineRef.current || !user?.id || !token) return;
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
      const wsUrl = `${base}/api/ws/driver/offers/${encodeURIComponent(user.id)}?token=${encodeURIComponent(token)}`;
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
              if (Platform.OS !== 'web') {
                Vibration.vibrate(400);
              }
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
  }, [isOnline, user?.id, token, fetchIncomingRide]);

  // Fallback polling when no active modal; slow interval while WebSocket is healthy.
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    if (isOnline && !incomingRide) {
      void fetchIncomingRide();
      const pollMs = driverOffersWsConnected ? 90000 : 8000;
      pollInterval = setInterval(() => {
        void fetchIncomingRide();
      }, pollMs);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOnline, incomingRide, user?.id, driverOffersWsConnected, fetchIncomingRide]);

  useEffect(() => {
    if (!incomingRide?.id) return;
    const r = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    setCounterFareInput(r > 0 ? String(r) : '');
  }, [incomingRide?.id]);

  const declineHandlerRef = useRef<() => Promise<void>>(async () => {});
  const offerTimerExpiredRef = useRef(false);

  const handleDeclineRide = useCallback(async () => {
    const ride = incomingRide;
    if (!ride) return;
    try {
      if (ride.offer_id && user?.id) {
        await fetch(`${BACKEND_URL}/api/trips/offers/${ride.offer_id}/decline`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ driver_id: user.id }),
        });
      }
    } catch {}
    setIncomingRide(null);
    setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
  }, [incomingRide, user?.id]);

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
            void declineHandlerRef.current();
          }
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [incomingRide?.id]);

  const handleAcceptRide = async () => {
    if (!incomingRide) return;
    if (!user?.id) {
      Alert.alert('Profile Required', 'Please login again to accept rides.');
      return;
    }
    setAcceptingRide(true);
    const fallbackProposed = Math.round(
      Number(String(counterFareInput).replace(/,/g, '').trim()) ||
        Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0)
    );
    try {
      const tripId = incomingRide.id;
      const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
      const maxP = incomingRide.max_price != null ? Math.round(Number(incomingRide.max_price)) : null;
      const minP = incomingRide.min_price != null ? Math.round(Number(incomingRide.min_price)) : null;
      const proposed = Math.round(Number(String(counterFareInput).replace(/,/g, '').trim()) || riderOffer);
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
            driver_id: user.id,
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
          driver_id: user.id,
          offer_id: incomingRide?.offer_id,
          proposed_fare: proposed,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setCurrentTrip(data);
        const pickup = incomingRide?.pickup_location;
        const pickupAddress =
          typeof pickup === 'string'
            ? pickup
            : pickup?.address || 'Pickup location';
        const pickupLat = typeof pickup === 'object' ? pickup?.lat : null;
        const pickupLng = typeof pickup === 'object' ? pickup?.lng : null;

        const openNavigation = () => {
          if (pickupLat && pickupLng) {
            const url = Platform.select({
              ios: `maps:0,0?q=${pickupLat},${pickupLng}`,
              android: `google.navigation:q=${pickupLat},${pickupLng}`,
            }) || `https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`;
            Linking.openURL(url).catch(() => {
              Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`);
            });
          } else if (pickupAddress && pickupAddress !== 'Pickup location') {
            const encoded = encodeURIComponent(pickupAddress);
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
          }
        };

        Alert.alert(
          'Ride Accepted!',
          `Navigate to pickup:\n${pickupAddress}`,
          [
            {
              text: 'Open Trip',
              onPress: () => router.push(DRIVER_TRIPS_TAB_HREF),
              style: 'default',
            },
            { text: 'Navigate', onPress: openNavigation, style: 'default' },
            {
              text: 'Later',
              style: 'cancel',
              onPress: () => router.push(DRIVER_TRIPS_TAB_HREF),
            },
          ]
        );
        setIncomingRide(null);
      } else {
        Alert.alert('Could not accept', formatApiDetail(data?.detail) || 'This offer may have expired. Try the next one.');
      }
    } catch (e) {
      await queueDriverRideAcceptance(
        incomingRide.id,
        {
          driver_id: user.id,
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
  };

  const handleToggleOnline = async () => {
    if (onlineToggleInFlightRef.current) return;
    if (!user?.id) {
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
        `${BACKEND_URL}/api/drivers/${user.id}/online?is_online=${nextStatus}`,
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
        } else if (lower.includes('bank') || lower.includes('account')) {
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
    } catch {
      Alert.alert('Network Error', 'Could not update online status. Check your connection.');
    } finally {
      onlineToggleInFlightRef.current = false;
      setToggleSyncing(false);
    }
  };
  
  const checkOnboardingStatus = async () => {
    try {
      if (!user?.id) {
        setCheckingOnboarding(false);
        return;
      }
      
      // Check if driver has completed onboarding
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/onboarding-status`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const status = await response.json();
        
        setVerificationStatus(status.verification_status || (status.completed ? 'approved' : 'pending_review'));
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
          } else if (status.step === 'dashboard_limited' || status.step === 'documents_review') {
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
        }
        
        // Driver is approved — set verification status and show dashboard
        setVerificationStatus(status.verification_status || 'approved');
        try {
          const subRes = await getDriverSubscriptionStatus();
          const sub = subRes.data || {};
          setSubscriptionStatus(sub.status || 'none');
          setTrialTripsCompleted(sub.trial_trips_completed ?? 0);
          setTrialTripsTarget(sub.trial_trips_target ?? 20);
          setTrialExtended(sub.trial_extended ?? false);
        } catch {
          setSubscriptionStatus('none');
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
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.gray50} />

      {/* SIM Swap Alert Banner — non-blocking, shown only on genuine risk */}
      {simSwapAlert && (
        <View style={styles.simSwapBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
            <Ionicons name="shield-checkmark" size={20} color="#FFF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.simSwapBannerTitle}>Security Alert</Text>
              <Text style={styles.simSwapBannerText}>A new SIM was detected. Contact support if this wasn't you.</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setSimSwapAlert(false)} style={{ padding: 4 }}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      )}
      
      {/* HEADER WITH GRADIENT */}
      <LinearGradient
        colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{(() => { const h = new Date().getHours(); return h < 12 ? t.home.goodMorning : h < 17 ? t.home.goodAfternoon : t.home.goodEvening; })()}</Text>
            <Text style={styles.driverName}>{user?.name || 'Driver'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setFeatureHubOpen(true)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel="Open feature hub"
              accessibilityRole="button"
            >
              <Ionicons name="menu" size={26} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setShowLangPicker(true)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18 }}>{availableLanguages.find(l => l.code === language)?.flag || '🌐'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileButton} onPress={() => guardedPush('/(driver-tabs)/driver-profile')}>
              <Ionicons name="person-circle" size={40} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ONLINE STATUS TOGGLE */}
        <Animated.View
          style={[
            styles.statusCard,
            { opacity: fadeAnim },
            isOnline && styles.statusCardOnlineGlow,
          ]}
        >
          {/* Status dot indicator */}
          <View style={[styles.statusDot, isOnline && styles.statusDotOnline, !driverCanReceiveOffers && styles.statusDotLocked]}>
            {isOnline ? (
              <Ionicons name="radio-button-on" size={20} color="#22E180" />
            ) : !driverApproved ? (
              <Ionicons name="shield-half" size={20} color="#FBBF24" />
            ) : !trialReady ? (
              <Ionicons name="alert-circle" size={20} color="#FBBF24" />
            ) : (
              <Ionicons name="power" size={20} color="rgba(255,255,255,0.5)" />
            )}
          </View>

          <View style={styles.statusLeft}>
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>
                {isOnline
                  ? t.driver.youAreOnline
                  : !driverApproved
                    ? 'Pending Verification'
                    : !trialReady
                      ? 'Activate Your Account'
                      : t.driver.youAreOffline}
              </Text>
              <Text style={styles.statusSubtitle} numberOfLines={2}>
                {isOnline
                  ? (subscriptionStatus === 'trial'
                      ? `Trial • ${trialTripsCompleted}/${trialTripsTarget} trips${trialExtended ? ' (extended)' : ''}`
                      : t.driver.statusReceivingOffers)
                  : !driverApproved
                    ? 'Documents under review. Access unlocks after admin approval.'
                    : !trialReady
                      ? 'Tap "Activate" to start your free 20-trip trial.'
                      : t.driver.statusGoOnlineHint}
              </Text>
            </View>
          </View>

          {/* Action: either toggle or CTA button */}
          {!driverApproved ? (
            <View style={styles.pendingBadge}>
              <Ionicons name="time-outline" size={14} color="#FBBF24" />
              <Text style={styles.pendingBadgeText}>Review</Text>
            </View>
          ) : !trialReady ? (
            <TouchableOpacity
              style={styles.activateBtn}
              onPress={() => guardedPush('/driver/subscription')}
              activeOpacity={0.88}
            >
              <Text style={styles.activateBtnText}>Activate</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.toggleButton,
                isOnline && styles.toggleButtonActive,
                toggleSyncing && styles.toggleButtonDisabled,
              ]}
              onPress={handleToggleOnline}
              activeOpacity={0.8}
              disabled={toggleSyncing}
            >
              {toggleSyncing ? (
                <ActivityIndicator size="small" color="#FFF" style={{ margin: 6 }} />
              ) : (
                <View style={[styles.toggleThumb, isOnline && styles.toggleThumbActive]} />
              )}
            </TouchableOpacity>
          )}
        </Animated.View>

        <View style={styles.headerPills}>
          {/* Verification status pill */}
          <View style={[styles.headerPill, driverApproved && { backgroundColor: 'rgba(34,225,128,0.15)' }]}>
            <Ionicons
              name={driverApproved ? 'shield-checkmark' : 'shield-half'}
              size={16}
              color={driverApproved ? '#22E180' : '#FBBF24'}
            />
            <Text style={[styles.headerPillText, driverApproved && { color: '#22E180' }]}>
              {driverApproved ? 'Verified Driver' : 'Under review'}
            </Text>
          </View>

          {/* Subscription / trial pill */}
          {driverApproved && (
            <View style={[styles.headerPill, trialReady && { backgroundColor: 'rgba(34,225,128,0.12)' }]}>
              <Ionicons
                name={trialReady ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={trialReady ? '#22E180' : '#FBBF24'}
              />
              <Text style={[styles.headerPillText, trialReady && { color: '#22E180' }]}>
                {trialReady ? 'Active' : 'Activate account'}
              </Text>
            </View>
          )}

          {/* Live dispatch — only show when actually connected, hide "Fallback sync" noise */}
          {driverOffersWsConnected && (
            <View style={[styles.headerPill, { backgroundColor: 'rgba(34,225,128,0.12)' }]}>
              <Ionicons name="radio" size={16} color="#22E180" />
              <Text style={[styles.headerPillText, { color: '#22E180' }]}>Live dispatch</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabPad }}>

        {/* ── RIDE CATEGORY SELECTOR ─────────────────────────────────────── */}
        {driverCanReceiveOffers && (
          <View style={styles.catCard}>
            <View style={styles.catCardHeader}>
              <Ionicons name="layers-outline" size={18} color="#94A3B8" />
              <Text style={styles.catCardTitle}>Ride Categories</Text>
              {categorySyncing && <ActivityIndicator size="small" color="#00D46A" style={{ marginLeft: 6 }} />}
              <Text style={styles.catCardHint}>Select the types of rides you want to receive</Text>
            </View>
            <View style={styles.catGrid}>
              {CATEGORY_OPTIONS.map((cat) => {
                const active = activeCategories.includes(cat.id);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catTile, active && { borderColor: cat.color, backgroundColor: cat.color + '18' }]}
                    onPress={() => toggleCategory(cat.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.catTileIcon, { backgroundColor: cat.color + (active ? '30' : '15') }]}>
                      <Ionicons name={cat.icon} size={22} color={active ? cat.color : '#64748B'} />
                    </View>
                    <Text style={[styles.catTileLabel, active && { color: cat.color }]}>{cat.label}</Text>
                    <Text style={styles.catTileDesc}>{cat.desc}</Text>
                    {active && (
                      <View style={[styles.catCheck, { backgroundColor: cat.color }]}>
                        <Ionicons name="checkmark" size={10} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── IDLE BOOST SUGGESTION ──────────────────────────────────────── */}
        {idleBoostVisible && (
          <TouchableOpacity
            style={styles.idleBoostBanner}
            onPress={() => { setIdleBoostVisible(false); }}
            activeOpacity={0.85}
          >
            <Ionicons name="bulb-outline" size={18} color="#FFB800" />
            <Text style={styles.idleBoostText}>
              You've been idle a while. Enable more categories to get more rides!
            </Text>
            <Ionicons name="close" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
        {/* ─────────────────────────────────────────────────────────────── */}

        {verificationLocked && (
          <Animated.View style={[styles.verificationRoadmap, { opacity: fadeAnim }]}>
            <View style={styles.roadmapHeader}>
              <LinearGradient colors={[COLORS.accentGreen, '#00C853']} style={styles.roadmapIconGrad}>
                <Ionicons name="shield-checkmark-outline" size={22} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.roadmapBadge}>REVIEW IN PROGRESS</Text>
                <Text style={styles.roadmapTitle}>Documents submitted ✓</Text>
                <Text style={styles.roadmapSubtitle}>
                  Our team is reviewing your documents. You'll receive a notification once approved.
                </Text>
              </View>
            </View>

            <View style={styles.roadmapSteps}>
              <View style={styles.roadmapStep}>
                <View style={[styles.roadmapStepDot, { backgroundColor: COLORS.accentGreen }]}>
                  <Ionicons name="checkmark" size={11} color="#FFF" />
                </View>
                <Text style={styles.roadmapStepText}>Documents submitted</Text>
              </View>
              <View style={styles.roadmapStepLine} />
              <View style={styles.roadmapStep}>
                <View style={[styles.roadmapStepDot, { backgroundColor: COLORS.warning }]}>
                  <ActivityIndicator size="small" color="#FFF" style={{ transform: [{ scale: 0.7 }] }} />
                </View>
                <Text style={styles.roadmapStepText}>Company review in progress</Text>
              </View>
              <View style={styles.roadmapStepLine} />
              <View style={styles.roadmapStep}>
                <View style={[styles.roadmapStepDot, { backgroundColor: '#CBD5E1' }]}>
                  <Ionicons name="lock-closed" size={11} color="#FFF" />
                </View>
                <Text style={[styles.roadmapStepText, { color: '#94A3B8' }]}>Free 20-trip activity trial</Text>
              </View>
            </View>

            <View style={styles.roadmapActions}>
              <TouchableOpacity style={styles.roadmapPrimary} onPress={() => void checkOnboardingStatus()}>
                <Ionicons name="refresh" size={16} color="#FFF" />
                <Text style={styles.roadmapPrimaryText}>Refresh status</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.roadmapSecondary} onPress={() => guardedPush('/support')}>
                <Text style={styles.roadmapSecondaryText}>Contact support</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {driverApproved && !trialReady && (
          <Animated.View style={[styles.verificationRoadmap, styles.activationRoadmap, { opacity: fadeAnim }]}>
            <View style={styles.roadmapHeader}>
              <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.roadmapIconGrad}>
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roadmapBadge, { color: '#F59E0B' }]}>APPROVED — ACTION NEEDED</Text>
                <Text style={styles.roadmapTitle}>Account approved! 🎉</Text>
                <Text style={styles.roadmapSubtitle}>
                  Your account is verified! Activate your free 20-trip activity trial to start receiving ride offers now.
                </Text>
              </View>
            </View>

            <View style={styles.roadmapActions}>
              <TouchableOpacity
                style={[styles.roadmapPrimary, { backgroundColor: '#F59E0B' }]}
                onPress={() => guardedPush('/driver/subscription')}
              >
                <Ionicons name="flash" size={16} color="#FFF" />
                <Text style={styles.roadmapPrimaryText}>Activate 20-trip trial</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.roadmapSecondary} onPress={() => void checkOnboardingStatus()}>
                <Text style={styles.roadmapSecondaryText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {offlineQueueCount > 0 && (
          <View style={styles.offlineSyncCard}>
            <View style={styles.offlineSyncIcon}>
              <Ionicons name="cloud-upload-outline" size={18} color={COLORS.warning} />
            </View>
            <View style={styles.offlineSyncTextWrap}>
              <Text style={styles.offlineSyncTitle}>Offline ride sync pending</Text>
              <Text style={styles.offlineSyncSubtitle}>
                {offlineQueueCount} action{offlineQueueCount === 1 ? '' : 's'} queued. NEXRYDE will retry automatically when the network is stable.
              </Text>
            </View>
          </View>
        )}
        {/* ── EARNINGS GUARANTEE CARD ─────────────────────────────────── */}
        {earningsGuarantee && (() => {
          const g = earningsGuarantee;
          const floor = Number(g.minimum_hourly_earnings || 0);
          const earned = Number(g.current_hour_earnings || 0);
          const gap = Number(g.top_up_gap || 0);
          const pct = Math.min(100, Number(g.progress_pct || 0));
          const aboveFloor = Boolean(g.above_floor) || earned >= floor;

          // Standby — show only a compact chip when driver is offline
          if (!g.active) {
            return (
              <View style={styles.guaranteeChip}>
                <Ionicons name="shield-checkmark-outline" size={13} color={COLORS.accentGreen} />
                <Text style={styles.guaranteeChipText}>
                  Earnings Guarantee · Next: {g.next_window_label || 'See schedule'}
                </Text>
              </View>
            );
          }

          // Active window — full rich card
          const accentColor = aboveFloor ? '#16A34A' : '#D97706';
          const bgColor = aboveFloor ? '#F0FDF4' : '#FFFBEB';
          const borderColor = aboveFloor ? '#86EFAC' : '#FCD34D';
          const barFill = aboveFloor ? '#16A34A' : '#F59E0B';

          return (
            <View style={[styles.guaranteeCard, { backgroundColor: bgColor, borderColor }]}>
              {/* Header row */}
              <View style={styles.guaranteeHeader}>
                <View style={[styles.guaranteeIconWrap, { backgroundColor: aboveFloor ? '#DCFCE7' : '#FEF3C7' }]}>
                  <Ionicons
                    name={(g.icon as any) || 'shield-checkmark-outline'}
                    size={18}
                    color={accentColor}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.guaranteeTitle, { color: accentColor }]}>{g.title}</Text>
                  <Text style={styles.guaranteeReason}>{g.reason}</Text>
                </View>
                {g.window_ends_label ? (
                  <View style={styles.guaranteeEndBadge}>
                    <Text style={styles.guaranteeEndBadgeText}>Until {g.window_ends_label}</Text>
                  </View>
                ) : null}
              </View>

              {/* Progress bar */}
              <View style={styles.guaranteeBarBg}>
                <View style={[styles.guaranteeBarFill, { width: `${pct}%` as any, backgroundColor: barFill }]} />
              </View>

              {/* Earnings row */}
              <View style={styles.guaranteeEarningsRow}>
                <View style={styles.guaranteeEarningsItem}>
                  <Text style={styles.guaranteeEarningsLabel}>This hour</Text>
                  <Text style={[styles.guaranteeEarningsValue, { color: accentColor }]}>
                    ₦{earned.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.guaranteeEarningsDivider]} />
                <View style={styles.guaranteeEarningsItem}>
                  <Text style={styles.guaranteeEarningsLabel}>Floor</Text>
                  <Text style={styles.guaranteeEarningsValue}>₦{floor.toLocaleString()}</Text>
                </View>
                <View style={styles.guaranteeEarningsDivider} />
                <View style={styles.guaranteeEarningsItem}>
                  <Text style={styles.guaranteeEarningsLabel}>{aboveFloor ? 'Surplus' : 'Covered by Nexryde'}</Text>
                  <Text style={[styles.guaranteeEarningsValue, { color: aboveFloor ? '#16A34A' : '#D97706' }]}>
                    {aboveFloor ? `+₦${(earned - floor).toLocaleString()}` : `₦${gap.toLocaleString()}`}
                  </Text>
                </View>
              </View>

              {/* Status line */}
              <View style={styles.guaranteeStatusRow}>
                <Ionicons
                  name={aboveFloor ? 'checkmark-circle' : 'information-circle-outline'}
                  size={14}
                  color={aboveFloor ? '#16A34A' : '#D97706'}
                />
                <Text style={[styles.guaranteeStatusText, { color: aboveFloor ? '#15803D' : '#92400E' }]}>
                  {aboveFloor
                    ? "You've exceeded the floor — great work!"
                    : `Nexryde will top up ₦${gap.toLocaleString()} if this hour ends below the floor.`}
                </Text>
              </View>
            </View>
          );
        })()}
        {/* EARNINGS CARDS - PRIORITY */}
        <Animated.View style={[styles.section, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity
            onPress={() => guardedPush('/(driver-tabs)/driver-earnings')}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Open driver earnings"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.sectionTitle}>{t.driver.todayEarnings}</Text>
              {earningsLoading && <ActivityIndicator size="small" color={COLORS.accentGreen} />}
              {earningsError && !earningsLoading && (
                <Text style={{ fontSize: 11, color: '#f87171' }}>Could not load</Text>
              )}
            </View>
            <LinearGradient
            colors={['#022c22', '#064e3b', '#0f766e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.earningsGradientWrap}
          >
            {earningsLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <ActivityIndicator size="large" color="#22E180" />
                <Text style={{ color: '#86efac', fontSize: 13, marginTop: 8 }}>Loading earnings...</Text>
              </View>
            ) : (
            <View style={styles.earningsGrid}>
              <View style={[styles.earningCard, styles.earningCardOnGreen]}>
                <View style={[styles.earningIcon, { backgroundColor: '#F59E0B' }]}>
                  <Ionicons name="wallet" size={26} color="#FFF" />
                </View>
                <Text style={styles.earningLabelLight}>Today</Text>
                <Text style={styles.earningValueLight}>₦{earnings.today.toLocaleString()}</Text>
              </View>

              <View style={[styles.earningCard, styles.earningCardOnGreen]}>
                <View style={[styles.earningIcon, { backgroundColor: COLORS.accentGreen }]}>
                  <Ionicons name="calendar" size={26} color="#FFF" />
                </View>
                <Text style={styles.earningLabelLight}>This Week</Text>
                <Text style={styles.earningValueLight}>₦{earnings.week.toLocaleString()}</Text>
              </View>

              <View style={[styles.earningCard, styles.earningCardOnGreen]}>
                <View style={[styles.earningIcon, { backgroundColor: HOME_PALETTE.accentIndigo }]}>
                  <Ionicons name="car" size={26} color="#FFF" />
                </View>
                <Text style={styles.earningLabelLight}>Total Trips</Text>
                <Text style={styles.earningValueLight}>{earnings.trips}</Text>
              </View>
            </View>
            )}
          </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* PRIORITY FEATURES - BIG CARDS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>{t.driver.coreActions}</Text>
          <View style={styles.priorityGrid}>
            {priorityFeatures.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.priorityCard}
                onPress={() => guardedPush(feature.route)}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={[feature.color, feature.color + 'CC']}
                  style={styles.priorityGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={feature.icon as any} size={28} color="#FFF" />
                  <Text style={styles.priorityLabel}>{feature.label}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ALL FEATURES GRID - COMPLETE ACCESS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.driver.toolsSection}</Text>
            <Text style={styles.featureCount}>{toolFeatures.length}</Text>
          </View>
          <Text style={styles.toolsHint}>{t.driver.toolsHubHint}</Text>
          <View style={styles.allFeaturesGrid}>
            {toolFeatures.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.featureCard}
                onPress={() => guardedPush(feature.route)}
                activeOpacity={0.7}
              >
                <View style={[styles.featureIconBox, { backgroundColor: feature.color + '15' }]}>
                  <Ionicons name={feature.icon as any} size={24} color={feature.color} />
                </View>
                <Text style={styles.featureText} numberOfLines={2}>{feature.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
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

      {/* Language Picker Modal */}
      <Modal visible={showLangPicker} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', paddingTop: 100 }} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={{ marginHorizontal: 20, backgroundColor: '#1E293B', borderRadius: 16, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#94A3B8', paddingHorizontal: 12, paddingVertical: 8 }}>SELECT LANGUAGE</Text>
            {availableLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => { setLanguage(lang.code as SupportedLanguage); setShowLangPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: language === lang.code ? 'rgba(34,225,128,0.15)' : 'transparent', gap: 12 }}
              >
                <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{lang.nativeName}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>{lang.name}</Text>
                </View>
                {language === lang.code && <Ionicons name="checkmark-circle" size={22} color="#22E180" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <FeatureHubDrawer visible={featureHubOpen} onClose={() => setFeatureHubOpen(false)} role="driver" />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  simSwapBanner: {
    backgroundColor: '#B91C1C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  simSwapBannerTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 1,
  },
  simSwapBannerText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    lineHeight: 16,
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
  // ── Earnings Guarantee Card ─────────────────────────────────────────
  guaranteeCard: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  guaranteeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guaranteeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guaranteeTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  guaranteeReason: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  guaranteeEndBadge: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  guaranteeEndBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#374151',
  },
  guaranteeBarBg: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.07)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  guaranteeBarFill: {
    height: 6,
    borderRadius: 3,
  },
  guaranteeEarningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guaranteeEarningsItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  guaranteeEarningsDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  guaranteeEarningsLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  guaranteeEarningsValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F2937',
  },
  guaranteeStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  guaranteeStatusText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  // Compact standby chip (when not in an active window)
  guaranteeChip: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  guaranteeChipText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
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
