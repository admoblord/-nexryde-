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
  return {
    id: String(data.trip_id ?? ''),
    offer_id: String(data.offer_id ?? ''),
    pickup_location: (data.pickup ?? data.pickup_coordinates) as Record<string, unknown> | string | undefined,
    dropoff_location: (data.dropoff ?? data.destination_coordinates) as Record<string, unknown> | string | undefined,
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
  };
}

// Feature arrays built inside component to use translations

export default function ModernDriverHome() {
  const router = useRouter();
  const { user, token, setCurrentTrip } = useAppStore();
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
    const fetchEarnings = async () => {
      try {
        const [todayRes, weekRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/driver/earnings/${user.id}?period=today`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${BACKEND_URL}/api/driver/earnings/${user.id}?period=week`, {
            headers: getAuthHeaders(),
          }),
        ]);
        if (!todayRes.ok) return;
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
        }
      } catch {
        /* keep defaults */
      }
    };
    fetchEarnings();
    const interval = setInterval(fetchEarnings, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.id, user?.total_trips]);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
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
          setDriverCoords({ lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude });
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (mounted) {
          setDriverCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (update) => {
            if (mounted) {
              setDriverCoords({ lat: update.coords.latitude, lng: update.coords.longitude });
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

  // Push live location to backend for dispatch accuracy and rider tracking
  useEffect(() => {
    if (!isOnline || !user?.id || !driverCoords) return;
    const now = Date.now();
    const lastAt = lastLocationPushAtRef.current;
    const lastCoords = lastLocationPushCoordsRef.current;
    const minIntervalMs = 15000;
    const minMoveKm = 0.05; // 50m
    if (lastAt && now - lastAt < minIntervalMs) return;
    if (lastCoords) {
      const movedKm = Math.abs(calculateDistance(driverCoords.lat, driverCoords.lng, lastCoords.lat, lastCoords.lng));
      if (movedKm < minMoveKm && now - lastAt < 60000) return;
    }
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

  useEffect(() => {
    if (!user?.id || simSignalSent) return;
    const sendSimRiskSignal = async () => {
      try {
        const key = `nexryde_sim_fp_${user.id}`;
        let fingerprint = await SecureStore.getItemAsync(key);
        if (!fingerprint) {
          fingerprint = `simfp_${user.id}_${(user.phone || '').slice(-6)}_${Math.random().toString(36).slice(2, 12)}`;
          await SecureStore.setItemAsync(key, fingerprint);
        }
        await reportDriverSimSwapSignal(user.id, {
          sim_fingerprint: fingerprint,
          carrier_name: 'unknown',
          phone: user.phone || undefined,
        });
      } catch (error: any) {
        if (error?.response?.status === 423) {
          Alert.alert(
            'SIM Swap Protection',
            error?.response?.data?.detail || 'SIM swap risk detected. Account activity is frozen pending identity reconfirmation.',
          );
        }
      } finally {
        setSimSignalSent(true);
      }
    };
    void sendSimRiskSignal();
  }, [simSignalSent, user?.id, user?.phone]);

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
    onlineToggleInFlightRef.current = true;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/drivers/${user.id}/online?is_online=${nextStatus}`,
        { method: 'PUT', headers: getAuthHeaders() }
      );
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Status update failed', formatApiDetail(data?.detail) || 'Could not change online status.');
        return;
      }
      setIsOnline(nextStatus);
      if (nextStatus) {
        fetchIncomingRide();
      } else {
        setIncomingRide(null);
      }
    } catch {
      Alert.alert('Network Error', 'Could not update online status.');
    } finally {
      onlineToggleInFlightRef.current = false;
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
          if (!['trial', 'active', 'grace_period'].includes(sub.status || 'none')) {
            router.replace('/driver/subscription');
            return;
          }
        } catch {
          router.replace('/driver/subscription');
          return;
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

        {/* ONLINE STATUS TOGGLE - PROMINENT */}
        <Animated.View
          style={[
            styles.statusCard,
            { opacity: fadeAnim },
            isOnline && styles.statusCardOnlineGlow,
          ]}
        >
          <View style={styles.statusLeft}>
            <Ionicons 
              name={isOnline ? "radio-button-on" : "radio-button-off"} 
              size={24} 
              color={isOnline ? COLORS.success : COLORS.error} 
            />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>
                {isOnline ? t.driver.youAreOnline : t.driver.youAreOffline}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isOnline ? t.driver.statusReceivingOffers : t.driver.statusGoOnlineHint}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={[styles.toggleButton, isOnline && styles.toggleButtonActive]}
            onPress={handleToggleOnline}
            activeOpacity={0.8}
          >
            <View style={[styles.toggleThumb, isOnline && styles.toggleThumbActive]} />
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.headerPills}>
          <View style={styles.headerPill}>
            <Ionicons
              name={subscriptionStatus && ['trial', 'active', 'grace_period'].includes(subscriptionStatus) ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={subscriptionStatus && ['trial', 'active', 'grace_period'].includes(subscriptionStatus) ? '#22E180' : '#FBBF24'}
            />
            <Text style={styles.headerPillText}>
              {subscriptionStatus && ['trial', 'active', 'grace_period'].includes(subscriptionStatus)
                ? 'Subscription ready'
                : 'Subscription attention'}
            </Text>
          </View>
          <View style={styles.headerPill}>
            <Ionicons
              name={verificationStatus === 'approved' ? 'shield-checkmark' : 'shield-half'}
              size={16}
              color={verificationStatus === 'approved' ? '#22E180' : '#FBBF24'}
            />
            <Text style={styles.headerPillText}>
              {verificationStatus === 'approved' ? 'Driver verified' : 'Verification review'}
            </Text>
          </View>
          <View style={styles.headerPill}>
            <Ionicons
              name={driverOffersWsConnected ? 'radio' : 'cloud-offline-outline'}
              size={16}
              color={driverOffersWsConnected ? '#22E180' : '#FBBF24'}
            />
            <Text style={styles.headerPillText}>
              {driverOffersWsConnected ? 'Live dispatch' : 'Fallback sync'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
        {earningsGuarantee && (
          <View style={[styles.offlineSyncCard, styles.guaranteeBanner]}>
            <View style={[styles.offlineSyncIcon, styles.guaranteeIcon]}>
              <Ionicons
                name={earningsGuarantee.active ? 'thunderstorm-outline' : 'shield-checkmark-outline'}
                size={18}
                color={earningsGuarantee.active ? COLORS.warning : COLORS.accentGreen}
              />
            </View>
            <View style={styles.offlineSyncTextWrap}>
              <Text style={styles.offlineSyncTitle}>
                {earningsGuarantee.active ? 'Anti-surge protection active' : 'Anti-surge protection standby'}
              </Text>
              <Text style={styles.offlineSyncSubtitle}>
                Floor {`₦${Number(earningsGuarantee.minimum_hourly_earnings || 0).toLocaleString()}`}/hour. Current hour {`₦${Number(earningsGuarantee.current_hour_earnings || 0).toLocaleString()}`}.
                {Number(earningsGuarantee.top_up_gap || 0) > 0
                  ? ` Nexryde cover gap: ₦${Number(earningsGuarantee.top_up_gap || 0).toLocaleString()}.`
                  : ' You are already above the guarantee.'}
              </Text>
            </View>
          </View>
        )}
        {/* EARNINGS CARDS - PRIORITY */}
        <Animated.View style={[styles.section, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity
            onPress={() => guardedPush('/(driver-tabs)/driver-earnings')}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel="Open driver earnings"
          >
            <Text style={styles.sectionTitle}>{t.driver.todayEarnings}</Text>
            <LinearGradient
            colors={['#022c22', '#064e3b', '#0f766e']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.earningsGradientWrap}
          >
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
            <Text style={styles.featureCount}>{toolFeatures.length} items</Text>
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
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    marginLeft: 14,
    flex: 1,
  },
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
  guaranteeBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  guaranteeIcon: {
    backgroundColor: '#DCFCE7',
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
});
