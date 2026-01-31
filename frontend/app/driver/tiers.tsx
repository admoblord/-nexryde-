import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://nexryde-ui.emergent.host';

export default function TiersScreen() {
  const router = useRouter();
  const [pricingData, setPricingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPricingData();
  }, []);

  const fetchPricingData = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscription/pricing`);
      const data = await response.json();
      setPricingData(data);
    } catch (error) {
      console.error('Error fetching pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading pricing phases...</Text>
      </View>
    );
  }

  const phases = [
    {
      id: 'launch',
      name: '🚀 LAUNCH',
      price: pricingData?.phase_prices?.launch || 15000,
      badge: 'FIRST 500 ONLY',
      color: '#FF6B35',
      benefits: [
        '✓ Lowest price ever',
        '✓ Lock-in rate forever',
        '✓ Early adopter benefits',
        '✓ Priority support',
        '✓ Lifetime discount guarantee'
      ],
      available: pricingData?.launch_slots_remaining > 0,
      slotsLeft: pricingData?.launch_slots_remaining || 0
    },
    {
      id: 'early',
      name: '⭐ EARLY ADOPTER',
      price: pricingData?.phase_prices?.early || 18000,
      badge: 'ACTIVE PHASE',
      color: '#00BCD4',
      benefits: [
        '✓ Great value pricing',
        '✓ Full platform access',
        '✓ Standard support',
        '✓ Stable pricing',
        '✓ No hidden fees'
      ],
      available: true,
      current: pricingData?.current_phase === 'early'
    },
    {
      id: 'growth',
      name: '📈 GROWTH',
      price: pricingData?.phase_prices?.growth || 20000,
      badge: 'COMING SOON',
      color: '#9C27B0',
      benefits: [
        '✓ Premium features',
        '✓ Priority matching',
        '✓ Enhanced visibility',
        '✓ Advanced analytics',
        '✓ Premium support'
      ],
      available: false,
      current: pricingData?.current_phase === 'growth'
    },
    {
      id: 'premium',
      name: '💎 PREMIUM',
      price: pricingData?.phase_prices?.premium || 25000,
      badge: 'FUTURE PHASE',
      color: '#FFD700',
      benefits: [
        '✓ All premium features',
        '✓ VIP support 24/7',
        '✓ Highest priority',
        '✓ Exclusive perks',
        '✓ Market leader access'
      ],
      available: false,
      current: pricingData?.current_phase === 'premium'
    }
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription Phases</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={COLORS.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Dynamic Pricing System</Text>
              <Text style={styles.infoText}>
                NEXRYDE uses phased pricing. Join early to lock in the best rates. Prices increase as we grow!
              </Text>
            </View>
          </View>

          {/* Current Phase Indicator */}
          <View style={styles.currentPhaseCard}>
            <Text style={styles.currentPhaseLabel}>CURRENT ACTIVE PHASE</Text>
            <Text style={styles.currentPhaseName}>
              {phases.find(p => p.current)?.name || '⭐ EARLY ADOPTER'}
            </Text>
            <Text style={styles.currentPhasePrice}>
              ₦{(pricingData?.current_price || 18000).toLocaleString()}/month
            </Text>
          </View>

          {/* Phase Cards */}
          {phases.map((phase) => (
            <View 
              key={phase.id} 
              style={[
                styles.phaseCard,
                phase.current && styles.activePhaseCard,
                !phase.available && styles.lockedPhaseCard
              ]}
            >
              {/* Badge */}
              <View style={[styles.phaseBadge, { backgroundColor: phase.color }]}>
                <Text style={styles.phaseBadgeText}>{phase.badge}</Text>
              </View>

              {/* Header */}
              <View style={styles.phaseHeader}>
                <Text style={styles.phaseName}>{phase.name}</Text>
                <Text style={styles.phasePrice}>₦{phase.price.toLocaleString()}</Text>
                <Text style={styles.phasePriceLabel}>per month</Text>
              </View>

              {/* Slots Remaining */}
              {phase.id === 'launch' && phase.slotsLeft > 0 && (
                <View style={styles.slotsCard}>
                  <Ionicons name="time" size={16} color="#FF6B35" />
                  <Text style={styles.slotsText}>
                    Only {phase.slotsLeft} spots remaining!
                  </Text>
                </View>
              )}

              {/* Benefits */}
              <View style={styles.benefitsList}>
                {phase.benefits.map((benefit, index) => (
                  <Text key={index} style={styles.benefitText}>{benefit}</Text>
                ))}
              </View>

              {/* Status */}
              {phase.current ? (
                <View style={styles.currentBadge}>
                  <Ionicons name="checkmark-circle" size={20} color="#00FF00" />
                  <Text style={styles.currentBadgeText}>Your Current Phase</Text>
                </View>
              ) : !phase.available ? (
                <View style={styles.lockedBadge}>
                  <Ionicons name="lock-closed" size={20} color={COLORS.textSecondary} />
                  <Text style={styles.lockedBadgeText}>Not Available Yet</Text>
                </View>
              ) : null}
            </View>
          ))}

          {/* Note */}
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>
              💡 <Text style={styles.noteBold}>Smart Tip:</Text> Join during the Launch or Early phase to lock in the lowest rates forever. Your subscription price never increases once you join!
            </Text>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.lightSurface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  currentPhaseCard: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  currentPhaseLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.white,
    opacity: 0.8,
    marginBottom: SPACING.xs,
    letterSpacing: 1,
  },
  currentPhaseName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  currentPhasePrice: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  phaseCard: {
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.borderColor,
  },
  activePhaseCard: {
    borderColor: '#00FF00',
    backgroundColor: '#00FF0010',
  },
  lockedPhaseCard: {
    opacity: 0.6,
  },
  phaseBadge: {
    position: 'absolute',
    top: -8,
    right: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  phaseBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  phaseHeader: {
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingTop: SPACING.sm,
  },
  phaseName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  phasePrice: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  phasePriceLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  slotsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B3520',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  slotsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#FF6B35',
  },
  benefitsList: {
    marginBottom: SPACING.md,
  },
  benefitText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
    lineHeight: 22,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00FF0020',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  currentBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#00AA00',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.textSecondary + '20',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.xs,
  },
  lockedBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  noteCard: {
    backgroundColor: '#FFD70020',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  noteText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  noteBold: {
    fontWeight: 'bold',
  },
  bottomSpacer: {
    height: 40,
  },
});
