import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

const { width } = Dimensions.get('window');

export default function EarningsDashboardScreen() {
  const router = useRouter();

  const stats = {
    today: 15200,
    week: 87500,
    month: 342000,
    trips: 156,
    hours: 48,
    rating: 4.92,
  };

  const weeklyData = [
    { day: 'Mon', amount: 12500, trips: 8 },
    { day: 'Tue', amount: 15200, trips: 10 },
    { day: 'Wed', amount: 8900, trips: 6 },
    { day: 'Thu', amount: 18400, trips: 12 },
    { day: 'Fri', amount: 21000, trips: 14 },
    { day: 'Sat', amount: 11500, trips: 7 },
    { day: 'Sun', amount: 0, trips: 0 },
  ];

  const maxAmount = Math.max(...weeklyData.map(d => d.amount));

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.primary, COLORS.background]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.glow, { top: 80, left: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, right: 20, backgroundColor: COLORS.gold, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earnings Dashboard</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Total Earnings */}
          <View style={styles.totalCard}>
            <LinearGradient colors={[COLORS.accentGreen, COLORS.accentBlue]} style={styles.totalGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.totalLabel}>This Month</Text>
              <Text style={styles.totalAmount}>{CURRENCY}{stats.month.toLocaleString()}</Text>
              <View style={styles.totalStats}>
                <View style={styles.totalStat}>
                  <Ionicons name="car" size={16} color={COLORS.white} />
                  <Text style={styles.totalStatText}>{stats.trips} trips</Text>
                </View>
                <View style={styles.totalStat}>
                  <Ionicons name="time" size={16} color={COLORS.white} />
                  <Text style={styles.totalStatText}>{stats.hours} hours</Text>
                </View>
                <View style={styles.totalStat}>
                  <Ionicons name="star" size={16} color={COLORS.white} />
                  <Text style={styles.totalStatText}>{stats.rating}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.quickStatCard}>
              <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.quickStatGradient}>
                <Text style={styles.quickStatLabel}>Today</Text>
                <Text style={styles.quickStatValue}>{CURRENCY}{stats.today.toLocaleString()}</Text>
              </LinearGradient>
            </View>
            <View style={styles.quickStatCard}>
              <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.quickStatGradient}>
                <Text style={styles.quickStatLabel}>This Week</Text>
                <Text style={styles.quickStatValue}>{CURRENCY}{stats.week.toLocaleString()}</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Weekly Chart */}
          <Text style={styles.sectionTitle}>Weekly Overview</Text>
          <View style={styles.chartCard}>
            <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.chartGradient}>
              <View style={styles.chartBars}>
                {weeklyData.map((day, i) => (
                  <View key={i} style={styles.barContainer}>
                    <View style={styles.barWrapper}>
                      <LinearGradient
                        colors={day.amount > 0 ? [COLORS.accentGreen, COLORS.accentBlue] : [COLORS.surfaceLight, COLORS.surfaceLight]}
                        style={[styles.bar, { height: day.amount > 0 ? (day.amount / maxAmount) * 100 : 8 }]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{day.day}</Text>
                    <Text style={styles.barAmount}>{day.amount > 0 ? `${CURRENCY}${(day.amount/1000).toFixed(0)}k` : '-'}</Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
          </View>

          {/* Recent Earnings */}
          <Text style={styles.sectionTitle}>Recent Earnings</Text>
          {[{ date: 'Today', amount: 15200, trips: 10 }, { date: 'Yesterday', amount: 21000, trips: 14 }, { date: 'Wed', amount: 8900, trips: 6 }].map((item, i) => (
            <View key={i} style={styles.recentCard}>
              <View style={styles.recentLeft}>
                <View style={styles.recentIcon}>
                  <Ionicons name="calendar" size={20} color={COLORS.accentGreen} />
                </View>
                <View>
                  <Text style={styles.recentDate}>{item.date}</Text>
                  <Text style={styles.recentTrips}>{item.trips} trips completed</Text>
                </View>
              </View>
              <Text style={styles.recentAmount}>{CURRENCY}{item.amount.toLocaleString()}</Text>
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
  totalCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  totalGradient: { padding: SPACING.xl, alignItems: 'center' },
  totalLabel: { fontSize: FONT_SIZE.md, color: 'rgba(255,255,255,0.8)', marginBottom: SPACING.xs },
  totalAmount: { fontSize: 48, fontWeight: '900', color: COLORS.white, marginBottom: SPACING.md },
  totalStats: { flexDirection: 'row', gap: SPACING.xl },
  totalStat: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  totalStatText: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.9)' },
  quickStats: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
  quickStatCard: { flex: 1, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  quickStatGradient: { padding: SPACING.lg, alignItems: 'center', borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xl },
  quickStatLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACING.xs },
  quickStatValue: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.white },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white, marginBottom: SPACING.md },
  chartCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  chartGradient: { padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  chartBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140 },
  barContainer: { alignItems: 'center', flex: 1 },
  barWrapper: { height: 100, justifyContent: 'flex-end' },
  bar: { width: 24, borderRadius: 12, minHeight: 8 },
  barLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: SPACING.sm },
  barAmount: { fontSize: 9, color: COLORS.textSecondary, marginTop: 2 },
  recentCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.surfaceLight },
  recentLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  recentIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accentGreenSoft, alignItems: 'center', justifyContent: 'center' },
  recentDate: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  recentTrips: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  recentAmount: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.accentGreen },
});