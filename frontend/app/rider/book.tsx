import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Modal,
  Platform,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type RideType = 'intra_city' | 'inter_city';
type VehicleType = 'economy' | 'comfort' | 'premium' | 'suv';

interface RouteStop {
  id: string;
  type: 'pickup' | 'dropoff';
  address: string;
  coordinates?: { latitude: number; longitude: number };
}

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface SubscriptionStatus {
  tier: 'city_rider' | 'road_warrior' | 'none';
  status: 'trial' | 'active' | 'expired';
  can_access_intercity: boolean;
}

interface VehicleOption {
  type: VehicleType;
  name: string;
  icon: string;
  description: string;
  multiplier: number; // Price multiplier relative to base fare
}

const VEHICLE_OPTIONS: VehicleOption[] = [
  { type: 'economy', name: 'Economy', icon: 'car-outline', description: 'Standard cars', multiplier: 1.0 },
  { type: 'comfort', name: 'Comfort', icon: 'car-sport-outline', description: 'Premium comfort', multiplier: 1.25 },
  { type: 'premium', name: 'Premium', icon: 'car', description: 'Luxury sedans', multiplier: 1.5 },
  { type: 'suv', name: 'SUV', icon: 'car-sport', description: 'Large vehicles', multiplier: 1.8 },
];

