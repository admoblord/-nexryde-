import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '../../src/constants/theme';
import { Card, Button } from '../../src/components/UI';
import { useAppStore } from '../../src/store/appStore';
import { estimateFare, requestTrip } from '../../src/services/api';

export default function BookRideScreen() {
  const router = useRouter();
  const { user, currentLocation, setCurrentLocation, pickupLocation, setPickupLocation, dropoffLocation, setDropoffLocation, setCurrentTrip } = useAppStore();
  
  const [step, setStep] = useState<'pickup' | 'dropoff' | 'confirm'>('pickup');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [fareEstimate, setFareEstimate] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
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
        ? `${address[0].street || ''}, ${address[0].city || ''}`
        : 'Current Location';

      const currentLoc = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: addressStr,
      };
      
      setCurrentLocation(currentLoc);
      setPickupLocation(currentLoc);
    } catch (error) {
      console.log('Location error:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchText.trim()) return;
    
    setLoading(true);
    try {
      // In a real app, use Google Places API
      // For demo, we'll create a mock location
      const mockLocation = {
        latitude: (pickupLocation?.latitude || 6.5244) + (Math.random() * 0.1 - 0.05),
        longitude: (pickupLocation?.longitude || 3.3792) + (Math.random() * 0.1 - 0.05),
        address: searchText,
      };

      if (step === 'pickup') {
        setPickupLocation(mockLocation);
        setStep('dropoff');
        setSearchText('');
      } else if (step === 'dropoff') {
        setDropoffLocation(mockLocation);
        await getFareEstimate(pickupLocation!, mockLocation);
        setStep('confirm');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to find location');
    } finally {
      setLoading(false);
    }
  };

  const getFareEstimate = async (pickup: any, dropoff: any) => {
    try {
      const response = await estimateFare({
        pickup_lat: pickup.latitude,
        pickup_lng: pickup.longitude,
        dropoff_lat: dropoff.latitude,
        dropoff_lng: dropoff.longitude,
      });
      setFareEstimate(response.data);
    } catch (error) {
      console.log('Fare estimate error:', error);
    }
  };

  const handleBookRide = async () => {
    if (!user?.id || !pickupLocation || !dropoffLocation) return;
    
    setLoading(true);
    try {
      const response = await requestTrip(user.id, {
        pickup_lat: pickupLocation.latitude,
        pickup_lng: pickupLocation.longitude,
        pickup_address: pickupLocation.address,
        dropoff_lat: dropoffLocation.latitude,
        dropoff_lng: dropoffLocation.longitude,
        dropoff_address: dropoffLocation.address,
        payment_method: paymentMethod,
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
      setPickupLocation(currentLocation);
      setStep('dropoff');
    }
  };

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
              if (step === 'confirm') setStep('dropoff');
              else if (step === 'dropoff') setStep('pickup');
              else router.back();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {step === 'pickup' ? 'Set Pickup' : step === 'dropoff' ? 'Set Destination' : 'Confirm Ride'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Location Display */}
          <Card style={styles.locationCard}>
            <TouchableOpacity 
              style={styles.locationRow}
              onPress={() => setStep('pickup')}
            >
              <View style={[styles.locationDot, { backgroundColor: COLORS.primary }]} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>Pickup</Text>
                <Text style={styles.locationAddress} numberOfLines={1}>
                  {pickupLocation?.address || 'Set pickup location'}
                </Text>
              </View>
              {step !== 'confirm' && (
                <Ionicons name="pencil" size={16} color={COLORS.gray400} />
              )}
            </TouchableOpacity>
            
            <View style={styles.locationDivider} />
            
            <TouchableOpacity 
              style={styles.locationRow}
              onPress={() => pickupLocation && setStep('dropoff')}
              disabled={!pickupLocation}
            >
              <View style={[styles.locationDot, { backgroundColor: COLORS.error }]} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>Destination</Text>
                <Text style={styles.locationAddress} numberOfLines={1}>
                  {dropoffLocation?.address || 'Where are you going?'}
                </Text>
              </View>
              {step !== 'confirm' && pickupLocation && (
                <Ionicons name="pencil" size={16} color={COLORS.gray400} />
              )}
            </TouchableOpacity>
          </Card>

          {/* Search Input */}
          {step !== 'confirm' && (
            <View style={styles.searchSection}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={COLORS.gray400} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={step === 'pickup' ? 'Search pickup location' : 'Search destination'}
                  placeholderTextColor={COLORS.gray400}
                  value={searchText}
                  onChangeText={setSearchText}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                />
                {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}>
                    <Ionicons name="close-circle" size={20} color={COLORS.gray400} />
                  </TouchableOpacity>
                )}
              </View>

              {step === 'pickup' && (
                <TouchableOpacity style={styles.currentLocationButton} onPress={useCurrentLocation}>
                  <Ionicons name="locate" size={20} color={COLORS.primary} />
                  <Text style={styles.currentLocationText}>Use current location</Text>
                </TouchableOpacity>
              )}

              {searchText.length > 0 && (
                <Button
                  title={loading ? 'Searching...' : 'Search'}
                  onPress={handleSearch}
                  loading={loading}
                  style={styles.searchButton}
                />
              )}
            </View>
          )}

          {/* Fare Estimate & Confirmation */}
          {step === 'confirm' && fareEstimate && (
            <>
              <Card style={styles.fareCard}>
                <Text style={styles.fareLabel}>Estimated Fare</Text>
                <Text style={styles.fareAmount}>
                  {CURRENCY}{fareEstimate.total_fare?.toLocaleString()}
                </Text>
                <View style={styles.fareDetails}>
                  <View style={styles.fareDetail}>
                    <Ionicons name="navigate" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.fareDetailText}>{fareEstimate.distance_km} km</Text>
                  </View>
                  <View style={styles.fareDetail}>
                    <Ionicons name="time" size={16} color={COLORS.textSecondary} />
                    <Text style={styles.fareDetailText}>{fareEstimate.duration_mins} mins</Text>
                  </View>
                </View>
              </Card>

              {/* Payment Method */}
              <Text style={styles.sectionTitle}>Payment Method</Text>
              <View style={styles.paymentOptions}>
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    paymentMethod === 'cash' && styles.paymentOptionSelected
                  ]}
                  onPress={() => setPaymentMethod('cash')}
                >
                  <Ionicons name="cash" size={24} color={paymentMethod === 'cash' ? COLORS.primary : COLORS.gray500} />
                  <Text style={[
                    styles.paymentOptionText,
                    paymentMethod === 'cash' && styles.paymentOptionTextSelected
                  ]}>Cash</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    paymentMethod === 'bank_transfer' && styles.paymentOptionSelected
                  ]}
                  onPress={() => setPaymentMethod('bank_transfer')}
                >
                  <Ionicons name="card" size={24} color={paymentMethod === 'bank_transfer' ? COLORS.primary : COLORS.gray500} />
                  <Text style={[
                    styles.paymentOptionText,
                    paymentMethod === 'bank_transfer' && styles.paymentOptionTextSelected
                  ]}>Bank Transfer</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.paymentNote}>
                <Ionicons name="information-circle" size={20} color={COLORS.info} />
                <Text style={styles.paymentNoteText}>
                  {paymentMethod === 'cash' 
                    ? 'Pay the driver in cash when you reach your destination'
                    : 'Transfer payment to driver\'s bank account after the ride'
                  }
                </Text>
              </View>

              <Button
                title={loading ? 'Booking...' : `Book Ride - ${CURRENCY}${fareEstimate.total_fare?.toLocaleString()}`}
                onPress={handleBookRide}
                loading={loading}
                icon="car"
                style={styles.bookButton}
              />
            </>
          )}
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
  locationCard: {
    marginBottom: SPACING.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  locationLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  locationAddress: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  locationDivider: {
    height: 1,
    backgroundColor: COLORS.gray200,
    marginLeft: 28,
    marginVertical: SPACING.xs,
  },
  searchSection: {
    marginBottom: SPACING.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  currentLocationText: {
    marginLeft: SPACING.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  searchButton: {
    marginTop: SPACING.sm,
  },
  fareCard: {
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  fareLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  fareAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.primary,
    marginVertical: SPACING.sm,
  },
  fareDetails: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  fareDetail: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fareDetailText: {
    marginLeft: SPACING.xs,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
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
    marginBottom: SPACING.lg,
  },
  paymentNoteText: {
    flex: 1,
    marginLeft: SPACING.sm,
    color: COLORS.info,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  bookButton: {
    marginTop: 'auto',
  },
});
