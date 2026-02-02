import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// SIMPLE CAR TYPES (Like Uber/Bolt)
const CAR_TYPES = [
  { 
    id: 'economy', 
    name: 'Economy', 
    emoji: '🚗', 
    multiplier: 1.0,
    desc: 'Affordable rides',
    capacity: '1-4 seats',
    color: '#000'
  },
  { 
    id: 'comfort', 
    name: 'Comfort', 
    emoji: '🚙', 
    multiplier: 1.3,
    desc: 'More space',
    capacity: '1-4 seats',
    color: '#1a8917'
  },
  { 
    id: 'premium', 
    name: 'Premium', 
    emoji: '🚘', 
    multiplier: 2.0,
    desc: 'High-end cars',
    capacity: '1-4 seats',
    color: '#4a148c'
  },
  { 
    id: 'xl', 
    name: 'XL', 
    emoji: '🚐', 
    multiplier: 1.5,
    desc: 'Extra seats',
    capacity: '1-6 seats',
    color: '#01579b'
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

  // Auto-calculate fare when both locations are entered
  useEffect(() => {
    if (pickup.trim() && destination.trim()) {
      calculateFare();
    } else {
      setFareEstimate(null);
    }
  }, [pickup, destination, selectedCar, tripType]);

  const calculateFare = async () => {
    setIsCalculating(true);
    try {
      // Call Google Maps API via backend to get REAL distance and time
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
      } else {
        console.error('Fare calculation failed');
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

    // Navigate to ride confirmation/tracking
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book a Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Trip Type Toggle */}
        <View style={styles.tripTypeContainer}>
          <TouchableOpacity
            style={[styles.tripTypeButton, tripType === 'intra' && styles.tripTypeActive]}
            onPress={() => setTripType('intra')}
          >
            <Text style={[styles.tripTypeText, tripType === 'intra' && styles.tripTypeTextActive]}>
              Within City
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tripTypeButton, tripType === 'inter' && styles.tripTypeActive]}
            onPress={() => setTripType('inter')}
          >
            <Text style={[styles.tripTypeText, tripType === 'inter' && styles.tripTypeTextActive]}>
              Between Cities
            </Text>
          </TouchableOpacity>
        </View>

        {/* Location Inputs */}
        <View style={styles.locationCard}>
          {/* Pickup */}
          <View style={styles.inputRow}>
            <View style={[styles.dot, { backgroundColor: '#10b981' }]} />
            <TextInput
              style={styles.input}
              placeholder="Pickup location"
              placeholderTextColor="#9ca3af"
              value={pickup}
              onChangeText={setPickup}
              autoCapitalize="words"
            />
            {pickup.length > 0 && (
              <TouchableOpacity onPress={() => setPickup('')}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />

          {/* Destination */}
          <View style={styles.inputRow}>
            <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
            <TextInput
              style={styles.input}
              placeholder="Where to?"
              placeholderTextColor="#9ca3af"
              value={destination}
              onChangeText={setDestination}
              autoCapitalize="words"
            />
            {destination.length > 0 && (
              <TouchableOpacity onPress={() => setDestination('')}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Quick Suggestions */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestionsRow}>
          <TouchableOpacity style={styles.suggestionChip} onPress={() => setPickup('Current Location')}>
            <Ionicons name="locate" size={16} color="#10b981" />
            <Text style={styles.suggestionText}>Current</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.suggestionChip}>
            <Ionicons name="home" size={16} color="#3b82f6" />
            <Text style={styles.suggestionText}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.suggestionChip}>
            <Ionicons name="briefcase" size={16} color="#f59e0b" />
            <Text style={styles.suggestionText}>Work</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Car Type Selection */}
        <Text style={styles.sectionTitle}>Choose a ride</Text>
        {CAR_TYPES.map((car) => (
          <TouchableOpacity
            key={car.id}
            style={[styles.carCard, selectedCar === car.id && styles.carCardSelected]}
            onPress={() => setSelectedCar(car.id)}
          >
            <View style={styles.carLeft}>
              <Text style={styles.carEmoji}>{car.emoji}</Text>
              <View>
                <Text style={styles.carName}>{car.name}</Text>
                <Text style={styles.carDesc}>{car.desc} • {car.capacity}</Text>
                {fareEstimate && (
                  <Text style={styles.carTime}>
                    {fareEstimate.duration} • {fareEstimate.distance}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.carRight}>
              {isCalculating ? (
                <ActivityIndicator size="small" color="#000" />
              ) : fareEstimate ? (
                <Text style={styles.carPrice}>
                  ₦{Math.round(fareEstimate.total_fare * car.multiplier).toLocaleString()}
                </Text>
              ) : (
                <Text style={styles.carPricePlaceholder}>--</Text>
              )}
              {selectedCar === car.id && (
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
              )}
            </View>
          </TouchableOpacity>
        ))}

        {/* Fare Breakdown */}
        {fareEstimate && (
          <View style={styles.fareCard}>
            <Text style={styles.fareTitle}>Price Breakdown</Text>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Distance</Text>
              <Text style={styles.fareValue}>{fareEstimate.distance}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Estimated Time</Text>
              <Text style={styles.fareValue}>{fareEstimate.duration}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Base Fare</Text>
              <Text style={styles.fareValue}>₦{fareEstimate.base_fare?.toLocaleString()}</Text>
            </View>
            {tripType === 'inter' && (
              <View style={styles.fareNote}>
                <Ionicons name="information-circle" size={16} color="#3b82f6" />
                <Text style={styles.fareNoteText}>
                  Inter-city price calculated from Google Maps distance + traffic
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Book Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.bookButton, !fareEstimate && styles.bookButtonDisabled]}
          onPress={handleBookRide}
          disabled={!fareEstimate || isCalculating}
        >
          <Text style={styles.bookButtonText}>
            {isCalculating ? 'Calculating...' : 'Confirm Ride'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tripTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginTop: 16,
    marginBottom: 20,
  },
  tripTypeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tripTypeActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tripTypeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  tripTypeTextActive: {
    color: '#000',
  },
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
    marginLeft: 24,
  },
  suggestionsRow: {
    marginTop: 12,
    marginBottom: 24,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
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
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  carCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  carCardSelected: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  carLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  carEmoji: {
    fontSize: 32,
  },
  carName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  carDesc: {
    fontSize: 13,
    color: '#6b7280',
  },
  carTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  carRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  carPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  carPricePlaceholder: {
    fontSize: 18,
    fontWeight: '700',
    color: '#d1d5db',
  },
  fareCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 100,
  },
  fareTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  fareLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  fareValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  fareNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  fareNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#3b82f6',
    lineHeight: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  bookButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  bookButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
