import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// NEXRYDE BRAND COLORS FROM LOGO
const COLORS = {
  brandGreen: '#00D46A',
  brandBlue: '#4A90E2',
  darkBg: '#1A1F2E',
  cardBg: '#252B3D',
  white: '#FFFFFF',
  lightGray: '#E8EEF5',
  textPrimary: '#FFFFFF',
  textSecondary: '#A8B3C5',
};

const VEHICLE_TYPES = [
  { id: 'economy', name: 'Standard', icon: 'car', color: COLORS.brandGreen, desc: 'Affordable rides' },
  { id: 'comfort', name: 'Comfort', icon: 'car-sport', color: COLORS.brandBlue, desc: 'Extra comfort' },
  { id: 'xl', name: 'XL', icon: 'bus', color: '#FFB800', desc: 'More space' },
  { id: 'premium', name: 'Premium', icon: 'rocket', color: '#9333EA', desc: 'Luxury ride' },
];

const TRIP_TYPES = [
  { id: 'intra', label: 'Intra-City', desc: 'Within Lagos', icon: 'business' },
  { id: 'inter', label: 'Inter-City', desc: 'Lagos to other cities', icon: 'airplane' },
];

export default function BookRideScreen() {
  const router = useRouter();
  const [selectedCity, setSelectedCity] = useState('');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState<string[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // PROACTIVE GPS: Auto-detect location when screen loads
  useEffect(() => {
    getCurrentLocationProactive();
  }, []);
  
  // Get user's current GPS location - VERY PROACTIVE
  const getCurrentLocationProactive = async () => {
    try {
      setIsGettingLocation(true);
      
      // Request location permissions with high accuracy
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Location Permission', 'Please enable location services for accurate pickup detection');
        setIsGettingLocation(false);
        return;
      }
      
      // Get current position with HIGH ACCURACY
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High, // Very accurate GPS
      });
      
      const { latitude, longitude } = location.coords;
      
      // Reverse geocode to get address
      const address = await reverseGeocode(latitude, longitude);
      
      setCurrentLocation({
        lat: latitude,
        lng: longitude,
        address: address
      });
      
      // Auto-detect city from address
      if (address.toLowerCase().includes('lagos')) {
        setSelectedCity('Lagos, Nigeria');
      } else if (address.toLowerCase().includes('abuja')) {
        setSelectedCity('Abuja, Nigeria');
      } else if (address.toLowerCase().includes('port harcourt')) {
        setSelectedCity('Port Harcourt, Nigeria');
      }
      
      setIsGettingLocation(false);
    } catch (error) {
      console.error('GPS Error:', error);
      setIsGettingLocation(false);
    }
  };
  
  // Reverse geocode coordinates to address using Google Maps
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
      
      return `${lat}, ${lng}`;
    } catch (error) {
      console.error('Reverse geocode error:', error);
      return `${lat}, ${lng}`;
    }
  };
  
  // Use GPS location for pickup
  const useCurrentLocation = () => {
    if (currentLocation) {
      setPickup(currentLocation.address);
      Alert.alert('📍 Location Set', 'Using your current location as pickup');
    } else {
      Alert.alert('Getting Location', 'Please wait while we detect your exact location...');
      getCurrentLocationProactive();
    }
  };
  
  // Auto-detect trip type based on pickup and destination cities
  const detectTripType = () => {
    if (!pickup || !destination) return 'intra';
    
    const pickupLower = pickup.toLowerCase();
    const destLower = destination.toLowerCase();
    
    // Check if both are in Lagos
    const pickupInLagos = pickupLower.includes('lagos');
    const destInLagos = destLower.includes('lagos');
    
    // Check if both are in Abuja
    const pickupInAbuja = pickupLower.includes('abuja');
    const destInAbuja = destLower.includes('abuja');
    
    // If both in same city, it's intra-city
    if ((pickupInLagos && destInLagos) || (pickupInAbuja && destInAbuja)) {
      return 'intra';
    }
    
    // If different cities or one going to another city, it's inter-city
    return 'inter';
  };

  const addStop = () => {
    if (stops.length < 3) {
      setStops([...stops, '']);
    } else {
      Alert.alert('Maximum Stops', 'You can add up to 3 stops only');
    }
  };

  const removeStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const updateStop = (index: number, value: string) => {
    const newStops = [...stops];
    newStops[index] = value;
    setStops(newStops);
  };

  const handleConfirmBooking = async () => {
    // Validate city selection
    if (!selectedCity || selectedCity.trim() === '') {
      Alert.alert('Select City', 'Please select your city first');
      return;
    }
    
    // Validate inputs
    if (!pickup || pickup.trim() === '' || pickup.toLowerCase().includes('null')) {
      Alert.alert('Invalid Pickup', 'Please select a valid pickup location from the suggestions');
      return;
    }
    
    if (!destination || destination.trim() === '' || destination.toLowerCase().includes('null')) {
      Alert.alert('Invalid Destination', 'Please select a valid destination from the suggestions');
      return;
    }

    if (pickup === destination) {
      Alert.alert('Same Location', 'Pickup and destination cannot be the same');
      return;
    }

    setIsLoading(true);
    try {
      // Auto-detect trip type based on locations
      const tripType = detectTripType();
      
      const response = await fetch(`${BACKEND_URL}/api/fares/estimate-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup: pickup,
          destination: destination,
          vehicle_type: selectedVehicle,  // economy, comfort, xl, premium
          trip_type: tripType,  // auto-detected: intra or inter
        }),
      });

      const fareData = await response.json();
      
      if (response.ok && fareData.total_fare) {
        const tripTypeLabel = tripType === 'intra' ? '🏙️ Intra-City' : '🛣️ Inter-City';
        Alert.alert(
          '🚗 Confirm Booking',
          `${tripTypeLabel}\nVehicle: ${VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.name}\n\nFrom: ${pickup}\n\nTo: ${destination}\n\nFare: ₦${fareData.total_fare.toFixed(2)}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Book Now', onPress: () => {
              Alert.alert('✅ Success', 'Searching for nearby drivers...');
              router.back();
            }}
          ]
        );
      } else {
        Alert.alert('Error', fareData.detail || 'Could not calculate fare. Please ensure both locations are valid and try again.');
      }
    } catch (error) {
      console.error('Fare calculation error:', error);
      Alert.alert('Error', 'Could not calculate fare. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[COLORS.darkBg, '#2A3348']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book a Ride</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          {/* Location Cards */}
          <View style={styles.locationsContainer}>
            {/* City Selection Card - FIRST */}
            <View style={styles.locationCard}>
              <View style={styles.locationIconContainer}>
                <View style={[styles.iconCircle, { backgroundColor: '#FFB800' }]}>
                  <Ionicons name="business" size={20} color={COLORS.white} />
                </View>
                <View style={styles.verticalLine} />
              </View>
              
              <View style={styles.locationInput}>
                <Text style={styles.locationLabel}>ENTER CITY</Text>
                <LocationAutocomplete
                  placeholder="Lagos, Abuja, Port Harcourt..."
                  value={selectedCity}
                  onChangeText={setSelectedCity}
                  onPlaceSelected={(location) => setSelectedCity(location.description)}
                  apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                  placeholderTextColor="#A8B3C5"
                />
              </View>
            </View>

            {/* Show pickup/destination only after city is selected */}
            {selectedCity && (
              <>
                {/* Pickup Card with GPS Button */}
                <View style={[styles.locationCard, { marginTop: -10 }]}>
                  <View style={styles.locationIconContainer}>
                    <View style={[styles.iconCircle, { backgroundColor: COLORS.brandGreen }]}>
                      <Ionicons name="location" size={20} color={COLORS.white} />
                    </View>
                    <View style={styles.verticalLine} />
                  </View>
                  
                  <View style={styles.locationInput}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={styles.locationLabel}>PICKUP LOCATION</Text>
                      <TouchableOpacity 
                        onPress={useCurrentLocation}
                        style={styles.gpsButton}
                        disabled={isGettingLocation}
                      >
                        {isGettingLocation ? (
                          <ActivityIndicator size="small" color={COLORS.brandGreen} />
                        ) : (
                          <>
                            <Ionicons name="navigate" size={16} color={COLORS.brandGreen} />
                            <Text style={styles.gpsButtonText}>Use GPS</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                    <LocationAutocomplete
                      placeholder="Enter pickup location..."
                      value={pickup}
                      onChangeText={setPickup}
                      onPlaceSelected={(location) => setPickup(location.description)}
                      apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                      placeholderTextColor="#A8B3C5"
                    />
                  </View>
                </View>

                {/* STOPS - Dynamic Stop Addition */}
                {stops.map((stop, index) => (
                  <View key={index} style={[styles.locationCard, { marginTop: -10 }]}>
                    <View style={styles.locationIconContainer}>
                      <View style={[styles.iconCircle, { backgroundColor: '#9333EA' }]}>
                        <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 14 }}>
                          {index + 1}
                        </Text>
                      </View>
                      {index < stops.length - 1 && <View style={styles.verticalLine} />}
                    </View>
                    
                    <View style={styles.locationInput}>
                      <View style={styles.stopHeader}>
                        <Text style={styles.locationLabel}>STOP {index + 1}</Text>
                        <TouchableOpacity onPress={() => removeStop(index)}>
                          <Ionicons name="close-circle" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                      <LocationAutocomplete
                        placeholder={`Enter stop ${index + 1} location...`}
                        value={stop}
                        onChangeText={(text) => updateStop(index, text)}
                        onPlaceSelected={(location) => updateStop(index, location.description)}
                        apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                        placeholderTextColor="#A8B3C5"
                      />
                    </View>
                  </View>
                ))}

                {/* Add Stop Button */}
                {stops.length < 3 && (
                  <TouchableOpacity
                    style={styles.addStopButton}
                    onPress={addStop}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={COLORS.brandGreen} />
                    <Text style={styles.addStopText}>Add Stop</Text>
                  </TouchableOpacity>
                )}

                {/* Destination Card */}
                <View style={[styles.locationCard, { marginTop: -10 }]}>
                  <View style={styles.locationIconContainer}>
                    <View style={[styles.iconCircle, { backgroundColor: COLORS.brandBlue }]}>
                      <Ionicons name="flag" size={20} color={COLORS.white} />
                    </View>
                  </View>
                  
                  <View style={styles.locationInput}>
                    <Text style={styles.locationLabel}>DESTINATION</Text>
                    <LocationAutocomplete
                      placeholder="Where are you going?"
                      value={destination}
                      onChangeText={setDestination}
                      onPlaceSelected={(location) => setDestination(location.description)}
                      apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                      placeholderTextColor="#A8B3C5"
                    />
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Vehicle Types - Only show when city is selected */}
          {selectedCity && (
            <View style={styles.vehicleSection}>
              <Text style={styles.sectionTitle}>Select Vehicle</Text>
              <View style={styles.vehicleGrid}>
                {VEHICLE_TYPES.map((vehicle) => (
                  <TouchableOpacity
                    key={vehicle.id}
                    style={[
                      styles.vehicleCard,
                      selectedVehicle === vehicle.id && styles.vehicleCardSelected
                    ]}
                    onPress={() => setSelectedVehicle(vehicle.id)}
                  >
                    <View style={[styles.vehicleIcon, { backgroundColor: vehicle.color + '20' }]}>
                      <Ionicons name={vehicle.icon as any} size={28} color={vehicle.color} />
                    </View>
                    <Text style={styles.vehicleName}>{vehicle.name}</Text>
                    {selectedVehicle === vehicle.id && (
                      <View style={styles.checkmark}>
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.brandGreen} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* BID A RIDE - Big Alternative Option */}
              <TouchableOpacity
                style={styles.bidRideButton}
                onPress={() => router.push('/rider/bid')}
              >
                <LinearGradient
                  colors={['#F59E0B', '#EF4444']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.bidRideGradient}
                >
                  <Ionicons name="pricetag" size={26} color={COLORS.white} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.bidRideTitle}>💰 Bid a Ride</Text>
                    <Text style={styles.bidRideSubtitle}>Name your price and negotiate</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={28} color={COLORS.white} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Book Button - Only show when city is selected */}
          {selectedCity && (
            <TouchableOpacity
              style={styles.bookButton}
              onPress={handleConfirmBooking}
              disabled={isLoading || !pickup || !destination}
            >
              <LinearGradient
                colors={[COLORS.brandGreen, COLORS.brandBlue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bookGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Text style={styles.bookButtonText}>Confirm Booking</Text>
                    <Ionicons name="arrow-forward-circle" size={24} color={COLORS.white} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 26, // BIGGER from 20
    fontWeight: '800',
    color: COLORS.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  locationsContainer: {
    marginTop: 20,
  },
  locationCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20, // BIGGER from 16
    padding: 22, // BIGGER from 16
    marginBottom: 0,
    minHeight: 95, // Added for bigger cards
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  locationIconContainer: {
    alignItems: 'center',
    marginRight: 18,
  },
  iconCircle: {
    width: 52, // BIGGER from 40
    height: 52, // BIGGER from 40
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  verticalLine: {
    width: 3, // BIGGER from 2
    height: 30,
    backgroundColor: COLORS.textSecondary,
    marginTop: 6,
  },
  locationInput: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 15, // BIGGER from 11
    fontWeight: '900', // BOLDER from 800
    color: COLORS.textSecondary,
    marginBottom: 12, // More space from 8
    letterSpacing: 1,
  },
  autocompleteContainer: {
    // Autocomplete will render here
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 106, 0.1)',
    borderRadius: 16, // BIGGER from 12
    paddingVertical: 18, // BIGGER from 12
    marginTop: 12, // More space
    marginBottom: 16,
    borderWidth: 3, // BIGGER from 2
    borderColor: COLORS.brandGreen,
    borderStyle: 'dashed',
    minHeight: 65, // Added for bigger button
  },
  addStopText: {
    fontSize: 17, // BIGGER from 14
    fontWeight: '800', // BOLDER from 700
    color: COLORS.brandGreen,
    marginLeft: 10,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 106, 0.2)',
    paddingHorizontal: 14, // BIGGER from 10
    paddingVertical: 10, // BIGGER from 6
    borderRadius: 12, // BIGGER from 8
    gap: 6,
    minHeight: 44, // Touch target
  },
  gpsButtonText: {
    fontSize: 14, // BIGGER from 11
    fontWeight: '800', // BOLDER from 700
    color: COLORS.brandGreen,
  },
  tripTypeSection: {
    marginTop: 24,
  },
  tripTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  tripTypeCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 100,
  },
  tripTypeCardSelected: {
    borderColor: COLORS.brandGreen,
    backgroundColor: 'rgba(0, 212, 106, 0.1)',
  },
  tripTypeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  tripTypeLabelSelected: {
    color: COLORS.brandGreen,
  },
  tripTypeDesc: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  tripTypeCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  vehicleSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 22, // BIGGER from 18
    fontWeight: '900', // BOLDER from 800
    color: COLORS.white,
    marginBottom: 20, // More space from 16
  },
  vehicleGrid: {
    flexDirection: 'row',
    gap: 14, // BIGGER from 12
  },
  vehicleCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 20, // BIGGER from 16
    padding: 22, // BIGGER from 16
    alignItems: 'center',
    borderWidth: 3, // BIGGER from 2
    borderColor: 'transparent',
    minHeight: 135, // Added for bigger cards
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  vehicleCardSelected: {
    borderColor: COLORS.brandGreen,
    backgroundColor: 'rgba(0, 212, 106, 0.08)',
    transform: [{ scale: 1.05 }], // Slight pop effect
  },
  vehicleIcon: {
    width: 68, // BIGGER from 56
    height: 68, // BIGGER from 56
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12, // More space from 8
  },
  vehicleName: {
    fontSize: 16, // BIGGER from 14
    fontWeight: '800', // BOLDER from 700
    color: COLORS.white,
  },
  checkmark: {
    position: 'absolute',
    top: 10, // Adjusted
    right: 10, // Adjusted
  },
  bookButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    borderRadius: 20, // BIGGER from 16
    overflow: 'hidden',
    minHeight: 68, // BIGGER button from default
    shadowColor: COLORS.brandGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
    shadowColor: COLORS.brandGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  bookGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24, // BIGGER from 18
    gap: 12, // More space from 8
  },
  bookButtonText: {
    fontSize: 20, // BIGGER from 18
    fontWeight: '900', // BOLDER from 800
    color: COLORS.white,
    letterSpacing: 1,
  },
});
