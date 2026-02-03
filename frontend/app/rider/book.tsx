import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
  TextInput,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';

// Conditional import for Google Places Autocomplete
let GooglePlacesAutocomplete: any;
if (Platform.OS !== 'web') {
  GooglePlacesAutocomplete = require('react-native-google-places-autocomplete').GooglePlacesAutocomplete;
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY';

// UNIFIED COLORS
const COLORS = {
  background: '#121212',
  cardBg: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  yellow: '#FFB600',
  green: '#22E180',
  purple: '#A259FF',
  red: '#F85D50',
};

// VEHICLE TYPES - UNIFIED
const CAR_TYPES = [
  { 
    id: 'economy', 
    name: 'Economy', 
    desc: 'Affordable rides',
    capacity: '4 seats',
    icon: 'bicycle',
    color: COLORS.yellow,
  },
  { 
    id: 'comfort', 
    name: 'Comfort', 
    desc: 'Extra space & comfort',
    capacity: '4 seats',
    icon: 'car',
    color: COLORS.green,
  },
  { 
    id: 'premium', 
    name: 'Premium', 
    desc: 'Luxury vehicles',
    capacity: '4 seats',
    icon: 'diamond',
    color: COLORS.purple,
  },
  { 
    id: 'xl', 
    name: 'XL', 
    desc: 'Group rides',
    capacity: '6 seats',
    icon: 'bus',
    color: COLORS.yellow,
  },
];

interface Stop {
  id: string;
  location: string;
}

export default function BookingScreen() {
  const router = useRouter();
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedCar, setSelectedCar] = useState('economy');
  const [fareEstimate, setFareEstimate] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [tripType, setTripType] = useState<'intra' | 'inter'>('intra');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  
  const pickupRef = useRef<any>();
  const destRef = useRef<any>();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const carPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();

    // Car pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(carPulse, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(carPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Get Current Location
  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable location access');
        setIsGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address && address.length > 0) {
        const addr = address[0];
        const formattedAddress = [addr.street, addr.city || addr.subregion, addr.region, 'Nigeria']
          .filter(Boolean)
          .join(', ');
        setPickup(formattedAddress);
        Alert.alert('✅ Location Detected', `${formattedAddress}`);
      }
    } catch (error) {
      Alert.alert('Location Error', 'Unable to get your location');
    } finally {
      setIsGettingLocation(false);
    }
  };

  // Add/Remove/Update Stops
  const addStop = () => {
    setStops([...stops, { id: `stop-${Date.now()}`, location: '' }]);
  };

  const removeStop = (stopId: string) => {
    setStops(stops.filter(stop => stop.id !== stopId));
  };

  const updateStop = (stopId: string, location: string) => {
    setStops(stops.map(stop => stop.id === stopId ? { ...stop, location } : stop));
  };

  // Calculate Fare
  useEffect(() => {
    if (pickup.trim() && destination.trim() && pickup.trim().length > 2 && destination.trim().length > 2) {
      const timer = setTimeout(() => calculateFare(), 800);
      return () => clearTimeout(timer);
    } else {
      setFareEstimate(null);
    }
  }, [pickup, destination, selectedCar, tripType, stops]);

  const calculateFare = async () => {
    setIsCalculating(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/fares/estimate-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup, destination, vehicle_type: selectedCar, trip_type: tripType,
          stops: stops.map(s => s.location).filter(l => l.trim()),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setFareEstimate(data);
      }
    } catch (error) {
      console.error('Error calculating fare:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleBookRide = () => {
    if (!pickup.trim() || !destination.trim()) {
      Alert.alert('Missing Information', 'Please enter pickup and destination');
      return;
    }
    router.push({
      pathname: '/rider/tracking',
      params: {
        pickup, destination, stops: JSON.stringify(stops), carType: selectedCar,
        estimatedFare: fareEstimate?.total_fare || 0,
        distance: fareEstimate?.distance || 0,
        duration: fareEstimate?.duration || 0
      }
    });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* HEADER - BOLD */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Available Rides</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 3D MAP WITH CARS */}
          <Animated.View style={[styles.mapSection, { opacity: fadeAnim }]}>
            <View style={styles.mapContainer}>
              <View style={styles.mapBuildings}>
                {/* Buildings */}
                <View style={[styles.building, { height: 70, width: 80, backgroundColor: '#2A2A2A', left: 30, top: 40 }]} />
                <View style={[styles.building, { height: 90, width: 70, backgroundColor: '#2F2F2F', left: 120, top: 30 }]} />
                <View style={[styles.building, { height: 60, width: 60, backgroundColor: '#353535', right: 90, top: 50 }]} />
                <View style={[styles.building, { height: 80, width: 75, backgroundColor: '#2D2D2D', right: 30, bottom: 60 }]} />
                
                {/* Yellow route line */}
                <View style={styles.routeLine} />
                
                {/* ANIMATED CARS ON MAP */}
                <Animated.View style={[styles.carOnMap, { transform: [{ scale: carPulse }], left: '25%', top: '45%' }]}>
                  <Ionicons name="car" size={24} color={COLORS.yellow} />
                </Animated.View>
                <Animated.View style={[styles.carOnMap, { transform: [{ scale: carPulse }], right: '30%', bottom: '40%' }]}>
                  <Ionicons name="car" size={24} color={COLORS.green} />
                </Animated.View>
                <Animated.View style={[styles.carOnMap, { transform: [{ scale: carPulse }], left: '60%', top: '30%' }]}>
                  <Ionicons name="car" size={20} color={COLORS.purple} />
                </Animated.View>
                
                {/* Your location marker */}
                <View style={styles.locationMarker}>
                  <Ionicons name="location" size={24} color={COLORS.red} />
                  <Text style={styles.locationLabel}>Your Location</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* OPTIONS CONTAINER */}
          <View style={styles.optionsContainer}>
            {/* TRIP TYPE - BOLD */}
            <View style={styles.tripTypeRow}>
              <TouchableOpacity
                style={[styles.tripTypeBtn, tripType === 'intra' && styles.tripTypeBtnActive]}
                onPress={() => setTripType('intra')}
              >
                <Text style={[styles.tripTypeText, tripType === 'intra' && styles.tripTypeTextActive]}>
                  Within City
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tripTypeBtn, tripType === 'inter' && styles.tripTypeBtnActive]}
                onPress={() => setTripType('inter')}
              >
                <Text style={[styles.tripTypeText, tripType === 'inter' && styles.tripTypeTextActive]}>
                  Intercity
                </Text>
              </TouchableOpacity>
            </View>

            {/* LOCATION INPUTS - UNIFIED CARD */}
            <View style={styles.locationCard}>
              {/* Quick Actions Row */}
              <View style={styles.quickActionsRow}>
                <TouchableOpacity 
                  style={[styles.quickActionBtn, { backgroundColor: COLORS.green + '20' }]}
                  onPress={getCurrentLocation}
                  disabled={isGettingLocation}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.green + '30' }]}>
                    {isGettingLocation ? (
                      <ActivityIndicator size="small" color={COLORS.green} />
                    ) : (
                      <Ionicons name="locate" size={18} color={COLORS.green} />
                    )}
                  </View>
                  <Text style={styles.quickActionText}>
                    {isGettingLocation ? 'Detecting...' : 'Use GPS'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.quickActionBtn, { backgroundColor: COLORS.purple + '20' }]}
                  onPress={() => router.push('/rider/voice-booking' as any)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.purple + '30' }]}>
                    <Ionicons name="mic" size={18} color={COLORS.purple} />
                  </View>
                  <Text style={styles.quickActionText}>Voice</Text>
                </TouchableOpacity>
              </View>

              {/* Pickup */}
              <View style={styles.locationInputRow}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.green }]} />
                <View style={styles.inputWrapper}>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={styles.input}
                      placeholder="Pickup location"
                      placeholderTextColor={COLORS.textSecondary}
                      value={pickup}
                      onChangeText={setPickup}
                    />
                  ) : (
                    <GooglePlacesAutocomplete
                      ref={pickupRef}
                      placeholder='Pickup location'
                      minLength={2}
                      fetchDetails={true}
                      onPress={(data) => setPickup(data.description)}
                      query={{ key: GOOGLE_MAPS_API_KEY, language: 'en', components: 'country:ng' }}
                      styles={{ textInput: styles.input }}
                      textInputProps={{ placeholderTextColor: COLORS.textSecondary }}
                      enablePoweredByContainer={false}
                      nearbyPlacesAPI="GooglePlacesSearch"
                      debounce={300}
                    />
                  )}
                </View>
              </View>

              {/* Stops */}
              {stops.map((stop, index) => (
                <View key={stop.id}>
                  <View style={styles.locationInputRow}>
                    <View style={[styles.locationDot, { backgroundColor: COLORS.yellow }]} />
                    <View style={styles.inputWrapper}>
                      {Platform.OS === 'web' ? (
                        <TextInput
                          style={styles.input}
                          placeholder={`Stop ${index + 1}`}
                          placeholderTextColor={COLORS.textSecondary}
                          value={stop.location}
                          onChangeText={(text) => updateStop(stop.id, text)}
                        />
                      ) : (
                        <GooglePlacesAutocomplete
                          placeholder={`Stop ${index + 1}`}
                          minLength={2}
                          fetchDetails={true}
                          onPress={(data) => updateStop(stop.id, data.description)}
                          query={{ key: GOOGLE_MAPS_API_KEY, language: 'en', components: 'country:ng' }}
                          styles={{ textInput: styles.input }}
                          textInputProps={{ placeholderTextColor: COLORS.textSecondary }}
                          enablePoweredByContainer={false}
                          nearbyPlacesAPI="GooglePlacesSearch"
                          debounce={300}
                        />
                      )}
                    </View>
                    <TouchableOpacity onPress={() => removeStop(stop.id)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Destination */}
              <View style={styles.locationInputRow}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.red }]} />
                <View style={styles.inputWrapper}>
                  {Platform.OS === 'web' ? (
                    <TextInput
                      style={styles.input}
                      placeholder="Where to?"
                      placeholderTextColor={COLORS.textSecondary}
                      value={destination}
                      onChangeText={setDestination}
                    />
                  ) : (
                    <GooglePlacesAutocomplete
                      ref={destRef}
                      placeholder='Where to?'
                      minLength={2}
                      fetchDetails={true}
                      onPress={(data) => { setDestination(data.description); Keyboard.dismiss(); }}
                      query={{ key: GOOGLE_MAPS_API_KEY, language: 'en', components: 'country:ng' }}
                      styles={{ textInput: styles.input }}
                      textInputProps={{ placeholderTextColor: COLORS.textSecondary }}
                      enablePoweredByContainer={false}
                      nearbyPlacesAPI="GooglePlacesSearch"
                      debounce={300}
                    />
                  )}
                </View>
              </View>

              {/* Add Stop - BOLD */}
              {stops.length < 3 && (
                <TouchableOpacity style={styles.addStopBtn} onPress={addStop}>
                  <Ionicons name="add-circle-outline" size={20} color={COLORS.yellow} />
                  <Text style={styles.addStopText}>Add Stop</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* VEHICLE SELECTION - UNIFIED & BOLD */}
            <Text style={styles.sectionTitle}>Choose Vehicle</Text>
            {CAR_TYPES.map((car) => (
              <TouchableOpacity
                key={car.id}
                style={[
                  styles.vehicleCard,
                  selectedCar === car.id && styles.vehicleCardActive
                ]}
                onPress={() => setSelectedCar(car.id)}
                activeOpacity={0.8}
              >
                <View style={styles.vehicleLeft}>
                  <View style={[styles.vehicleIcon, { backgroundColor: car.color + '20' }]}>
                    <Ionicons name={car.icon as any} size={32} color={car.color} />
                  </View>
                  <View>
                    <Text style={styles.vehicleName}>{car.name}</Text>
                    <Text style={styles.vehicleDesc}>{car.desc}</Text>
                    <Text style={styles.vehicleCapacity}>{car.capacity}</Text>
                  </View>
                </View>
                <View style={styles.vehicleRight}>
                  {isCalculating ? (
                    <ActivityIndicator size="small" color={COLORS.green} />
                  ) : fareEstimate ? (
                    <>
                      <Text style={styles.vehiclePrice}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
                      {selectedCar === car.id && (
                        <View style={styles.selectedBadge}>
                          <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
                        </View>
                      )}
                    </>
                  ) : (
                    <Text style={styles.vehiclePriceEmpty}>--</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {/* TRIP SUMMARY - BOLD */}
            {fareEstimate && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Trip Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Distance</Text>
                  <Text style={styles.summaryValue}>{fareEstimate.distance_km?.toFixed(1)} km</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Estimated Time</Text>
                  <Text style={styles.summaryValue}>{fareEstimate.duration_min?.toFixed(0)} min</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total Fare</Text>
                  <Text style={styles.summaryTotalValue}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* CONFIRM BUTTON - BOLD & UNIFIED */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.confirmBtn, (!pickup || !destination) && styles.confirmBtnDisabled]}
            onPress={handleBookRide}
            disabled={!pickup || !destination}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={(!pickup || !destination) ? ['#4A5568', '#2D3748'] : [COLORS.green, '#00D98C']}
              style={styles.confirmGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.confirmText}>
                {fareEstimate 
                  ? `Confirm ${CAR_TYPES.find(c => c.id === selectedCar)?.name}` 
                  : 'Enter Locations'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scheduleBtn}>
            <Ionicons name="calendar" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },

  // HEADER - BOLD
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.red,
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },

  // 3D MAP WITH CARS
  mapSection: {
    height: 250,
    marginBottom: 0,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    position: 'relative',
  },
  mapBuildings: {
    flex: 1,
    position: 'relative',
  },
  building: {
    position: 'absolute',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  routeLine: {
    position: 'absolute',
    bottom: '30%',
    left: '20%',
    right: '20%',
    height: 4,
    backgroundColor: COLORS.yellow,
    borderRadius: 2,
    shadowColor: COLORS.yellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  carOnMap: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  locationMarker: {
    position: 'absolute',
    bottom: '25%',
    left: '18%',
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 11,
    color: COLORS.red,
    fontWeight: '800',
    marginTop: 2,
  },

  // OPTIONS CONTAINER
  optionsContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // TRIP TYPE - BOLD
  tripTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  tripTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
  },
  tripTypeBtnActive: {
    backgroundColor: COLORS.green,
  },
  tripTypeText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  tripTypeTextActive: {
    color: COLORS.text,
  },

  // LOCATION CARD - UNIFIED
  locationCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 8,
  },
  quickActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  locationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 10,
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  inputWrapper: {
    flex: 1,
  },
  input: {
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 8,
    fontWeight: '700',
  },
  removeBtn: {
    padding: 4,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingTop: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.background,
    marginTop: 8,
  },
  addStopText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.yellow,
    letterSpacing: 0.3,
  },

  // SECTION TITLE - BOLD
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },

  // VEHICLE CARDS - UNIFIED & BOLD
  vehicleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  vehicleCardActive: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.green,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  vehicleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 3,
    letterSpacing: -0.3,
  },
  vehicleDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginBottom: 3,
  },
  vehicleCapacity: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  vehicleRight: {
    alignItems: 'flex-end',
  },
  vehiclePrice: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  vehiclePriceEmpty: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  selectedBadge: {
    marginTop: 4,
  },

  // SUMMARY - BOLD
  summaryCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.background,
    marginVertical: 12,
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  summaryTotalValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.green,
    letterSpacing: -0.5,
  },

  // BOTTOM BAR - BOLD
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: COLORS.background,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBg,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  confirmBtnDisabled: {
    shadowOpacity: 0.2,
  },
  confirmGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  scheduleBtn: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