export default function BookScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [step, setStep] = useState<'location' | 'vehicle'>('location');
  const [rideType, setRideType] = useState<RideType>('intra_city');
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('economy');
  
  const [stops, setStops] = useState<RouteStop[]>([
    { id: '1', type: 'pickup', address: '' },
    { id: '2', type: 'dropoff', address: '' },
  ]);
  
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);

  // Fetch driver subscription status
  useEffect(() => {
    if (user?.id) {
      fetchSubscriptionStatus();
    }
    getCurrentLocation();
  }, [user?.id]);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscription/status/${user?.id}`);
      const data = await response.json();
      setSubscription({
        tier: data.tier || 'none',
        status: data.status || 'expired',
        can_access_intercity: data.tier === 'road_warrior' && (data.status === 'trial' || data.status === 'active'),
      });
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setSubscription({
        tier: 'none',
        status: 'expired',
        can_access_intercity: false,
      });
    }
    setLoadingSubscription(false);
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // ⭐ DYNAMIC PRICING CALCULATION
  const calculatePrice = (distance: number, vehicleType: VehicleType, rideType: RideType): number => {
    if (rideType === 'intra_city') {
      // INTRA-CITY PRICING (within city, max 50km)
      // Base fare: ₦200
      // Per km: ₦100/km
      // Formula: 200 + (distance * 100) * vehicle_multiplier
      const baseFare = 200;
      const perKm = 100;
      const vehicleMultiplier = VEHICLE_OPTIONS.find(v => v.type === vehicleType)?.multiplier || 1.0;
      return Math.round((baseFare + (distance * perKm)) * vehicleMultiplier);
    } else {
      // INTER-CITY PRICING (city to city, 50km+)
      // Base fare: ₦1000
      // Per km: ₦150/km
      // Formula: 1000 + (distance * 150) * vehicle_multiplier
      const baseFare = 1000;
      const perKm = 150;
      const vehicleMultiplier = VEHICLE_OPTIONS.find(v => v.type === vehicleType)?.multiplier || 1.0;
      return Math.round((baseFare + (distance * perKm)) * vehicleMultiplier);
    }
  };

  // Update estimated distance when both pickup and dropoff are set
  useEffect(() => {
    const pickup = stops.find(s => s.type === 'pickup');
    const dropoff = stops.find(s => s.type === 'dropoff');
    
    if (pickup?.coordinates && dropoff?.coordinates) {
      const distance = calculateDistance(
        pickup.coordinates.latitude,
        pickup.coordinates.longitude,
        dropoff.coordinates.latitude,
        dropoff.coordinates.longitude
      );
      setEstimatedDistance(distance);
      
      // Auto-switch to inter-city if distance > 50km
      if (distance > 50 && subscription?.can_access_intercity) {
        setRideType('inter_city');
      } else if (distance <= 50) {
        setRideType('intra_city');
      }
    }
  }, [stops, subscription]);

  const searchPlaces = async (query: string) => {
    if (query.length < 2) {
      setPredictions([]);
      return;
    }

    setIsSearching(true);
    try {
      // Add bias for intra-city or inter-city search
      const locationBias = rideType === 'intra_city' 
        ? `&radius=50000&location=${currentLocation?.latitude || 6.5244},${currentLocation?.longitude || 3.3792}`
        : '&components=country:ng';
        
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          query
        )}${locationBias}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.predictions) {
        setPredictions(data.predictions);
      }
    } catch (error) {
      console.error('Error searching places:', error);
    }
    setIsSearching(false);
  };

  const getPlaceDetails = async (placeId: string): Promise<{
    latitude: number;
    longitude: number;
    address: string;
  } | null> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.result) {
        return {
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
          address: data.result.formatted_address,
        };
      }
    } catch (error) {
      console.error('Error getting place details:', error);
    }
    return null;
  };

  const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    }
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  };

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setIsLoadingLocation(true);
    
    const details = await getPlaceDetails(prediction.place_id);
    if (details && activeStopId) {
      setStops(stops.map(stop =>
        stop.id === activeStopId
          ? {
              ...stop,
              address: details.address,
              coordinates: {
                latitude: details.latitude,
                longitude: details.longitude,
              },
            }
          : stop
      ));
    }
    
    setSearchQuery('');
    setPredictions([]);
    setShowMapPicker(false);
    setActiveStopId(null);
    setIsLoadingLocation(false);
  };

  const useCurrentLocation = async () => {
    if (!currentLocation) await getCurrentLocation();
    
    if (currentLocation) {
      setIsLoadingLocation(true);
      const address = await reverseGeocode(currentLocation.latitude, currentLocation.longitude);
      
      if (activeStopId) {
        setStops(stops.map(stop =>
          stop.id === activeStopId
            ? { ...stop, address, coordinates: currentLocation }
            : stop
        ));
        setActiveStopId(null);
      }
      setIsLoadingLocation(false);
      setShowMapPicker(false);
    }
  };

  const openLocationPicker = (stopId: string) => {
    setActiveStopId(stopId);
    setShowMapPicker(true);
  };

  const handleRideTypeChange = (type: RideType) => {
    if (type === 'inter_city' && !subscription?.can_access_intercity) {
      Alert.alert(
        '🏆 Upgrade to Road Warrior',
        'Inter-city trips are exclusively for Road Warrior subscribers. Upgrade now to unlock unlimited city-to-city rides!',
        [
          { text: 'Maybe Later', style: 'cancel' },
          { 
            text: 'Upgrade Now', 
            onPress: () => router.push('/driver/subscription')
          }
        ]
      );
      return;
    }
    setRideType(type);
  };

  const canContinue = 
    stops.find(s => s.type === 'pickup')?.address && 
    stops.find(s => s.type === 'dropoff')?.address &&
    (rideType === 'intra_city' || subscription?.can_access_intercity);

  const handleContinueToVehicleSelection = () => {
    if (canContinue) {
      // Check if distance matches ride type
      if (estimatedDistance) {
        if (rideType === 'intra_city' && estimatedDistance > 50) {
          Alert.alert(
            'Distance Too Far',
            'This trip is over 50km. Please switch to Inter-City mode or choose a closer destination.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      setStep('vehicle');
    }
  };

  const handleConfirmRide = () => {
    // Navigate to bid screen or find driver screen
    const pickup = stops.find(s => s.type === 'pickup');
    const dropoff = stops.find(s => s.type === 'dropoff');
    
    if (pickup?.coordinates && dropoff?.coordinates) {
      const estimatedPrice = calculatePrice(estimatedDistance || 0, selectedVehicle, rideType);
      
      router.push({
        pathname: '/rider/bid',
        params: {
          pickupLat: pickup.coordinates.latitude,
          pickupLng: pickup.coordinates.longitude,
          pickupAddress: pickup.address,
          dropoffLat: dropoff.coordinates.latitude,
          dropoffLng: dropoff.coordinates.longitude,
          dropoffAddress: dropoff.address,
          suggestedFare: estimatedPrice,
          vehicleType: selectedVehicle,
          rideType: rideType,
        }
      });
    }
  };

  // LOCATION SELECTION SCREEN
  if (step === 'location') {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#F8FAFC', '#EFF6FF', '#F8FAFC']}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => router.back()}
            >
              <Ionicons name="close" size={24} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Book a Ride</Text>
            <View style={styles.headerRight} />
          </View>

          {/* Ride Type Tabs */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, rideType === 'intra_city' && styles.tabActive]}
              onPress={() => handleRideTypeChange('intra_city')}
            >
              <LinearGradient
                colors={rideType === 'intra_city' ? ['#22C55E', '#16A34A'] : ['transparent', 'transparent']}
                style={styles.tabGradient}
              >
                <View style={styles.tabContent}>
                  <Ionicons 
                    name="business" 
                    size={22} 
                    color={rideType === 'intra_city' ? '#FFFFFF' : '#64748B'} 
                  />
                  <View style={styles.tabTextContainer}>
                    <Text style={[styles.tabText, rideType === 'intra_city' && styles.tabTextActive]}>
                      Intra-City
                    </Text>
                    <Text style={[styles.tabSubtext, rideType === 'intra_city' && styles.tabSubtextActive]}>
                      Within city (Max 50km)
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, rideType === 'inter_city' && styles.tabActive]}
              onPress={() => handleRideTypeChange('inter_city')}
            >
              <LinearGradient
                colors={rideType === 'inter_city' ? ['#F59E0B', '#D97706'] : ['transparent', 'transparent']}
                style={styles.tabGradient}
              >
                <View style={styles.tabContent}>
                  <Ionicons 
                    name="navigate" 
                    size={22} 
                    color={rideType === 'inter_city' ? '#FFFFFF' : '#64748B'} 
                  />
                  <View style={styles.tabTextContainer}>
                    <Text style={[styles.tabText, rideType === 'inter_city' && styles.tabTextActive]}>
                      Inter-City
                    </Text>
                    <Text style={[styles.tabSubtext, rideType === 'inter_city' && styles.tabSubtextActive]}>
                      City to city
                    </Text>
                  </View>
                  {!subscription?.can_access_intercity && (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={14} color="#F59E0B" />
                    </View>
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Info Banner */}
            <View style={[styles.infoBanner, { 
              backgroundColor: rideType === 'intra_city' ? '#DCFCE7' : '#FEF3C7' 
            }]}>
              <Ionicons 
                name="information-circle" 
                size={20} 
                color={rideType === 'intra_city' ? '#16A34A' : '#D97706'} 
              />
              <Text style={[styles.infoBannerText, { 
                color: rideType === 'intra_city' ? '#166534' : '#92400E' 
              }]}>
                {rideType === 'intra_city' 
                  ? 'Travel within the same city. Max distance: 50km'
                  : 'Travel between different cities. Road Warrior exclusive!'}
              </Text>
            </View>

            {/* Location Inputs */}
            <View style={styles.locationsCard}>
              {/* Pickup */}
              <TouchableOpacity
                style={styles.locationRow}
                onPress={() => openLocationPicker('1')}
              >
                <View style={styles.locationDot}>
                  <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
                </View>
                <View style={styles.locationInputContainer}>
                  <Text style={styles.locationLabel}>PICKUP LOCATION</Text>
                  <Text style={[
                    styles.locationText,
                    !stops[0].address && styles.locationPlaceholder
                  ]} numberOfLines={1}>
                    {stops[0].address || 'Enter pickup location'}
                  </Text>
                </View>
                <Ionicons name="search" size={20} color="#94A3B8" />
              </TouchableOpacity>

              <View style={styles.locationLine} />

              {/* Dropoff */}
              <TouchableOpacity
                style={styles.locationRow}
                onPress={() => openLocationPicker('2')}
              >
                <View style={styles.locationDot}>
                  <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
                </View>
                <View style={styles.locationInputContainer}>
                  <Text style={styles.locationLabel}>DROP-OFF LOCATION</Text>
                  <Text style={[
                    styles.locationText,
                    !stops[1].address && styles.locationPlaceholder
                  ]} numberOfLines={1}>
                    {stops[1].address || 'Enter destination'}
                  </Text>
                </View>
                <Ionicons name="search" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Distance Display */}
            {estimatedDistance !== null && (
              <View style={styles.distanceCard}>
                <Ionicons name="map-outline" size={20} color="#3B82F6" />
                <Text style={styles.distanceText}>
                  Estimated distance: <Text style={styles.distanceValue}>{estimatedDistance.toFixed(1)} km</Text>
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Continue Button */}
          <View style={styles.bottomContainer}>
            <TouchableOpacity
              style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
              onPress={handleContinueToVehicleSelection}
              disabled={!canContinue}
            >
              <LinearGradient
                colors={canContinue 
                  ? ['#22C55E', '#16A34A'] 
                  : ['#CBD5E1', '#94A3B8']
                }
                style={styles.continueGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[
                  styles.continueText,
                  !canContinue && styles.continueTextDisabled
                ]}>
                  Continue to Vehicle Selection
                </Text>
                <Ionicons 
                  name="arrow-forward-circle" 
                  size={24} 
                  color={canContinue ? '#FFFFFF' : '#64748B'} 
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Location Search Modal */}
          <Modal
            visible={showMapPicker}
            animationType="slide"
            presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          >
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={() => {
                    setShowMapPicker(false);
                    setSearchQuery('');
                    setPredictions([]);
                  }}
                >
                  <Ionicons name="close" size={24} color="#0F172A" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {rideType === 'intra_city' ? 'Search Location' : 'Search City'}
                </Text>
                <View style={{ width: 40 }} />
              </View>

              <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                  <Ionicons name="search" size={20} color="#94A3B8" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder={rideType === 'intra_city' ? 'Search for a place...' : 'Search for a city...'}
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={(text) => {
                      setSearchQuery(text);
                      searchPlaces(text);
                    }}
                    autoFocus
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => {
                      setSearchQuery('');
                      setPredictions([]);
                    }}>
                      <Ionicons name="close-circle" size={20} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Current Location Button */}
              <TouchableOpacity
                style={styles.currentLocationButton}
                onPress={useCurrentLocation}
                disabled={isLoadingLocation}
              >
                <View style={styles.currentLocationIcon}>
                  {isLoadingLocation ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <Ionicons name="locate" size={20} color="#3B82F6" />
                  )}
                </View>
                <Text style={styles.currentLocationText}>Use Current Location</Text>
              </TouchableOpacity>

              {isSearching && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#22C55E" />
                </View>
              )}

              <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                {predictions.map((prediction) => (
                  <TouchableOpacity
                    key={prediction.place_id}
                    style={styles.resultItem}
                    onPress={() => handleSelectPrediction(prediction)}
                  >
                    <View style={styles.resultIcon}>
                      <Ionicons 
                        name={rideType === 'inter_city' ? 'navigate' : 'location-outline'} 
                        size={20} 
                        color="#64748B" 
                      />
                    </View>
                    <View style={styles.resultContent}>
                      <Text style={styles.resultMain}>
                        {prediction.structured_formatting.main_text}
                      </Text>
                      <Text style={styles.resultSecondary}>
                        {prediction.structured_formatting.secondary_text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </SafeAreaView>
          </Modal>
        </SafeAreaView>
      </View>
    );
  }

  // VEHICLE SELECTION SCREEN
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F8FAFC', '#EFF6FF', '#F8FAFC']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setStep('location')}
          >
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Vehicle</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Route Summary */}
          <View style={styles.routeSummaryCard}>
            <View style={styles.routeSummaryRow}>
              <View style={styles.routeSummaryDot}>
                <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
              </View>
              <Text style={styles.routeSummaryText} numberOfLines={1}>
                {stops[0].address}
              </Text>
            </View>
            <View style={styles.routeSummaryLine} />
            <View style={styles.routeSummaryRow}>
              <View style={styles.routeSummaryDot}>
                <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
              </View>
              <Text style={styles.routeSummaryText} numberOfLines={1}>
                {stops[1].address}
              </Text>
            </View>
            {estimatedDistance !== null && (
              <View style={styles.routeSummaryDistance}>
                <Ionicons name="map-outline" size={16} color="#64748B" />
                <Text style={styles.routeSummaryDistanceText}>
                  {estimatedDistance.toFixed(1)} km • {rideType === 'intra_city' ? 'Intra-City' : 'Inter-City'}
                </Text>
              </View>
            )}
          </View>

          {/* Vehicle Options */}
          <View style={styles.vehiclesSection}>
            <Text style={styles.vehiclesSectionTitle}>Choose Your Ride</Text>
            <Text style={styles.vehiclesSectionSubtitle}>Prices based on distance and vehicle type</Text>
            
            {VEHICLE_OPTIONS.map((vehicle) => {
              const price = calculatePrice(estimatedDistance || 0, vehicle.type, rideType);
              const isSelected = selectedVehicle === vehicle.type;
              
              return (
                <TouchableOpacity
                  key={vehicle.type}
                  style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                  onPress={() => setSelectedVehicle(vehicle.type)}
                >
                  <View style={[styles.vehicleIcon, isSelected && styles.vehicleIconSelected]}>
                    <Ionicons 
                      name={vehicle.icon as any} 
                      size={28} 
                      color={isSelected ? '#FFFFFF' : '#64748B'} 
                    />
                  </View>
                  <View style={styles.vehicleInfo}>
                    <Text style={[styles.vehicleName, isSelected && styles.vehicleNameSelected]}>
                      {vehicle.name}
                    </Text>
                    <Text style={[styles.vehicleDesc, isSelected && styles.vehicleDescSelected]}>
                      {vehicle.description}
                    </Text>
                  </View>
                  <View style={styles.vehiclePriceContainer}>
                    <Text style={[styles.vehiclePrice, isSelected && styles.vehiclePriceSelected]}>
                      ₦{price.toLocaleString()}
                    </Text>
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Pricing Info */}
          <View style={styles.pricingInfo}>
            <View style={styles.pricingInfoHeader}>
              <Ionicons name="information-circle-outline" size={20} color="#3B82F6" />
              <Text style={styles.pricingInfoTitle}>How Pricing Works</Text>
            </View>
            <View style={styles.pricingInfoContent}>
              {rideType === 'intra_city' ? (
                <>
                  <Text style={styles.pricingInfoText}>• Base fare: ₦200</Text>
                  <Text style={styles.pricingInfoText}>• Per kilometer: ₦100/km</Text>
                  <Text style={styles.pricingInfoText}>• Comfort: +25% • Premium: +50% • SUV: +80%</Text>
                </>
              ) : (
                <>
                  <Text style={styles.pricingInfoText}>• Base fare: ₦1,000</Text>
                  <Text style={styles.pricingInfoText}>• Per kilometer: ₦150/km</Text>
                  <Text style={styles.pricingInfoText}>• Comfort: +25% • Premium: +50% • SUV: +80%</Text>
                </>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Confirm Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirmRide}
          >
            <LinearGradient
              colors={['#22C55E', '#16A34A']}
              style={styles.confirmGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.confirmText}>
                Confirm Ride • ₦{calculatePrice(estimatedDistance || 0, selectedVehicle, rideType).toLocaleString()}
              </Text>
              <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  tab: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabActive: {
    borderColor: 'transparent',
  },
  tabGradient: {
    padding: 16,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tabTextContainer: {
    flex: 1,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabSubtext: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  tabSubtextActive: {
    color: 'rgba(255,255,255,0.9)',
  },
  lockBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  locationsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationLine: {
    width: 2,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginLeft: 11,
    marginVertical: 8,
  },
  locationInputContainer: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  locationPlaceholder: {
    color: '#CBD5E1',
  },
  distanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  distanceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  distanceValue: {
    fontWeight: '800',
    color: '#3B82F6',
  },
  bottomContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  continueButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  continueTextDisabled: {
    color: '#64748B',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  currentLocationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3B82F6',
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultContent: {
    flex: 1,
  },
  resultMain: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  resultSecondary: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  // Vehicle selection styles
  routeSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  routeSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeSummaryDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeSummaryLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E2E8F0',
    marginLeft: 9,
    marginVertical: 6,
  },
  routeSummaryText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  routeSummaryDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  routeSummaryDistanceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  vehiclesSection: {
    marginBottom: 20,
  },
  vehiclesSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  vehiclesSectionSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 16,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  vehicleCardSelected: {
    borderColor: '#22C55E',
    backgroundColor: '#F0FDF4',
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleIconSelected: {
    backgroundColor: '#22C55E',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  vehicleNameSelected: {
    color: '#166534',
  },
  vehicleDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  vehicleDescSelected: {
    color: '#16A34A',
  },
  vehiclePriceContainer: {
    alignItems: 'flex-end',
  },
  vehiclePrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  vehiclePriceSelected: {
    color: '#16A34A',
  },
  selectedBadge: {
    marginTop: 4,
  },
  pricingInfo: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  pricingInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  pricingInfoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E40AF',
  },
  pricingInfoContent: {
    gap: 6,
  },
  pricingInfoText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  confirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  confirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
