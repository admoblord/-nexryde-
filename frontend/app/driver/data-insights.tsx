import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const { width } = Dimensions.get('window');

export default function DataInsightsScreen() {
  const router = useRouter();
  const [timeframe, setTimeframe] = useState('month');

  const insights = {
    totalEarnings: 285000,
    totalTrips: 156,
    avgTripFare: 1827,
    totalDistance: 1847,
    totalHours: 124,
    earningsPerHour: 2298,
    fuelCost: 45000,
    netEarnings: 240000,
    topRoute: 'VI → Lekki',
    topHour: '6 PM',
    busiest Day: 'Friday',
  };

  const earningsTrend = [
    { month: 'Jan', amount: 245000 },
    { month: 'Feb', amount: 268000 },
    { month: 'Mar', amount: 285000 },
  ];

  const topRoutes = [
    { from: 'Victoria Island', to: 'Lekki Phase 1', trips: 42, earnings: 87500, avgTime: 25 },
    { from: 'Ikeja GRA', to: 'Victoria Island', trips: 38, earnings: 76000, avgTime: 32 },
    { from: 'Lekki', to: 'Ajah', trips: 35, earnings: 52500, avgTime: 18 },
    { from: 'Ikoyi', to: 'VI', trips: 28, earnings: 56000, avgTime: 15 },
  ];

  const hourlyBreakdown = [
    { hour: '6 AM', trips: 8, earnings: 12000, demand: 'low' },
    { hour: '7 AM', trips: 12, earnings: 18000, demand: 'medium' },
    { hour: '8 AM', trips: 15, earnings: 24000, demand: 'high' },
    { hour: '12 PM', trips: 18, earnings: 28000, demand: 'high' },
    { hour: '5 PM', trips: 25, earnings: 45000, demand: 'very-high' },
    { hour: '6 PM', trips: 32, earnings: 58000, demand: 'very-high' },
    { hour: '7 PM', trips: 28, earnings: 52000, demand: 'high' },
    { hour: '10 PM', trips: 18, earnings: 32000, demand: 'medium' },
  ];

  const getDemandColor = (demand: string) => {
    switch (demand) {
      case 'very-high': return COLORS.error;
      case 'high': return COLORS.accentOrange;
      case 'medium': return COLORS.accentBlue;
      default: return COLORS.lightTextMuted;
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Ionicons name="bar-chart" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Data Insights</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        {/* Timeframe Selector */}
        <View style={styles.timeframeSelector}>
          {['week', 'month', 'year'].map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[styles.timeframeButton, timeframe === tf && styles.timeframeButtonActive]}
              onPress={() => setTimeframe(tf)}
            >
              <Text style={[styles.timeframeText, timeframe === tf && styles.timeframeTextActive]}>
                {tf.charAt(0).toUpperCase() + tf.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Key Insights Cards */}
          <View style={styles.insightsGrid}>
            <View style={styles.insightCard}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                style={styles.insightGradient}
              >
                <Ionicons name="cash" size={32} color={COLORS.white} />
                <Text style={styles.insightValue}>₦{insights.totalEarnings.toLocaleString()}</Text>
                <Text style={styles.insightLabel}>Total Earnings</Text>
                <View style={styles.trendBadge}>
                  <Ionicons name="trending-up" size={12} color={COLORS.white} />
                  <Text style={styles.trendText}>+15%</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.insightCard}>
              <LinearGradient
                colors={[COLORS.accentBlue, COLORS.accentBlueDark]}
                style={styles.insightGradient}
              >
                <Ionicons name="car" size={32} color={COLORS.white} />
                <Text style={styles.insightValue}>{insights.totalTrips}</Text>
                <Text style={styles.insightLabel}>Total Trips</Text>
                <View style={styles.trendBadge}>
                  <Ionicons name="trending-up" size={12} color={COLORS.white} />
                  <Text style={styles.trendText}>+8%</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.insightCard}>
              <LinearGradient
                colors={[COLORS.accentOrange, '#D97706']}
                style={styles.insightGradient}
              >
                <Ionicons name="time" size={32} color={COLORS.white} />
                <Text style={styles.insightValue}>₦{insights.earningsPerHour.toLocaleString()}</Text>
                <Text style={styles.insightLabel}>Per Hour</Text>
                <View style={styles.trendBadge}>
                  <Ionicons name="trending-up" size={12} color={COLORS.white} />
                  <Text style={styles.trendText}>+12%</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={styles.insightCard}>
              <LinearGradient
                colors={[COLORS.accentPurple, '#7C3AED']}
                style={styles.insightGradient}
              >
                <Ionicons name="wallet" size={32} color={COLORS.white} />
                <Text style={styles.insightValue}>₦{insights.netEarnings.toLocaleString()}</Text>
                <Text style={styles.insightLabel}>Net Earnings</Text>
                <View style={styles.trendBadge}>
                  <Ionicons name="trending-up" size={12} color={COLORS.white} />
                  <Text style={styles.trendText}>+10%</Text>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Earnings Trend */}
          <View style={styles.trendSection}>
            <Text style={styles.sectionTitle}>📈 Earnings Trend</Text>
            <View style={styles.trendCard}>
              <View style={styles.trendChart}>
                {earningsTrend.map((item, index) => {
                  const maxAmount = Math.max(...earningsTrend.map(e => e.amount));
                  const height = (item.amount / maxAmount) * 100;
                  return (
                    <View key={index} style={styles.trendBar}>
                      <Text style={styles.trendAmount}>₦{(item.amount / 1000).toFixed(0)}K</Text>
                      <View style={styles.trendBarContainer}>
                        <LinearGradient
                          colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                          style={[styles.trendBarFill, { height: `${height}%` }]}
                        />
                      </View>
                      <Text style={styles.trendLabel}>{item.month}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.trendInsight}>
                <Ionicons name="trending-up" size={20} color={COLORS.accentGreen} />
                <Text style={styles.trendInsightText}>
                  You're earning ₦40,000 more each month!
                </Text>
              </View>
            </View>
          </View>

          {/* Top Routes */}
          <View style={styles.routesSection}>
            <Text style={styles.sectionTitle}>🗺️ Top Routes</Text>
            {topRoutes.map((route, index) => (
              <View key={index} style={styles.routeCard}>
                <View style={styles.routeRank}>
                  <Text style={styles.routeRankText}>#{index + 1}</Text>
                </View>
                <View style={styles.routeInfo}>
                  <View style={styles.routeHeader}>
                    <View style={styles.routeLocations}>
                      <Text style={styles.routeFrom}>{route.from}</Text>
                      <Ionicons name="arrow-forward" size={16} color={COLORS.lightTextMuted} />
                      <Text style={styles.routeTo}>{route.to}</Text>
                    </View>
                  </View>
                  <View style={styles.routeStats}>
                    <View style={styles.routeStat}>
                      <Ionicons name="car" size={14} color={COLORS.accentBlue} />
                      <Text style={styles.routeStatText}>{route.trips} trips</Text>
                    </View>
                    <View style={styles.routeStat}>
                      <Ionicons name="cash" size={14} color={COLORS.accentGreen} />
                      <Text style={styles.routeStatText}>₦{route.earnings.toLocaleString()}</Text>
                    </View>
                    <View style={styles.routeStat}>
                      <Ionicons name="time" size={14} color={COLORS.accentOrange} />
                      <Text style={styles.routeStatText}>{route.avgTime} min</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Hourly Breakdown */}
          <View style={styles.hourlySection}>
            <Text style={styles.sectionTitle}>⏰ Hourly Performance</Text>
            <View style={styles.hourlyCard}>
              {hourlyBreakdown.map((hour, index) => (
                <View key={index} style={styles.hourlyRow}>
                  <Text style={styles.hourlyTime}>{hour.hour}</Text>
                  <View style={styles.hourlyBar}>
                    <View
                      style={[
                        styles.hourlyBarFill,
                        {
                          width: `${(hour.earnings / 58000) * 100}%`,
                          backgroundColor: getDemandColor(hour.demand),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.hourlyEarnings}>₦{(hour.earnings / 1000).toFixed(0)}K</Text>
                </View>
              ))}
              <View style={styles.hourlyLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.error }]} />
                  <Text style={styles.legendText}>Very High</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.accentOrange }]} />
                  <Text style={styles.legendText}>High</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS.accentBlue }]} />
                  <Text style={styles.legendText}>Medium</Text>
                </View>
              </View>
            </View>
          </View>

          {/* AI Insights */}
          <View style={styles.aiSection}>
            <Text style={styles.sectionTitle}>🤖 AI Insights</Text>
            <View style={styles.aiInsightCard}>
              <Ionicons name="sparkles" size={24} color={COLORS.accentGreen} />
              <Text style={styles.aiInsightTitle}>Best Time to Drive</Text>
              <Text style={styles.aiInsightText}>
                Based on your data, you earn 45% more between 5-7 PM. 
                Focus on these hours to maximize earnings.
              </Text>
            </View>
            <View style={styles.aiInsightCard}>
              <Ionicons name="trending-up" size={24} color={COLORS.accentBlue} />
              <Text style={styles.aiInsightTitle}>Route Optimization</Text>
              <Text style={styles.aiInsightText}>
                VI → Lekki route gives you ₦2,083 per trip. 
                This is 28% higher than your average.
              </Text>
            </View>
            <View style={styles.aiInsightCard}>
              <Ionicons name="calendar" size={24} color={COLORS.accentOrange} />
              <Text style={styles.aiInsightTitle}>Weekly Pattern</Text>
              <Text style={styles.aiInsightText}>
                Fridays are your best day with ₦58,000 average. 
                Consider working more Fridays for better earnings.
              </Text>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  timeframeSelector: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  timeframeButtonActive: {
    backgroundColor: COLORS.accentGreen,
  },
  timeframeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  timeframeTextActive: {
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  insightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  insightCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  insightGradient: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  insightValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    marginVertical: SPACING.xs,
  },
  insightLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  trendText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.white,
  },
  trendSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  trendCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  trendChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 150,
    marginBottom: SPACING.md,
  },
  trendBar: {
    flex: 1,
    alignItems: 'center',
  },
  trendAmount: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.accentGreen,
    marginBottom: SPACING.xs,
  },
  trendBarContainer: {
    width: '80%',
    height: 100,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendBarFill: {
    width: '100%',
    borderRadius: BORDER_RADIUS.md,
  },
  trendLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginTop: SPACING.xs,
  },
  trendInsight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.successSoft,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  trendInsightText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  routesSection: {
    marginBottom: SPACING.lg,
  },
  routeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  routeRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  routeRankText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  routeInfo: {
    flex: 1,
  },
  routeHeader: {
    marginBottom: SPACING.sm,
  },
  routeLocations: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  routeFrom: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  routeTo: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  routeStats: {
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  routeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeStatText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
  },
  hourlySection: {
    marginBottom: SPACING.lg,
  },
  hourlyCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  hourlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  hourlyTime: {
    width: 60,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  hourlyBar: {
    flex: 1,
    height: 24,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginHorizontal: SPACING.sm,
  },
  hourlyBarFill: {
    height: '100%',
  },
  hourlyEarnings: {
    width: 50,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    textAlign: 'right',
  },
  hourlyLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
  },
  aiSection: {
    marginTop: SPACING.lg,
  },
  aiInsightCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  aiInsightTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginVertical: SPACING.xs,
  },
  aiInsightText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    lineHeight: 20,
  },
});
