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

// Conditional import for Google Places Autocomplete (only on native)
let GooglePlacesAutocomplete: any;
if (Platform.OS !== 'web') {
  GooglePlacesAutocomplete = require('react-native-google-places-autocomplete').GooglePlacesAutocomplete;
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY';

// VIBRANT COLORFUL PREMIUM DESIGN
const COLORS = {
  dark: '#0A0E27',
  cyan: '#00F5FF',
  magenta: '#FF006E',
  purple: '#8338EC',
  gold: '#FFBE0B',
  mint: '#06FFA5',
  blue: '#0084FF',
  text: '#FFFFFF',
  textDark: '#0A0E27',
  textSecondary: '#A0AEC0',
  cardBg: 'rgba(255, 255, 255, 0.08)',
};

// COLORFUL CAR TYPES - VIBRANT GRADIENTS
const CAR_TYPES = [
  { 
    id: 'economy', 
    name: 'Economy', 
    desc: 'Affordable rides',
    capacity: '4 seats',
    gradient: ['#00F5FF', '#0084FF'],
    icon: 'car-sport',
  },
  { 
    id: 'comfort', 
    name: 'Comfort', 
    desc: 'Extra space',
    capacity: '4 seats',
    gradient: ['#FF006E', '#FF4589'],
    icon: 'car',
  },
  { 
    id: 'premium', 
    name: 'Premium', 
    desc: 'Luxury vehicles',
    capacity: '4 seats',
    gradient: ['#8338EC', '#A855F7'],
    icon: 'car-sport-outline',
  },
  { 
    id: 'xl', 
    name: 'XL', 
    desc: 'Group rides',
    capacity: '6 seats',
    gradient: ['#FFBE0B', '#FB8500'],
    icon: 'bus',
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

  // Add Stop
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

  // Auto-calculate fare
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
      {/* FUTURISTIC DARK GRADIENT */}
      <LinearGradient
        colors={['#0A0E27', '#151B3D', '#1E2749']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* COLORFUL HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <LinearGradient
              colors={[COLORS.cyan, COLORS.blue]}
              style={styles.backGradient}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Your Ride</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* COLORFUL TRIP TYPE SELECTOR */}
          <View style={styles.tripTypeContainer}>
            <TouchableOpacity
              style={[styles.tripTypeBtn]}
              onPress={() => setTripType('intra')}
            >
              <LinearGradient
                colors={tripType === 'intra' ? [COLORS.cyan, COLORS.blue] : ['transparent', 'transparent']}
                style={styles.tripTypeGradient}
              >
                <Ionicons name="location" size={18} color="#FFFFFF" />
                <Text style={styles.tripTypeText}>Within City</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tripTypeBtn]}
              onPress={() => setTripType('inter')}
            >
              <LinearGradient
                colors={tripType === 'inter' ? [COLORS.magenta, '#FF4589'] : ['transparent', 'transparent']}
                style={styles.tripTypeGradient}
              >
                <Ionicons name="airplane" size={18} color="#FFFFFF" />
                <Text style={styles.tripTypeText}>Intercity</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* LOCATION INPUTS - GLASSMORPHISM */}
          <View style={styles.locationCard}>
            <View style={styles.locationCardHeader}>
              <LinearGradient
                colors={[COLORS.cyan, COLORS.blue]}
                style={styles.headerIcon}
              >
                <Ionicons name="navigate-circle" size={20} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.locationCardTitle}>Route Details</Text>
            </View>

            {/* Pickup */}
            <View style={styles.locationRow}>
              <View style={[styles.locationDot, { backgroundColor: COLORS.mint }]} />
              <View style={styles.inputWrapper}>
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
                  <View style={[styles.locationDot, { backgroundColor: COLORS.gold }]} />
                  <View style={styles.inputWrapper}>
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
                    style={styles.removeBtn}
                  >
                    <Ionicons name="close-circle" size={22} color={COLORS.magenta} />
                  </TouchableOpacity>
                </View>
                <View style={styles.verticalLine} />
              </View>
            ))}

            {/* Destination */}
            <View style={styles.locationRow}>
              <View style={[styles.locationDot, { backgroundColor: COLORS.magenta }]} />
              <View style={styles.inputWrapper}>
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

            {/* Add Stop Button - Colorful */}
            {stops.length < 3 && (
              <TouchableOpacity style={styles.addStopBtn} onPress={addStop}>
                <LinearGradient
                  colors={[COLORS.gold, '#FB8500']}
                  style={styles.addStopGradient}
                >
                  <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.addStopText}>Add stop</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* VIBRANT CAR SELECTION */}
          <View style={styles.carSection}>
            <Text style={styles.sectionTitle}>Select Vehicle</Text>
            {CAR_TYPES.map((car) => (
              <TouchableOpacity
                key={car.id}
                onPress={() => setSelectedCar(car.id)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={selectedCar === car.id ? car.gradient : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.05)']}
                  style={styles.carCard}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View style={styles.carLeft}>
                    <View style={[styles.carIconBg, selectedCar === car.id && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                      <Ionicons 
                        name={car.icon as any} 
                        size={26} 
                        color={selectedCar === car.id ? "#FFFFFF" : COLORS.textSecondary} 
                      />
                    </View>
                    <View style={styles.carInfo}>
                      <Text style={[styles.carName, selectedCar === car.id && { color: '#FFFFFF' }]}>
                        {car.name}
                      </Text>
                      <Text style={[styles.carDesc, selectedCar === car.id && { color: 'rgba(255,255,255,0.9)' }]}>
                        {car.desc} • {car.capacity}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.carRight}>
                    {isCalculating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : fareEstimate ? (
                      <Text style={[styles.carPrice, selectedCar === car.id && { color: '#FFFFFF' }]}>
                        ₦{fareEstimate.total_fare?.toLocaleString()}
                      </Text>
                    ) : (
                      <Text style={styles.carPriceEmpty}>--</Text>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>

          {/* FARE BREAKDOWN - GLASSMORPHISM */}
          {fareEstimate && (
            <View style={styles.fareCard}>
              <LinearGradient
                colors={['rgba(0, 245, 255, 0.1)', 'rgba(131, 56, 236, 0.1)']}
                style={styles.fareGradient}
              >
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Distance</Text>
                  <Text style={styles.fareValue}>{fareEstimate.distance_km?.toFixed(1)} km</Text>
                </View>
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Time</Text>
                  <Text style={styles.fareValue}>{fareEstimate.duration_min?.toFixed(0)} min</Text>
                </View>
                <View style={styles.fareDivider} />
                <View style={styles.fareRow}>
                  <Text style={styles.fareTotalLabel}>Total Fare</Text>
                  <Text style={styles.fareTotalValue}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
                </View>
              </LinearGradient>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* COLORFUL BOOK BUTTON */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={[styles.bookButton]}
            onPress={handleBookRide}
            disabled={!pickup || !destination}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={(!pickup || !destination) ? ['#4A5568', '#2D3748'] : [COLORS.cyan, COLORS.blue, COLORS.purple]}
              style={styles.bookButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.bookButtonText}>
                {fareEstimate ? `Book - ₦${fareEstimate.total_fare?.toLocaleString()}` : 'Book Ride'}
              </Text>
              <Ionicons name="arrow-forward-circle" size={24} color="#FFFFFF" />
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
    paddingVertical: 12,
  },
  backButton: {
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  backGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // TRIP TYPE
  tripTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  tripTypeBtn: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tripTypeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    backgroundColor: COLORS.cardBg,
  },
  tripTypeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },

  // LOCATION CARD
  locationCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  verticalLine: {
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 6,
    marginVertical: 4,
  },
  inputWrapper: {
    flex: 1,
  },
  input: {
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 12,
    fontWeight: '600',
  },
  removeBtn: {
    padding: 4,
  },
  addStopBtn: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  addStopGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  addStopText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // CAR SECTION
  carSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  carCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  carLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  carIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carInfo: {
    flex: 1,
  },
  carName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  carDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  carRight: {
    alignItems: 'flex-end',
  },
  carPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  carPriceEmpty: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },

  // FARE CARD
  fareCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fareGradient: {
    padding: 20,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fareLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  fareValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '700',
  },
  fareDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  fareTotalLabel: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '800',
  },
  fareTotalValue: {
    fontSize: 20,
    color: COLORS.text,
    fontWeight: '900',
  },

  // BOOK BUTTON
  bottomContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  bookButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  bookButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
