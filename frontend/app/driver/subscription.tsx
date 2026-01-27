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

export default function SubscriptionScreen() {
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
          <Text style={styles.headerTitle}>Subscription</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Current Status */}
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: COLORS.lightSurface }]}>
              <Ionicons name="card-outline" size={24} color={COLORS.lightTextMuted} />
            </View>
            <View>
              <Text style={styles.statusTitle}>No Active Subscription</Text>
              <Text style={styles.statusSubtitle}>Subscribe to start earning</Text>
            </View>
          </View>

          {/* Pricing Card */}
          <View style={styles.pricingCard}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.pricingGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.bestValueBadge}>
                <Text style={styles.bestValueText}>BEST VALUE</Text>
              </View>
              <Text style={styles.planName}>Monthly Plan</Text>
              <Text style={styles.planPrice}>
                {CURRENCY}{SUBSCRIPTION_PRICE.toLocaleString()}
                <Text style={styles.planPeriod}>/month</Text>
              </Text>
              <Text style={styles.planSavings}>Save {CURRENCY}125,000+ monthly vs commission apps!</Text>
            </LinearGradient>
          </View>

          {/* Benefits */}
          <Text style={styles.sectionTitle}>What You Get</Text>
          <View style={styles.benefitsGrid}>
            <BenefitCard 
              icon="cash" 
              title="100% Earnings" 
              desc="Keep every naira you earn"
              color={COLORS.accentGreen}
            />
            <BenefitCard 
              icon="close-circle" 
              title="Zero Commission" 
              desc="No cuts from your rides"
              color={COLORS.error}
            />
            <BenefitCard 
              icon="trophy" 
              title="Daily Challenges" 
              desc="Earn bonus rewards"
              color={COLORS.gold}
            />
            <BenefitCard 
              icon="sparkles" 
              title="AI Assistant" 
              desc="Smart driving insights"
              color={COLORS.accentBlue}
            />
          </View>
        </ScrollView>

        {/* Subscribe Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity style={styles.subscribeButton}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.subscribeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.subscribeText}>Subscribe - {CURRENCY}{SUBSCRIPTION_PRICE.toLocaleString()}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const BenefitCard = ({ icon, title, desc, color }: { icon: string; title: string; desc: string; color: string }) => (
  <View style={styles.benefitCard}>
    <View style={[styles.benefitIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon as any} size={22} color={color} />
    </View>
    <Text style={styles.benefitTitle}>{title}</Text>
    <Text style={styles.benefitDesc}>{desc}</Text>
  </View>
);

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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  pricingCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  pricingGradient: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  bestValueBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.md,
  },
  bestValueText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  planName: {
    fontSize: FONT_SIZE.md,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: SPACING.xs,
  },
  planPrice: {
    fontSize: 48,
    fontWeight: '800',
    color: COLORS.white,
  },
  planPeriod: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '400',
  },
  planSavings: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  benefitCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  benefitTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  subscribeButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  subscribeGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  subscribeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
