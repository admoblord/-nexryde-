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
import { VoiceAssistantButton } from '@/src/components/VoiceAssistant';
import { VoiceIntent } from '@/src/services/voiceAssistant';

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
  multiplier: number;
  capacity: string;
}

const VEHICLE_OPTIONS: VehicleOption[] = [
  { 
    type: 'economy', 
    name: 'Economy', 
    icon: 'car-outline', 
    description: 'Affordable rides', 
    multiplier: 1.0,
    capacity: '1-4 people'
  },
  { 
    type: 'comfort', 
    name: 'Comfort', 
    icon: 'car-sport-outline', 
    description: 'Extra legroom', 
    multiplier: 1.25,
    capacity: '1-4 people'
  },
  { 
    type: 'suv', 
    name: 'SUV', 
    icon: 'car-sport', 
    description: 'Spacious rides', 
    multiplier: 1.5,
    capacity: '1-6 people'
  },
  { 
    type: 'premium', 
    name: 'Premium', 
    icon: 'car', 
    description: 'Luxury vehicles', 
    multiplier: 2.0,
    capacity: '1-4 people'
  },
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
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

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

  const getRouteDetails = async (
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<{ distance: number; duration: number } | null> => {
    try {
      setIsCalculatingRoute(true);
      
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`
      );
      
      const data = await response.json();
      
      if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
        const element = data.rows[0].elements[0];
        const distanceKm = element.distance.value / 1000;
        const durationHours = element.duration.value / 3600;
        
        setIsCalculatingRoute(false);
        return { distance: distanceKm, duration: durationHours };
      } else {
        setIsCalculatingRoute(false);
        return fallbackDistanceCalculation(originLat, originLng, destLat, destLng);
      }
    } catch (error) {
      console.error('Error calling Google Maps API:', error);
      setIsCalculatingRoute(false);
      return fallbackDistanceCalculation(originLat, originLng, destLat, destLng);
    }
  };

  const fallbackDistanceCalculation = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): { distance: number; duration: number } => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    const duration = distance / 60;
    
    return { distance, duration };
  };

  const calculatePrice = (
    distance: number, 
    vehicleType: VehicleType, 
    rideType: RideType, 
    duration?: number
  ): number => {
    const vehicleMultiplier = VEHICLE_OPTIONS.find(v => v.type === vehicleType)?.multiplier || 1.0;
    
    if (rideType === 'intra_city') {
      const baseFare = 200;
      const perKm = 100;
      const perMinute = 5;
      
      let price = baseFare + (distance * perKm);
      
      if (duration) {
        const minutes = duration * 60;
        price += minutes * perMinute;
      }
      
      return Math.round(price * vehicleMultiplier);
    } else {
      const baseFare = 1000;
      const perKm = 120;
      const perHour = 800;
      
      const hours = duration || (distance / 70);
      const price = baseFare + (distance * perKm) + (hours * perHour);
      
      return Math.round(price * vehicleMultiplier);
    }
  };

  useEffect(() => {
    const pickup = stops.find(s => s.type === 'pickup');
    const dropoff = stops.find(s => s.type === 'dropoff');
    
    if (pickup?.coordinates && dropoff?.coordinates) {
      getRouteDetails(
        pickup.coordinates.latitude,
        pickup.coordinates.longitude,
        dropoff.coordinates.latitude,
        dropoff.coordinates.longitude
      ).then((routeData) => {
        if (routeData) {
          setEstimatedDistance(routeData.distance);
          setEstimatedDuration(routeData.duration);
          
          if (routeData.distance > 50 && subscription?.can_access_intercity) {
            setRideType('inter_city');
          } else if (routeData.distance <= 50) {
            setRideType('intra_city');
          }
        }
      });
    }
  }, [stops, subscription]);

  const searchPlaces = async (query: string) => {
    if (query.length < 2) {
      setPredictions([]);
      return;
    }

    setIsSearching(true);
    try {
      // Use backend proxy instead of calling Google directly
      const locationBias = rideType === 'intra_city' 
        ? `&location_bias=${currentLocation?.latitude || 6.5244},${currentLocation?.longitude || 3.3792}&radius=50000`
        : '';
        
      const response = await fetch(
        `${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(query)}&components=country:ng${locationBias}`
      );
      const data = await response.json();
      
      if (data.predictions) {
        // Format predictions to match expected structure
        const formattedPredictions = data.predictions.map((pred: any) => ({
          place_id: pred.place_id,
          description: pred.description,
          structured_formatting: {
            main_text: pred.main_text,
            secondary_text: pred.secondary_text
          }
        }));
        setPredictions(formattedPredictions);
      }
    } catch (error) {
      console.error('Error searching places:', error);
      Alert.alert('Error', 'Failed to search locations. Please check your internet connection.');
    }
    setIsSearching(false);
  };

  const getPlaceDetails = async (placeId: string): Promise<{
    latitude: number;
    longitude: number;
    address: string;
  } | null> => {
    try {
      // Use backend proxy instead of calling Google directly
      const response = await fetch(
        `${BACKEND_URL}/api/places/details/${placeId}`
      );
      const data = await response.json();
      
      if (data.status === 'OK') {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address,
        };
      }
    } catch (error) {
      console.error('Error getting place details:', error);
      Alert.alert('Error', 'Failed to get location details.');
    }
    return null;
  };

  const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
    try {
      // Use backend proxy instead of calling Google directly
      const response = await fetch(
        `${BACKEND_URL}/api/places/geocode?lat=${latitude}&lng=${longitude}`
      );
      const data = await response.json();
      
      if (data.status === 'OK' && data.address) {
        return data.address;
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
        'Upgrade Required',
        'Inter-city trips are available with Road Warrior subscription. Upgrade now to unlock city-to-city rides!',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Upgrade', 
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
    const pickup = stops.find(s => s.type === 'pickup');
    const dropoff = stops.find(s => s.type === 'dropoff');
    
    if (pickup?.coordinates && dropoff?.coordinates) {
      const estimatedPrice = calculatePrice(
        estimatedDistance || 0, 
        selectedVehicle, 
        rideType,
        estimatedDuration || undefined
      );
      
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

  const handleVoiceCommand = async (intent: VoiceIntent, params?: any) => {
    if (intent === 'book_ride' && params?.destination) {
      try {
        // Use backend proxy instead of calling Google directly
        const response = await fetch(
          `${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(
            params.destination
          )}&components=country:ng`
        );
        const data = await response.json();
        
        if (data.predictions && data.predictions.length > 0) {
          const placeDetails = await getPlaceDetails(data.predictions[0].place_id);
          
          if (placeDetails) {
            setStops(stops.map(stop =>
              stop.type === 'dropoff'
                ? {
                    ...stop,
                    address: placeDetails.address,
                    coordinates: {
                      latitude: placeDetails.latitude,
                      longitude: placeDetails.longitude,
                    },
                  }
                : stop
            ));
            
            Alert.alert(
              'Destination Set',
              `Destination set to ${placeDetails.address}`,
              [{ text: 'OK' }]
            );
          }
        }
      } catch (error) {
        console.error('Error processing voice destination:', error);
        Alert.alert('Error', 'Failed to process voice command.');
      }
    }
  };

  // LOCATION SELECTION SCREEN
  if (step === 'location') {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Plan your ride</Text>
            <View style={styles.headerRight} />
          </View>

          {/* Ride Type Selector */}
          <View style={styles.rideTypeContainer}>
            <TouchableOpacity
              style={[styles.rideTypeButton, rideType === 'intra_city' && styles.rideTypeButtonActive]}
              onPress={() => handleRideTypeChange('intra_city')}
            >
              <Text style={[styles.rideTypeText, rideType === 'intra_city' && styles.rideTypeTextActive]}>
                Within City
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rideTypeButton, rideType === 'inter_city' && styles.rideTypeButtonActive]}
              onPress={() => handleRideTypeChange('inter_city')}
            >
              <Text style={[styles.rideTypeText, rideType === 'inter_city' && styles.rideTypeTextActive]}>
                City to City
              </Text>
              {!subscription?.can_access_intercity && (
                <Ionicons name="lock-closed" size={14} color="#999" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Location Input Card */}
            <View style={styles.locationCard}>
              {/* Pickup */}
              <TouchableOpacity
                style={styles.locationInputRow}
                onPress={() => openLocationPicker('1')}
              >
                <View style={styles.iconContainer}>
                  <View style={styles.pickupDot} />
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Pickup Location</Text>
                  <Text style={[styles.inputValue, !stops[0].address && styles.inputPlaceholder]}>
                    {stops[0].address || 'Choose a pickup location'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.dividerLine} />

              {/* Dropoff */}
              <TouchableOpacity
                style={styles.locationInputRow}
                onPress={() => openLocationPicker('2')}
              >
                <View style={styles.iconContainer}>
                  <View style={styles.dropoffDot} />
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Dropoff Location</Text>
                  <Text style={[styles.inputValue, !stops[1].address && styles.inputPlaceholder]}>
                    {stops[1].address || 'Choose a destination'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Route Info */}
            {isCalculatingRoute && (
              <View style={styles.routeInfoCard}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={styles.routeInfoText}>Calculating route...</Text>
              </View>
            )}
            
            {!isCalculatingRoute && estimatedDistance !== null && (
              <View style={styles.routeInfoCard}>
                <View style={styles.routeInfoRow}>
                  <Ionicons name="navigate-outline" size={16} color="#666" />
                  <Text style={styles.routeInfoText}>
                    {estimatedDistance.toFixed(1)} km • {' '}
                    {estimatedDuration !== null && (
                      estimatedDuration < 1 
                        ? `${Math.round(estimatedDuration * 60)} min`
                        : `${estimatedDuration.toFixed(1)} hr`
                    )}
                  </Text>
                </View>
                <Text style={styles.routeInfoSubtext}>Based on current traffic</Text>
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
              <Text style={[styles.continueButtonText, !canContinue && styles.continueButtonTextDisabled]}>
                Choose vehicle
              </Text>
            </TouchableOpacity>
          </View>

          {/* Voice Assistant Button */}
          <VoiceAssistantButton 
            onCommand={handleVoiceCommand}
            position="bottom-right"
            userType="rider"
          />

          {/* Location Search Modal */}
          <Modal
            visible={showMapPicker}
            animationType="slide"
            presentationStyle="fullScreen"
          >
            <SafeAreaView style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <TouchableOpacity 
                  style={styles.modalBackButton}
                  onPress={() => {
                    setShowMapPicker(false);
                    setSearchQuery('');
                    setPredictions([]);
                  }}
                >
                  <Ionicons name="arrow-back" size={24} color="#000" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {activeStopId === '1' ? 'Pickup location' : 'Dropoff location'}
                </Text>
                <View style={{ width: 40 }} />
              </View>

              <View style={styles.searchContainer}>
                <View style={styles.searchInputContainer}>
                  <Ionicons name="search" size={20} color="#999" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search for a location"
                    placeholderTextColor="#999"
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
                      <Ionicons name="close-circle" size={20} color="#999" />
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
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Ionicons name="locate" size={20} color="#000" />
                  )}
                </View>
                <Text style={styles.currentLocationText}>Use current location</Text>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>

              {isSearching && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#000" />
                </View>
              )}

              <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
                {predictions.map((prediction) => (
                  <TouchableOpacity
                    key={prediction.place_id}
                    style={styles.resultItem}
                    onPress={() => handleSelectPrediction(prediction)}
                  >
                    <View style={styles.resultIconContainer}>
                      <Ionicons name="location-outline" size={20} color="#666" />
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
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => setStep('location')}
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Choose a ride</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Trip Summary */}
          <View style={styles.tripSummary}>
            <View style={styles.tripRoute}>
              <View style={styles.tripDotContainer}>
                <View style={styles.pickupDot} />
              </View>
              <Text style={styles.tripAddress} numberOfLines={1}>
                {stops[0].address}
              </Text>
            </View>
            <View style={styles.tripConnector} />
            <View style={styles.tripRoute}>
              <View style={styles.tripDotContainer}>
                <View style={styles.dropoffDot} />
              </View>
              <Text style={styles.tripAddress} numberOfLines={1}>
                {stops[1].address}
              </Text>
            </View>
          </View>

          {/* Vehicle Options */}
          <View style={styles.vehiclesSection}>
            {VEHICLE_OPTIONS.map((vehicle) => {
              const price = calculatePrice(
                estimatedDistance || 0, 
                vehicle.type, 
                rideType,
                estimatedDuration || undefined
              );
              const isSelected = selectedVehicle === vehicle.type;
              
              return (
                <TouchableOpacity
                  key={vehicle.type}
                  style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                  onPress={() => setSelectedVehicle(vehicle.type)}
                >
                  <View style={styles.vehicleLeft}>
                    <View style={styles.vehicleIconCircle}>
                      <Ionicons 
                        name={vehicle.icon as any} 
                        size={24} 
                        color="#000" 
                      />
                    </View>
                    <View style={styles.vehicleInfo}>
                      <View style={styles.vehicleHeader}>
                        <Text style={styles.vehicleName}>{vehicle.name}</Text>
                        {estimatedDuration !== null && (
                          <Text style={styles.vehicleEta}>
                            {estimatedDuration < 1 
                              ? `${Math.round(estimatedDuration * 60)} min`
                              : `${estimatedDuration.toFixed(1)} hr`
                            }
                          </Text>
                        )}
                      </View>
                      <Text style={styles.vehicleDesc}>{vehicle.description}</Text>
                      <Text style={styles.vehicleCapacity}>{vehicle.capacity}</Text>
                    </View>
                  </View>
                  <View style={styles.vehicleRight}>
                    <Text style={styles.vehiclePrice}>₦{price.toLocaleString()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Confirm Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirmRide}
          >
            <Text style={styles.confirmButtonText}>
              Request {VEHICLE_OPTIONS.find(v => v.type === selectedVehicle)?.name}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  rideTypeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  rideTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  rideTypeButtonActive: {
    backgroundColor: '#000',
  },
  rideTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  rideTypeTextActive: {
    color: '#FFF',
  },
  locationCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  locationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000',
  },
  dropoffDot: {
    width: 10,
    height: 10,
    backgroundColor: '#000',
  },
  inputContainer: {
    flex: 1,
    marginLeft: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
    marginBottom: 4,
  },
  inputValue: {
    fontSize: 15,
    fontWeight: '400',
    color: '#000',
  },
  inputPlaceholder: {
    color: '#CCC',
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 44,
  },
  routeInfoCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
  },
  routeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  routeInfoSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  bottomContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  continueButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  continueButtonTextDisabled: {
    color: '#999',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  searchContainer: {
    padding: 16,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
  },
  currentLocationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    marginLeft: 12,
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
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  resultIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultContent: {
    flex: 1,
    marginLeft: 12,
  },
  resultMain: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    marginBottom: 2,
  },
  resultSecondary: {
    fontSize: 13,
    color: '#666',
  },
  // Vehicle selection styles
  tripSummary: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
  },
  tripRoute: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripDotContainer: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripConnector: {
    width: 2,
    height: 16,
    backgroundColor: '#DDD',
    marginLeft: 11,
    marginVertical: 4,
  },
  tripAddress: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: '#000',
    marginLeft: 12,
  },
  vehiclesSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  vehicleCardSelected: {
    borderColor: '#000',
    backgroundColor: '#F8F8F8',
  },
  vehicleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  vehicleIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: {
    flex: 1,
    marginLeft: 12,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  vehicleEta: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  vehicleDesc: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  vehicleCapacity: {
    fontSize: 12,
    color: '#999',
  },
  vehicleRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  vehiclePrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  confirmButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
