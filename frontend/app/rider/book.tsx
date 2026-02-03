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

// PREMIUM CAR TYPES - Beautiful & Professional
const CAR_TYPES = [
  { 
    id: 'economy', 
    name: 'Economy', 
    emoji: '🚗', 
    multiplier: 1.0,
    desc: 'Affordable, everyday rides',
    capacity: '1-4',
    gradient: ['#667eea', '#764ba2'],
    color: '#667eea'
  },
  { 
    id: 'comfort', 
    name: 'Comfort', 
    emoji: '🚙', 
    multiplier: 1.3,
    desc: 'Extra space & comfort',
    capacity: '1-4',
    gradient: ['#f093fb', '#f5576c'],
    color: '#f093fb'
  },
  { 
    id: 'premium', 
    name: 'Premium', 
    emoji: '🚘', 
    multiplier: 2.0,
    desc: 'Luxury high-end vehicles',
    capacity: '1-4',
    gradient: ['#4facfe', '#00f2fe'],
    color: '#4facfe'
  },
  { 
    id: 'xl', 
    name: 'XL', 
    emoji: '🚐', 
    multiplier: 1.5,
    desc: 'Extra seats for groups',
    capacity: '1-6',
    gradient: ['#43e97b', '#38f9d7'],
    color: '#43e97b'
  },
];

