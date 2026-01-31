import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

const { width } = Dimensions.get('window');

export default function EarningsDashboardScreen() {
  const router = useRouter();

  const weeklyData = [
    { day: 'Mon', amount: 13000, height: 0.4 },
    { day: 'Tue', amount: 15000, height: 0.5 },
    { day: 'Wed', amount: 0, height: 0 },
    { day: 'Thu', amount: 18000, height: 0.6 },
    { day: 'Fri', amount: 21000, height: 0.7 },
    { day: 'Sat', amount: 12000, height: 0.4 },
    { day: 'Sun', amount: 0, height: 0 },
  ];

  const recentEarnings = [
    { id: 1, date: 'Today', trips: 10, amount: 15200 },
    { id: 2, date: 'Yesterday', trips: 14, amount: 21000 },
    { id: 3, date: 'Monday', trips: 8, amount: 12500 },
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
          <Text style={styles.headerTitle}>Earnings Dashboard</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Main Earnings Card */}
          <View style={styles.mainCard}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.mainGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.mainLabel}>This Month</Text>
              <Text style={styles.mainAmount}>{CURRENCY}342,000</Text>
              <View style={styles.mainStats}>
                <View style={styles.mainStat}>
                  <Text style={styles.mainStatValue}>156 trips</Text>
                </View>
                <View style={styles.mainStat}>
                  <Text style={styles.mainStatValue}>48 hours</Text>
                </View>
                <View style={styles.mainStat}>
                  <Text style={styles.mainStatValue}>4.92</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatLabel}>Today</Text>
              <Text style={styles.quickStatValue}>{CURRENCY}15,200</Text>
            </View>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatLabel}>This Week</Text>
              <Text style={styles.quickStatValue}>{CURRENCY}87,500</Text>
            </View>
          </View>

          {/* Weekly Chart */}
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>Weekly Overview</Text>
            <View style={styles.chartCard}>
              <View style={styles.chartContainer}>
                {weeklyData.map((item, index) => (
                  <View key={index} style={styles.chartBar}>
                    <View style={styles.barContainer}>
                      <LinearGradient
                        colors={item.height > 0 ? [COLORS.accentGreen, COLORS.accentBlue] : [COLORS.lightBorder, COLORS.lightBorder]}
                        style={[styles.bar, { height: `${Math.max(item.height * 100, 5)}%` }]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{item.day}</Text>
                    <Text style={styles.barAmount}>{item.amount > 0 ? `${CURRENCY}${(item.amount/1000).toFixed(0)}k` : '-'}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Recent Earnings */}
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recent Earnings</Text>
            {recentEarnings.map(earning => (
              <View key={earning.id} style={styles.earningCard}>
                <View style={[styles.earningIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                  <Ionicons name="car" size={20} color={COLORS.accentGreen} />
                </View>
                <View style={styles.earningInfo}>
                  <Text style={styles.earningDate}>{earning.date}</Text>
                  <Text style={styles.earningTrips}>{earning.trips} trips completed</Text>
                </View>
                <Text style={styles.earningAmount}>{CURRENCY}{earning.amount.toLocaleString()}</Text>
              </View>
            ))}
          </View>

          {/* 🔥 INSTANT LOANS - COMING SOON */}
          <View style={styles.loanCard}>
            <View style={styles.loanBadge}>
              <Text style={styles.loanBadgeText}>COMING SOON</Text>
            </View>
            <View style={styles.loanIcon}>
              <Ionicons name="cash" size={40} color="#10B981" />
            </View>
            <Text style={styles.loanTitle}>💳 Instant Driver Loans</Text>
            <Text style={styles.loanDesc}>
              Get instant loans from ₦5,000 to ₦50,000 • Auto-payback from earnings • Build your credit score
            </Text>
            <View style={styles.loanFeatures}>
              <View style={styles.loanFeature}>
                <Ionicons name="flash" size={16} color="#F59E0B" />
                <Text style={styles.loanFeatureText}>Instant approval</Text>
              </View>
              <View style={styles.loanFeature}>
                <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                <Text style={styles.loanFeatureText}>No paperwork</Text>
              </View>
              <View style={styles.loanFeature}>
                <Ionicons name="trending-up" size={16} color="#3B82F6" />
                <Text style={styles.loanFeatureText}>Build credit</Text>
              </View>
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
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  mainCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  mainGradient: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  mainLabel: {
    fontSize: FONT_SIZE.sm,
    color: '#64748B',
    marginBottom: SPACING.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mainAmount: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.md,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  mainStats: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  mainStat: {
    alignItems: 'center',
  },
  mainStatValue: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
  },
  quickStats: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  quickStatLabel: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickStatValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#0F172A',
  },
  chartSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.md,
    letterSpacing: -0.5,
  },
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 160,
    alignItems: 'flex-end',
  },
  chartBar: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    height: 100,
    width: 24,
    justifyContent: 'flex-end',
    marginBottom: SPACING.xs,
  },
  bar: {
    width: '100%',
    borderRadius: 12,
    minHeight: 4,
  },
  barLabel: {
    fontSize: FONT_SIZE.xs,
    color: '#475569',
    marginBottom: 2,
    fontWeight: '700',
  },
  barAmount: {
    fontSize: FONT_SIZE.xxs,
    color: '#64748B',
    fontWeight: '700',
  },
  recentSection: {
    marginBottom: SPACING.lg,
  },
  earningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  earningIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  earningInfo: {
    flex: 1,
  },
  earningDate: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#0F172A',
  },
  earningTrips: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    fontWeight: '700',
  },
  earningAmount: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  // Loan Card Styles
  loanCard: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(16,185,129,0.3)',
    alignItems: 'center',
  },
  loanBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  loanBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  loanIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  loanTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  loanDesc: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  loanFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  loanFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  loanFeatureText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
});
