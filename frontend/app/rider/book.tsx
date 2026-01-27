import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function BookScreen() {
  const router = useRouter();
  const { setPickupLocation, setDropoffLocation } = useAppStore();
  const [step, setStep] = useState(1);
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedService, setSelectedService] = useState('economy');
  const [selectedPayment, setSelectedPayment] = useState('cash');

  const handleConfirmPickup = () => {
    setPickupLocation({
      latitude: 6.5244,
      longitude: 3.3792,
      address: pickup || 'Current Location',
    });
    setStep(2);
  };

  const handleConfirmDestination = () => {
    setDropoffLocation({
      latitude: 6.4541,
      longitude: 3.3947,
      address: destination || 'Selected Destination',
    });
    setStep(3);
  };

  const handleBookRide = () => {
    router.push('/rider/tracking');
  };

  const estimatedFare = selectedService === 'premium' ? 3500 : 2320;
  const estimatedTime = '15-20 min';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 80, right: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, left: 20, backgroundColor: COLORS.accentBlue, width: 60, height: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => step > 1 ? setStep(step - 1) : router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 1 ? 'Set Pickup' : step === 2 ? 'Set Destination' : 'Confirm Ride'}
          </Text>
          <View style={styles.headerRight} />
        </View>

        {/* Step Indicator */}
        <View style={styles.stepIndicator}>
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <View style={[styles.stepDot, step >= s && styles.stepDotActive]}>
                {step > s ? (
                  <Ionicons name="checkmark" size={14} color={COLORS.primary} />
                ) : (
                  <Text style={[styles.stepNumber, step >= s && styles.stepNumberActive]}>{s}</Text>
                )}
              </View>
              {s < 3 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
            </React.Fragment>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Step 1: Pickup */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <View style={styles.inputCard}>
                <LinearGradient
                  colors={[COLORS.surface, COLORS.surfaceLight]}
                  style={styles.inputCardGradient}
                >
                  <Text style={styles.inputLabel}>Pickup Location</Text>
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputIcon}>
                      <View style={styles.pickupDot} />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter pickup address"
                      placeholderTextColor={COLORS.textMuted}
                      value={pickup}
                      onChangeText={setPickup}
                    />
                  </View>
                </LinearGradient>
              </View>

              <Text style={styles.suggestionsTitle}>Suggestions</Text>
              
              <TouchableOpacity 
                style={styles.suggestionCard}
                onPress={() => setPickup('Current Location')}
              >
                <View style={[styles.suggestionIcon, { backgroundColor: COLORS.successSoft }]}>
                  <Ionicons name="locate" size={20} color={COLORS.success} />
                </View>
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionTitle}>Current Location</Text>
                  <Text style={styles.suggestionSubtitle}>Use GPS location</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.suggestionCard}
                onPress={() => setPickup('Home - Victoria Island')}
              >
                <View style={[styles.suggestionIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
                  <Ionicons name="home" size={20} color={COLORS.accentBlue} />
                </View>
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionTitle}>Home</Text>
                  <Text style={styles.suggestionSubtitle}>Victoria Island, Lagos</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.suggestionCard}
                onPress={() => setPickup('Work - Lekki Phase 1')}
              >
                <View style={[styles.suggestionIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                  <Ionicons name="briefcase" size={20} color={COLORS.accentGreen} />
                </View>
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionTitle}>Work</Text>
                  <Text style={styles.suggestionSubtitle}>Lekki Phase 1, Lagos</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 2: Destination */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <View style={styles.inputCard}>
                <LinearGradient
                  colors={[COLORS.surface, COLORS.surfaceLight]}
                  style={styles.inputCardGradient}
                >
                  <Text style={styles.inputLabel}>Destination</Text>
                  <View style={styles.inputWrapper}>
                    <View style={styles.inputIcon}>
                      <View style={styles.destDot} />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="Where are you going?"
                      placeholderTextColor={COLORS.textMuted}
                      value={destination}
                      onChangeText={setDestination}
                    />
                  </View>
                </LinearGradient>
              </View>

              <Text style={styles.suggestionsTitle}>Recent Places</Text>
              
              {['Ikeja City Mall', 'Murtala Muhammed Airport', 'The Palms Shopping Mall'].map((place, i) => (
                <TouchableOpacity 
                  key={i}
                  style={styles.suggestionCard}
                  onPress={() => setDestination(place)}
                >
                  <View style={[styles.suggestionIcon, { backgroundColor: COLORS.infoSoft }]}>
                    <Ionicons name="time" size={20} color={COLORS.info} />
                  </View>
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionTitle}>{place}</Text>
                    <Text style={styles.suggestionSubtitle}>Lagos, Nigeria</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <View style={styles.stepContent}>
              {/* Route Summary */}
              <View style={styles.routeCard}>
                <LinearGradient
                  colors={[COLORS.surface, COLORS.surfaceLight]}
                  style={styles.routeGradient}
                >
                  <View style={styles.routePoint}>
                    <View style={styles.pickupDot} />
                    <View style={styles.routeTextWrap}>
                      <Text style={styles.routeLabel}>Pickup</Text>
                      <Text style={styles.routeText}>{pickup || 'Current Location'}</Text>
                    </View>
                  </View>
                  <View style={styles.routeLine}>
                    <View style={styles.routeLineInner} />
                  </View>
                  <View style={styles.routePoint}>
                    <View style={styles.destDot} />
                    <View style={styles.routeTextWrap}>
                      <Text style={styles.routeLabel}>Destination</Text>
                      <Text style={styles.routeText}>{destination || 'Selected Destination'}</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* Service Selection */}
              <Text style={styles.sectionTitle}>Choose Your Ride</Text>
              <View style={styles.servicesRow}>
                <TouchableOpacity
                  style={[styles.serviceOption, selectedService === 'economy' && styles.serviceOptionActive]}
                  onPress={() => setSelectedService('economy')}
                >
                  <View style={styles.serviceIconWrap}>
                    <Ionicons name="car" size={28} color={selectedService === 'economy' ? COLORS.accentGreen : COLORS.textMuted} />
                  </View>
                  <Text style={[styles.serviceName, selectedService === 'economy' && styles.serviceNameActive]}>Economy</Text>
                  <Text style={styles.servicePrice}>{CURRENCY}2,320</Text>
                  <Text style={styles.serviceTime}>{estimatedTime}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.serviceOption, selectedService === 'premium' && styles.serviceOptionActive]}
                  onPress={() => setSelectedService('premium')}
                >
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumBadgeText}>LUXURY</Text>
                  </View>
                  <View style={styles.serviceIconWrap}>
                    <Ionicons name="diamond" size={28} color={selectedService === 'premium' ? COLORS.gold : COLORS.textMuted} />
                  </View>
                  <Text style={[styles.serviceName, selectedService === 'premium' && styles.serviceNameActive]}>Premium</Text>
                  <Text style={styles.servicePrice}>{CURRENCY}3,500</Text>
                  <Text style={styles.serviceTime}>{estimatedTime}</Text>
                </TouchableOpacity>
              </View>

              {/* Payment Selection */}
              <Text style={styles.sectionTitle}>Payment Method</Text>
              <View style={styles.paymentOptions}>
                <TouchableOpacity
                  style={[styles.paymentOption, selectedPayment === 'cash' && styles.paymentOptionActive]}
                  onPress={() => setSelectedPayment('cash')}
                >
                  <Ionicons name="cash" size={24} color={selectedPayment === 'cash' ? COLORS.success : COLORS.textMuted} />
                  <Text style={[styles.paymentText, selectedPayment === 'cash' && styles.paymentTextActive]}>Cash</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentOption, selectedPayment === 'transfer' && styles.paymentOptionActive]}
                  onPress={() => setSelectedPayment('transfer')}
                >
                  <Ionicons name="card" size={24} color={selectedPayment === 'transfer' ? COLORS.info : COLORS.textMuted} />
                  <Text style={[styles.paymentText, selectedPayment === 'transfer' && styles.paymentTextActive]}>Transfer</Text>
                </TouchableOpacity>
              </View>

              {/* Fare Summary */}
              <View style={styles.fareCard}>
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Estimated Fare</Text>
                  <Text style={styles.fareValue}>{CURRENCY}{estimatedFare.toLocaleString()}</Text>
                </View>
                <View style={styles.fareDivider} />
                <View style={styles.fareFeatures}>
                  <View style={styles.fareFeature}>
                    <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
                    <Text style={styles.fareFeatureText}>Insured trip</Text>
                  </View>
                  <View style={styles.fareFeature}>
                    <Ionicons name="location" size={16} color={COLORS.info} />
                    <Text style={styles.fareFeatureText}>Live tracking</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom Action Button */}
        <View style={styles.bottomAction}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={step === 1 ? handleConfirmPickup : step === 2 ? handleConfirmDestination : handleBookRide}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.actionGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.actionText}>
                {step === 1 ? 'Confirm Pickup' : step === 2 ? 'Confirm Destination' : 'Book Ride'}
              </Text>
              <View style={styles.actionArrow}>
                <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
              </View>
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
    backgroundColor: COLORS.background,
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.12,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  headerRight: {
    width: 44,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surfaceLight,
  },
  stepDotActive: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  stepNumber: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  stepNumberActive: {
    color: COLORS.primary,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.surfaceLight,
    marginHorizontal: SPACING.xs,
  },
  stepLineActive: {
    backgroundColor: COLORS.accentGreen,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
  },
  stepContent: {
    flex: 1,
  },
  inputCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  inputCardGradient: {
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
  },
  inputIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
  },
  destDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: COLORS.accentBlue,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.white,
    paddingVertical: SPACING.md,
  },
  suggestionsTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
    marginTop: SPACING.sm,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  suggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  suggestionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  routeCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
  },
  routeGradient: {
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeTextWrap: {
    marginLeft: SPACING.md,
  },
  routeLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  routeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  routeLine: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.surfaceLight,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  routeLineInner: {
    flex: 1,
    backgroundColor: COLORS.accentGreen,
    opacity: 0.5,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  servicesRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  serviceOption: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surfaceLight,
  },
  serviceOptionActive: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.accentGreenSoft,
  },
  premiumBadge: {
    position: 'absolute',
    top: -8,
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  premiumBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
  },
  serviceIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  serviceName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  serviceNameActive: {
    color: COLORS.white,
  },
  servicePrice: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.accentGreen,
    marginTop: SPACING.xs,
  },
  serviceTime: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.surfaceLight,
  },
  paymentOptionActive: {
    borderColor: COLORS.accentGreen,
  },
  paymentText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  paymentTextActive: {
    color: COLORS.white,
  },
  fareCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  fareValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.accentGreen,
  },
  fareDivider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
    marginVertical: SPACING.md,
  },
  fareFeatures: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  fareFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  fareFeatureText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  bottomAction: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  actionButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
  },
  actionText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  actionArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