export default function BookingScreen() {
  const router = useRouter();
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedCar, setSelectedCar] = useState('economy');
  const [fareEstimate, setFareEstimate] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [tripType, setTripType] = useState<'intra' | 'inter'>('intra');
  
  const pickupRef = useRef<any>();
  const destRef = useRef<any>();

  // Auto-calculate fare when both locations are entered
  useEffect(() => {
    if (pickup.trim() && destination.trim() && pickup.trim().length > 2 && destination.trim().length > 2) {
      const timer = setTimeout(() => {
        calculateFare();
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setFareEstimate(null);
    }
  }, [pickup, destination, selectedCar, tripType]);

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
          trip_type: tripType
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
      Alert.alert('Missing Pickup', 'Please enter your pickup location');
      return;
    }
    if (!destination.trim()) {
      Alert.alert('Missing Destination', 'Please enter your destination');
      return;
    }
    if (!fareEstimate) {
      Alert.alert('Calculating...', 'Please wait for fare calculation');
      return;
    }

    router.push({
      pathname: '/rider/tracking',
      params: {
        pickup,
        destination,
        carType: selectedCar,
        estimatedFare: fareEstimate.total_fare,
        distance: fareEstimate.distance,
        duration: fareEstimate.duration
      }
    });
  };

  const selectedCarData = CAR_TYPES.find(c => c.id === selectedCar);

  return (
    <View style={styles.container}>
      {/* Premium Gradient Background */}
      <LinearGradient
        colors={['#f8f9fa', '#e9ecef', '#dee2e6']}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1a1a2e" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Your Ride</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Trip Type Toggle */}
          <View style={styles.tripTypeCard}>
            <TouchableOpacity
              style={[styles.tripTypeButton, tripType === 'intra' && styles.tripTypeActive]}
              onPress={() => setTripType('intra')}
            >
              <LinearGradient
                colors={tripType === 'intra' ? ['#667eea', '#764ba2'] : ['transparent', 'transparent']}
                style={styles.tripTypeGradient}
              >
                <Ionicons name="location" size={20} color={tripType === 'intra' ? '#fff' : '#6b7280'} />
                <Text style={[styles.tripTypeText, tripType === 'intra' && styles.tripTypeTextActive]}>
                  Within City
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tripTypeButton, tripType === 'inter' && styles.tripTypeActive]}
              onPress={() => setTripType('inter')}
            >
              <LinearGradient
                colors={tripType === 'inter' ? ['#f093fb', '#f5576c'] : ['transparent', 'transparent']}
                style={styles.tripTypeGradient}
              >
                <Ionicons name="airplane" size={20} color={tripType === 'inter' ? '#fff' : '#6b7280'} />
                <Text style={[styles.tripTypeText, tripType === 'inter' && styles.tripTypeTextActive]}>
                  Between Cities
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Location Inputs with GOOGLE AUTOCOMPLETE */}
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <Ionicons name="navigate-circle" size={24} color="#667eea" />
              <Text style={styles.locationHeaderText}>Where are you going?</Text>
            </View>

            {/* Pickup with Google Autocomplete */}
            <View style={styles.autocompleteContainer}>
              <View style={[styles.inputDot, { backgroundColor: '#10b981' }]}>
                <View style={styles.inputDotInner} />
              </View>
              <View style={{ flex: 1 }}>
                {Platform.OS === 'web' ? (
                  <TextInput
                    style={styles.autocompleteInput}
                    placeholder="Pickup location"
                    placeholderTextColor="#9ca3af"
                    value={pickup}
                    onChangeText={setPickup}
                    returnKeyType="next"
                    onSubmitEditing={() => destRef.current?.focus()}
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
                      textInput: styles.autocompleteInput,
                      listView: styles.autocompleteList,
                      row: styles.autocompleteRow,
                      description: styles.autocompleteDescription,
                    }}
                    textInputProps={{
                      placeholderTextColor: '#9ca3af',
                      returnKeyType: 'next',
                      onSubmitEditing: () => destRef.current?.focus(),
                    }}
                    enablePoweredByContainer={false}
                    nearbyPlacesAPI="GooglePlacesSearch"
                    debounce={300}
                  />
                )}
              </View>
            </View>

            <View style={styles.routeLine} />

            {/* Destination with Google Autocomplete */}
            <View style={styles.autocompleteContainer}>
              <View style={[styles.inputDot, { backgroundColor: '#ef4444' }]}>
                <Ionicons name="location" size={12} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
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
                  requestUrl={{
                    url: 'https://maps.googleapis.com/maps/api',
                    useOnPlatform: 'web',
                  }}
                  styles={{
                    textInput: styles.autocompleteInput,
                    listView: styles.autocompleteList,
                    row: styles.autocompleteRow,
                    description: styles.autocompleteDescription,
                  }}
                  textInputProps={{
                    placeholderTextColor: '#9ca3af',
                    returnKeyType: 'done',
                  }}
                  enablePoweredByContainer={false}
                  nearbyPlacesAPI="GooglePlacesSearch"
                  debounce={300}
                />
              </View>
            </View>

            {/* Quick Suggestions */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsRow}>
              <TouchableOpacity 
                style={styles.suggestionChip} 
                onPress={() => {
                  setPickup('Current Location');
                  pickupRef.current?.setAddressText('Current Location');
                }}
              >
                <Ionicons name="navigate" size={16} color="#10b981" />
                <Text style={styles.suggestionText}>Current</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.suggestionChip}>
                <Ionicons name="home" size={16} color="#667eea" />
                <Text style={styles.suggestionText}>Home</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.suggestionChip}>
                <Ionicons name="briefcase" size={16} color="#f093fb" />
                <Text style={styles.suggestionText}>Work</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Car Type Selection */}
          <Text style={styles.sectionTitle}>Choose your ride</Text>
          {CAR_TYPES.map((car) => {
            const isSelected = selectedCar === car.id;
            const estimatedPrice = fareEstimate ? Math.round(fareEstimate.total_fare * car.multiplier) : null;
            
            return (
              <TouchableOpacity
                key={car.id}
                style={[styles.carCard, isSelected && styles.carCardSelected]}
                onPress={() => setSelectedCar(car.id)}
              >
                {isSelected && (
                  <LinearGradient
                    colors={car.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.carCardGradient}
                  />
                )}
                <View style={styles.carLeft}>
                  <View style={[styles.carEmojiContainer, { backgroundColor: car.color + '20' }]}>
                    <Text style={styles.carEmoji}>{car.emoji}</Text>
                  </View>
                  <View style={styles.carInfo}>
                    <Text style={[styles.carName, isSelected && styles.carNameSelected]}>{car.name}</Text>
                    <Text style={[styles.carDesc, isSelected && styles.carDescSelected]}>{car.desc}</Text>
                    <View style={styles.carMeta}>
                      <Ionicons name="people" size={14} color={isSelected ? '#fff' : '#9ca3af'} />
                      <Text style={[styles.carCapacity, isSelected && styles.carCapacitySelected]}>
                        {car.capacity} seats
                      </Text>
                      {fareEstimate && (
                        <>
                          <Text style={[styles.carMetaDot, isSelected && styles.carMetaDotSelected]}>•</Text>
                          <Text style={[styles.carTime, isSelected && styles.carTimeSelected]}>
                            {fareEstimate.duration}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
                <View style={styles.carRight}>
                  {isCalculating ? (
                    <ActivityIndicator size="small" color={isSelected ? '#fff' : car.color} />
                  ) : estimatedPrice ? (
                    <>
                      <Text style={[styles.carPrice, isSelected && styles.carPriceSelected]}>
                        ₦{estimatedPrice.toLocaleString()}
                      </Text>
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        </View>
                      )}
                    </>
                  ) : (
                    <Text style={styles.carPricePlaceholder}>--</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Fare Breakdown */}
          {fareEstimate && (
            <View style={styles.fareCard}>
              <LinearGradient
                colors={['#f8f9fa', '#ffffff']}
                style={styles.fareGradient}
              >
                <View style={styles.fareHeader}>
                  <Ionicons name="receipt" size={20} color="#667eea" />
                  <Text style={styles.fareTitle}>Trip Summary</Text>
                </View>

                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Distance</Text>
                  <Text style={styles.fareValue}>{fareEstimate.distance}</Text>
                </View>
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Estimated Time</Text>
                  <Text style={styles.fareValue}>{fareEstimate.duration}</Text>
                </View>
                <View style={styles.fareDivider} />
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabelBold}>Base Fare</Text>
                  <Text style={styles.fareValueBold}>₦{fareEstimate.base_fare?.toLocaleString()}</Text>
                </View>

                {tripType === 'inter' && (
                  <View style={styles.fareNote}>
                    <Ionicons name="information-circle" size={16} color="#667eea" />
                    <Text style={styles.fareNoteText}>
                      Price calculated from Google Maps (real-time traffic included)
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Book Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.bookButton, !fareEstimate && styles.bookButtonDisabled]}
            onPress={handleBookRide}
            disabled={!fareEstimate || isCalculating}
          >
            <LinearGradient
              colors={fareEstimate ? (selectedCarData?.gradient || ['#667eea', '#764ba2']) : ['#d1d5db', '#d1d5db']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.bookButtonGradient}
            >
              <Text style={styles.bookButtonText}>
                {isCalculating ? 'Calculating...' : fareEstimate ? 'Confirm & Book Ride' : 'Enter Locations'}
              </Text>
              {fareEstimate && !isCalculating && (
                <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
              )}
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
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  tripTypeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 6,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  tripTypeButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tripTypeActive: {},
  tripTypeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  tripTypeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6b7280',
  },
  tripTypeTextActive: {
    color: '#fff',
  },
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  locationHeaderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  autocompleteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  inputDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  inputDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#e5e7eb',
    marginLeft: 11,
    marginVertical: 4,
  },
  autocompleteInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
    paddingVertical: 12,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  autocompleteList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  autocompleteRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  autocompleteDescription: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  suggestionsRow: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  carCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  carCardSelected: {
    borderColor: 'transparent',
    shadowOpacity: 0.15,
  },
  carCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  carLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    zIndex: 1,
  },
  carEmojiContainer: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carEmoji: {
    fontSize: 26,
  },
  carInfo: {
    flex: 1,
  },
  carName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  carNameSelected: {
    color: '#fff',
  },
  carDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  carDescSelected: {
    color: 'rgba(255,255,255,0.9)',
  },
  carMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  carCapacity: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
  carCapacitySelected: {
    color: 'rgba(255,255,255,0.85)',
  },
  carMetaDot: {
    color: '#d1d5db',
    marginHorizontal: 4,
  },
  carMetaDotSelected: {
    color: 'rgba(255,255,255,0.6)',
  },
  carTime: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
  carTimeSelected: {
    color: 'rgba(255,255,255,0.85)',
  },
  carRight: {
    alignItems: 'flex-end',
    gap: 6,
    zIndex: 1,
  },
  carPrice: {
    fontSize: 19,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  carPriceSelected: {
    color: '#fff',
  },
  carPricePlaceholder: {
    fontSize: 19,
    fontWeight: '900',
    color: '#d1d5db',
  },
  selectedBadge: {
    marginTop: 2,
  },
  fareCard: {
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
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
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  fareLabel: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  fareValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  fareLabelBold: {
    fontSize: 16,
    color: '#1a1a2e',
    fontWeight: '700',
  },
  fareValueBold: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  fareDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  fareNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  fareNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#667eea',
    lineHeight: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    paddingBottom: 24,
    backgroundColor: 'transparent',
  },
  bookButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  bookButtonDisabled: {
    shadowOpacity: 0.05,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  bookButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
});
