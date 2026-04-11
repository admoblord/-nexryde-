import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  ScrollView, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

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

export default function BookInDriveStyle() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestedDriverId?: string; driverName?: string }>();
  const { user, setCurrentTrip } = useAppStore();
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

        let address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        try {
          const res = await fetch(`${BACKEND_URL}/api/places/geocode?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          if (data?.address) address = data.address;
          else if (data?.formatted_address) address = data.formatted_address;
        } catch {}

        if (!mounted) return;
        setCurrentLocation({ lat: latitude, lng: longitude, address });
        setPickup(address);
        setPickupCoords({ lat: latitude, lng: longitude });
        setGpsStatus('locked');
      } catch {
        if (mounted) setGpsStatus('error');
      }
    };
    detectGPS();
    return () => { mounted = false; };
  }, []);

  const fetchPlaceDetails = async (placeId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/places/details/${encodeURIComponent(placeId)}`);
      const data = await res.json();
      if (data?.latitude && data?.longitude) {
        return { description: data.address || '', lat: data.latitude, lng: data.longitude };
      }
    } catch {}
    return null;
  };

  const resolveAddressToCoords = async (address: string) => {
    try {
      const query = encodeURIComponent(address.trim());
      const res = await fetch(`${BACKEND_URL}/api/places/geocode-address?address=${query}`);
      const data = await res.json();
      if (res.ok && data?.latitude && data?.longitude) {
        return {
          lat: data.latitude as number,
          lng: data.longitude as number,
          address: data.address || address,
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
    const data = await res.json();
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
      VEHICLES.map(async (vehicle) => {
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
      } else {
        Alert.alert('Fare Error', toStr(data?.detail || data?.message, 'Could not calculate fare. Please try again.'));
      }
    } catch (error: any) {
      Alert.alert('Connection Error', toStr(error, 'Network error. Check your connection and try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!pickupCoords?.lat || !pickupCoords?.lng || !destinationCoords?.lat || !destinationCoords?.lng) {
      setFareMatrix({});
      return;
    }
    const run = async () => {
      try {
        await calculateAllVehiclePrices();
      } catch {}
    };
    const timer = setTimeout(run, 400);
    return () => {
      clearTimeout(timer);
    };
  }, [pickupCoords?.lat, pickupCoords?.lng, destinationCoords?.lat, destinationCoords?.lng, selectedVehicle]);

  const findOffers = async () => {
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
          payment_method: 'cash',
          offered_fare: currentFare,
          recommended_fare:
            Number(fareDetails?.base_price || fareDetails?.total_fare || 0) || undefined,
          fare_estimate_id: fareDetails?.estimate_id || undefined,
          trip_type: 'intra',
          preferred_driver_id: requestedDriverId || undefined,
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

  const pollForDriver = (id: string | null) => {
    if (!id) return;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${BACKEND_URL}/api/trips/${id}/status`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (data.success && ['accepted', 'arrived', 'ongoing'].includes(data.status) && data.driver_info) {
          clearInterval(interval);
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
            payment_method: 'cash',
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
        clearInterval(interval);
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
              payment_method: 'cash',
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
    }, 3000);
  };

  const cancelSearch = async () => {
    await cancelPendingTrip(tripId);
    setSearchingForDriver(false);
    setDriverFound(null);
    setTripId(null);
  };
  const veh = selectedVehicle ? VEHICLES.find(v => v.id === selectedVehicle) : null;

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

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* MAP SECTION */}
      <View style={s.mapArea}>
        <View style={s.mapPlaceholder}>
          <Ionicons name="map" size={56} color={COLORS.dim} />
          <Text style={s.mapText}>
            {pickupCoords && destinationCoords ? `${fareDetails?.distance_km?.toFixed(1) || '—'} km route` : 'Select locations to view route'}
          </Text>
        </View>

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
          {/* Vehicle */}
          <TouchableOpacity style={[s.vehicleCard, !veh && s.vehicleCardPrompt]} onPress={() => setShowVehicleModal(true)} accessibilityLabel="Select vehicle type" accessibilityRole="button">
            <View style={[s.vehIcon, { backgroundColor: (veh?.color || COLORS.dim) + '20' }]}>
              <Ionicons name={(veh?.icon || 'car') as any} size={24} color={veh?.color || COLORS.dim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.vehName, !veh && { color: COLORS.muted }]}>{veh ? veh.name : 'Select Vehicle Type'}</Text>
              <Text style={s.vehDesc}>{veh ? `${veh.time} • ${veh.desc}` : 'Tap to choose Standard, Comfort, XL or Premium'}</Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={veh ? COLORS.muted : COLORS.green} />
          </TouchableOpacity>

          {/* Fare / Calculate */}
          {currentFare > 0 ? (
            <View style={s.fareSection}>
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
              <TouchableOpacity style={s.findBtn} onPress={findOffers} disabled={isLoading} accessibilityLabel="Find ride offers" accessibilityRole="button">
                <LinearGradient colors={[COLORS.lime, '#9CD900']} style={s.btnGrad}>
                  {isLoading ? <ActivityIndicator color={COLORS.bg} /> : <Text style={s.findBtnText}>Find offers</Text>}
                </LinearGradient>
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
              onChangeText={(text) => { editingField === 'pickup' ? setPickup(text) : setDestination(text); }}
              onPlaceSelected={async (loc) => {
                const details = await fetchPlaceDetails(loc.placeId);
                const desc = details?.description || loc.description;
                const coords = details ? { lat: details.lat, lng: details.lng } : null;
                if (editingField === 'pickup') {
                  setPickup(desc);
                  if (coords) setPickupCoords(coords);
                } else {
                  setDestination(desc);
                  if (coords) setDestinationCoords(coords);
                }
                setShowLocationModal(false);
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
            {VEHICLES.map(v => (
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
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>{driverFound.rating?.toFixed(1)}</Text>
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
  sheet: { flex: 1, backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, paddingTop: 8 },
  sheetContent: { padding: 20, paddingBottom: 40 },
  vehicleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 20, padding: 16, marginBottom: 16, gap: 12 },
  vehicleCardPrompt: { borderWidth: 1.5, borderColor: COLORS.green, borderStyle: 'dashed' },
  vehIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  vehName: { fontSize: 16, fontWeight: '800', color: COLORS.white },
  vehDesc: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  fareSection: { gap: 16 },
  fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  fareBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center' },
  fareBtnText: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  fareAmount: { fontSize: 32, fontWeight: '900', color: COLORS.lime },
  findBtn: { borderRadius: 16, overflow: 'hidden' },
  btnGrad: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  findBtnText: { fontSize: 18, fontWeight: '900', color: COLORS.bg },
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
