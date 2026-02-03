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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// Conditional import for Google Places Autocomplete (only on native)
let GooglePlacesAutocomplete: any;
if (Platform.OS !== 'web') {
  GooglePlacesAutocomplete = require('react-native-google-places-autocomplete').GooglePlacesAutocomplete;
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY';

// PREMIUM USA STYLE - Navy Blue/Gold Luxury Color Scheme
const COLORS = {
  primary: '#1B2B4D',        // Deep Navy Blue
  secondary: '#D4AF37',      // Luxury Gold
  accent: '#3A5A8C',         // Medium Navy
  background: '#F8F9FB',     // Light background
  cardBg: '#FFFFFF',         // Pure white cards
  text: '#1B2B4D',           // Navy text
  textSecondary: '#64748B',  // Slate gray
  border: '#E2E8F0',         // Light border
  success: '#059669',        // Green
  error: '#DC2626',          // Red
};

// PREMIUM CAR TYPES - Clean, Professional, No Emojis
const CAR_TYPES = [
  { 
    id: 'economy', 
    name: 'Economy', 
    desc: 'Affordable rides',
    capacity: '4 seats',
    eta: '3 min',
  },
  { 
    id: 'comfort', 
    name: 'Comfort', 
    desc: 'Extra space',
    capacity: '4 seats',
    eta: '5 min',
  },
  { 
    id: 'premium', 
    name: 'Premium', 
    desc: 'Luxury vehicles',
    capacity: '4 seats',
    eta: '8 min',
  },
  { 
    id: 'xl', 
    name: 'XL', 
    desc: 'Group rides',
    capacity: '6 seats',
    eta: '6 min',
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
  
  const pickupRef = useRef<any>();
  const destRef = useRef<any>();

  // Add Stop functionality
  const addStop = () => {
    const newStop: Stop = {
      id: `stop-${Date.now()}`,
      location: '',
    };
    setStops([...stops, newStop]);
  };

  // Remove Stop
  const removeStop = (stopId: string) => {
    setStops(stops.filter(stop => stop.id !== stopId));
  };

  // Update Stop location
  const updateStop = (stopId: string, location: string) => {
    setStops(stops.map(stop => 
      stop.id === stopId ? { ...stop, location } : stop
    ));
  };

  // Auto-calculate fare when locations are entered
  useEffect(() => {
    if (pickup.trim() && destination.trim() && pickup.trim().length > 2 && destination.trim().length > 2) {
      const timer = setTimeout(() => {
        calculateFare();
      }, 800);
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
          pickup: pickup,
          destination: destination,
          vehicle_type: selectedCar,
          trip_type: tripType,
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
    if (!pickup.trim()) {
      Alert.alert('Pickup Required', 'Please enter your pickup location');
      return;
    }
    if (!destination.trim()) {
      Alert.alert('Destination Required', 'Please enter your destination');
      return;
    }

    router.push({
      pathname: '/rider/tracking',
      params: {
        pickup,
        destination,
        stops: JSON.stringify(stops),
        carType: selectedCar,
        estimatedFare: fareEstimate?.total_fare || 0,
        distance: fareEstimate?.distance || 0,
        duration: fareEstimate?.duration || 0
      }
    });
  };

  const selectedCarData = CAR_TYPES.find(c => c.id === selectedCar);

  return (
    <View style={styles.container}>
      {/* Premium Navy Blue Gradient Background */}
      <LinearGradient
        colors={['#F8F9FB', '#EFF3F8']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Minimal Premium Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book a Ride</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trip Type Selector - Minimalist */}
          <View style={styles.tripTypeContainer}>
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

          {/* Location Inputs - Premium Card */}
          <View style={styles.locationCard}>
            {/* Pickup Location */}
            <View style={styles.locationRow}>
              <View style={styles.iconContainer}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.success }]} />
              </View>
              <View style={styles.inputContainer}>
                {Platform.OS === 'web' ? (
                  <TextInput
                    style={styles.input}
                    placeholder="Pickup location"
                    placeholderTextColor={COLORS.textSecondary}
                    value={pickup}
                    onChangeText={setPickup}
                    returnKeyType="next"
                  />
                ) : (
                  <GooglePlacesAutocomplete
                    ref={pickupRef}
                    placeholder='Pickup location'
                    minLength={2}
                    fetchDetails={true}
                    onPress={(data, details = null) => {
                      setPickup(data.description);
                    }}
                    query={{
                      key: GOOGLE_MAPS_API_KEY,
                      language: 'en',
                      components: 'country:ng',
                    }}
                    styles={{
                      textInput: styles.input,
                      listView: styles.autocompleteList,
                    }}
                    textInputProps={{
                      placeholderTextColor: COLORS.textSecondary,
                      returnKeyType: 'next',
                    }}
                    enablePoweredByContainer={false}
                    nearbyPlacesAPI="GooglePlacesSearch"
                    debounce={300}
                  />
                )}
              </View>
            </View>

            <View style={styles.verticalLine} />

            {/* Stops */}
            {stops.map((stop, index) => (
              <View key={stop.id}>
                <View style={styles.locationRow}>
                  <View style={styles.iconContainer}>
                    <View style={[styles.locationDot, { backgroundColor: COLORS.secondary }]} />
                  </View>
                  <View style={styles.inputContainer}>
                    {Platform.OS === 'web' ? (
                      <TextInput
                        style={styles.input}
                        placeholder={`Stop ${index + 1}`}
                        placeholderTextColor={COLORS.textSecondary}
                        value={stop.location}
                        onChangeText={(text) => updateStop(stop.id, text)}
                        returnKeyType="next"
                      />
                    ) : (
                      <GooglePlacesAutocomplete
                        placeholder={`Stop ${index + 1}`}
                        minLength={2}
                        fetchDetails={true}
                        onPress={(data, details = null) => {
                          updateStop(stop.id, data.description);
                        }}
                        query={{
                          key: GOOGLE_MAPS_API_KEY,
                          language: 'en',
                          components: 'country:ng',
                        }}
                        styles={{
                          textInput: styles.input,
                          listView: styles.autocompleteList,
                        }}
                        textInputProps={{
                          placeholderTextColor: COLORS.textSecondary,
                          returnKeyType: 'next',
                        }}
                        enablePoweredByContainer={false}
                        nearbyPlacesAPI="GooglePlacesSearch"
                        debounce={300}
                      />
                    )}
                  </View>
                  <TouchableOpacity 
                    onPress={() => removeStop(stop.id)}
                    style={styles.removeStopBtn}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
                <View style={styles.verticalLine} />
              </View>
            ))}

            {/* Destination Location */}
            <View style={styles.locationRow}>
              <View style={styles.iconContainer}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.error }]} />
              </View>
              <View style={styles.inputContainer}>
                {Platform.OS === 'web' ? (
                  <TextInput
                    style={styles.input}
                    placeholder="Where to?"
                    placeholderTextColor={COLORS.textSecondary}
                    value={destination}
                    onChangeText={setDestination}
                    returnKeyType="done"
                  />
                ) : (
                  <GooglePlacesAutocomplete
                    ref={destRef}
                    placeholder='Where to?'
                    minLength={2}
                    fetchDetails={true}
                    onPress={(data, details = null) => {
                      setDestination(data.description);
                      Keyboard.dismiss();
                    }}
                    query={{
                      key: GOOGLE_MAPS_API_KEY,
                      language: 'en',
                      components: 'country:ng',
                    }}
                    styles={{
                      textInput: styles.input,
                      listView: styles.autocompleteList,
                    }}
                    textInputProps={{
                      placeholderTextColor: COLORS.textSecondary,
                      returnKeyType: 'done',
                    }}
                    enablePoweredByContainer={false}
                    nearbyPlacesAPI="GooglePlacesSearch"
                    debounce={300}
                  />
                )}
              </View>
            </View>

            {/* Add Stop Button */}
            {stops.length < 3 && (
              <TouchableOpacity style={styles.addStopBtn} onPress={addStop}>
                <Ionicons name="add-circle-outline" size={20} color={COLORS.secondary} />
                <Text style={styles.addStopText}>Add stop</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Premium Car Selection */}
          <View style={styles.carSection}>
            <Text style={styles.sectionTitle}>Select Vehicle</Text>
            {CAR_TYPES.map((car) => (
              <TouchableOpacity
                key={car.id}
                style={[
                  styles.carCard,
                  selectedCar === car.id && styles.carCardActive
                ]}
                onPress={() => setSelectedCar(car.id)}
              >
                <View style={styles.carInfo}>
                  <Text style={styles.carName}>{car.name}</Text>
                  <Text style={styles.carDesc}>{car.desc}</Text>
                  <View style={styles.carMeta}>
                    <Text style={styles.carMetaText}>
                      <Ionicons name="people-outline" size={14} color={COLORS.textSecondary} /> {car.capacity}
                    </Text>
                    <Text style={styles.carMetaText}>
                      <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} /> {car.eta}
                    </Text>
                  </View>
                </View>
                <View style={styles.carPricing}>
                  {isCalculating ? (
                    <ActivityIndicator size="small" color={COLORS.secondary} />
                  ) : fareEstimate ? (
                    <Text style={styles.carPrice}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
                  ) : (
                    <Text style={styles.carPriceEstimate}>Enter route</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Fare Breakdown - If available */}
          {fareEstimate && (
            <View style={styles.fareCard}>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Distance</Text>
                <Text style={styles.fareValue}>{fareEstimate.distance_km?.toFixed(1)} km</Text>
              </View>
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>Estimated time</Text>
                <Text style={styles.fareValue}>{fareEstimate.duration_min?.toFixed(0)} min</Text>
              </View>
              <View style={styles.fareDivider} />
              <View style={styles.fareRow}>
                <Text style={styles.fareTotalLabel}>Total Fare</Text>
                <Text style={styles.fareTotalValue}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
              </View>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Premium Book Button - Fixed Bottom */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={[
              styles.bookButton,
              (!pickup || !destination) && styles.bookButtonDisabled
            ]}
            onPress={handleBookRide}
            disabled={!pickup || !destination}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.accent]}
              style={styles.bookButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.bookButtonText}>
                {fareEstimate ? `Book Ride - ₦${fareEstimate.total_fare?.toLocaleString()}` : 'Book Ride'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
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
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  
  // Trip Type Selector
  tripTypeContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tripTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tripTypeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  tripTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tripTypeTextActive: {
    color: '#FFFFFF',
  },

  // Location Card - Premium
  locationCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  verticalLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.border,
    marginLeft: 15,
    marginVertical: 4,
  },
  inputContainer: {
    flex: 1,
    marginLeft: 12,
  },
  input: {
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 12,
    fontWeight: '500',
  },
  autocompleteList: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    marginTop: 8,
  },
  removeStopBtn: {
    marginLeft: 8,
    padding: 4,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  addStopText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.secondary,
    marginLeft: 8,
  },

  // Car Selection - Premium
  carSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  carCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  carCardActive: {
    borderColor: COLORS.secondary,
    backgroundColor: '#FFFBF0',
  },
  carInfo: {
    flex: 1,
  },
  carName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  carDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  carMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  carMetaText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  carPricing: {
    alignItems: 'flex-end',
  },
  carPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
  },
  carPriceEstimate: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // Fare Breakdown
  fareCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fareLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  fareValue: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '600',
  },
  fareDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  fareTotalLabel: {
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: '700',
  },
  fareTotalValue: {
    fontSize: 20,
    color: COLORS.primary,
    fontWeight: '700',
  },

  // Book Button - Premium
  bottomContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  bookButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  bookButtonDisabled: {
    opacity: 0.5,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 8,
  },
  bookButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
