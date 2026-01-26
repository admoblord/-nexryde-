import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { FallingRoses, RosePetalsStatic, RoseGlow, FloatingRoseBloom } from '@/src/components/FallingRoses';

const { width } = Dimensions.get('window');

export default function DriverTierScreen() {
  const router = useRouter();
  const [currentTier, setCurrentTier] = useState('basic');
  const [tierConfig, setTierConfig] = useState<any>(null);

  useEffect(() => {
    fetchTierConfig();
  }, []);

  const fetchTierConfig = async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/tiers/config`);
      const data = await response.json();
      setTierConfig(data);
    } catch (error) {
      console.error('Error fetching tier config:', error);
    }
  };

  const handleUpgradeRequest = () => {
    Alert.alert(
      'Upgrade to Premium',
      'Ready to earn more? Complete these steps:\n\n1. Submit vehicle photos\n2. Pass inspection (₦2,000)\n3. Complete training\n\nSame ₦25,000/month - Higher earnings!',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Upgrade', onPress: () => router.push('/driver/upgrade-form') }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      <RosePetalsStatic count={12} />
      <FallingRoses intensity="light" />
      <RoseGlow size={250} style={styles.glowTop} />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver Tiers</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Current Tier Badge */}
          <View style={styles.currentTierSection}>
            <View style={styles.currentTierBadge}>
              <FloatingRoseBloom />
            </View>
            <Text style={styles.currentTierLabel}>Your Current Tier</Text>
            <Text style={styles.currentTierName}>KODA Basic</Text>
            <View style={styles.feeHighlight}>
              <Text style={styles.feeText}>{CURRENCY}25,000/month</Text>
              <View style={styles.feePetal} />
            </View>
          </View>

          {/* Key Message */}
          <View style={styles.messageCard}>
            <LinearGradient
              colors={[COLORS.successSoft, 'transparent']}
              style={styles.messageGradient}
            >
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              <Text style={styles.messageText}>
                Same ₦25,000 fee for ALL tiers.{'\n'}
                Difference = <Text style={styles.messageHighlight}>Earning potential</Text>, NOT cost!
              </Text>
            </LinearGradient>
          </View>

          {/* Tier Comparison */}
          <View style={styles.tiersSection}>
            {/* Basic Tier */}
            <View style={[styles.tierCard, currentTier === 'basic' && styles.tierCardActive]}>
              <LinearGradient
                colors={[COLORS.surface, COLORS.surfaceLight]}
                style={styles.tierGradient}
              >
                <View style={styles.tierHeader}>
                  <View style={[styles.tierIcon, { backgroundColor: `${COLORS.accent}20` }]}>
                    <Ionicons name="car" size={28} color={COLORS.accent} />
                  </View>
                  {currentTier === 'basic' && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>CURRENT</Text>
                    </View>
                  )}
                </View>
                
                <Text style={styles.tierName}>KODA Basic</Text>
                <Text style={styles.tierFee}>{CURRENCY}25,000/month</Text>
                
                <View style={styles.earningsBox}>
                  <Text style={styles.earningsLabel}>Earnings per ride</Text>
                  <Text style={styles.earningsValue}>{CURRENCY}200 - {CURRENCY}300</Text>
                </View>
                
                <View style={styles.requirementsList}>
                  <RequirementItem text="Valid vehicle" met={true} />
                  <RequirementItem text="Clean interior" met={true} />
                  <RequirementItem text="4.3+ rating" met={true} />
                </View>
              </LinearGradient>
            </View>

            {/* Premium Tier */}
            <View style={[styles.tierCard, currentTier === 'premium' && styles.tierCardActive]}>
              <LinearGradient
                colors={[COLORS.rosePetal5, COLORS.rosePetal4]}
                style={styles.tierGradient}
              >
                <View style={styles.premiumBadge}>
                  <Ionicons name="diamond" size={12} color={COLORS.primary} />
                  <Text style={styles.premiumBadgeText}>PREMIUM</Text>
                </View>
                
                <View style={styles.tierHeader}>
                  <View style={[styles.tierIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Ionicons name="diamond" size={28} color={COLORS.white} />
                  </View>
                </View>
                
                <Text style={[styles.tierName, { color: COLORS.white }]}>KODA Premium</Text>
                <Text style={[styles.tierFee, { color: 'rgba(255,255,255,0.9)' }]}>{CURRENCY}25,000/month</Text>
                <Text style={styles.sameFeeNote}>Same fee, higher earnings!</Text>
                
                <View style={[styles.earningsBox, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Text style={[styles.earningsLabel, { color: 'rgba(255,255,255,0.8)' }]}>Earnings per ride</Text>
                  <Text style={[styles.earningsValue, { color: COLORS.white }]}>{CURRENCY}300 - {CURRENCY}450</Text>
                  <Text style={styles.earningsBonus}>+50% more!</Text>
                </View>
                
                <View style={styles.requirementsList}>
                  <RequirementItem text="2018+ vehicle" met={false} light />
                  <RequirementItem text="Leather seats" met={false} light />
                  <RequirementItem text="Dual AC" met={false} light />
                  <RequirementItem text="4.7+ rating" met={false} light />
                  <RequirementItem text="Premium training" met={false} light />
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Premium Perks */}
          <View style={styles.perksSection}>
            <Text style={styles.sectionTitle}>Premium Driver Perks</Text>
            <View style={styles.perksList}>
              <PerkItem icon="headset" text="Priority support" />
              <PerkItem icon="flash" text="Early access to new features" />
              <PerkItem icon="car-sport" text="Free vehicle inspection vouchers" />
              <PerkItem icon="ribbon" text="Premium Driver badge" />
              <PerkItem icon="trending-up" text="Higher earning potential" />
            </View>
          </View>

          {/* Upgrade Path */}
          <View style={styles.upgradeSection}>
            <Text style={styles.sectionTitle}>How to Upgrade (FREE)</Text>
            <View style={styles.stepsList}>
              <StepItem number={1} text="Maintain 4.7★ rating for 60 days" />
              <StepItem number={2} text="Own/lease approved Premium vehicle" />
              <StepItem number={3} text="Complete free Premium Service course" />
              <StepItem number={4} text="Pass vehicle inspection (₦2,000 fee)" />
            </View>
            <Text style={styles.upgradeNote}>
              NO EXTRA MONTHLY FEE - still {CURRENCY}25,000
            </Text>
          </View>

          {/* Upgrade Button */}
          {currentTier === 'basic' && (
            <TouchableOpacity 
              style={styles.upgradeButton}
              onPress={handleUpgradeRequest}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[COLORS.gold, '#C9A030']}
                style={styles.upgradeGradient}
              >
                <Ionicons name="arrow-up-circle" size={24} color={COLORS.primary} />
                <Text style={styles.upgradeButtonText}>Request Upgrade to Premium</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Financial Example */}
          <View style={styles.exampleSection}>
            <Text style={styles.sectionTitle}>Monthly Earnings Example</Text>
            
            <View style={styles.exampleCard}>
              <Text style={styles.exampleTitle}>Basic Driver</Text>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>100 rides × {CURRENCY}2,000</Text>
                <Text style={styles.exampleValue}>{CURRENCY}200,000</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Subscription</Text>
                <Text style={styles.exampleValueRed}>-{CURRENCY}25,000</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Fuel/Maintenance</Text>
                <Text style={styles.exampleValueRed}>~{CURRENCY}100,000</Text>
              </View>
              <View style={[styles.exampleRow, styles.exampleTotal]}>
                <Text style={styles.exampleTotalLabel}>Net Profit</Text>
                <Text style={styles.exampleTotalValue}>~{CURRENCY}75,000</Text>
              </View>
            </View>

            <View style={[styles.exampleCard, styles.exampleCardPremium]}>
              <LinearGradient
                colors={[COLORS.rosePetal5, COLORS.rosePetal4]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Text style={[styles.exampleTitle, { color: COLORS.white }]}>Premium Driver</Text>
              <View style={styles.exampleRow}>
                <Text style={[styles.exampleLabel, { color: 'rgba(255,255,255,0.8)' }]}>80 rides × {CURRENCY}3,000</Text>
                <Text style={[styles.exampleValue, { color: COLORS.white }]}>{CURRENCY}240,000</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={[styles.exampleLabel, { color: 'rgba(255,255,255,0.8)' }]}>Subscription</Text>
                <Text style={[styles.exampleValueRed, { color: '#FFB4B4' }]}>-{CURRENCY}25,000</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={[styles.exampleLabel, { color: 'rgba(255,255,255,0.8)' }]}>Fuel/Maintenance</Text>
                <Text style={[styles.exampleValueRed, { color: '#FFB4B4' }]}>~{CURRENCY}120,000</Text>
              </View>
              <View style={[styles.exampleRow, styles.exampleTotal]}>
                <Text style={[styles.exampleTotalLabel, { color: COLORS.white }]}>Net Profit</Text>
                <Text style={[styles.exampleTotalValue, { color: COLORS.gold }]}>~{CURRENCY}95,000</Text>
              </View>
              <Text style={styles.bonusNote}>+{CURRENCY}20,000 more for same hours!</Text>
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const RequirementItem = ({ text, met, light }: { text: string; met: boolean; light?: boolean }) => (
  <View style={styles.requirementItem}>
    <Ionicons 
      name={met ? "checkmark-circle" : "ellipse-outline"} 
      size={16} 
      color={light ? 'rgba(255,255,255,0.7)' : (met ? COLORS.success : COLORS.textMuted)} 
    />
    <Text style={[styles.requirementText, light && { color: 'rgba(255,255,255,0.8)' }]}>{text}</Text>
  </View>
);

const PerkItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.perkItem}>
    <View style={styles.perkIcon}>
      <Ionicons name={icon as any} size={18} color={COLORS.gold} />
    </View>
    <Text style={styles.perkText}>{text}</Text>
  </View>
);

const StepItem = ({ number, text }: { number: number; text: string }) => (
  <View style={styles.stepItem}>
    <View style={styles.stepNumber}>
      <Text style={styles.stepNumberText}>{number}</Text>
    </View>
    <Text style={styles.stepText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -80,
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
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerRight: {
    width: 44,
  },
  currentTierSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  currentTierBadge: {
    marginBottom: SPACING.md,
  },
  currentTierLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  currentTierName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  feeHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.sm,
  },
  feeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accent,
  },
  feePetal: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
  },
  messageCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
  },
  messageGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
  },
  messageText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.success,
    lineHeight: 20,
  },
  messageHighlight: {
    fontWeight: '700',
  },
  tiersSection: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  tierCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  tierCardActive: {
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  tierGradient: {
    padding: SPACING.lg,
    position: 'relative',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  tierIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  premiumBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    gap: 2,
  },
  premiumBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
  },
  tierName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  tierFee: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  sameFeeNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
    fontWeight: '600',
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },
  earningsBox: {
    backgroundColor: COLORS.gray800,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  earningsLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  earningsValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.accent,
  },
  earningsBonus: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.gold,
    marginTop: 2,
  },
  requirementsList: {
    gap: SPACING.xs,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  requirementText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  perksSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  perksList: {
    gap: SPACING.sm,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
  },
  perkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  upgradeSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  stepsList: {
    gap: SPACING.sm,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  stepText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    flex: 1,
  },
  upgradeNote: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.success,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  upgradeButton: {
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    ...SHADOWS.gold,
  },
  upgradeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  upgradeButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  exampleSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  exampleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  exampleCardPremium: {
    overflow: 'hidden',
    position: 'relative',
  },
  exampleTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  exampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  exampleLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  exampleValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  exampleValueRed: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.error,
  },
  exampleTotal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray700,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  exampleTotalLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  exampleTotalValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.success,
  },
  bonusNote: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gold,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  bottomSpacer: {
    height: 40,
  },
});
