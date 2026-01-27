import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

export default function FareBreakdownScreen() {
  const router = useRouter();

  const fareDetails = {
    baseFare: 500,
    distance: 1200,
    time: 320,
    trafficSurcharge: 200,
    weatherSurcharge: 0,
    total: 2220,
    originalEstimate: 2000,
  };

  const tripInfo = {
    driver: 'Chukwuemeka Okafor',
    pickup: 'Victoria Island, Lagos',
    dropoff: 'Ikeja City Mall',
    distance: '12.5 km',
    duration: '35 min',
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.primary, COLORS.background]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.glow, { top: 80, right: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, left: 20, backgroundColor: COLORS.accentBlue, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Fare Breakdown</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Total Card */}
          <View style={styles.totalCard}>
            <LinearGradient colors={[COLORS.accentGreen, COLORS.accentBlue]} style={styles.totalGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.totalLabel}>Total Fare</Text>
              <Text style={styles.totalAmount}>{CURRENCY}{fareDetails.total.toLocaleString()}</Text>
              {fareDetails.total > fareDetails.originalEstimate && (
                <View style={styles.adjustedBadge}>
                  <Ionicons name="information-circle" size={14} color={COLORS.white} />
                  <Text style={styles.adjustedText}>Adjusted from {CURRENCY}{fareDetails.originalEstimate}</Text>
                </View>
              )}
            </LinearGradient>
          </View>

          {/* Trip Summary */}
          <View style={styles.tripCard}>
            <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.tripGradient}>
              <View style={styles.tripHeader}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.avatarText}>{tripInfo.driver.charAt(0)}</Text>
                </View>
                <View style={styles.tripInfo}>
                  <Text style={styles.driverName}>{tripInfo.driver}</Text>
                  <Text style={styles.tripStats}>{tripInfo.distance} • {tripInfo.duration}</Text>
                </View>
              </View>
              <View style={styles.routeInfo}>
                <View style={styles.routePoint}>
                  <View style={styles.pickupDot} />
                  <Text style={styles.routeText}>{tripInfo.pickup}</Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routePoint}>
                  <View style={styles.destDot} />
                  <Text style={styles.routeText}>{tripInfo.dropoff}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Fare Breakdown */}
          <Text style={styles.sectionTitle}>Fare Details</Text>
          <View style={styles.breakdownCard}>
            <FareRow label="Base Fare" value={fareDetails.baseFare} />
            <FareRow label="Distance (12.5 km)" value={fareDetails.distance} />
            <FareRow label="Time (35 min)" value={fareDetails.time} />
            {fareDetails.trafficSurcharge > 0 && (
              <FareRow label="Traffic Adjustment" value={fareDetails.trafficSurcharge} highlight />
            )}
            {fareDetails.weatherSurcharge > 0 && (
              <FareRow label="Weather Surcharge" value={fareDetails.weatherSurcharge} highlight />
            )}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalRowLabel}>Total</Text>
              <Text style={styles.totalRowValue}>{CURRENCY}{fareDetails.total.toLocaleString()}</Text>
            </View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color={COLORS.info} />
            <Text style={styles.infoText}>Fares may be adjusted based on real-time traffic conditions and weather. The maximum adjustment is capped at 50% of the original estimate.</Text>
          </View>
        </ScrollView>

        <View style={styles.bottomAction}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.back()}>
            <LinearGradient colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]} style={styles.actionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.actionText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const FareRow = ({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) => (
  <View style={styles.fareRow}>
    <Text style={[styles.fareLabel, highlight && styles.fareLabelHighlight]}>{label}</Text>
    <Text style={[styles.fareValue, highlight && styles.fareValueHighlight]}>{CURRENCY}{value.toLocaleString()}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  glow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.white },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  totalCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  totalGradient: { padding: SPACING.xl, alignItems: 'center' },
  totalLabel: { fontSize: FONT_SIZE.md, color: 'rgba(255,255,255,0.8)', marginBottom: SPACING.xs },
  totalAmount: { fontSize: 48, fontWeight: '800', color: COLORS.white },
  adjustedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full, marginTop: SPACING.sm, gap: SPACING.xs },
  adjustedText: { fontSize: FONT_SIZE.sm, color: COLORS.white },
  tripCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  tripGradient: { padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  tripHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accentGreenSoft, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  avatarText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.accentGreen },
  tripInfo: { flex: 1 },
  driverName: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  tripStats: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  routeInfo: { backgroundColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  pickupDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accentGreen },
  destDot: { width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS.accentBlue },
  routeLine: { width: 2, height: 16, backgroundColor: COLORS.surface, marginLeft: 4, marginVertical: SPACING.xs },
  routeText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, flex: 1 },
  sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white, marginBottom: SPACING.md },
  breakdownCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xxl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, marginBottom: SPACING.lg },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  fareLabel: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  fareLabelHighlight: { color: COLORS.warning },
  fareValue: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  fareValueHighlight: { color: COLORS.warning },
  divider: { height: 1, backgroundColor: COLORS.surfaceLight, marginVertical: SPACING.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRowLabel: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  totalRowValue: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.accentGreen },
  infoBox: { flexDirection: 'row', backgroundColor: COLORS.infoSoft, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, gap: SPACING.sm },
  infoText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.info, lineHeight: 20 },
  bottomAction: { padding: SPACING.lg },
  actionButton: { borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  actionGradient: { paddingVertical: SPACING.lg, alignItems: 'center' },
  actionText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.primary },
});