import React, { useState, useEffect, useRef } from 'react';
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
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import * as Location from 'expo-location';

// Conditionally import MapView only for native platforms
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
}

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  background: '#0B1120',
  cardBg: '#1A2332',
  cardBgLight: '#232F42',
  brandGreen: '#00D46A',
  brandBlue: '#0EA5E9',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  yellow: '#FFB800',
  orange: '#F59E0B',
  red: '#EF4444',
  purple: '#9333EA',
};

const VEHICLE_TYPES = [
  { id: 'economy', name: 'Standard', icon: 'car', color: '#00D46A', time: '4-5 min', desc: 'Affordable fares' },
  { id: 'comfort', name: 'Comfort', icon: 'car-sport', color: '#0EA5E9', time: '5-7 min', desc: 'More space' },
  { id: 'xl', name: 'XL', icon: 'bus', color: '#FFB800', time: '6-8 min', desc: '6 seats' },
  { id: 'premium', name: 'Premium', icon: 'rocket', color: '#9333EA', time: '5-6 min', desc: 'Luxury rides' },
];

export default function BookRideEnhanced() {
  const router = useRouter();
  
  // Location states
  const [selectedCity, setSelectedCity] = useState('');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState<string[]>([]);
  
  // Booking states
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Price adjustment states
  const [calculatedFare, setCalculatedFare] = useState(0);
  const [adjustedFare, setAdjustedFare] = useState(0);
  const [fareDetails, setFareDetails] = useState<any>(null);
  const [showPriceSection, setShowPriceSection] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);
  const [promoCode, setPromoCode] = useState('');

  // GPS detection on mount
  useEffect(() => {
    getCurrentLocationProactive();
  }, []);

  const getCurrentLocationProactive = async () => {
    try {
      setIsGettingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        setIsGettingLocation(false);
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const { latitude, longitude } = location.coords;
      const address = await reverseGeocode(latitude, longitude);
      
      setCurrentLocation({ lat: latitude, lng: longitude, address });
      
      // Auto-detect city
      if (address.toLowerCase().includes('lagos')) {
        setSelectedCity('Lagos, Nigeria');
      } else if (address.toLowerCase().includes('abuja')) {
        setSelectedCity('Abuja, Nigeria');
      }
      
      setIsGettingLocation(false);
    } catch (error) {
      console.error('GPS Error:', error);
      setIsGettingLocation(false);
    }
  };

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
      return `${lat}, ${lng}`;
    }
  };

  const useCurrentLocation = () => {
    if (currentLocation) {
      setPickup(currentLocation.address);
      Alert.alert('📍 Location Set', 'Using your current location as pickup');
    } else {
      getCurrentLocationProactive();
    }
  };

  const detectTripType = () => {
    if (!pickup || !destination) return 'intra';
    
    const pickupLower = pickup.toLowerCase();
    const destLower = destination.toLowerCase();
    
    const pickupInLagos = pickupLower.includes('lagos');
    const destInLagos = destLower.includes('lagos');
    const pickupInAbuja = pickupLower.includes('abuja');
    const destInAbuja = destLower.includes('abuja');
    
    if ((pickupInLagos && destInLagos) || (pickupInAbuja && destInAbuja)) {
      return 'intra';
    }
    
    return 'inter';
  };

  const addStop = () => {
    if (stops.length < 3) {
      setStops([...stops, '']);
    }
  };

  const removeStop = (index: number) => {
    const newStops = stops.filter((_, i) => i !== index);
    setStops(newStops);
  };

  const updateStop = (index: number, value: string) => {
    const newStops = [...stops];
    newStops[index] = value;
    setStops(newStops);
  };

  const handleCalculateFare = async () => {
    if (!selectedCity || selectedCity.trim() === '') {
      Alert.alert('Select City', 'Please select your city first');
      return;
    }
    
    if (!pickup || pickup.trim() === '') {
      Alert.alert('Invalid Pickup', 'Please select a valid pickup location');
      return;
    }
    
    if (!destination || destination.trim() === '') {
      Alert.alert('Invalid Destination', 'Please select a valid destination');
      return;
    }

    if (pickup === destination) {
      Alert.alert('Same Location', 'Pickup and destination cannot be the same');
      return;
    }

    setIsLoading(true);
    try {
      const tripType = detectTripType();
      
      const response = await fetch(`${BACKEND_URL}/api/fares/estimate-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup: pickup,
          destination: destination,
          vehicle_type: selectedVehicle,
          trip_type: tripType,
        }),
      });

      const fareData = await response.json();
      
      if (response.ok && fareData.total_fare) {
        setCalculatedFare(fareData.total_fare);
        setAdjustedFare(fareData.total_fare);
        setFareDetails(fareData);
        setShowPriceSection(true);
        setIsLoading(false);
      } else {
        setIsLoading(false);
        Alert.alert('Error', fareData.detail || 'Could not calculate fare');
      }
    } catch (error) {
      console.error('Fare calculation error:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Could not calculate fare. Please check your connection.');
    }
  };

  const increaseFare = () => {
    const maxFare = calculatedFare * 2;
    setAdjustedFare(prev => Math.min(maxFare, prev + 100));
  };

  const decreaseFare = () => {
    const minFare = calculatedFare * 0.5;
    setAdjustedFare(prev => Math.max(minFare, prev - 100));
  };

  const findOffers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/trips/create-with-custom-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rider_id: 'user_123',
          pickup: pickup,
          destination: destination,
          recommended_fare: calculatedFare,
          offered_fare: adjustedFare,
          vehicle_type: selectedVehicle,
          trip_type: detectTripType(),
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setIsLoading(false);
        Alert.alert(
          '🎯 Finding Drivers!',
          `Your offer of ₦${adjustedFare.toLocaleString()} has been sent to ${result.drivers_notified} nearby drivers!\n\nYou'll be notified when drivers respond.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        setIsLoading(false);
        Alert.alert('Error', 'Could not send offer. Please try again.');
      }
    } catch (error) {
      console.error('Find offers error:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Could not send offer to drivers.');
    }
  };

  const selectedVehicleData = VEHICLE_TYPES.find(v => v.id === selectedVehicle);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={[COLORS.background, '#0F1829']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Book a Ride</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Location Input Section */}
            <View style={styles.locationSection}>
              {/* Enter City */}
              <View style={styles.locationRow}>
                <View style={styles.iconContainer}>
                  <View style={[styles.iconCircle, { backgroundColor: COLORS.yellow }]}>
                    <Ionicons name="business" size={24} color={COLORS.white} />
                  </View>
                </View>
                <View style={styles.locationInputContainer}>
                  <Text style={styles.locationLabel}>ENTER CITY</Text>
                  <LocationAutocomplete
                    placeholder="Lagos, Abuja, Port Harcourt..."
                    value={selectedCity}
                    onChangeText={setSelectedCity}
                    onPlaceSelected={(location) => setSelectedCity(location.description)}
                    apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              {/* Show pickup/destination only after city selected */}
              {selectedCity && (
                <>
                  {/* Pickup Location */}
                  <View style={styles.locationRow}>
                    <View style={styles.iconContainer}>
                      <View style={[styles.iconCircle, { backgroundColor: COLORS.brandGreen }]}>
                        <Ionicons name="location" size={24} color={COLORS.white} />
                      </View>
                      <View style={styles.verticalLine} />
                    </View>
                    <View style={styles.locationInputContainer}>
                      <View style={styles.labelRow}>
                        <Text style={styles.locationLabel}>PICKUP LOCATION</Text>
                        <TouchableOpacity onPress={useCurrentLocation} style={styles.gpsButton}>
                          {isGettingLocation ? (
                            <ActivityIndicator size="small" color={COLORS.brandGreen} />
                          ) : (
                            <>
                              <Ionicons name="navigate" size={16} color={COLORS.brandGreen} />
                              <Text style={styles.gpsText}>GPS</Text>
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
                        placeholderTextColor="#64748B"
                      />
                    </View>
                  </View>

                  {/* Stops */}
                  {stops.map((stop, index) => (
                    <View key={index} style={styles.locationRow}>
                      <View style={styles.iconContainer}>
                        <View style={[styles.iconCircle, { backgroundColor: COLORS.purple }]}>
                          <Text style={styles.stopNumber}>{index + 1}</Text>
                        </View>
                        <View style={styles.verticalLine} />
                      </View>
                      <View style={styles.locationInputContainer}>
                        <View style={styles.labelRow}>
                          <Text style={styles.locationLabel}>STOP {index + 1}</Text>
                          <TouchableOpacity onPress={() => removeStop(index)}>
                            <Ionicons name="close-circle" size={22} color={COLORS.red} />
                          </TouchableOpacity>
                        </View>
                        <LocationAutocomplete
                          placeholder={`Stop ${index + 1} location...`}
                          value={stop}
                          onChangeText={(text) => updateStop(index, text)}
                          onPlaceSelected={(location) => updateStop(index, location.description)}
                          apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                          placeholderTextColor="#64748B"
                        />
                      </View>
                    </View>
                  ))}

                  {/* Add Stop Button */}
                  {stops.length < 3 && (
                    <TouchableOpacity style={styles.addStopButton} onPress={addStop}>
                      <Ionicons name="add-circle" size={24} color={COLORS.brandGreen} />
                      <Text style={styles.addStopText}>Add Stop</Text>
                    </TouchableOpacity>
                  )}

                  {/* Destination */}
                  <View style={styles.locationRow}>
                    <View style={styles.iconContainer}>
                      <View style={[styles.iconCircle, { backgroundColor: COLORS.red }]}>
                        <Ionicons name="flag" size={24} color={COLORS.white} />
                      </View>
                    </View>
                    <View style={styles.locationInputContainer}>
                      <Text style={styles.locationLabel}>DESTINATION</Text>
                      <LocationAutocomplete
                        placeholder="Where are you going?"
                        value={destination}
                        onChangeText={setDestination}
                        onPlaceSelected={(location) => setDestination(location.description)}
                        apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                        placeholderTextColor="#64748B"
                      />
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Promo Code Section - inDrive Style */}
            {selectedCity && (
              <TouchableOpacity style={styles.promoSection}>
                <Ionicons name="pricetag" size={24} color={COLORS.yellow} />
                <Text style={styles.promoText}>Got promo code? Use it here</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}

            {/* Vehicle Selection - BIG Cards */}
            {selectedCity && !showPriceSection && (
              <View style={styles.vehicleSection}>
                <Text style={styles.sectionTitle}>Select Vehicle</Text>
                {VEHICLE_TYPES.map((vehicle) => (
                  <TouchableOpacity
                    key={vehicle.id}
                    style={[
                      styles.vehicleCard,
                      selectedVehicle === vehicle.id && styles.vehicleCardSelected
                    ]}
                    onPress={() => setSelectedVehicle(vehicle.id)}
                  >
                    <View style={[styles.vehicleIconBig, { backgroundColor: vehicle.color + '20' }]}>
                      <Ionicons name={vehicle.icon as any} size={32} color={vehicle.color} />
                    </View>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleName}>{vehicle.name}</Text>
                      <Text style={styles.vehicleTime}>{vehicle.time} • {vehicle.desc}</Text>
                    </View>
                    {selectedVehicle === vehicle.id && (
                      <Ionicons name="checkmark-circle" size={28} color={COLORS.brandGreen} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* PRICE ADJUSTMENT SECTION - inDrive Style */}
            {showPriceSection && (
              <View style={styles.priceSection}>
                {/* Selected Vehicle Display */}
                <View style={styles.selectedVehicleCard}>
                  <View style={[styles.vehicleIconBig, { backgroundColor: selectedVehicleData?.color + '20' }]}>
                    <Ionicons name={selectedVehicleData?.icon as any} size={32} color={selectedVehicleData?.color} />
                  </View>
                  <View style={styles.vehicleInfo}>
                    <Text style={styles.vehicleName}>{selectedVehicleData?.name}</Text>
                    <Text style={styles.vehicleTime}>{selectedVehicleData?.time} • {selectedVehicleData?.desc}</Text>
                  </View>
                </View>

                {/* HUGE PRICE with +/- Buttons - inDrive Style */}
                <View style={styles.priceCard}>
                  <Text style={styles.priceTitle}>NGN{adjustedFare.toLocaleString()}</Text>
                  
                  <View style={styles.priceControls}>
                    <TouchableOpacity 
                      style={styles.priceButtonBig}
                      onPress={decreaseFare}
                    >
                      <Text style={styles.priceButtonText}>−−−</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.priceButtonBig}
                      onPress={increaseFare}
                    >
                      <Text style={styles.priceButtonText}>+++</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={styles.recommendedText}>
                    Recommended fare: NGN{calculatedFare.toLocaleString()}
                  </Text>
                  
                  {adjustedFare !== calculatedFare && (
                    <Text style={styles.differenceText}>
                      {adjustedFare < calculatedFare 
                        ? `${((calculatedFare - adjustedFare) / calculatedFare * 100).toFixed(1)}% below • May take longer`
                        : `${((adjustedFare - calculatedFare) / calculatedFare * 100).toFixed(1)}% above • Faster match!`
                      }
                    </Text>
                  )}
                </View>

                {/* Auto-accept Toggle - inDrive Style */}
                <View style={styles.autoAcceptSection}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="flash" size={22} color={COLORS.yellow} />
                    <Text style={styles.autoAcceptText}>Auto-accept offer of NGN{adjustedFare.toLocaleString()}</Text>
                  </View>
                  <Switch
                    value={autoAccept}
                    onValueChange={setAutoAccept}
                    trackColor={{ false: '#334155', true: COLORS.brandGreen + '60' }}
                    thumbColor={autoAccept ? COLORS.brandGreen : '#64748B'}
                  />
                </View>
              </View>
            )}

            {/* Calculate Fare or Find Offers Button */}
            {selectedCity && (
              <View style={styles.buttonContainer}>
                {!showPriceSection ? (
                  <TouchableOpacity
                    style={styles.mainButton}
                    onPress={handleCalculateFare}
                    disabled={isLoading || !pickup || !destination}
                  >
                    <LinearGradient
                      colors={[COLORS.brandGreen, '#00B455']}
                      style={styles.mainButtonGradient}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={COLORS.white} size="large" />
                      ) : (
                        <Text style={styles.mainButtonText}>Calculate Fare</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.mainButton}
                    onPress={findOffers}
                    disabled={isLoading}
                  >
                    <LinearGradient
                      colors={['#B8F11B', '#8BC F00']}
                      style={styles.mainButtonGradient}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={COLORS.background} size="large" />
                      ) : (
                        <Text style={[styles.mainButtonText, { color: COLORS.background }]}>Find offers</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  mapContainer: {
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  locationSection: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginRight: 16,
    paddingTop: 4,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalLine: {
    width: 3,
    height: 24,
    backgroundColor: COLORS.textMuted,
    marginTop: 8,
  },
  stopNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.white,
  },
  locationInputContainer: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 212, 106, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  gpsText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.brandGreen,
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 106, 0.1)',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: COLORS.brandGreen,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  addStopText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.brandGreen,
    marginLeft: 8,
  },
  promoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  promoText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  vehicleSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 16,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  vehicleCardSelected: {
    borderColor: COLORS.brandGreen,
    backgroundColor: 'rgba(0, 212, 106, 0.08)',
  },
  vehicleIconBig: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
  },
  vehicleTime: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  priceSection: {
    marginBottom: 16,
  },
  selectedVehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
  },
  priceCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  priceTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 24,
    letterSpacing: -1,
  },
  priceControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  priceButtonBig: {
    width: 100,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.cardBgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceButtonText: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.white,
  },
  recommendedText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  differenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.yellow,
    textAlign: 'center',
  },
  autoAcceptSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  autoAcceptText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: 10,
    flex: 1,
  },
  buttonContainer: {
    paddingHorizontal: 0,
  },
  mainButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.brandGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  mainButtonGradient: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButtonText: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
});
