import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  ScrollView, Modal, TextInput, Platform, Animated, Easing, KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders, getWalletMe, getRiderPreferences, updateRiderPreferences, getAvailableDrivers } from '@/src/services/api';
import { fetchRouteSafety, type RouteSafetyResponse } from '@/src/services/crimeSafetyData';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import { TrafficAI, type TrafficRoute } from '@/src/services/trafficAI';
import MapComponent from '@/src/components/MapComponent';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { getRecentLocations, cacheRecentLocation } from '@/src/services/offlineMode';

/** Set `EXPO_PUBLIC_BOOKING_PROMO=false` to hide the booking promo strip entirely. */
const BOOKING_PROMO_ENABLED = String(process.env.EXPO_PUBLIC_BOOKING_PROMO ?? 'true').toLowerCase() !== 'false';
const BOOKING_PROMO_DISMISS_KEY = '@nexryde_booking_promo_dismissed_v1';

/** True when the pickup label is still raw "lat, lng" (geocode not applied yet or failed). */
function isRawLatLngLabel(s: string): boolean {
  return /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(String(s || '').trim());
}

async function reverseGeocodeViaBackend(
  lat: number,
  lng: number,
  baseUrl: string,
): Promise<string | null> {
  const origin = String(baseUrl || '').replace(/\/$/, '');
  if (!origin) return null;
  const url = `${origin}/api/places/geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
  const once = async () => {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const raw = String(data?.address || data?.formatted_address || '').trim();
    if (!raw || isRawLatLngLabel(raw)) return null;
    return raw;
  };
  let out = await once();
  if (out) return out;
  await new Promise((r) => setTimeout(r, 800));
  out = await once();
  return out || null;
}

const COLORS = {
  bg: '#0D1420',
  card: '#1A2332',
  cardLight: '#232F42',
  green: '#00D46A',
  blue: '#0EA5E9',
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

/** Native map isolated so a bad require / native module error can be caught by ErrorBoundary. */
function BookingRideMapNative(props: {
  pickupCoords: { lat: number; lng: number };
  destinationCoords: { lat: number; lng: number } | null;
  routePolyline: { latitude: number; longitude: number }[];
  pickup: string;
  destination: string;
  nearbyDrivers: Array<{
    driver_id: string;
    name?: string;
    lat: number;
    lng: number;
    status?: string;
    vehicle?: string;
  }>;
}) {
  try {
    const RideMap = require('@/src/components/RideMap.native').default;
    const safeDrivers = (props.nearbyDrivers || []).filter(
      (d) =>
        d &&
        Number.isFinite(Number(d.lat)) &&
        Number.isFinite(Number(d.lng)) &&
        Math.abs(Number(d.lat)) <= 90 &&
        Math.abs(Number(d.lng)) <= 180,
    );
    return (
      <RideMap
        mapRef={null}
        pickupCoords={props.pickupCoords}
        destinationCoords={props.destinationCoords}
        routePolyline={props.routePolyline}
        pickup={props.pickup}
        destination={props.destination}
        nearbyDrivers={safeDrivers}
      />
    );
  } catch {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ color: COLORS.muted, textAlign: 'center' }}>Map could not load. You can still enter pickup and destination below.</Text>
      </View>
    );
  }
}

function BookInDriveStyle() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestedDriverId?: string; driverName?: string }>();
  const { user, token, setCurrentTrip } = useAppStore();
  const requestedDriverId = params.requestedDriverId || null;
  const requestedDriverName = params.driverName || null;
  const insets = useSafeAreaInsets();

  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [gpsStatus, setGpsStatus] = useState<'detecting' | 'locked' | 'error'>('detecting');

  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [currentFare, setCurrentFare] = useState(0);
  const [fareDetails, setFareDetails] = useState<any>(null);
  const [fareMatrix, setFareMatrix] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingField, setEditingField] = useState<'pickup' | 'destination'>('pickup');
  const [showVehicleModal, setShowVehicleModal] = useState(false);

  const [searchingForDriver, setSearchingForDriver] = useState(false);
  const [searchCountdown, setSearchCountdown] = useState(0);
  const searchCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [driverFound, setDriverFound] = useState<any>(null);
  const driverPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calculateInFlightRef = useRef(false);
  const offerInFlightRef = useRef(false);
  const navigationInFlightRef = useRef(false);
  const [ridePaymentMethod, setRidePaymentMethod] = useState<'cash' | 'wallet'>('cash');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<TrafficRoute | null>(null);
  const [routeSafety, setRouteSafety] = useState<RouteSafetyResponse | null>(null);
  const [routeSafetyLoading, setRouteSafetyLoading] = useState(false);
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
  const [recentDestinations, setRecentDestinations] = useState<
    Array<{ address?: string; description?: string; lat?: number; lng?: number }>
  >([]);
  const [bookingPromoVisible, setBookingPromoVisible] = useState(false);
  const [isFirstRider, setIsFirstRider] = useState(false);

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

  const clearDriverPoll = useCallback(() => {
    if (driverPollRef.current) {
      clearInterval(driverPollRef.current);
      driverPollRef.current = null;
    }
  }, []);

  /** Schedule screen with whatever route context we have (Bolt-style “Later” — no blocking alerts). */
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
    if (!user?.id) {
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
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const res = await getRiderPreferences(user.id);
        setEstateName(String(res.data?.estate_name || ''));
        setEstateGateCode(String(res.data?.estate_gate_code || ''));
      } catch {}
    })();
  }, [user?.id]);

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
    if (!user?.id) return;
    let cancelled = false;
    void fetch(`${BACKEND_URL}/api/incentives/first-ride-status`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.first_ride_completed === false) setIsFirstRider(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
    if (!user?.id) {
      setScheduledRides([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/rides/scheduled/${encodeURIComponent(user.id)}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        const rides = Array.isArray(data?.scheduled_rides) ? data.scheduled_rides : [];
        setScheduledRides(rides.slice(0, 2));
      } catch {
        setScheduledRides([]);
      }
    })();
  }, [user?.id]);

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
  }, [pickupCoords?.lat, pickupCoords?.lng, currentLocation?.lat, currentLocation?.lng, selectedVehicle]);

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
        rider_id: user?.id || '',
        driver_id: t?.driver_id || null,
        pickup_location:
          pl && typeof pl === 'object'
            ? {
                lat: Number(pl.lat),
                lng: Number(pl.lng),
                address: String(pl.address || ''),
              }
            : {
                lat: pickupCoords?.lat || currentLocation?.lat || 0,
                lng: pickupCoords?.lng || currentLocation?.lng || 0,
                address: pickup,
              },
        dropoff_location:
          dl && typeof dl === 'object'
            ? {
                lat: Number(dl.lat),
                lng: Number(dl.lng),
                address: String(dl.address || ''),
              }
            : {
                lat: destinationCoords?.lat || 0,
                lng: destinationCoords?.lng || 0,
                address: destination,
              },
        distance_km: Number(t?.distance_km ?? fareDetails?.distance_km ?? 0),
        duration_mins: Number(t?.duration_mins ?? fareDetails?.duration_mins ?? 0),
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
    },
    [
      user?.id,
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
    ]
  );

  const inferCity = (pickupText: string, destinationText: string): string => {
    const combined = `${pickupText || ''} ${destinationText || ''}`.toLowerCase();
    if (combined.includes('abuja') || combined.includes('fct')) return 'abuja';
    if (
      combined.includes('port harcourt') ||
      combined.includes('port-harcourt') ||
      combined.includes('rivers')
    ) {
      return 'port_harcourt';
    }
    if (combined.includes('lagos')) return 'lagos';
    return 'lagos';
  };

  const inferCityFromCoords = (lat?: number, lng?: number) => {
    if (!lat || !lng) return null;
    const targets = [
      { key: 'lagos', lat: 6.5244, lng: 3.3792, radiusKm: 120 },
      { key: 'abuja', lat: 9.0765, lng: 7.3986, radiusKm: 120 },
      { key: 'port_harcourt', lat: 4.8156, lng: 7.0498, radiusKm: 120 },
    ];
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const R = 6371;
      const dLat = toRad(bLat - aLat);
      const dLng = toRad(bLng - aLng);
      const aa =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    };
    let nearest: { key: string; distance: number; radiusKm: number } | null = null;
    for (const t of targets) {
      const distance = haversineKm(lat, lng, t.lat, t.lng);
      if (!nearest || distance < nearest.distance) {
        nearest = { key: t.key, distance, radiusKm: t.radiusKm };
      }
    }
    if (nearest && nearest.distance <= nearest.radiusKm) return nearest.key;
    return null;
  };

  // GPS: show rider on map immediately (coords first), then replace label with reverse-geocoded address.
  useEffect(() => {
    let mounted = true;
    const detectGPS = async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) setGpsStatus('error');
          return;
        }

        let latN: number | undefined;
        let lngN: number | undefined;

        try {
          const last = await Location.getLastKnownPositionAsync({
            maxAge: 180000,
            requiredAccuracy: 500,
          });
          if (last?.coords) {
            latN = Number(last.coords.latitude);
            lngN = Number(last.coords.longitude);
          }
        } catch {
          /* ignore */
        }

        if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Lowest,
          });
          if (!mounted) return;
          latN = Number(loc.coords.latitude);
          lngN = Number(loc.coords.longitude);
        }

        if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
          if (mounted) setGpsStatus('error');
          return;
        }

        const lat0 = latN as number;
        const lng0 = lngN as number;

        if (!mounted) return;
        setPickupCoords({ lat: lat0, lng: lng0 });
        setCurrentLocation({ lat: lat0, lng: lng0, address: '' });
        setPickup('Finding address…');
        setGpsStatus('locked');

        void (async () => {
          try {
            const resolved = await reverseGeocodeViaBackend(lat0, lng0, BACKEND_URL);
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
        })();

        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((loc: { coords: { latitude: number; longitude: number } }) => {
            if (!mounted) return;
            const nlat = Number(loc.coords.latitude);
            const nlng = Number(loc.coords.longitude);
            if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return;
            setPickupCoords({ lat: nlat, lng: nlng });
            setCurrentLocation(
              (prev: { lat: number; lng: number; address?: string } | null) =>
                prev
                  ? { ...prev, lat: nlat, lng: nlng }
                  : { lat: nlat, lng: nlng, address: '' },
            );
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
  }, []);

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
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [gpsStatus, pickupCoords?.lat, pickupCoords?.lng, pickup]);

  const fetchPlaceDetails = async (placeId: string) => {
    const id = String(placeId || '').trim();
    if (!id) return null;
    try {
      const res = await fetch(`${BACKEND_URL}/api/places/details/${encodeURIComponent(id)}`);
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

  const requestFareEstimate = async (payload: {
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    service_type: string;
    city: string;
    pickup_address?: string;
    dropoff_address?: string;
  }) => {
    const res = await fetch(`${BACKEND_URL}/api/fare/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(toStr(data?.detail, 'Could not calculate fare'));
    }
    return data;
  };

  const calculateAllVehiclePrices = async () => {
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
        'lagos';

      const results = await Promise.all(
        availableVehicles.map(async (vehicle) => {
          try {
            const data = await requestFareEstimate({
              pickup_lat: pLat!,
              pickup_lng: pLng!,
              dropoff_lat: dLat!,
              dropoff_lng: dLng!,
              service_type: vehicle.id,
              city,
              pickup_address: pickup?.trim() || undefined,
              dropoff_address: destination?.trim() || undefined,
            });
            const price = Number(data?.total_fare ?? data?.fare ?? data?.total ?? 0);
            return [vehicle.id, Math.round(price), data] as const;
          } catch {
            return [vehicle.id, 0, null] as const;
          }
        })
      );

      const nextMatrix = Object.fromEntries(results.map(([id, price]) => [id, price]));
      setFareMatrix(nextMatrix);

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
        setFareDetails(detail);
        const minP = Math.round(Number(detail.min_price ?? 0));
        const maxP = Math.round(Number(detail.max_price ?? 1e15));
        const sug = Math.round(Number(detail.base_price ?? detail.total_fare ?? row?.[1] ?? 0));
        setCurrentFare((prev) => {
          if (prev >= minP && prev <= maxP) return prev;
          return Math.max(minP, sug || vehPrice || 0);
        });
      } else if (vehPrice > 0) {
        setCurrentFare(vehPrice);
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
        'lagos';
      const basePayload = {
        pickup_lat: pLat,
        pickup_lng: pLng,
        dropoff_lat: dLat,
        dropoff_lng: dLng,
        service_type: serviceType,
        city: inferredCity,
        pickup_address: pickup?.trim() || undefined,
        dropoff_address: destination?.trim() || undefined,
      };

      let data;
      try {
        data = await requestFareEstimate(basePayload);
      } catch (firstError) {
        // Retry once for the default Standard flow with a stable fallback city.
        const retryPayload = {
          ...basePayload,
          service_type: serviceType || 'economy',
          city: inferredCity || 'lagos',
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
        setCurrentFare(Math.round(computedFare));
        setFareDetails({ ...data, service_type: serviceType, city: inferredCity });
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
        Alert.alert('Fare Error', toStr(data?.detail || data?.message, 'Could not calculate fare. Please try again.'));
      }
    } catch (error: any) {
      Alert.alert('Connection Error', toStr(error, 'Network error. Check your connection and try again.'));
    } finally {
      calculateInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!pickupCoords?.lat || !pickupCoords?.lng || !destinationCoords?.lat || !destinationCoords?.lng) {
      setFareMatrix({});
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
  }, [pickupCoords?.lat, pickupCoords?.lng, destinationCoords?.lat, destinationCoords?.lng, selectedVehicle, availableVehicles]);

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
      return;
    }
    let cancelled = false;
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
          if (!cancelled) setRouteSafety(snap);
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
    if (!user?.id) { Alert.alert('Login', 'Please login to request a ride.'); return; }
    if (!selectedVehicle) { Alert.alert('Select Vehicle', 'Please select a vehicle type first.'); setShowVehicleModal(true); return; }
    const MIN_FARE = 100;
    const smartMin = fareDetails?.min_price != null ? Math.round(Number(fareDetails.min_price)) : 0;
    const floor = Math.max(MIN_FARE, smartMin || 0);
    if (!Number.isFinite(currentFare) || currentFare < floor) {
      Alert.alert(
        'Minimum fare',
        smartMin
          ? `Minimum fare for this trip is ₦${smartMin.toLocaleString()}`
          : `Use at least ₦${floor.toLocaleString()}. Tap Calculate Fare or adjust with +/−.`,
      );
      return;
    }
    if (!pickup?.trim() || !destination?.trim()) {
      Alert.alert('Locations', 'Choose pickup and destination.');
      return;
    }
    const payMethod = tripPaymentMethod();
    if (payMethod === 'wallet') {
      let bal = walletBalance ?? 0;
      try {
        const w = await getWalletMe(1);
        bal = Number(w.data?.balance ?? 0);
        setWalletBalance(bal);
      } catch {
        /* use cached balance */
      }
      if (bal + 1e-6 < currentFare) {
        Alert.alert(
          'Insufficient balance',
          `You need at least ₦${currentFare.toLocaleString()} in your wallet. Top up in Wallet or pay with cash.`,
        );
        return;
      }
    }
    offerInFlightRef.current = true;
    setIsLoading(true);
    try {
      const pLat = pickupCoords?.lat || currentLocation?.lat || 0;
      const pLng = pickupCoords?.lng || currentLocation?.lng || 0;
      const dLat = destinationCoords?.lat || 0;
      const dLng = destinationCoords?.lng || 0;
      if (!pLat || !pLng || !dLat || !dLng) {
        Alert.alert('Pin locations', 'Pick addresses from search suggestions or use GPS so we have coordinates for drivers.');
        setIsLoading(false);
        return;
      }
      const city =
        inferCityFromCoords(pLat, pLng) ||
        inferCityFromCoords(dLat, dLng) ||
        inferCity(pickup, destination) ||
        'lagos';
      const normalizedService = selectedVehicle === 'standard' ? 'economy' : selectedVehicle;

      const res = await fetch(`${BACKEND_URL}/api/trips/request?rider_id=${user.id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          pickup_lat: pLat,
          pickup_lng: pLng,
          pickup_address: pickup.trim(),
          dropoff_lat: dLat,
          dropoff_lng: dLng,
          dropoff_address: destination.trim(),
          service_type: normalizedService,
          city,
          payment_method: payMethod,
          offered_fare: currentFare,
          recommended_fare:
            Number(fareDetails?.base_price || fareDetails?.total_fare || 0) || undefined,
          fare_estimate_id: fareDetails?.estimate_id || undefined,
          trip_type: 'intra',
          preferred_driver_id: requestedDriverId || undefined,
          ride_preferences: ridePreferences,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && (result.trip || result.success)) {
        const tid = result.trip?.id || result.trip_id || null;
        setTripId(tid);
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
        Alert.alert('Could not request ride', toStr(result?.detail || result?.message, 'Please try again in a moment.'));
      }
    } catch {
      Alert.alert('Error', 'Could not reach server.');
    } finally {
      offerInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const cancelPendingTrip = async (id: string | null) => {
    if (!id || !user?.id) return;
    try {
      await fetch(`${BACKEND_URL}/api/trips/${id}/cancel`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ cancelled_by: user.id }),
      });
    } catch {}
  };

  const handleSaveGateCode = async () => {
    if (!user?.id) return;
    setSavingGateCode(true);
    try {
      await updateRiderPreferences(user.id, {
        estate_name: estateName.trim() || null,
        estate_gate_code: estateGateCode.trim() || null,
      });
      Alert.alert('Saved', 'Your estate gate code will auto-share with the driver for 10 minutes after arrival.');
    } catch {
      Alert.alert('Error', 'Could not save estate gate code.');
    } finally {
      setSavingGateCode(false);
    }
  };

  const pollForDriver = (id: string | null) => {
    if (!id) return;
    clearDriverPoll();
    let attempts = 0;
    driverPollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${BACKEND_URL}/api/trips/${id}/status`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (data.success && ['accepted', 'arrived', 'ongoing'].includes(data.status) && data.driver_info) {
          clearDriverPoll();
          setCurrentTrip({
            id,
            rider_id: user?.id || '',
            driver_id: data.driver_info.driver_id || null,
            pickup_location: {
              lat: pickupCoords?.lat || 0,
              lng: pickupCoords?.lng || 0,
              address: pickup,
            },
            dropoff_location: {
              lat: destinationCoords?.lat || 0,
              lng: destinationCoords?.lng || 0,
              address: destination,
            },
            distance_km: Number(fareDetails?.distance_km || 0),
            duration_mins: Number(fareDetails?.duration_mins || 0),
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
        }
      } catch {}
      if (attempts >= 30) {
        clearDriverPoll();
        try {
          const finalRes = await fetch(`${BACKEND_URL}/api/trips/${id}/status`, {
            headers: getAuthHeaders(),
          });
          const finalData = await finalRes.json();
          if (finalData?.success && ['accepted', 'arrived', 'ongoing'].includes(finalData.status) && finalData.driver_info) {
            setCurrentTrip({
              id,
              rider_id: user?.id || '',
              driver_id: finalData.driver_info.driver_id || null,
              pickup_location: {
                lat: pickupCoords?.lat || 0,
                lng: pickupCoords?.lng || 0,
                address: pickup,
              },
              dropoff_location: {
                lat: destinationCoords?.lat || 0,
                lng: destinationCoords?.lng || 0,
                address: destination,
              },
              distance_km: Number(fareDetails?.distance_km || 0),
              duration_mins: Number(fareDetails?.duration_mins || 0),
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
      if (st === 'completed' || st === 'pending_payment') {
        clearDriverPoll();
        setSearchingForDriver(false);
        setDriverFound(null);
        setTripId(null);
        router.replace({ pathname: '/rider/trip-receipt', params: { tripId: id } } as any);
        return;
      }
      if (['accepted', 'arrived', 'ongoing'].includes(st) && t.driver_id) {
        applyAcceptedFromRealtime(id, t, st);
      }
    },
    [tripId, clearDriverPoll, setCurrentTrip, applyAcceptedFromRealtime, router]
  );

  useRiderTripRealtime({
    riderId: user?.id,
    token,
    enabled: Boolean(searchingForDriver && tripId && user?.id && token),
    watchTripId: tripId,
    onTripUpdate: handleRiderTripWs,
  });

  const cancelSearch = async () => {
    clearDriverPoll();
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
  const priorityMatch =
    smartBaseUi != null && smartBaseUi > 0 && currentFare >= smartBaseUi * 0.95;
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

  // Crash guard: Android production builds can hard-crash on native MapView init.
  // Keep booking usable by using the lightweight map placeholder on Android.
  const useNativeBookingMap = Platform.OS !== 'web' && Platform.OS !== 'android';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* MAP SECTION */}
      <View style={s.mapArea}>
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
                destinationCoords
                  ? [
                      { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
                      { latitude: destinationCoords.lat, longitude: destinationCoords.lng },
                    ]
                  : [{ latitude: pickupCoords.lat, longitude: pickupCoords.lng }]
              }
            />
          ) : (
            <BookingRideMapNative
              pickupCoords={pickupCoords}
              destinationCoords={destinationCoords}
              routePolyline={
                destinationCoords
                  ? [
                      { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
                      { latitude: destinationCoords.lat, longitude: destinationCoords.lng },
                    ]
                  : []
              }
              pickup={pickup}
              destination={destination}
              nearbyDrivers={nearbyDrivers}
            />
          )
        ) : (
          <View style={s.mapPlaceholder}>
            <Ionicons name="map" size={56} color={COLORS.dim} />
            <Text style={s.mapText}>Turn on location or choose pickup to see the map</Text>
          </View>
        )}

        {pickupCoords && !destinationCoords ? (
          <View style={s.mapRouteHint} pointerEvents="none">
            <Ionicons name="navigate-circle-outline" size={16} color={COLORS.lime} />
            <Text style={s.mapRouteHintText}>Choose where you are going in the sheet</Text>
          </View>
        ) : null}

        <View style={s.mapTopBar}>
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

        {/* Preferred driver banner */}
        {requestedDriverId && (
          <View style={s.preferredBanner}>
            <Ionicons name="heart" size={16} color="#EF4444" />
            <Text style={s.preferredText}>
              Requesting {requestedDriverName || 'your favorite driver'}
            </Text>
            <TouchableOpacity onPress={() => router.setParams({ requestedDriverId: '', driverName: '' })}>
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          </View>
        )}

      </View>

      {/* BOTTOM SHEET */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: sheetSlide }] }]}>
        <ScrollView
          contentContainerStyle={[s.sheetContent, { paddingBottom: Math.max(insets.bottom + 16, 56) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <View style={s.sheetHandle} accessibilityRole="none" />

          {BOOKING_PROMO_ENABLED && bookingPromoVisible ? (
            <View style={s.boltPromoBanner}>
              <View style={s.boltPromoIconWrap}>
                <Ionicons name="pricetag" size={18} color={COLORS.blue} />
              </View>
              <View style={s.boltPromoTextCol}>
                <Text style={s.boltPromoTitle}>Ride on your schedule</Text>
                <Text style={s.boltPromoBody}>
                  Book ahead and lock your route when it suits you.
                </Text>
                <View style={s.boltPromoActions}>
                  <TouchableOpacity
                    style={s.boltPromoCta}
                    onPress={openScheduleRide}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel="Open schedule from promo"
                  >
                    <Text style={s.boltPromoCtaText}>Schedule</Text>
                    <Ionicons name="arrow-forward" size={14} color={COLORS.bg} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                onPress={dismissBookingPromo}
                style={s.boltPromoClose}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                accessibilityLabel="Dismiss promo"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={s.boltHeroTitle}>Go wherever, whenever.</Text>
          <Text style={s.boltHeroSub}>Pickup follows your map. Set where you are headed below.</Text>

          <View style={s.boltServiceRow}>
            <TouchableOpacity
              style={s.boltServiceCard}
              onPress={openDestinationSearch}
              activeOpacity={0.88}
              accessibilityLabel="Find a ride"
              accessibilityRole="button"
            >
              <View style={[s.boltServiceIconBg, { backgroundColor: 'rgba(0,212,106,0.14)' }]}>
                <Ionicons name="car-sport" size={26} color={COLORS.green} />
              </View>
              <Text style={s.boltServiceTitle}>Rides</Text>
              <Text style={s.boltServiceSub}>{`Let's go`}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.boltServiceCard}
              onPress={openScheduleRide}
              activeOpacity={0.88}
              accessibilityLabel="Schedule a ride"
              accessibilityRole="button"
            >
              <View style={[s.boltServiceIconBg, { backgroundColor: 'rgba(14,165,233,0.18)' }]}>
                <Ionicons name="calendar" size={24} color={COLORS.blue} />
              </View>
              <Text style={s.boltServiceTitle}>Schedule</Text>
              <Text style={s.boltServiceSub}>Book ahead</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.boltServiceCard}
              onPress={() => router.push('/rider/family')}
              activeOpacity={0.88}
              accessibilityLabel="Family and favorites"
              accessibilityRole="button"
            >
              <View style={[s.boltServiceIconBg, { backgroundColor: 'rgba(147,51,234,0.2)' }]}>
                <Ionicons name="people" size={24} color={COLORS.purple} />
              </View>
              <Text style={s.boltServiceTitle}>Family</Text>
              <Text style={s.boltServiceSub}>People you trust</Text>
            </TouchableOpacity>
          </View>

          <View style={s.boltWhereShell}>
            <TouchableOpacity
              style={s.boltWhereMain}
              onPress={openDestinationSearch}
              activeOpacity={0.88}
              accessibilityLabel={destination?.trim() ? 'Edit destination' : 'Where to'}
              accessibilityRole="button"
            >
              <Ionicons name="search" size={22} color={COLORS.dim} />
              <Text
                style={[s.boltWhereQuestion, !!destination?.trim() && s.boltWhereFilled]}
                numberOfLines={1}
              >
                {destination?.trim() ? destination : 'Where to?'}
              </Text>
            </TouchableOpacity>
            <View style={s.boltWhereDivider} />
            <TouchableOpacity
              style={s.boltLaterWrap}
              onPress={openScheduleRide}
              activeOpacity={0.88}
              accessibilityLabel="Schedule for later"
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={20} color={COLORS.bg} />
              <Text style={s.boltLaterLabel}>Later</Text>
            </TouchableOpacity>
          </View>

          {recentDestinations.length > 0 ? (
            <View style={s.boltRecentBlock}>
              <Text style={s.boltRecentHeading}>Recent</Text>
              {recentDestinations.slice(0, 5).map((item, idx) => {
                const title = String(item.address || item.description || '').trim();
                if (!title) return null;
                return (
                  <TouchableOpacity
                    key={`recent-${idx}-${title.slice(0, 24)}`}
                    style={s.boltRecentRow}
                    onPress={() => applyRecentDestination(item)}
                    activeOpacity={0.88}
                  >
                    <View style={s.boltRecentIcon}>
                      <Ionicons name="time-outline" size={20} color={COLORS.dim} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.boltRecentTitle} numberOfLines={2}>
                        {title}
                      </Text>
                      {Number.isFinite(item.lat) && Number.isFinite(item.lng) ? (
                        <Text style={s.boltRecentMeta}>Saved pin</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.dim} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

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

          {pickupCoords && destinationCoords && (routeSafetyLoading || routeSafety) ? (
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
                  color={routeSafety?.route_risk_level === 'high' ? COLORS.yellow : COLORS.yellow}
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
              ) : (
                <Text style={s.routeSafetySub}>Could not check route safety.</Text>
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
              const discPrice = isFirstRider && price > 0 ? Math.round(price * 0.80) : null;
              const isSelected = selectedVehicle === v.id;
              const loadingPrice = !!(pickup && destination && !price && isLoading);
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[s.inlineCatRow, isSelected && s.inlineCatRowActive, isSelected && { borderColor: v.color }]}
                  onPress={() => {
                    setSelectedVehicle(v.id);
                    if (price && price > 0) {
                      setCurrentFare(discPrice ?? price);
                    } else if (pickup && destination) {
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
                          ₦{(discPrice ?? price).toLocaleString()}
                        </Text>
                        {discPrice != null && (
                          <Text style={s.inlineCatOrigPrice}>₦{price.toLocaleString()}</Text>
                        )}
                      </>
                    ) : (
                      <Text style={s.inlineCatPriceMuted}>
                        {pickup && destination ? '—' : 'Enter route'}
                      </Text>
                    )}
                  </View>
                  {isFirstRider && price > 0 && (
                    <View style={s.firstRideBadge}>
                      <Text style={s.firstRideBadgeText}>-20%</Text>
                    </View>
                  )}
                  {isSelected && !isFirstRider && (
                    <View style={[s.inlineCatCheck, { backgroundColor: v.color }]}>
                      <Ionicons name="checkmark" size={12} color="#FFF" />
                    </View>
                  )}
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
              {smartBaseUi != null && smartBaseUi > 0 && (
                <View style={{ marginBottom: 10, gap: 6 }}>
                  {/* Compact fare range pill */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <View style={{ backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="cash-outline" size={13} color="#22d3ee" />
                      <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '700' }}>
                        ₦{(smartMinUi ?? smartBaseUi).toLocaleString()} – ₦{(smartMaxUi ?? Math.round(smartBaseUi * 1.3)).toLocaleString()}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#0f2d18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="star" size={12} color="#fbbf24" />
                      <Text style={{ color: '#86efac', fontSize: 12, fontWeight: '700' }}>Suggested ₦{smartBaseUi.toLocaleString()}</Text>
                    </View>
                    {priorityMatch && (
                      <View style={{ backgroundColor: '#1e3a1e', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: COLORS.lime, fontSize: 11, fontWeight: '800' }}>⚡ Priority match</Text>
                      </View>
                    )}
                    {fareDetails?.first_ride_discount_applied && (
                      <View style={{ backgroundColor: 'rgba(0,212,106,0.18)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(0,212,106,0.35)' }}>
                        <Ionicons name="gift-outline" size={12} color="#00D46A" />
                        <Text style={{ color: '#00D46A', fontSize: 11, fontWeight: '800' }}>
                          🎉 20% First Ride Discount Applied
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
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
                <Text style={s.payHint}>
                  {ridePaymentMethod === 'wallet'
                    ? walletBalance != null
                      ? `Balance ₦${walletBalance.toLocaleString()} — charged when you confirm after the trip`
                      : 'Loading balance…'
                    : 'Pay the driver in person'}
                </Text>
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
              </View>
              <View>
                <Text style={s.paySectionLabel}>Estate gate code</Text>
                <Text style={s.preferenceHint}>Auto-shares with the driver for 10 minutes after they arrive at your estate gate.</Text>
                <View style={s.gateCard}>
                  <TextInput
                    value={estateName}
                    onChangeText={setEstateName}
                    placeholder="Estate or apartment name"
                    placeholderTextColor={COLORS.dim}
                    style={s.gateInput}
                  />
                  <TextInput
                    value={estateGateCode}
                    onChangeText={setEstateGateCode}
                    placeholder="Gate code"
                    placeholderTextColor={COLORS.dim}
                    style={s.gateInput}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity style={s.gateSaveBtn} onPress={handleSaveGateCode} disabled={savingGateCode}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.white} />
                    <Text style={s.gateSaveBtnText}>{savingGateCode ? 'Saving...' : 'Save Gate Code'}</Text>
                  </TouchableOpacity>
                </View>
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
                <LinearGradient colors={isLoading ? ['#64748b', '#475569'] : [COLORS.green, '#00B455']} style={[s.btnGrad, { paddingVertical: 18 }]}>
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
                colors={pickup && destination && selectedVehicle ? [COLORS.green, '#009E3F'] : ['#334155', '#475569']}
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

      {/* LOCATION MODAL */}
      <Modal visible={showLocationModal} animationType="slide" onRequestClose={() => setShowLocationModal(false)}>
        <SafeAreaView style={s.modalContainer} edges={['top', 'bottom']}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>{editingField === 'pickup' ? 'Pickup' : 'Where to?'}</Text>
            <View style={{ width: 28 }} />
          </View>
          <KeyboardAvoidingView
            style={s.modalKb}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
          >
            <View style={s.modalBody}>
            <LocationAutocomplete
              placeholder={editingField === 'pickup' ? 'Search pickup…' : 'Search destination…'}
              value={editingField === 'pickup' ? pickup : destination}
              onChangeText={(text) => {
                editingField === 'pickup' ? setPickup(text) : setDestination(text);
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
                    const details = await fetchPlaceDetails(placeId);
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

      {/* SEARCHING MODAL */}
      <Modal visible={searchingForDriver} animationType="fade" transparent onRequestClose={cancelSearch}>
        <View style={s.searchBg}>
          <View style={s.searchBox}>
            {!driverFound ? (
              <>
                <ActivityIndicator size="large" color={COLORS.green} style={{ marginBottom: 20 }} />
                <Text style={s.searchTitle}>
                  {requestedDriverId ? `Requesting ${requestedDriverName || 'Your Driver'}...` : 'Finding Your Driver...'}
                </Text>
                <Text style={s.searchSub}>
                  {requestedDriverId
                    ? `₦${currentFare.toLocaleString()} • Priority request sent`
                    : `₦${currentFare.toLocaleString()} sent to nearby drivers`}
                </Text>
                {searchCountdown > 0 && (
                  <View style={{ marginTop: 8, marginBottom: 4, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: '#64748b' }}>
                      Offer expires in{' '}
                      <Text style={{ fontWeight: '800', color: searchCountdown <= 15 ? COLORS.red : '#0f172a' }}>
                        {searchCountdown}s
                      </Text>
                    </Text>
                  </View>
                )}
                <TouchableOpacity style={s.searchCancel} onPress={cancelSearch} accessibilityLabel="Cancel search" accessibilityRole="button">
                  <Text style={{ color: COLORS.red, fontWeight: '800', fontSize: 16 }}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={64} color={COLORS.green} />
                <Text style={s.searchTitle}>Driver Found!</Text>
                <View style={s.driverCard}>
                  <View style={s.driverAvatar}><Ionicons name="person" size={28} color={COLORS.blue} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.driverName}>{driverFound.name}</Text>
                    <Text style={s.driverVeh}>{driverFound.vehicle}</Text>
                    <Text style={s.driverPlate}>{driverFound.plate} - {driverFound.color}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="star" size={16} color="#F59E0B" />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>
                      {Number(driverFound?.rating ?? 0).toFixed(1)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.doneBtn}
                  onPress={() => {
                    setSearchingForDriver(false);
                    setDriverFound(null);
                    router.replace({
                      pathname: '/rider/tracking',
                      params: {
                        tripId: tripId || '',
                        pickup,
                        destination,
                      },
                    } as any);
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 17 }}>Track Driver</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapArea: { height: '42%', position: 'relative' },
  mapPlaceholder: { flex: 1, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  mapText: { fontSize: 14, color: COLORS.dim, marginTop: 10 },
  mapRouteHint: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(13,20,32,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(184,241,27,0.35)',
  },
  mapRouteHintText: { color: COLORS.lime, fontSize: 13, fontWeight: '800' },
  mapTopBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 4,
  },
  backBtnCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(26,35,50,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(26,35,50,0.94)',
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
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
  boltHeroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  boltHeroSub: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 20,
    lineHeight: 20,
  },
  boltPromoBanner: {
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
  boltPromoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(14,165,233,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boltPromoTextCol: { flex: 1, minWidth: 0 },
  boltPromoTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
  },
  boltPromoBody: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    lineHeight: 18,
  },
  boltPromoActions: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  boltPromoCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lime,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  boltPromoCtaText: { fontSize: 13, fontWeight: '900', color: COLORS.bg },
  boltPromoClose: { padding: 2, marginTop: -4 },
  boltServiceRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 10,
    marginBottom: 18,
  },
  boltServiceCard: {
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
  boltServiceIconBg: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  boltServiceTitle: { fontSize: 15, fontWeight: '900', color: COLORS.white },
  boltServiceSub: { fontSize: 12, fontWeight: '600', color: COLORS.dim, marginTop: 4 },
  boltWhereShell: {
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
  boltWhereMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingVertical: 14,
    paddingRight: 8,
  },
  boltWhereQuestion: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.dim,
  },
  boltWhereFilled: { color: COLORS.white, fontWeight: '700' },
  boltWhereDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(148,163,184,0.35)' },
  boltLaterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    backgroundColor: COLORS.lime,
    minWidth: 88,
  },
  boltLaterLabel: { fontSize: 15, fontWeight: '900', color: COLORS.bg },
  boltRecentBlock: { marginBottom: 18 },
  boltRecentHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.dim,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  boltRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.2)',
  },
  boltRecentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(148,163,184,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boltRecentTitle: { fontSize: 16, fontWeight: '800', color: COLORS.white, lineHeight: 22 },
  boltRecentMeta: { fontSize: 12, fontWeight: '600', color: COLORS.dim, marginTop: 2 },
  preferredBanner: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  preferredText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#FCA5A5' },
  sheet: { flex: 1, backgroundColor: COLORS.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -24, paddingTop: 10 },
  sheetContent: { paddingHorizontal: 20, paddingTop: 8 },
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
  gateCard: {
    backgroundColor: COLORS.cardLight,
    borderRadius: 16,
    padding: 12,
    gap: 10,
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
  gateSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 12,
  },
  gateSaveBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.white },
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
  modalBody: { flex: 1, padding: 16 },
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
  searchBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  searchBox: { backgroundColor: '#FFF', borderRadius: 24, padding: 32, width: '100%', alignItems: 'center' },
  searchTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 12 },
  searchSub: { fontSize: 14, color: '#64748B', marginTop: 8, textAlign: 'center' },
  searchCancel: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, borderWidth: 2, borderColor: COLORS.red },
  driverCard: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, marginVertical: 16, gap: 12 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  driverVeh: { fontSize: 13, color: '#64748B', marginTop: 2 },
  driverPlate: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginTop: 2 },
  doneBtn: { backgroundColor: COLORS.green, paddingVertical: 14, paddingHorizontal: 60, borderRadius: 16 },
});

export default function BookInDriveStyleScreen() {
  return (
    <ErrorBoundary>
      <BookInDriveStyle />
    </ErrorBoundary>
  );
}
