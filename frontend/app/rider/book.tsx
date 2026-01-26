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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { FallingRoses, RosePetalsStatic, RoseGlow, FloatingRoseBloom } from '@/src/components/FallingRoses';

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
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Background rose effects */}
      <RosePetalsStatic count={10} />
      <FallingRoses intensity="light" />
      
      {/* Decorative glow */}
      <RoseGlow size={300} style={styles.glowTopRight} />
      
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
                <View style={styles.suggestionRose} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.suggestionCard}
                onPress={() => setPickup('Home - Victoria Island')}
              >
                <View style={[styles.suggestionIcon, { backgroundColor: COLORS.accentSoft }]}>
                  <Ionicons name="home" size={20} color={COLORS.accent} />
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
                <View style={[styles.suggestionIcon, { backgroundColor: COLORS.infoSoft }]}>
                  <Ionicons name="briefcase" size={20} color={COLORS.info} />
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
                  <View style={[styles.suggestionIcon, { backgroundColor: `${COLORS.rosePetal2}20` }]}>
                    <Ionicons name="time" size={20} color={COLORS.rosePetal2} />
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
                    <Ionicons name="car" size={28} color={selectedService === 'economy' ? COLORS.accent : COLORS.textMuted} />
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
              colors={[COLORS.accent, COLORS.accentDark]}
              style={styles.actionGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.actionText}>
                {step === 1 ? 'Confirm Pickup' : step === 2 ? 'Confirm Destination' : 'Book Ride'}
              </Text>
              <View style={styles.actionArrow}>
                <Ionicons name="arrow-forward" size={20} color={COLORS.accent} />
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
    backgroundColor: COLORS.primary,
  },
  glowTopRight: {
    position: 'absolute',
    top: -100,
    right: -100,
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
    borderColor: COLORS.gray700,
  },
  stepDotActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
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
    backgroundColor: COLORS.gray700,
    marginHorizontal: SPACING.xs,
  },
  stepLineActive: {
    backgroundColor: COLORS.accent,
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
    ...SHADOWS.md,
  },
  inputCardGradient: {
    padding: SPACING.lg,
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
    backgroundColor: COLORS.gray800,
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
    backgroundColor: COLORS.success,
  },
  destDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: COLORS.rosePetal3,
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
    borderColor: COLORS.gray800,
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
  suggestionRose: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
    opacity: 0.6,
  },
  routeCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    ...SHADOWS.md,
  },
  routeGradient: {
    padding: SPACING.lg,
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
    backgroundColor: COLORS.gray700,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  routeLineInner: {
    flex: 1,
    backgroundColor: COLORS.accent,
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
    borderColor: COLORS.gray700,
  },
  serviceOptionActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
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
    backgroundColor: COLORS.gray800,
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
    color: COLORS.accent,
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
    borderColor: COLORS.gray700,
  },
  paymentOptionActive: {
    borderColor: COLORS.accent,
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
    borderColor: COLORS.gray700,
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
    color: COLORS.accent,
  },
  fareDivider: {
    height: 1,
    backgroundColor: COLORS.gray700,
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
    ...SHADOWS.rose,
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
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
