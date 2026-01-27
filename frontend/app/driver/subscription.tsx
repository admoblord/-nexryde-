import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY, SUBSCRIPTION_PRICE } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, subscription, setSubscription } = useAppStore();
  const [loading, setLoading] = useState(false);
  const isActive = subscription?.status === 'active';

  const handleSubscribe = () => {
    Alert.alert('Subscribe to NEXRYDE', `Pay ${CURRENCY}${SUBSCRIPTION_PRICE.toLocaleString()} for 30 days of unlimited earnings with zero commission.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Pay Now', onPress: () => {
        setLoading(true);
        setTimeout(() => {
          setSubscription({ id: 'sub_' + Date.now(), user_id: user?.id || '', status: 'active', start_date: new Date().toISOString(), end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), plan: 'monthly', amount: SUBSCRIPTION_PRICE });
          setLoading(false);
          Alert.alert('Success!', 'Your subscription is now active. Go online and start earning!', [{ text: 'Start Earning', onPress: () => router.back() }]);
        }, 1500);
      }}
    ]);
  };

  const benefits = [
    { icon: 'cash', title: '100% Earnings', desc: 'Keep every naira you earn', color: COLORS.accentGreen },
    { icon: 'shield-checkmark', title: 'Zero Commission', desc: 'No cuts from your rides', color: COLORS.accentBlue },
    { icon: 'trophy', title: 'Daily Challenges', desc: 'Earn bonus rewards', color: COLORS.gold },
    { icon: 'sparkles', title: 'AI Assistant', desc: 'Smart driving insights', color: COLORS.info },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.primary, COLORS.background]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.glow, { top: 80, right: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, left: 20, backgroundColor: COLORS.gold, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Status Card */}
          <View style={styles.statusCard}>
            <LinearGradient colors={isActive ? [COLORS.accentGreen, COLORS.accentGreenDark] : [COLORS.surface, COLORS.surfaceLight]} style={styles.statusGradient}>
              <View style={styles.statusIcon}>
                <Ionicons name={isActive ? 'checkmark-circle' : 'card'} size={32} color={isActive ? COLORS.white : COLORS.accentGreen} />
              </View>
              <View style={styles.statusInfo}>
                <Text style={[styles.statusTitle, isActive && { color: COLORS.white }]}>{isActive ? 'Active Subscription' : 'No Active Subscription'}</Text>
                <Text style={[styles.statusSubtitle, isActive && { color: 'rgba(255,255,255,0.8)' }]}>{isActive ? '28 days remaining' : 'Subscribe to start earning'}</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Pricing Card */}
          <View style={styles.pricingCard}>
            <LinearGradient colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]} style={styles.pricingGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <View style={styles.pricingBadge}>
                <Text style={styles.pricingBadgeText}>BEST VALUE</Text>
              </View>
              <Text style={styles.pricingLabel}>Monthly Plan</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceCurrency}>{CURRENCY}</Text>
                <Text style={styles.priceAmount}>{SUBSCRIPTION_PRICE.toLocaleString()}</Text>
                <Text style={styles.pricePeriod}>/month</Text>
              </View>
              <Text style={styles.pricingSave}>Save {CURRENCY}125,000+ monthly vs commission apps!</Text>
            </LinearGradient>
          </View>

          {/* Benefits */}
          <Text style={styles.sectionTitle}>What You Get</Text>
          <View style={styles.benefitsGrid}>
            {benefits.map((benefit, i) => (
              <View key={i} style={styles.benefitCard}>
                <View style={[styles.benefitIcon, { backgroundColor: benefit.color + '20' }]}>
                  <Ionicons name={benefit.icon as any} size={24} color={benefit.color} />
                </View>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDesc}>{benefit.desc}</Text>
              </View>
            ))}
          </View>

          {/* Comparison */}
          <Text style={styles.sectionTitle}>Why NEXRYDE Wins</Text>
          <View style={styles.comparisonCard}>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Per Ride</Text>
              <View style={styles.comparisonValues}>
                <Text style={styles.comparisonOther}>{CURRENCY}500 lost</Text>
                <Text style={styles.comparisonNexryde}>{CURRENCY}0</Text>
              </View>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Monthly (250 rides)</Text>
              <View style={styles.comparisonValues}>
                <Text style={styles.comparisonOther}>{CURRENCY}125,000 lost</Text>
                <Text style={styles.comparisonNexryde}>{CURRENCY}25,000</Text>
              </View>
            </View>
            <View style={[styles.comparisonRow, styles.comparisonRowHighlight]}>
              <Text style={styles.comparisonSavingsLabel}>You Save</Text>
              <Text style={styles.comparisonSavings}>{CURRENCY}100,000+</Text>
            </View>
          </View>
        </ScrollView>

        {!isActive && (
          <View style={styles.bottomAction}>
            <TouchableOpacity style={styles.subscribeButton} onPress={handleSubscribe} disabled={loading}>
              <LinearGradient colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]} style={styles.subscribeGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.subscribeText}>{loading ? 'Processing...' : `Subscribe - ${CURRENCY}${SUBSCRIPTION_PRICE.toLocaleString()}`}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  glow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.white },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: 120 },
  statusCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  statusGradient: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  statusIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  statusSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  pricingCard: { marginBottom: SPACING.xl, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  pricingGradient: { padding: SPACING.xl, alignItems: 'center' },
  pricingBadge: { backgroundColor: COLORS.white, paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.md },
  pricingBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.accentGreen },
  pricingLabel: { fontSize: FONT_SIZE.md, color: 'rgba(25,37,63,0.7)', marginBottom: SPACING.xs },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceCurrency: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.primary },
  priceAmount: { fontSize: 48, fontWeight: '900', color: COLORS.primary },
  pricePeriod: { fontSize: FONT_SIZE.md, color: 'rgba(25,37,63,0.7)', marginLeft: 4 },
  pricingSave: { fontSize: FONT_SIZE.sm, color: 'rgba(25,37,63,0.8)', marginTop: SPACING.sm, textAlign: 'center' },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white, marginBottom: SPACING.md },
  benefitsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.xl },
  benefitCard: { width: '47%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.surfaceLight },
  benefitIcon: { width: 48, height: 48, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  benefitTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white, marginBottom: 2 },
  benefitDesc: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  comparisonCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xxl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight },
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceLight },
  comparisonLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  comparisonValues: { flexDirection: 'row', gap: SPACING.lg },
  comparisonOther: { fontSize: FONT_SIZE.sm, color: COLORS.error, textDecorationLine: 'line-through' },
  comparisonNexryde: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.accentGreen },
  comparisonRowHighlight: { borderBottomWidth: 0, paddingTop: SPACING.md },
  comparisonSavingsLabel: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
  comparisonSavings: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.accentGreen },
  bottomAction: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACING.lg, backgroundColor: COLORS.background },
  subscribeButton: { borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  subscribeGradient: { paddingVertical: SPACING.lg, alignItems: 'center' },
  subscribeText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.primary },
});