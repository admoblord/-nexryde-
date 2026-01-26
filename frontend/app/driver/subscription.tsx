import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY, SUBSCRIPTION_PRICE } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, subscription, setSubscription } = useAppStore();
  const [loading, setLoading] = useState(false);

  const isActive = subscription?.status === 'active';

  const handleSubscribe = () => {
    Alert.alert(
      'Subscribe to KODA',
      `Pay ${CURRENCY}${SUBSCRIPTION_PRICE.toLocaleString()} for 30 days of unlimited earnings with zero commission.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: () => {
            setLoading(true);
            setTimeout(() => {
              setSubscription({
                id: 'sub_' + Date.now(),
                user_id: user?.id || '',
                status: 'active',
                start_date: new Date().toISOString(),
                end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                plan: 'monthly',
                amount: SUBSCRIPTION_PRICE,
              });
              setLoading(false);
              Alert.alert(
                'Success!',
                'Your subscription is now active. Go online and start earning!',
                [{ text: 'Start Earning', onPress: () => router.back() }]
              );
            }, 1500);
          }
        }
      ]
    );
  };

  const handleRenew = () => {
    Alert.alert(
      'Renew Subscription',
      `Extend your subscription for another 30 days at ${CURRENCY}${SUBSCRIPTION_PRICE.toLocaleString()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Renew Now', onPress: handleSubscribe }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Status Card */}
        <View style={[
          styles.statusCard,
          isActive && styles.statusCardActive
        ]}>
          <View style={styles.statusIconWrap}>
            <Ionicons 
              name={isActive ? 'checkmark-circle' : 'alert-circle'} 
              size={48} 
              color={isActive ? COLORS.white : COLORS.accent} 
            />
          </View>
          <Text style={styles.statusTitle}>
            {isActive ? 'Premium Driver' : 'No Active Subscription'}
          </Text>
          <Text style={styles.statusSubtext}>
            {isActive 
              ? `Valid until ${new Date(subscription.end_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : 'Subscribe to go online and start earning'
            }
          </Text>
          
          {isActive && (
            <View style={styles.statusBadge}>
              <Ionicons name="infinite" size={16} color={COLORS.success} />
              <Text style={styles.statusBadgeText}>Zero Commission</Text>
            </View>
          )}
        </View>

        {/* Pricing Card */}
        <View style={styles.pricingCard}>
          <View style={styles.pricingHeader}>
            <View style={styles.pricingBadge}>
              <Text style={styles.pricingBadgeText}>Monthly Plan</Text>
            </View>
            <View style={styles.pricingAmount}>
              <Text style={styles.pricingCurrency}>{CURRENCY}</Text>
              <Text style={styles.pricingValue}>{SUBSCRIPTION_PRICE.toLocaleString()}</Text>
              <Text style={styles.pricingPeriod}>/month</Text>
            </View>
          </View>

          <View style={styles.pricingDivider} />

          <View style={styles.pricingFeatures}>
            <View style={styles.pricingFeature}>
              <View style={styles.pricingFeatureIcon}>
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.pricingFeatureTitle}>Keep 100% of fares</Text>
                <Text style={styles.pricingFeatureDesc}>No percentage cuts, ever</Text>
              </View>
            </View>

            <View style={styles.pricingFeature}>
              <View style={styles.pricingFeatureIcon}>
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.pricingFeatureTitle}>Unlimited rides</Text>
                <Text style={styles.pricingFeatureDesc}>Accept as many as you want</Text>
              </View>
            </View>

            <View style={styles.pricingFeature}>
              <View style={styles.pricingFeatureIcon}>
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.pricingFeatureTitle}>Priority support</Text>
                <Text style={styles.pricingFeatureDesc}>24/7 dedicated assistance</Text>
              </View>
            </View>

            <View style={styles.pricingFeature}>
              <View style={styles.pricingFeatureIcon}>
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.pricingFeatureTitle}>Rewards & challenges</Text>
                <Text style={styles.pricingFeatureDesc}>Earn bonuses and badges</Text>
              </View>
            </View>

            <View style={styles.pricingFeature}>
              <View style={styles.pricingFeatureIcon}>
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              </View>
              <View>
                <Text style={styles.pricingFeatureTitle}>AI Assistant</Text>
                <Text style={styles.pricingFeatureDesc}>Smart earnings tips & support</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Comparison */}
        <View style={styles.comparisonCard}>
          <Text style={styles.comparisonTitle}>Why KODA wins</Text>
          <View style={styles.comparisonTable}>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Earn on ₦10,000 ride</Text>
              <View style={styles.comparisonValues}>
                <View style={styles.comparisonKoda}>
                  <Text style={styles.comparisonKodaText}>{CURRENCY}10,000</Text>
                  <Text style={styles.comparisonKodaLabel}>KODA</Text>
                </View>
                <View style={styles.comparisonOther}>
                  <Text style={styles.comparisonOtherText}>{CURRENCY}7,500</Text>
                  <Text style={styles.comparisonOtherLabel}>Others (25% cut)</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.comparisonDivider} />
            
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Monthly (20 rides/day)</Text>
              <View style={styles.comparisonValues}>
                <View style={styles.comparisonKoda}>
                  <Text style={styles.comparisonKodaText}>{CURRENCY}575K</Text>
                  <Text style={styles.comparisonKodaLabel}>After sub</Text>
                </View>
                <View style={styles.comparisonOther}>
                  <Text style={styles.comparisonOtherText}>{CURRENCY}450K</Text>
                  <Text style={styles.comparisonOtherLabel}>With 25% cut</Text>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.comparisonSavings}>
            <Ionicons name="trending-up" size={20} color={COLORS.success} />
            <Text style={styles.comparisonSavingsText}>Save {CURRENCY}125,000+ monthly with KODA!</Text>
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            loading && styles.subscribeButtonLoading
          ]}
          onPress={isActive ? handleRenew : handleSubscribe}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.subscribeButtonText}>
            {loading ? 'Processing...' : (isActive ? 'Renew Subscription' : 'Subscribe Now')}
          </Text>
          {!loading && (
            <View style={styles.subscribeButtonIcon}>
              <Ionicons name="arrow-forward" size={20} color={COLORS.accent} />
            </View>
          )}
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.termsText}>
          By subscribing, you agree to our Terms of Service. Subscription auto-renews unless cancelled.
        </Text>
      </ScrollView>
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
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  // Status Card
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusCardActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  statusIconWrap: {
    marginBottom: SPACING.md,
  },
  statusTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  statusSubtext: {
    fontSize: FONT_SIZE.md,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  statusBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Pricing Card
  pricingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.lg,
  },
  pricingHeader: {
    alignItems: 'center',
  },
  pricingBadge: {
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.md,
  },
  pricingBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accent,
  },
  pricingAmount: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pricingCurrency: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  pricingValue: {
    fontSize: FONT_SIZE.display,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  pricingPeriod: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: 10,
    marginLeft: SPACING.xs,
  },
  pricingDivider: {
    height: 1,
    backgroundColor: COLORS.gray100,
    marginVertical: SPACING.lg,
  },
  pricingFeatures: {
    gap: SPACING.md,
  },
  pricingFeature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  pricingFeatureIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  pricingFeatureTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  pricingFeatureDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  // Comparison
  comparisonCard: {
    backgroundColor: COLORS.gray800,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  comparisonTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  comparisonTable: {},
  comparisonRow: {
    marginBottom: SPACING.sm,
  },
  comparisonLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    marginBottom: SPACING.sm,
  },
  comparisonValues: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  comparisonKoda: {
    flex: 1,
    backgroundColor: COLORS.successSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  comparisonKodaText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.success,
  },
  comparisonKodaLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.success,
  },
  comparisonOther: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  comparisonOtherText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.gray400,
  },
  comparisonOtherLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
  },
  comparisonDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: SPACING.md,
  },
  comparisonSavings: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,210,106,0.1)',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  comparisonSavingsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  // Subscribe Button
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    ...SHADOWS.gold,
  },
  subscribeButtonLoading: {
    opacity: 0.7,
  },
  subscribeButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subscribeButtonIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.lg,
    lineHeight: 18,
  },
});
