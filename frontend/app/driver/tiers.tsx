import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

const { width } = Dimensions.get('window');

export default function TiersScreen() {
  const router = useRouter();
  const currentTier = 'basic';

  const tiers = [
    {
      id: 'basic',
      name: 'Basic',
      price: 25000,
      color: COLORS.accentBlue,
      multiplier: 1.0,
      features: ['Standard fare rates', 'Basic support', 'Standard visibility'],
      icon: 'car',
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 25000,
      color: COLORS.gold,
      multiplier: 1.2,
      features: ['20% higher fares', 'Priority support', 'Featured in app', 'Premium badge'],
      icon: 'diamond',
      requirements: ['4.8+ rating', 'Vehicle under 5 years', '95% completion rate'],
    },
  ];

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.primary, COLORS.background]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.glow, { top: 80, right: 30, backgroundColor: COLORS.gold }]} />
      <View style={[styles.glow, { bottom: 200, left: 20, backgroundColor: COLORS.accentBlue, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver Tiers</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Current Tier Banner */}
          <View style={styles.currentBanner}>
            <LinearGradient colors={[COLORS.accentGreen, COLORS.accentBlue]} style={styles.bannerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <View style={styles.bannerLeft}>
                <Ionicons name="ribbon" size={28} color={COLORS.white} />
                <View>
                  <Text style={styles.bannerLabel}>Your Current Tier</Text>
                  <Text style={styles.bannerTier}>Basic Driver</Text>
                </View>
              </View>
              <View style={styles.bannerRight}>
                <Text style={styles.bannerMultiplier}>1.0x</Text>
                <Text style={styles.bannerMultiplierLabel}>Earnings</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Tiers */}
          {tiers.map((tier) => (
            <View key={tier.id} style={[styles.tierCard, tier.id === currentTier && styles.tierCardActive]}>
              <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.tierGradient}>
                {tier.id === 'premium' && <View style={styles.premiumTag}><Text style={styles.premiumTagText}>RECOMMENDED</Text></View>}
                
                <View style={styles.tierHeader}>
                  <View style={[styles.tierIcon, { backgroundColor: tier.color + '20' }]}>
                    <Ionicons name={tier.icon as any} size={28} color={tier.color} />
                  </View>
                  <View style={styles.tierInfo}>
                    <Text style={styles.tierName}>{tier.name}</Text>
                    <Text style={styles.tierPrice}>{CURRENCY}{tier.price.toLocaleString()}/month</Text>
                  </View>
                  <View style={[styles.multiplierBadge, { backgroundColor: tier.color + '20' }]}>
                    <Text style={[styles.multiplierText, { color: tier.color }]}>{tier.multiplier}x</Text>
                  </View>
                </View>

                <View style={styles.features}>
                  {tier.features.map((feature, i) => (
                    <View key={i} style={styles.featureRow}>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.accentGreen} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                {tier.requirements && (
                  <View style={styles.requirements}>
                    <Text style={styles.requirementsTitle}>Requirements</Text>
                    {tier.requirements.map((req, i) => (
                      <View key={i} style={styles.reqRow}>
                        <Ionicons name="information-circle" size={16} color={COLORS.info} />
                        <Text style={styles.reqText}>{req}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {tier.id !== currentTier && (
                  <TouchableOpacity style={[styles.upgradeButton, { backgroundColor: tier.color }]}>
                    <Text style={styles.upgradeText}>Upgrade to {tier.name}</Text>
                  </TouchableOpacity>
                )}
                {tier.id === currentTier && (
                  <View style={styles.currentBadge}>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.accentGreen} />
                    <Text style={styles.currentText}>Current Tier</Text>
                  </View>
                )}
              </LinearGradient>
            </View>
          ))}
        </ScrollView>
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
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  currentBanner: { borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden', marginBottom: SPACING.xl },
  bannerGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  bannerLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)' },
  bannerTier: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  bannerRight: { alignItems: 'flex-end' },
  bannerMultiplier: { fontSize: FONT_SIZE.xxl, fontWeight: '800', color: COLORS.white },
  bannerMultiplierLabel: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.8)' },
  tierCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  tierCardActive: { borderWidth: 2, borderColor: COLORS.accentGreen },
  tierGradient: { padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  premiumTag: { position: 'absolute', top: 12, right: 12, backgroundColor: COLORS.gold, paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.sm },
  premiumTagText: { fontSize: 9, fontWeight: '800', color: COLORS.primary },
  tierHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  tierIcon: { width: 56, height: 56, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  tierInfo: { flex: 1 },
  tierName: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.white },
  tierPrice: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  multiplierBadge: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full },
  multiplierText: { fontSize: FONT_SIZE.lg, fontWeight: '800' },
  features: { gap: SPACING.sm, marginBottom: SPACING.md },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  featureText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  requirements: { backgroundColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  requirementsTitle: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.white, marginBottom: SPACING.sm },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.xs },
  reqText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  upgradeButton: { paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, alignItems: 'center' },
  upgradeText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
  currentBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.md },
  currentText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.accentGreen },
});