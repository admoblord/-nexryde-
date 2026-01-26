import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Button } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { estimateFare, requestTrip, FareEstimateResponse } from '@/src/services/api';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

export default function BookRideScreen() {
  const router = useRouter();
  const { user, currentLocation, setCurrentLocation, setCurrentTrip } = useAppStore();
  
  const [step, setStep] = useState<'locations' | 'confirm'>('locations');
  const [pickupLocation, setPickupLocation] = useState<LocationData | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<LocationData | null>(null);
  const [fareEstimate, setFareEstimate] = useState<FareEstimateResponse | null>(null);
  const [serviceType, setServiceType] = useState<'economy' | 'premium'>('economy');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [loading, setLoading] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  
  const pickupRef = useRef<any>(null);
  const dropoffRef = useRef<any>(null);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to book a ride');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const addressStr = address[0] 
        ? `${address[0].street || ''}, ${address[0].city || address[0].region || ''}`
        : 'Current Location';

      const currentLoc: LocationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: addressStr.trim().replace(/^,\s*/, ''),
      };
      
      setCurrentLocation({
        latitude: currentLoc.latitude,
        longitude: currentLoc.longitude,
        address: currentLoc.address,
      });
      setPickupLocation(currentLoc);
    } catch (error) {
      console.log('Location error:', error);
    } finally {
      setFetchingLocation(false);
    }
  };

  // COST CONTROL: Only call fare estimation when user confirms destination
  const handleConfirmDestination = async () => {
    if (!pickupLocation || !dropoffLocation) {
      Alert.alert('Error', 'Please select both pickup and destination');
      return;
    }

    setLoading(true);
    try {
      // Call backend which handles Google Directions API call
      const response = await estimateFare({
        pickup_lat: pickupLocation.latitude,
        pickup_lng: pickupLocation.longitude,
        dropoff_lat: dropoffLocation.latitude,
        dropoff_lng: dropoffLocation.longitude,
        service_type: serviceType,
        city: 'lagos', // Default to Lagos for MVP
      });
      
      setFareEstimate(response.data);
      setStep('confirm');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to estimate fare');
    } finally {
      setLoading(false);
    }
  };

  const handleBookRide = async () => {
    if (!user?.id || !pickupLocation || !dropoffLocation || !fareEstimate) return;
    
    setLoading(true);
    try {
      const response = await requestTrip(user.id, {
        pickup_lat: pickupLocation.latitude,
        pickup_lng: pickupLocation.longitude,
        pickup_address: pickupLocation.address,
        dropoff_lat: dropoffLocation.latitude,
        dropoff_lng: dropoffLocation.longitude,
        dropoff_address: dropoffLocation.address,
        service_type: serviceType,
        payment_method: paymentMethod,
        fare_estimate_id: fareEstimate.estimate_id, // Use locked price
      });
      
      setCurrentTrip(response.data.trip);
      router.replace('/rider/tracking');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to book ride');
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (currentLocation) {
      setPickupLocation({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        address: currentLocation.address,
      });
    }
  };

  const handlePlaceSelect = (data: any, details: any, type: 'pickup' | 'dropoff') => {
    if (details?.geometry?.location) {
      const location: LocationData = {
        latitude: details.geometry.location.lat,
        longitude: details.geometry.location.lng,
        address: data.description || details.formatted_address || '',
      };
      
      if (type === 'pickup') {
        setPickupLocation(location);
      } else {
        setDropoffLocation(location);
      }
    }
  };

  const renderLocationInputs = () => (
    <View style={styles.locationsContainer}>
      {/* Current Location Card */}
      <Card style={styles.currentLocationCard}>
        <TouchableOpacity style={styles.currentLocationRow} onPress={useCurrentLocation}>
          <View style={styles.currentLocationIcon}>
            <Ionicons name="locate" size={20} color={COLORS.primary} />
          </View>
          <View style={styles.currentLocationInfo}>
            <Text style={styles.currentLocationLabel}>Use Current Location</Text>
            {fetchingLocation ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.currentLocationAddress} numberOfLines={1}>
                {currentLocation?.address || 'Fetching...'}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
        </TouchableOpacity>
      </Card>

      {/* Pickup Input */}
      <View style={styles.inputSection}>
        <View style={styles.inputHeader}>
          <View style={[styles.inputDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.inputLabel}>Pickup Location</Text>
        </View>
        
        {GOOGLE_MAPS_API_KEY ? (
          <GooglePlacesAutocomplete
            ref={pickupRef}
            placeholder="Search pickup location"
            onPress={(data, details) => handlePlaceSelect(data, details, 'pickup')}
            query={{
              key: GOOGLE_MAPS_API_KEY,
              language: 'en',
              components: 'country:ng', // Nigeria
            }}
            fetchDetails={true}
            styles={{
              container: styles.autocompleteContainer,
              textInput: styles.autocompleteInput,
              listView: styles.autocompleteList,
              row: styles.autocompleteRow,
              description: styles.autocompleteDescription,
            }}
            enablePoweredByContainer={false}
            debounce={300} // 300ms debounce to reduce API calls
            minLength={3} // Min 3 chars before searching
            textInputProps={{
              placeholderTextColor: COLORS.gray400,
            }}
          />
        ) : (
          <TextInput
            style={styles.fallbackInput}
            placeholder="Enter pickup address"
            placeholderTextColor={COLORS.gray400}
            value={pickupLocation?.address || ''}
            onChangeText={(text) => setPickupLocation(prev => prev ? {...prev, address: text} : null)}
          />
        )}
        
        {pickupLocation && (
          <View style={styles.selectedLocation}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={styles.selectedLocationText} numberOfLines={1}>
              {pickupLocation.address}
            </Text>
          </View>
        )}
      </View>

      {/* Dropoff Input */}
      <View style={styles.inputSection}>
        <View style={styles.inputHeader}>
          <View style={[styles.inputDot, { backgroundColor: COLORS.error }]} />
          <Text style={styles.inputLabel}>Destination</Text>
        </View>
        
        {GOOGLE_MAPS_API_KEY ? (
          <GooglePlacesAutocomplete
            ref={dropoffRef}
            placeholder="Where are you going?"
            onPress={(data, details) => handlePlaceSelect(data, details, 'dropoff')}
            query={{
              key: GOOGLE_MAPS_API_KEY,
              language: 'en',
              components: 'country:ng',
            }}
            fetchDetails={true}
            styles={{
              container: styles.autocompleteContainer,
              textInput: styles.autocompleteInput,
              listView: styles.autocompleteList,
              row: styles.autocompleteRow,
              description: styles.autocompleteDescription,
            }}
            enablePoweredByContainer={false}
            debounce={300}
            minLength={3}
            textInputProps={{
              placeholderTextColor: COLORS.gray400,
            }}
          />
        ) : (
          <TextInput
            style={styles.fallbackInput}
            placeholder="Enter destination address"
            placeholderTextColor={COLORS.gray400}
            value={dropoffLocation?.address || ''}
            onChangeText={(text) => {
              // For fallback, create mock coordinates
              setDropoffLocation({
                latitude: (pickupLocation?.latitude || 6.5244) + (Math.random() * 0.05),
                longitude: (pickupLocation?.longitude || 3.3792) + (Math.random() * 0.05),
                address: text,
              });
            }}
          />
        )}
        
        {dropoffLocation && (
          <View style={styles.selectedLocation}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={styles.selectedLocationText} numberOfLines={1}>
              {dropoffLocation.address}
            </Text>
          </View>
        )}
      </View>

      {/* Service Type Selection */}
      <View style={styles.serviceSection}>
        <Text style={styles.sectionTitle}>Service Type</Text>
        <View style={styles.serviceOptions}>
          <TouchableOpacity
            style={[styles.serviceOption, serviceType === 'economy' && styles.serviceOptionSelected]}
            onPress={() => setServiceType('economy')}
          >
            <Ionicons name="car" size={24} color={serviceType === 'economy' ? COLORS.primary : COLORS.gray500} />
            <Text style={[styles.serviceOptionText, serviceType === 'economy' && styles.serviceOptionTextSelected]}>
              Economy
            </Text>
            <Text style={styles.serviceOptionPrice}>From {CURRENCY}1,500</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.serviceOption, serviceType === 'premium' && styles.serviceOptionSelected]}
            onPress={() => setServiceType('premium')}
          >
            <Ionicons name="car-sport" size={24} color={serviceType === 'premium' ? COLORS.primary : COLORS.gray500} />
            <Text style={[styles.serviceOptionText, serviceType === 'premium' && styles.serviceOptionTextSelected]}>
              Premium
            </Text>
            <Text style={styles.serviceOptionPrice}>From {CURRENCY}2,500</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Confirm Button - This triggers the fare calculation */}
      <Button
        title={loading ? 'Calculating Fare...' : 'Confirm Destination'}
        onPress={handleConfirmDestination}
        loading={loading}
        disabled={!pickupLocation || !dropoffLocation}
        icon="checkmark-circle"
        style={styles.confirmButton}
      />
    </View>
  );

  const renderConfirmation = () => (
    <View style={styles.confirmContainer}>
      {/* Route Summary */}
      <Card style={styles.routeCard}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>Pickup</Text>
            <Text style={styles.routeAddress}>{pickupLocation?.address}</Text>
          </View>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>Destination</Text>
            <Text style={styles.routeAddress}>{dropoffLocation?.address}</Text>
          </View>
        </View>
      </Card>

      {/* Fare Breakdown */}
      {fareEstimate && (
        <Card style={styles.fareCard}>
          <Text style={styles.fareTitle}>Fare Breakdown</Text>
          
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Base Fare</Text>
            <Text style={styles.fareValue}>{CURRENCY}{fareEstimate.base_fare.toLocaleString()}</Text>
          </View>
          
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Distance ({fareEstimate.distance_km} km)</Text>
            <Text style={styles.fareValue}>{CURRENCY}{fareEstimate.distance_fee.toLocaleString()}</Text>
          </View>
          
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Time ({fareEstimate.duration_min} mins)</Text>
            <Text style={styles.fareValue}>{CURRENCY}{fareEstimate.time_fee.toLocaleString()}</Text>
          </View>
          
          {fareEstimate.traffic_fee > 0 && (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Traffic Adjustment</Text>
              <Text style={styles.fareValue}>{CURRENCY}{fareEstimate.traffic_fee.toLocaleString()}</Text>
            </View>
          )}
          
          {fareEstimate.is_peak && (
            <View style={styles.peakBadge}>
              <Ionicons name="time" size={14} color={COLORS.warning} />
              <Text style={styles.peakText}>Peak hours ({(fareEstimate.multiplier * 100 - 100).toFixed(0)}% adjustment)</Text>
            </View>
          )}
          
          <View style={styles.fareDivider} />
          
          <View style={styles.fareRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{CURRENCY}{fareEstimate.total_fare.toLocaleString()}</Text>
          </View>
          
          <Text style={styles.priceValidText}>
            Price valid for {fareEstimate.price_lock_minutes} minutes
          </Text>
        </Card>
      )}

      {/* Payment Method */}
      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <View style={styles.paymentOptions}>
          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'cash' && styles.paymentOptionSelected]}
            onPress={() => setPaymentMethod('cash')}
          >
            <Ionicons name="cash" size={24} color={paymentMethod === 'cash' ? COLORS.primary : COLORS.gray500} />
            <Text style={[styles.paymentOptionText, paymentMethod === 'cash' && styles.paymentOptionTextSelected]}>
              Cash
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentOption, paymentMethod === 'bank_transfer' && styles.paymentOptionSelected]}
            onPress={() => setPaymentMethod('bank_transfer')}
          >
            <Ionicons name="card" size={24} color={paymentMethod === 'bank_transfer' ? COLORS.primary : COLORS.gray500} />
            <Text style={[styles.paymentOptionText, paymentMethod === 'bank_transfer' && styles.paymentOptionTextSelected]}>
              Bank Transfer
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.paymentNote}>
          <Ionicons name="information-circle" size={18} color={COLORS.info} />
          <Text style={styles.paymentNoteText}>
            {paymentMethod === 'cash' 
              ? 'Pay driver in cash at the end of your trip'
              : 'Transfer payment to driver\'s bank account after the ride'
            }
          </Text>
        </View>
      </View>

      {/* Book Button */}
      <Button
        title={loading ? 'Booking...' : `Book Ride - ${CURRENCY}${fareEstimate?.total_fare.toLocaleString()}`}
        onPress={handleBookRide}
        loading={loading}
        icon="car"
        style={styles.bookButton}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => {
              if (step === 'confirm') setStep('locations');
              else router.back();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {step === 'locations' ? 'Book a Ride' : 'Confirm Trip'}
          </Text>
        </View>

        <ScrollView 
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'locations' ? renderLocationInputs() : renderConfirmation()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  content: {
    padding: SPACING.md,
    paddingTop: 0,
    paddingBottom: SPACING.xxl,
  },
  locationsContainer: {
    gap: SPACING.md,
  },
  currentLocationCard: {
    padding: 0,
    overflow: 'hidden',
  },
  currentLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  currentLocationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  currentLocationLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  currentLocationAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  inputSection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  inputDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: SPACING.sm,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  autocompleteContainer: {
    flex: 0,
    zIndex: 10,
  },
  autocompleteInput: {
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    height: 44,
  },
  autocompleteList: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
    ...SHADOWS.md,
  },
  autocompleteRow: {
    padding: SPACING.sm,
  },
  autocompleteDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
  fallbackInput: {
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    height: 44,
  },
  selectedLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  selectedLocationText: {
    flex: 1,
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.success,
  },
  serviceSection: {
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  serviceOptions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  serviceOption: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gray200,
    ...SHADOWS.sm,
  },
  serviceOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  serviceOptionText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.gray500,
    marginTop: SPACING.xs,
  },
  serviceOptionTextSelected: {
    color: COLORS.primary,
  },
  serviceOptionPrice: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  confirmButton: {
    marginTop: SPACING.md,
  },
  confirmContainer: {
    gap: SPACING.md,
  },
  routeCard: {},
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  routeInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  routeLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  routeAddress: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.gray200,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  fareCard: {},
  fareTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  fareLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  fareValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  peakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  peakText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    fontWeight: '500',
  },
  fareDivider: {
    height: 1,
    backgroundColor: COLORS.gray200,
    marginVertical: SPACING.sm,
  },
  totalLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  totalValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  priceValidText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  paymentSection: {
    marginTop: SPACING.sm,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    ...SHADOWS.sm,
  },
  paymentOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  paymentOptionText: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.gray500,
    fontWeight: '500',
  },
  paymentOptionTextSelected: {
    color: COLORS.primary,
  },
  paymentNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.info + '15',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  paymentNoteText: {
    flex: 1,
    marginLeft: SPACING.sm,
    color: COLORS.info,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  bookButton: {
    marginTop: SPACING.md,
  },
});
