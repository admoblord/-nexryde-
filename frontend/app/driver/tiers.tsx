import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY, SUBSCRIPTION_PRICE } from '@/src/constants/theme';

export default function TiersScreen() {
  const router = useRouter();

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
          <Text style={styles.headerTitle}>Driver Tiers</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Current Tier Card */}
          <View style={styles.currentTierCard}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.currentTierGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View>
                <Text style={styles.currentTierLabel}>Your Current Tier</Text>
                <Text style={styles.currentTierName}>Basic Driver</Text>
              </View>
              <View style={styles.multiplierBadge}>
                <Text style={styles.multiplierText}>1.0x</Text>
                <Text style={styles.multiplierLabel}>Earnings</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Basic Tier */}
          <View style={[styles.tierCard, styles.tierCardActive]}>
            <View style={styles.tierHeader}>
              <View style={[styles.tierIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                <Ionicons name="car" size={24} color={COLORS.accentGreen} />
              </View>
              <View style={styles.tierInfo}>
                <Text style={styles.tierName}>Basic</Text>
                <Text style={styles.tierPrice}>{CURRENCY}{SUBSCRIPTION_PRICE.toLocaleString()}/month</Text>
              </View>
              <View style={styles.tierMultiplier}>
                <Text style={styles.tierMultiplierText}>1x</Text>
              </View>
            </View>
            <View style={styles.tierBenefits}>
              <Text style={styles.tierBenefit}>• Standard fare rates</Text>
              <Text style={styles.tierBenefit}>• Basic support</Text>
              <Text style={styles.tierBenefit}>• Standard visibility</Text>
            </View>
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Current Tier</Text>
            </View>
          </View>

          {/* Premium Tier */}
          <View style={styles.tierCard}>
            <View style={styles.recommendedBadge}>
              <Text style={styles.recommendedText}>RECOMMENDED</Text>
            </View>
            <View style={styles.tierHeader}>
              <View style={[styles.tierIcon, { backgroundColor: COLORS.warningSoft }]}>
                <Ionicons name="star" size={24} color={COLORS.gold} />
              </View>
              <View style={styles.tierInfo}>
                <Text style={styles.tierName}>Premium</Text>
                <Text style={styles.tierPrice}>{CURRENCY}{SUBSCRIPTION_PRICE.toLocaleString()}/month</Text>
              </View>
              <View style={[styles.tierMultiplier, { backgroundColor: COLORS.warningSoft }]}>
                <Text style={[styles.tierMultiplierText, { color: COLORS.gold }]}>1.2x</Text>
              </View>
            </View>
            <View style={styles.tierBenefits}>
              <Text style={styles.tierBenefit}>• 20% higher fares</Text>
              <Text style={styles.tierBenefit}>• Priority support</Text>
              <Text style={styles.tierBenefit}>• Featured in app</Text>
              <Text style={styles.tierBenefit}>• Premium badge</Text>
            </View>
            <View style={styles.requirementsSection}>
              <Text style={styles.requirementsTitle}>Requirements</Text>
              <Text style={styles.requirementItem}>• 4.8+ rating</Text>
              <Text style={styles.requirementItem}>• Vehicle under 5 years</Text>
              <Text style={styles.requirementItem}>• 95% completion rate</Text>
            </View>
            <TouchableOpacity style={styles.upgradeButton}>
              <LinearGradient
                colors={[COLORS.gold, '#FFB800']}
                style={styles.upgradeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.upgradeText}>Upgrade to Premium</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Elite Tier */}
          <View style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <View style={[styles.tierIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
                <Ionicons name="diamond" size={24} color={COLORS.accentBlue} />
              </View>
              <View style={styles.tierInfo}>
                <Text style={styles.tierName}>Elite</Text>
                <Text style={styles.tierPrice}>{CURRENCY}{SUBSCRIPTION_PRICE.toLocaleString()}/month</Text>
              </View>
              <View style={[styles.tierMultiplier, { backgroundColor: COLORS.accentBlueSoft }]}>
                <Text style={[styles.tierMultiplierText, { color: COLORS.accentBlue }]}>1.5x</Text>
              </View>
            </View>
            <View style={styles.tierBenefits}>
              <Text style={styles.tierBenefit}>• 50% higher fares</Text>
              <Text style={styles.tierBenefit}>• VIP support 24/7</Text>
              <Text style={styles.tierBenefit}>• Top of search results</Text>
              <Text style={styles.tierBenefit}>• Elite badge & benefits</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
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
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  currentTierCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  currentTierGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  currentTierLabel: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  currentTierName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  multiplierBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  multiplierText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  multiplierLabel: {
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.8)',
  },
  tierCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  tierCardActive: {
    borderColor: COLORS.accentGreen,
    borderWidth: 2,
  },
  recommendedBadge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  recommendedText: {
    fontSize: FONT_SIZE.xxs,
    fontWeight: '700',
    color: COLORS.white,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  tierIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  tierPrice: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  tierMultiplier: {
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  tierMultiplierText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  tierBenefits: {
    marginBottom: SPACING.md,
  },
  tierBenefit: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: 4,
  },
  currentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  currentBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  requirementsSection: {
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  requirementsTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  requirementItem: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: 2,
  },
  upgradeButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  upgradeGradient: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  upgradeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
