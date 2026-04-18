import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  ScrollView, Modal, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders, getWalletMe, getRiderPreferences, updateRiderPreferences, getAvailableDrivers } from '@/src/services/api';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import { TrafficAI, type TrafficRoute } from '@/src/services/trafficAI';
import MapComponent from '@/src/components/MapComponent';

const COLORS = {
  bg: '#0B1120',
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

export default function BookInDriveStyle() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestedDriverId?: string; driverName?: string }>();
  const { user, token, setCurrentTrip } = useAppStore();
  const requestedDriverId = params.requestedDriverId || null;
  const requestedDriverName = params.driverName || null;

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
  const [tripId, setTripId] = useState<string | null>(null);
  const [driverFound, setDriverFound] = useState<any>(null);
  const driverPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calculateInFlightRef = useRef(false);
  const offerInFlightRef = useRef(false);
  const navigationInFlightRef = useRef(false);
  const [ridePaymentMethod, setRidePaymentMethod] = useState<'cash' | 'wallet'>('cash');
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<TrafficRoute | null>(null);
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

  const openScheduleRide = () => {
    if (navigationInFlightRef.current) return;
    if (!pickup?.trim() || !destination?.trim()) {
      Alert.alert('Add route first', 'Choose pickup and destination before scheduling a ride.');
      return;
    }
    const pLat = pickupCoords?.lat || currentLocation?.lat;
    const pLng = pickupCoords?.lng || currentLocation?.lng;
    const dLat = destinationCoords?.lat;
    const dLng = destinationCoords?.lng;
    if (!pLat || !pLng || !dLat || !dLng) {
      Alert.alert('Pin locations', 'Use search suggestions or GPS so we can save the scheduled trip correctly.');
      return;
    }
    navigationInFlightRef.current = true;
    router.push({
      pathname: '/rider/schedule',
      params: {
        pickup,
        dropoff: destination,
        pickupLat: String(pLat),
        pickupLng: String(pLng),
        dropoffLat: String(dLat),
        dropoffLng: String(dLng),
        rideType: selectedVehicle || 'economy',
        fareEstimate: String(currentFare || 0),
      },
    } as any);
    setTimeout(() => {
      navigationInFlightRef.current = false;
    }, 800);
  };

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

  // GPS detection on mount
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
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!mounted) return;
        const { latitude, longitude } = loc.coords;
        const latN = Number(latitude);
        const lngN = Number(longitude);
        if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
          if (mounted) setGpsStatus('error');
          return;
        }

        let address = `${latN.toFixed(4)}, ${lngN.toFixed(4)}`;
        try {
          const res = await fetch(`${BACKEND_URL}/api/places/geocode?lat=${latN}&lng=${lngN}`);
          const data = await res.json();
          if (data?.address) address = data.address;
          else if (data?.formatted_address) address = data.formatted_address;
        } catch {}

        if (!mounted) return;
        setCurrentLocation({ lat: latN, lng: lngN, address });
        setPickup(address);
        setPickupCoords({ lat: latN, lng: lngN });
        setGpsStatus('locked');
      } catch {
        if (mounted) setGpsStatus('error');
      }
    };
    detectGPS();
    return () => { mounted = false; };
  }, []);

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
    if (!veh && nextMatrix.economy > 0) {
      veh = 'economy';
      setSelectedVehicle('economy');
    }
    if (!veh) return;

    const row = results.find((r) => r[0] === veh);
    const detail = row?.[2];
    if (detail) {
      setFareDetails(detail);
      const minP = Math.round(Number(detail.min_price ?? 0));
      const maxP = Math.round(Number(detail.max_price ?? 1e15));
      const sug = Math.round(Number(detail.base_price ?? detail.total_fare ?? row?.[1] ?? 0));
      setCurrentFare((prev) => {
        if (prev >= minP && prev <= maxP) return prev;
        return Math.max(minP, sug || nextMatrix[veh!] || 0);
      });
    } else if (nextMatrix[veh] > 0) {
      setCurrentFare(nextMatrix[veh]);
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
        // #region agent log
        fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:handleCalculateFare',message:'routes before setOptimizedRoute',data:{routeCount:routes.length,hasFirst:!!first},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        setOptimizedRoute(first ? TrafficAI.normalizeTrafficRoute(first) : null);
      } else {
        Alert.alert('Fare Error', toStr(data?.detail || data?.message, 'Could not calculate fare. Please try again.'));
      }
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:handleCalculateFare',message:'handleCalculateFare catch',data:{err:String(error?.message||error)},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:fareMatrixEffect',message:'calculateAllVehiclePrices scheduled',data:{pLat:pickupCoords?.lat,pLng:pickupCoords?.lng,dLat:destinationCoords?.lat,dLng:destinationCoords?.lng,vehicle:selectedVehicle},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      try {
        await calculateAllVehiclePrices();
        // #region agent log
        fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:fareMatrixEffect',message:'calculateAllVehiclePrices ok',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:fareMatrixEffect',message:'calculateAllVehiclePrices error',data:{err:String((e as Error)?.message||e)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
      }
    };
    const timer = setTimeout(run, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [pickupCoords?.lat, pickupCoords?.lng, destinationCoords?.lat, destinationCoords?.lng, selectedVehicle, availableVehicles]);

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
  const nearbyOnlineCount = nearbyDrivers.filter((d) => d.status === 'online').length;
  const liveEtaLabel = veh?.time || 'ETA pending';
  const liveDriverLabel =
    nearbyOnlineCount > 0
      ? `${nearbyOnlineCount} nearby driver${nearbyOnlineCount > 1 ? 's' : ''}`
      : nearbyDrivers.length > 0
        ? `${nearbyDrivers.length} nearby (offline)`
        : 'Searching nearby drivers';
  const formatDistanceKm = (value: unknown) => {
    const distance = Number(value);
    if (!Number.isFinite(distance) || distance <= 0) return 'Route pending';
    return `${distance.toFixed(1)} km route`;
  };
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

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* MAP SECTION */}
      <View style={s.mapArea}>
        {pickupCoords && destinationCoords ? (
          Platform.OS === 'web' ? (
            <MapComponent
              style={s.mapPlaceholder}
              pickup={{
                latitude: pickupCoords.lat,
                longitude: pickupCoords.lng,
                address: pickup,
              }}
              dropoff={{
                latitude: destinationCoords.lat,
                longitude: destinationCoords.lng,
                address: destination,
              }}
              routeCoordinates={[
                { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
                { latitude: destinationCoords.lat, longitude: destinationCoords.lng },
              ]}
            />
          ) : (
            (() => {
              const RideMap = require('@/src/components/RideMap.native').default;
              // #region agent log
              fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:mapBranch',message:'render RideMap branch',data:{plat:Number(pickupCoords.lat),plng:Number(pickupCoords.lng),dlat:Number(destinationCoords.lat),dlng:Number(destinationCoords.lng),nearby:nearbyDrivers.length},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
              // #endregion
              return (
                <RideMap
                  mapRef={null}
                  pickupCoords={pickupCoords}
                  destinationCoords={destinationCoords}
                  routePolyline={[
                    { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
                    { latitude: destinationCoords.lat, longitude: destinationCoords.lng },
                  ]}
                  pickup={pickup}
                  destination={destination}
                  nearbyDrivers={nearbyDrivers}
                />
              );
            })()
          )
        ) : (
          <View style={s.mapPlaceholder}>
            <Ionicons name="map" size={56} color={COLORS.dim} />
            <Text style={s.mapText}>
              {pickupCoords && destinationCoords
                ? formatDistanceKm(fareDetails?.distance_km)
                : 'Select locations to view route'}
            </Text>
          </View>
        )}

        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>

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

        {/* Location bar */}
        <View style={s.locBar}>
          <TouchableOpacity style={s.locRow} onPress={() => { setEditingField('pickup'); setShowLocationModal(true); }} accessibilityLabel="Select pickup location" accessibilityRole="button">
            <View style={[s.dot, { backgroundColor: COLORS.green }]} />
            <Text style={s.locText} numberOfLines={1}>{pickup || 'Select pickup'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.locRow} onPress={() => { setEditingField('destination'); setShowLocationModal(true); }} accessibilityLabel="Select destination" accessibilityRole="button">
            <View style={[s.dot, { backgroundColor: COLORS.red }]} />
            <Text style={s.locText} numberOfLines={1}>{destination || 'Select destination'}</Text>
          </TouchableOpacity>
          <View style={[s.gpsBadge, gpsStatus === 'locked' && { backgroundColor: 'rgba(0,212,106,0.2)' }, gpsStatus === 'error' && { backgroundColor: 'rgba(255,184,0,0.15)' }]}>
            {gpsStatus === 'detecting' && <><ActivityIndicator size="small" color={COLORS.blue} /><Text style={[s.gpsText, { color: COLORS.blue }]}>DETECTING...</Text></>}
            {gpsStatus === 'locked' && <><Ionicons name="location" size={13} color={COLORS.green} /><Text style={s.gpsText}>GPS LOCKED</Text></>}
            {gpsStatus === 'error' && <><Ionicons name="warning" size={13} color={COLORS.yellow} /><Text style={[s.gpsText, { color: COLORS.yellow }]}>GPS OFF</Text></>}
          </View>
        </View>
      </View>

      {/* BOTTOM SHEET */}
      <View style={s.sheet}>
        <ScrollView contentContainerStyle={s.sheetContent} showsVerticalScrollIndicator={false}>
          <View style={s.experienceHero}>
            <View>
              <Text style={s.experienceHeroTitle}>Quick Actions + Live Info</Text>
              <Text style={s.experienceHeroSub}>Nearby drivers, ETA, and one-tap trip controls.</Text>
            </View>

            <View style={s.heroStatRow}>
              <View style={s.heroStatCard}>
                <Ionicons name="pulse-outline" size={14} color={COLORS.green} />
                <Text style={s.heroStatLabel}>Nearby Drivers</Text>
                <Text style={s.heroStatValue} numberOfLines={1}>{liveDriverLabel}</Text>
              </View>
              <View style={s.heroStatCard}>
                <Ionicons name="time-outline" size={14} color={COLORS.blue} />
                <Text style={s.heroStatLabel}>Best ETA</Text>
                <Text style={s.heroStatValue} numberOfLines={1}>{liveEtaLabel}</Text>
              </View>
            </View>

            <View style={s.heroActionsRow}>
              <TouchableOpacity
                style={s.heroActionBtn}
                onPress={openScheduleRide}
                accessibilityLabel="Schedule ride from quick actions"
                accessibilityRole="button"
              >
                <Ionicons name="calendar-clear-outline" size={15} color={COLORS.white} />
                <Text style={s.heroActionText}>Schedule Ride</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.heroActionBtn}
                onPress={() => router.push('/rider/split-fare')}
                accessibilityLabel="Split fare from quick actions"
                accessibilityRole="button"
              >
                <Ionicons name="people-outline" size={15} color={COLORS.white} />
                <Text style={s.heroActionText}>Split Fare</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.heroActionBtn}
                onPress={() => router.push('/rider/safety-check')}
                accessibilityLabel="Open safety check from quick actions"
                accessibilityRole="button"
              >
                <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.white} />
                <Text style={s.heroActionText}>Safety Check</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={s.scheduleShortcut}
            onPress={openScheduleRide}
            disabled={isLoading}
            accessibilityLabel="Open schedule ride"
            accessibilityRole="button"
          >
            <View style={s.scheduleShortcutIcon}>
              <Ionicons name="calendar-clear-outline" size={18} color={COLORS.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.scheduleShortcutTitle}>Schedule ride</Text>
              <Text style={s.scheduleShortcutSub}>Set pickup, destination and choose your ride time.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
          </TouchableOpacity>

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

          {/* Vehicle */}
          <TouchableOpacity style={[s.vehicleCard, !veh && s.vehicleCardPrompt]} onPress={() => setShowVehicleModal(true)} accessibilityLabel="Select vehicle type" accessibilityRole="button">
            <View style={[s.vehIcon, { backgroundColor: (veh?.color || COLORS.dim) + '20' }]}>
              <Ionicons name={(veh?.icon || 'car') as any} size={24} color={veh?.color || COLORS.dim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.vehName, !veh && { color: COLORS.muted }]}>{veh ? veh.name : 'Select Vehicle Type'}</Text>
              <Text style={s.vehDesc}>
                {veh
                  ? `${veh.time} • ${veh.desc}`
                  : String(user?.gender || '').toLowerCase() === 'female'
                    ? 'Tap to choose Standard, Comfort, XL, Premium or Women Only'
                    : 'Tap to choose Standard, Comfort, XL or Premium'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={veh ? COLORS.muted : COLORS.green} />
          </TouchableOpacity>

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
                <View style={{ marginBottom: 10, gap: 4 }}>
                  <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: '700' }}>
                    Suggested price: ₦{smartBaseUi.toLocaleString()}
                  </Text>
                  {smartMinUi != null && smartMinUi > 0 && (
                    <Text style={{ color: COLORS.yellow, fontSize: 12, fontWeight: '700' }}>
                      Minimum allowed: ₦{smartMinUi.toLocaleString()}
                    </Text>
                  )}
                  {smartMaxUi != null && smartMaxUi > 0 && (
                    <Text style={{ color: COLORS.dim, fontSize: 11, fontWeight: '600' }}>
                      Drivers may counter up to ₦{smartMaxUi.toLocaleString()}
                    </Text>
                  )}
                  {priorityMatch && (
                    <Text style={{ color: COLORS.lime, fontSize: 11, fontWeight: '800' }}>
                      Priority matching — your offer is in the fast lane
                    </Text>
                  )}
                </View>
              )}
              <View style={s.fareRow}>
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
              </View>
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
              <TouchableOpacity style={s.findBtn} onPress={findOffers} disabled={isLoading} accessibilityLabel="Find ride offers" accessibilityRole="button">
                <LinearGradient colors={[COLORS.lime, '#9CD900']} style={s.btnGrad}>
                  {isLoading ? <ActivityIndicator color={COLORS.bg} /> : <Text style={s.findBtnText}>Find offers</Text>}
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.scheduleRideBtn}
                onPress={openScheduleRide}
                disabled={isLoading}
                accessibilityLabel="Schedule this ride"
                accessibilityRole="button"
              >
                <Ionicons name="calendar-outline" size={18} color={COLORS.white} />
                <Text style={s.scheduleRideBtnText}>Schedule for later</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.calcBtn} onPress={() => handleCalculateFare()} disabled={isLoading || !pickup || !destination}>
              <LinearGradient colors={pickup && destination && selectedVehicle ? [COLORS.green, '#00B455'] : ['#334155', '#334155']} style={s.btnGrad}>
                {isLoading ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.calcBtnText}>{selectedVehicle ? 'Calculate Fare' : 'Select Vehicle & Calculate'}</Text>}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* LOCATION MODAL */}
      <Modal visible={showLocationModal} animationType="slide" onRequestClose={() => setShowLocationModal(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>{editingField === 'pickup' ? 'Pickup Location' : 'Destination'}</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={s.modalBody}>
            <LocationAutocomplete
              placeholder={editingField === 'pickup' ? 'Enter pickup...' : 'Enter destination...'}
              value={editingField === 'pickup' ? pickup : destination}
              onChangeText={(text) => {
                if (editingField === 'destination' && (text.length === 2 || text.length === 3 || text.length % 10 === 0)) {
                  // #region agent log
                  fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:LocationAutocomplete',message:'destination onChangeText',data:{len:text.length},timestamp:Date.now(),hypothesisId:'T4'})}).catch(()=>{});
                  // #endregion
                }
                editingField === 'pickup' ? setPickup(text) : setDestination(text);
              }}
              onPlaceSelected={async (loc) => {
                try {
                  const field = editingField;
                  const rawDesc = typeof loc?.description === 'string' ? loc.description : '';
                  const details = loc?.placeId ? await fetchPlaceDetails(loc.placeId) : null;
                  const desc = String(details?.description || rawDesc || '').trim() || 'Selected location';
                  const coords =
                    details && Number.isFinite(details.lat) && Number.isFinite(details.lng)
                      ? { lat: details.lat, lng: details.lng }
                      : null;
                  if (field === 'pickup') {
                    setPickup(desc);
                    if (coords) setPickupCoords(coords);
                  } else {
                    setDestination(desc);
                    if (coords) setDestinationCoords(coords);
                  }
                  // #region agent log
                  fetch('http://127.0.0.1:7639/ingest/774e86fb-629a-4687-bad0-4630ed7bb9d7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'274678'},body:JSON.stringify({sessionId:'274678',location:'book-indrive-style.tsx:onPlaceSelected',message:'place applied',data:{field,hasCoords:!!coords,descLen:desc.length},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
                  // #endregion
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
                  <Ionicons name={v.icon as any} size={26} color={v.color} />
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
  mapArea: { height: '50%', position: 'relative' },
  mapPlaceholder: { flex: 1, backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center' },
  mapText: { fontSize: 14, color: COLORS.dim, marginTop: 10 },
  backBtn: { position: 'absolute', top: 16, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(26,35,50,0.9)', alignItems: 'center', justifyContent: 'center' },
  preferredBanner: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  preferredText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#FCA5A5' },
  locBar: { position: 'absolute', top: 16, left: 70, right: 16, backgroundColor: 'rgba(26,35,50,0.95)', borderRadius: 16, padding: 12, gap: 8 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  locText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.white },
  gpsBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(14,165,233,0.15)', borderRadius: 8, marginTop: 4, gap: 6 },
  gpsText: { fontSize: 11, fontWeight: '800', color: COLORS.green, textTransform: 'uppercase', letterSpacing: 0.8 },
  sheet: { flex: 1, backgroundColor: COLORS.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -24, paddingTop: 10 },
  sheetContent: { padding: 20, paddingBottom: 56 },
  experienceHero: {
    backgroundColor: '#101B2E',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  experienceHeroTitle: { color: COLORS.white, fontSize: 16, fontWeight: '900' },
  experienceHeroSub: { color: COLORS.muted, fontSize: 12, marginTop: 4, maxWidth: 280, lineHeight: 18 },
  heroStatRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  heroStatCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  heroStatLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroStatValue: { color: COLORS.white, fontSize: 12, fontWeight: '800' },
  heroActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  heroActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(35,47,66,0.65)',
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  heroActionText: { color: COLORS.white, fontSize: 11, fontWeight: '800' },
  scheduleShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  scheduleShortcutIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleShortcutTitle: { color: COLORS.white, fontSize: 14, fontWeight: '900' },
  scheduleShortcutSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
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
  fareAmount: { fontSize: 32, fontWeight: '900', color: COLORS.lime },
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
  scheduleRideBtn: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.45)',
    backgroundColor: '#17263F',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  scheduleRideBtnText: { fontSize: 15, fontWeight: '800', color: COLORS.white },
  calcBtn: { borderRadius: 16, overflow: 'hidden' },
  calcBtnText: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.white },
  modalBody: { flex: 1, padding: 16 },
  useGpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: COLORS.card, borderRadius: 14, marginTop: 16 },
  useGpsText: { fontSize: 15, fontWeight: '700', color: COLORS.green },
  vehModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  vehModalContent: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  vehModalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.white, marginBottom: 16, textAlign: 'center' },
  vehOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, marginBottom: 8, backgroundColor: COLORS.card, gap: 12 },
  vehOptionActive: { borderWidth: 2, borderColor: COLORS.green },
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
