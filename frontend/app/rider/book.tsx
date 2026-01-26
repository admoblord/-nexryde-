import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { estimateFare } from '@/src/services/api';

const { width } = Dimensions.get('window');

export default function BookRideScreen() {
  const router = useRouter();
  const { currentLocation, pickupLocation, dropoffLocation, setPickupLocation, setDropoffLocation } = useAppStore();
  
  const [step, setStep] = useState<'pickup' | 'destination' | 'confirm'>('pickup');
  const [pickupText, setPickupText] = useState(currentLocation?.address || 'Current Location');
  const [destinationText, setDestinationText] = useState('');
  const [fareEstimate, setFareEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<'cash' | 'transfer'>('cash');

  const handleSetPickup = () => {
    if (pickupText.trim()) {
      setPickupLocation({
        latitude: currentLocation?.latitude || 6.5244,
        longitude: currentLocation?.longitude || 3.3792,
        address: pickupText,
      });
      setStep('destination');
    }
  };

  const handleSetDestination = async () => {
    if (!destinationText.trim()) {
      Alert.alert('Error', 'Please enter your destination');
      return;
    }

    setDropoffLocation({
      latitude: 6.4541,
      longitude: 3.3947,
      address: destinationText,
    });

    // Get fare estimate
    setLoading(true);
    try {
      const response = await estimateFare({
        pickup_lat: currentLocation?.latitude || 6.5244,
        pickup_lng: currentLocation?.longitude || 3.3792,
        dropoff_lat: 6.4541,
        dropoff_lng: 3.3947,
      });
      setFareEstimate(response.data);
      setStep('confirm');
    } catch (error) {
      // Use fallback estimate
      setFareEstimate({
        distance_km: 8.5,
        duration_min: 25,
        base_fare: 800,
        distance_fare: 1020,
        time_fare: 500,
        total_fare: 2320,
        surge_multiplier: 1.0,
      });
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRide = () => {
    Alert.alert(
      'Finding Driver',
      'Looking for nearby drivers...',
      [
        {
          text: 'OK',
          onPress: () => router.push('/rider/tracking')
        }
      ]
    );
  };

  const renderPickupStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Pickup Location</Text>
        <View style={styles.inputWrapper}>
          <View style={styles.inputIconWrap}>
            <View style={styles.pickupDot} />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Enter pickup location"
            placeholderTextColor={COLORS.gray400}
            value={pickupText}
            onChangeText={setPickupText}
          />
          <TouchableOpacity style={styles.locationButton}>
            <Ionicons name="locate" size={20} color={COLORS.info} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.suggestionsSection}>
        <Text style={styles.suggestionsTitle}>Suggestions</Text>
        <TouchableOpacity 
          style={styles.suggestionItem}
          onPress={() => {
            setPickupText('Current Location');
            handleSetPickup();
          }}
        >
          <View style={[styles.suggestionIcon, { backgroundColor: COLORS.infoSoft }]}>
            <Ionicons name="navigate" size={20} color={COLORS.info} />
          </View>
          <View style={styles.suggestionContent}>
            <Text style={styles.suggestionTitle}>Current Location</Text>
            <Text style={styles.suggestionAddress}>Use GPS location</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.suggestionItem}>
          <View style={[styles.suggestionIcon, { backgroundColor: COLORS.accentSoft }]}>
            <Ionicons name="home" size={20} color={COLORS.accent} />
          </View>
          <View style={styles.suggestionContent}>
            <Text style={styles.suggestionTitle}>Home</Text>
            <Text style={styles.suggestionAddress}>Set home address</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.suggestionItem}>
          <View style={[styles.suggestionIcon, { backgroundColor: COLORS.successSoft }]}>
            <Ionicons name="briefcase" size={20} color={COLORS.success} />
          </View>
          <View style={styles.suggestionContent}>
            <Text style={styles.suggestionTitle}>Work</Text>
            <Text style={styles.suggestionAddress}>Set work address</Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.continueButton}
        onPress={handleSetPickup}
        activeOpacity={0.8}
      >
        <Text style={styles.continueButtonText}>Confirm Pickup</Text>
        <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderDestinationStep = () => (
    <View style={styles.stepContainer}>
      {/* Selected Pickup */}
      <View style={styles.selectedLocation}>
        <View style={styles.pickupDot} />
        <Text style={styles.selectedLocationText}>{pickupText}</Text>
        <TouchableOpacity onPress={() => setStep('pickup')}>
          <Ionicons name="pencil" size={16} color={COLORS.info} />
        </TouchableOpacity>
      </View>

      <View style={styles.routeLine} />

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Where are you going?</Text>
        <View style={styles.inputWrapper}>
          <View style={styles.inputIconWrap}>
            <View style={styles.destinationDot} />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Enter destination"
            placeholderTextColor={COLORS.gray400}
            value={destinationText}
            onChangeText={setDestinationText}
            autoFocus
          />
        </View>
      </View>

      <View style={styles.suggestionsSection}>
        <Text style={styles.suggestionsTitle}>Popular Destinations</Text>
        {[
          { name: 'Ikeja City Mall', address: 'Obafemi Awolowo Way, Ikeja' },
          { name: 'Lekki Phase 1', address: 'Lekki, Lagos' },
          { name: 'Victoria Island', address: 'VI, Lagos' },
        ].map((item, index) => (
          <TouchableOpacity 
            key={index}
            style={styles.suggestionItem}
            onPress={() => setDestinationText(item.name)}
          >
            <View style={[styles.suggestionIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="location" size={20} color={COLORS.gray600} />
            </View>
            <View style={styles.suggestionContent}>
              <Text style={styles.suggestionTitle}>{item.name}</Text>
              <Text style={styles.suggestionAddress}>{item.address}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity 
        style={[
          styles.continueButton,
          !destinationText.trim() && styles.continueButtonDisabled
        ]}
        onPress={handleSetDestination}
        disabled={loading || !destinationText.trim()}
        activeOpacity={0.8}
      >
        <Text style={styles.continueButtonText}>
          {loading ? 'Calculating...' : 'Get Fare Estimate'}
        </Text>
        <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderConfirmStep = () => (
    <View style={styles.stepContainer}>
      {/* Route Summary */}
      <View style={styles.routeSummary}>
        <View style={styles.routePoint}>
          <View style={styles.pickupDot} />
          <View style={styles.routePointContent}>
            <Text style={styles.routePointLabel}>Pickup</Text>
            <Text style={styles.routePointText}>{pickupText}</Text>
          </View>
        </View>
        <View style={styles.routeLineVertical} />
        <View style={styles.routePoint}>
          <View style={styles.destinationDot} />
          <View style={styles.routePointContent}>
            <Text style={styles.routePointLabel}>Destination</Text>
            <Text style={styles.routePointText}>{destinationText}</Text>
          </View>
        </View>
      </View>

      {/* Fare Card */}
      <View style={styles.fareCard}>
        <View style={styles.fareHeader}>
          <Text style={styles.fareTitle}>Estimated Fare</Text>
          <View style={styles.fareTime}>
            <Ionicons name="time" size={16} color={COLORS.gray500} />
            <Text style={styles.fareTimeText}>{fareEstimate?.duration_min || 25} min</Text>
          </View>
        </View>
        
        <Text style={styles.fareAmount}>
          {CURRENCY}{fareEstimate?.total_fare?.toLocaleString() || '2,320'}
        </Text>
        
        <View style={styles.fareDetails}>
          <View style={styles.fareDetailItem}>
            <Text style={styles.fareDetailLabel}>Distance</Text>
            <Text style={styles.fareDetailValue}>{fareEstimate?.distance_km || '8.5'} km</Text>
          </View>
          <View style={styles.fareDetailDivider} />
          <View style={styles.fareDetailItem}>
            <Text style={styles.fareDetailLabel}>Base Fare</Text>
            <Text style={styles.fareDetailValue}>{CURRENCY}{fareEstimate?.base_fare || '800'}</Text>
          </View>
        </View>
      </View>

      {/* Payment Selection */}
      <Text style={styles.paymentTitle}>Payment Method</Text>
      <View style={styles.paymentOptions}>
        <TouchableOpacity 
          style={[
            styles.paymentOption,
            selectedPayment === 'cash' && styles.paymentOptionSelected
          ]}
          onPress={() => setSelectedPayment('cash')}
        >
          <Ionicons 
            name="cash" 
            size={24} 
            color={selectedPayment === 'cash' ? COLORS.success : COLORS.gray400} 
          />
          <Text style={[
            styles.paymentOptionText,
            selectedPayment === 'cash' && styles.paymentOptionTextSelected
          ]}>Cash</Text>
          {selectedPayment === 'cash' && (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.paymentOption,
            selectedPayment === 'transfer' && styles.paymentOptionSelected
          ]}
          onPress={() => setSelectedPayment('transfer')}
        >
          <Ionicons 
            name="card" 
            size={24} 
            color={selectedPayment === 'transfer' ? COLORS.info : COLORS.gray400} 
          />
          <Text style={[
            styles.paymentOptionText,
            selectedPayment === 'transfer' && styles.paymentOptionTextSelected
          ]}>Transfer</Text>
          {selectedPayment === 'transfer' && (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.info} />
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.confirmButton}
        onPress={handleConfirmRide}
        activeOpacity={0.8}
      >
        <Text style={styles.confirmButtonText}>Confirm Ride</Text>
        <View style={styles.confirmButtonPrice}>
          <Text style={styles.confirmButtonPriceText}>
            {CURRENCY}{fareEstimate?.total_fare?.toLocaleString() || '2,320'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => step === 'pickup' ? router.back() : setStep(step === 'confirm' ? 'destination' : 'pickup')}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'pickup' ? 'Set Pickup' : step === 'destination' ? 'Set Destination' : 'Confirm Ride'}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressStep, step !== 'pickup' && styles.progressStepComplete]}>
          <Text style={styles.progressStepText}>1</Text>
        </View>
        <View style={[styles.progressLine, step !== 'pickup' && styles.progressLineComplete]} />
        <View style={[
          styles.progressStep, 
          step === 'confirm' && styles.progressStepComplete,
          step === 'destination' && styles.progressStepActive
        ]}>
          <Text style={styles.progressStepText}>2</Text>
        </View>
        <View style={[styles.progressLine, step === 'confirm' && styles.progressLineComplete]} />
        <View style={[
          styles.progressStep,
          step === 'confirm' && styles.progressStepActive
        ]}>
          <Text style={styles.progressStepText}>3</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'pickup' && renderPickupStep()}
          {step === 'destination' && renderDestinationStep()}
          {step === 'confirm' && renderConfirmStep()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  headerPlaceholder: {
    width: 44,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: SPACING.md,
  },
  progressStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStepActive: {
    backgroundColor: COLORS.accent,
  },
  progressStepComplete: {
    backgroundColor: COLORS.success,
  },
  progressStepText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  progressLine: {
    width: 40,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: SPACING.xs,
  },
  progressLineComplete: {
    backgroundColor: COLORS.success,
  },
  content: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  stepContainer: {
    flex: 1,
  },
  inputSection: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.gray100,
    paddingHorizontal: SPACING.md,
  },
  inputIconWrap: {
    width: 24,
    alignItems: 'center',
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.success,
  },
  destinationDot: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: COLORS.error,
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  locationButton: {
    padding: SPACING.sm,
  },
  selectedLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
  },
  selectedLocationText: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  routeLine: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.gray200,
    marginLeft: SPACING.md + 5,
    marginVertical: SPACING.xs,
  },
  suggestionsSection: {
    flex: 1,
  },
  suggestionsTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  suggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  suggestionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  suggestionAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    ...SHADOWS.gold,
  },
  continueButtonDisabled: {
    backgroundColor: COLORS.gray200,
    shadowOpacity: 0,
  },
  continueButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  // Confirm Step
  routeSummary: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  routePointContent: {
    flex: 1,
  },
  routePointLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  routePointText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  routeLineVertical: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.gray300,
    marginLeft: 5,
    marginVertical: SPACING.sm,
  },
  fareCard: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.lg,
  },
  fareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  fareTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  fareTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  fareTimeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  fareAmount: {
    fontSize: FONT_SIZE.display,
    fontWeight: '800',
    color: COLORS.accent,
    marginBottom: SPACING.md,
  },
  fareDetails: {
    flexDirection: 'row',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  fareDetailItem: {
    flex: 1,
  },
  fareDetailLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
  },
  fareDetailValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  fareDetailDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: SPACING.md,
  },
  paymentTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray50,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.gray100,
    gap: SPACING.sm,
  },
  paymentOptionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
  paymentOptionText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  paymentOptionTextSelected: {
    color: COLORS.textPrimary,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    ...SHADOWS.gold,
  },
  confirmButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  confirmButtonPrice: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  confirmButtonPriceText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
