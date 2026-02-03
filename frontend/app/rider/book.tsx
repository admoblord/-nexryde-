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
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';

const { width, height } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY';

// MODERN ASIAN COLOR PALETTE
const COLORS = {
  primary: '#6366F1', // Indigo
  secondary: '#EC4899', // Pink
  success: '#10B981', // Green
  warning: '#F59E0B', // Amber
  background: '#F9FAFB', // Light gray
  surface: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

// VEHICLE TYPES - ASIAN STYLE
const VEHICLE_TYPES = [
  { 
    id: 'bike', 
    name: 'Bike', 
    icon: 'bicycle', 
    time: '2 min',
    color: COLORS.success,
    capacity: 1,
  },
  { 
    id: 'economy', 
    name: 'Economy', 
    icon: 'car', 
    time: '3 min',
    color: COLORS.primary,
    capacity: 4,
  },
  { 
    id: 'comfort', 
    name: 'Comfort', 
    icon: 'car-sport', 
    time: '5 min',
    color: COLORS.warning,
    capacity: 4,
  },
  { 
    id: 'premium', 
    name: 'Premium', 
    icon: 'diamond', 
    time: '8 min',
    color: COLORS.secondary,
    capacity: 4,
  },
];

export default function ModernBookingScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  // State
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [isLoading, setIsLoading] = useState(false);
  const [showVehicleSheet, setShowVehicleSheet] = useState(false);
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  // Get current location
  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        return;
      }

      setIsLoading(true);
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // Reverse geocode
      const address = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (address[0]) {
        const { street, city, region } = address[0];
        setPickup(`${street}, ${city}, ${region}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not get your location');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle booking
  const handleConfirmBooking = async () => {
    // Validate inputs more strictly
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

    // Calculate real fare using backend
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/fares/estimate-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_address: pickup,
          destination_address: destination,
          service_type: selectedVehicle,
        }),
      });

      const fareData = await response.json();
      
      if (response.ok && fareData.total_fare) {
        Alert.alert(
          'Confirm Booking',
          `Vehicle: ${VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.name}\nFrom: ${pickup}\nTo: ${destination}\n\nFare: ₦${fareData.total_fare.toFixed(2)}`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm', onPress: () => {
              Alert.alert('Success', 'Searching for nearby drivers...');
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

  const selectedVehicleData = VEHICLE_TYPES.find(v => v.id === selectedVehicle);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book a Ride</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* LOCATION CARD */}
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="location" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Where to?</Text>
          </View>

          {/* PICKUP */}
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, { backgroundColor: COLORS.success }]} />
            <View style={styles.locationInputWrapper}>
              <LocationAutocomplete
                value={pickup}
                onChangeText={setPickup}
                onPlaceSelected={(place) => setPickup(place.description)}
                placeholder="Pickup location"
                apiKey={GOOGLE_MAPS_API_KEY}
                countryCode="ng"
                inputStyle={styles.locationInput}
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
            <TouchableOpacity 
              style={styles.gpsButton}
              onPress={getCurrentLocation}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="navigate" size={20} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          </View>

          {/* DIVIDER LINE */}
          <View style={styles.dividerLine} />

          {/* DESTINATION */}
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, { backgroundColor: COLORS.secondary }]} />
            <View style={styles.locationInputWrapper}>
              <LocationAutocomplete
                value={destination}
                onChangeText={setDestination}
                onPlaceSelected={(place) => setDestination(place.description)}
                placeholder="Where to?"
                apiKey={GOOGLE_MAPS_API_KEY}
                countryCode="ng"
                inputStyle={styles.locationInput}
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>
        </Animated.View>

        {/* VEHICLE SELECTION */}
        <Animated.View style={[styles.card, { opacity: fadeAnim, marginTop: 16 }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="car" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Choose Vehicle</Text>
          </View>

          <View style={styles.vehicleGrid}>
            {VEHICLE_TYPES.map((vehicle) => (
              <TouchableOpacity
                key={vehicle.id}
                style={[
                  styles.vehicleCard,
                  selectedVehicle === vehicle.id && { 
                    backgroundColor: vehicle.color + '10',
                    borderColor: vehicle.color,
                    borderWidth: 2,
                  }
                ]}
                onPress={() => setSelectedVehicle(vehicle.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.vehicleIcon, { backgroundColor: vehicle.color + '20' }]}>
                  <Ionicons name={vehicle.icon as any} size={24} color={vehicle.color} />
                </View>
                <Text style={styles.vehicleName}>{vehicle.name}</Text>
                <Text style={styles.vehicleTime}>{vehicle.time}</Text>
                {selectedVehicle === vehicle.id && (
                  <View style={[styles.selectedBadge, { backgroundColor: vehicle.color }]}>
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* PAYMENT METHOD */}
        <Animated.View style={[styles.card, { opacity: fadeAnim, marginTop: 16 }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="wallet" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Payment</Text>
          </View>
          
          <TouchableOpacity style={styles.paymentOption}>
            <View style={styles.paymentLeft}>
              <View style={[styles.paymentIcon, { backgroundColor: COLORS.success + '20' }]}>
                <Ionicons name="cash" size={20} color={COLORS.success} />
              </View>
              <Text style={styles.paymentText}>Cash</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </Animated.View>

        {/* EXTRA SPACING */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* BOTTOM BAR - CONFIRM BUTTON */}
      <Animated.View style={[styles.bottomBar, { opacity: fadeAnim }]}>
        <TouchableOpacity 
          style={[styles.confirmButton, { backgroundColor: selectedVehicleData?.color || COLORS.primary }]}
          onPress={handleConfirmBooking}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.confirmButtonText}>Confirm Booking</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // CARD STYLES
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 8,
  },

  // LOCATION INPUTS
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  locationInputWrapper: {
    flex: 1,
  },
  locationInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gpsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  dividerLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.border,
    marginLeft: 5,
    marginBottom: 8,
  },

  // VEHICLE GRID
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  vehicleCard: {
    width: (width - 68) / 2,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  vehicleTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  vehiclePrice: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // PAYMENT
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  paymentText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },

  // BOTTOM BAR
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginRight: 8,
  },
});
