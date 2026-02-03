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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

// Conditional import for Google Places Autocomplete (only on native)
let GooglePlacesAutocomplete: any;
if (Platform.OS !== 'web') {
  GooglePlacesAutocomplete = require('react-native-google-places-autocomplete').GooglePlacesAutocomplete;
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY';

// SHOCKING VIBRANT COLORS - MORE ADDICTIVE
const COLORS = {
  dark: '#0A0E27',
  darkCard: '#151B3D',
  cyan: '#00F5FF',
  magenta: '#FF006E',
  purple: '#8338EC',
  gold: '#FFBE0B',
  mint: '#06FFA5',
  blue: '#0084FF',
  orange: '#FF6B35',
  pink: '#FF69B4',
  text: '#FFFFFF',
  textSecondary: '#A0AEC0',
};

// PREMIUM CAR TYPES WITH SHOCKING GRADIENTS
const CAR_TYPES = [
  { 
    id: 'economy', 
    name: 'Economy', 
    desc: 'Affordable rides',
    capacity: '4',
    eta: '3',
    gradient: ['#00F5FF', '#0084FF', '#0066CC'],
    icon: 'car-sport',
  },
  { 
    id: 'comfort', 
    name: 'Comfort', 
    desc: 'Extra space',
    capacity: '4',
    eta: '5',
    gradient: ['#FF006E', '#FF4589', '#FF69B4'],
    icon: 'car',
  },
  { 
    id: 'premium', 
    name: 'Premium', 
    desc: 'Luxury vehicles',
    capacity: '4',
    eta: '8',
    gradient: ['#8338EC', '#A855F7', '#C084FC'],
    icon: 'diamond',
  },
  { 
    id: 'xl', 
    name: 'XL', 
    desc: 'Group rides',
    capacity: '6',
    eta: '6',
    gradient: ['#FFBE0B', '#FB8500', '#FF6B35'],
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
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  const pickupRef = useRef<any>();
  const destRef = useRef<any>();

  // ADDICTIVE ANIMATIONS
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Smooth entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();

    // Continuous pulse for active elements
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Glow effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

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
      {/* ANIMATED GRADIENT BACKGROUND */}
      <LinearGradient
        colors={['#0A0E27', '#151B3D', '#1E2749', '#2A3B6B']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ANIMATED GLOW CIRCLES */}
      <Animated.View style={[styles.glowCircle, styles.glow1, { opacity: glowOpacity }]} />
      <Animated.View style={[styles.glowCircle, styles.glow2, { opacity: glowOpacity }]} />
      <Animated.View style={[styles.glowCircle, styles.glow3, { opacity: glowOpacity }]} />

      <SafeAreaView style={styles.safeArea}>
        {/* PREMIUM HEADER WITH ANIMATION */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <LinearGradient colors={[COLORS.cyan, COLORS.blue]} style={styles.backGradient}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Your Ride</Text>
          <View style={{ width: 44 }} />
        </Animated.View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* TRIP TYPE SELECTOR - ANIMATED */}
          <Animated.View style={[styles.tripTypeContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity style={styles.tripTypeBtn} onPress={() => setTripType('intra')}>
              <LinearGradient
                colors={tripType === 'intra' ? [COLORS.cyan, COLORS.blue] : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.05)']}
                style={styles.tripTypeGradient}
              >
                <Ionicons name="location" size={18} color="#FFFFFF" />
                <Text style={styles.tripTypeText}>Within City</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tripTypeBtn} onPress={() => setTripType('inter')}>
              <LinearGradient
                colors={tripType === 'inter' ? [COLORS.magenta, COLORS.pink] : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.05)']}
                style={styles.tripTypeGradient}
              >
                <Ionicons name="airplane" size={18} color="#FFFFFF" />
                <Text style={styles.tripTypeText}>Intercity</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* LOCATION CARD - PREMIUM GLASSMORPHISM */}
          <Animated.View style={[styles.locationCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Header */}
            <View style={styles.locationCardHeader}>
              <LinearGradient colors={[COLORS.cyan, COLORS.blue]} style={styles.headerIcon}>
                <Ionicons name="navigate-circle" size={20} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.locationCardTitle}>Route Details</Text>
            </View>

            {/* GPS BUTTON - PULSING ANIMATION */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity 
                style={styles.gpsBtn}
                onPress={getCurrentLocation}
                disabled={isGettingLocation}
              >
                <LinearGradient
                  colors={[COLORS.mint, '#00D98C', '#00C389']}
                  style={styles.gpsBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {isGettingLocation ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="locate" size={18} color="#FFFFFF" />
                  )}
                  <Text style={styles.gpsBtnText}>
                    {isGettingLocation ? 'Detecting...' : 'Use GPS Location'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* VOICE BOOKING - ANIMATED */}
            <TouchableOpacity 
              style={styles.voiceBtn}
              onPress={() => router.push('/rider/voice-booking' as any)}
            >
              <LinearGradient
                colors={[COLORS.purple, '#A855F7', '#C084FC']}
                style={styles.voiceBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="mic" size={18} color="#FFFFFF" />
                <Text style={styles.voiceBtnText}>Voice Booking</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>AI</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Pickup */}
            <View style={styles.locationRow}>
              <Animated.View style={[styles.locationDot, { backgroundColor: COLORS.mint, transform: [{ scale: pulseAnim }] }]} />
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
                    <Ionicons name="close-circle" size={22} color={COLORS.magenta} />
                  </TouchableOpacity>
                </View>
                <View style={styles.verticalLine} />
              </View>
            ))}

            {/* Destination */}
            <View style={styles.locationRow}>
              <Animated.View style={[styles.locationDot, { backgroundColor: COLORS.magenta, transform: [{ scale: pulseAnim }] }]} />
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

            {/* Add Stop Button */}
            {stops.length < 3 && (
              <TouchableOpacity style={styles.addStopBtn} onPress={addStop}>
                <LinearGradient colors={[COLORS.gold, COLORS.orange]} style={styles.addStopGradient}>
                  <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.addStopText}>Add stop</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* VEHICLE SELECTION - SHOCKING DESIGN */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.sectionTitle}>Choose Vehicle</Text>
            {CAR_TYPES.map((car, index) => (
              <Animated.View
                key={car.id}
                style={{
                  transform: [{
                    translateY: slideAnim.interpolate({
                      inputRange: [0, 30],
                      outputRange: [0, 30 + (index * 10)],
                    })
                  }]
                }}
              >
                <TouchableOpacity
                  onPress={() => setSelectedCar(car.id)}
                  activeOpacity={0.85}
                  style={styles.carCardWrapper}
                >
                  <LinearGradient
                    colors={selectedCar === car.id ? car.gradient : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.06)']}
                    style={[
                      styles.carCard,
                      selectedCar === car.id && styles.carCardActive
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <View style={styles.carLeft}>
                      <View style={[styles.carIcon, selectedCar === car.id && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        <Ionicons name={car.icon as any} size={28} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={styles.carName}>{car.name}</Text>
                        <Text style={styles.carDesc}>{car.desc}</Text>
                        <View style={styles.carMeta}>
                          <View style={styles.metaItem}>
                            <Ionicons name="people" size={12} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.metaText}>{car.capacity}</Text>
                          </View>
                          <View style={styles.metaItem}>
                            <Ionicons name="time" size={12} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.metaText}>{car.eta}m</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <View style={styles.carRight}>
                      {isCalculating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : fareEstimate ? (
                        <View>
                          <Text style={styles.carPrice}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
                          {selectedCar === car.id && (
                            <View style={styles.selectedBadge}>
                              <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                            </View>
                          )}
                        </View>
                      ) : (
                        <Text style={styles.carPriceEmpty}>--</Text>
                      )}
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </Animated.View>

          {/* FARE BREAKDOWN */}
          {fareEstimate && (
            <Animated.View style={[styles.fareCard, { opacity: fadeAnim }]}>
              <LinearGradient
                colors={['rgba(0, 245, 255, 0.12)', 'rgba(131, 56, 236, 0.12)']}
                style={styles.fareGradient}
              >
                <View style={styles.fareHeader}>
                  <Ionicons name="receipt" size={20} color={COLORS.cyan} />
                  <Text style={styles.fareTitle}>Trip Summary</Text>
                </View>
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
            </Animated.View>
          )}

          <View style={{ height: 140 }} />
        </ScrollView>

        {/* BOOK BUTTON - SHOCKING GRADIENT */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.bookButton}
            onPress={handleBookRide}
            disabled={!pickup || !destination}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={(!pickup || !destination) 
                ? ['#4A5568', '#2D3748'] 
                : [COLORS.cyan, COLORS.blue, COLORS.purple, COLORS.magenta]}
              style={styles.bookButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.bookButtonText}>
                {fareEstimate ? `Book - ₦${fareEstimate.total_fare?.toLocaleString()}` : 'Book Ride'}
              </Text>
              <Ionicons name="arrow-forward-circle" size={26} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  
  // GLOW EFFECTS
  glowCircle: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: 250,
    blur: 50,
  },
  glow1: {
    top: -250,
    right: -200,
    backgroundColor: COLORS.cyan,
    opacity: 0.15,
  },
  glow2: {
    bottom: -200,
    left: -200,
    backgroundColor: COLORS.magenta,
    opacity: 0.15,
  },
  glow3: {
    top: '40%',
    left: '50%',
    backgroundColor: COLORS.purple,
    opacity: 0.1,
  },

  // HEADER
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
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  backGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  tripTypeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  tripTypeText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
  },

  // LOCATION CARD
  locationCard: {
    backgroundColor: 'rgba(21, 27, 61, 0.8)',
    borderRadius: 24,
    padding: 22,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 12,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },

  // GPS & VOICE BUTTONS
  gpsBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: COLORS.mint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  gpsBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  gpsBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  voiceBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  voiceBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  voiceBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // LOCATION INPUTS
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  verticalLine: {
    width: 2,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
    fontWeight: '700',
  },
  removeBtn: {
    padding: 4,
  },
  addStopBtn: {
    marginTop: 16,
    borderRadius: 14,
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
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // VEHICLE SECTION
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  carCardWrapper: {
    marginBottom: 14,
  },
  carCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  carCardActive: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  carLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  carIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carName: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  carDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    marginBottom: 6,
  },
  carMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '700',
  },
  carRight: {
    alignItems: 'flex-end',
  },
  carPrice: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  carPriceEmpty: {
    fontSize: 20,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
  },
  selectedBadge: {
    marginTop: 4,
  },

  // FARE CARD
  fareCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  fareGradient: {
    padding: 20,
  },
  fareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  fareTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fareLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  fareValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '800',
  },
  fareDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 12,
  },
  fareTotalLabel: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: '900',
  },
  fareTotalValue: {
    fontSize: 24,
    color: COLORS.text,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  // BOOK BUTTON
  bottomContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: 'rgba(10, 14, 39, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  bookButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  bookButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
