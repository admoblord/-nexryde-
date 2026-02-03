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
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState<string[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [selectedTripType, setSelectedTripType] = useState('intra');
  const [isLoading, setIsLoading] = useState(false);

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
      const response = await fetch(`${BACKEND_URL}/api/fares/estimate-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup: pickup,
          destination: destination,
          vehicle_type: selectedVehicle,  // economy, comfort, or xl
          trip_type: 'intra',  // intra-city by default
        }),
      });

      const fareData = await response.json();
      
      if (response.ok && fareData.total_fare) {
        Alert.alert(
          '🚗 Confirm Booking',
          `Vehicle: ${VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.name}\n\nFrom: ${pickup}\n\nTo: ${destination}\n\nFare: ₦${fareData.total_fare.toFixed(2)}`,
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
            {/* Pickup Card */}
            <View style={styles.locationCard}>
              <View style={styles.locationIconContainer}>
                <View style={[styles.iconCircle, { backgroundColor: COLORS.brandGreen }]}>
                  <Ionicons name="location" size={20} color={COLORS.white} />
                </View>
                <View style={styles.verticalLine} />
              </View>
              
              <View style={styles.locationInput}>
                <Text style={styles.locationLabel}>PICKUP LOCATION</Text>
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
                  <View style={[styles.iconCircle, { backgroundColor: '#FFB800' }]}>
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
          </View>

          {/* TRIP TYPE SELECTOR - INTRA-CITY vs INTER-CITY */}
          <View style={styles.tripTypeSection}>
            <Text style={styles.sectionTitle}>Trip Type</Text>
            <View style={styles.tripTypeContainer}>
              {TRIP_TYPES.map((tripType) => (
                <TouchableOpacity
                  key={tripType.id}
                  style={[
                    styles.tripTypeCard,
                    selectedTripType === tripType.id && styles.tripTypeCardSelected
                  ]}
                  onPress={() => setSelectedTripType(tripType.id)}
                >
                  <Ionicons 
                    name={tripType.icon as any} 
                    size={24} 
                    color={selectedTripType === tripType.id ? COLORS.brandGreen : COLORS.textSecondary} 
                  />
                  <Text style={[
                    styles.tripTypeLabel,
                    selectedTripType === tripType.id && styles.tripTypeLabelSelected
                  ]}>
                    {tripType.label}
                  </Text>
                  <Text style={[
                    styles.tripTypeDesc,
                    selectedTripType === tripType.id && { color: COLORS.brandGreen }
                  ]}>
                    {tripType.desc}
                  </Text>
                  {selectedTripType === tripType.id && (
                    <View style={styles.tripTypeCheck}>
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.brandGreen} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Vehicle Types */}
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
          </View>

          {/* Book Button */}
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
    fontSize: 20,
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
    borderRadius: 16,
    padding: 16,
    marginBottom: 0,
  },
  locationIconContainer: {
    alignItems: 'center',
    marginRight: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalLine: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.textSecondary,
    marginTop: 4,
  },
  locationInput: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 8,
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
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.brandGreen,
    borderStyle: 'dashed',
  },
  addStopText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.brandGreen,
    marginLeft: 8,
  },
  vehicleSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 16,
  },
  vehicleGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  vehicleCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleCardSelected: {
    borderColor: COLORS.brandGreen,
    backgroundColor: COLORS.cardBg,
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  bookButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    borderRadius: 16,
    overflow: 'hidden',
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
    paddingVertical: 18,
    gap: 8,
  },
  bookButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
  },
});
