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

export default function PerformanceAnalyticsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState('week');

  const performanceData = {
    score: 92,
    acceptanceRate: 95,
    cancellationRate: 2,
    completionRate: 98,
    averageRating: 4.9,
    totalTrips: 156,
    totalEarnings: 285000,
    averageTripTime: 22,
    peakHours: '5PM - 8PM',
    bestDay: 'Friday',
  };

  const weeklyTrends = [
    { day: 'Mon', trips: 18, earnings: 32000, rating: 4.8 },
    { day: 'Tue', trips: 22, earnings: 38000, rating: 4.9 },
    { day: 'Wed', trips: 24, earnings: 42000, rating: 4.9 },
    { day: 'Thu', trips: 26, earnings: 46000, rating: 5.0 },
    { day: 'Fri', trips: 32, earnings: 58000, rating: 4.9 },
    { day: 'Sat', trips: 20, earnings: 38000, rating: 4.8 },
    { day: 'Sun', trips: 14, earnings: 31000, rating: 4.9 },
  ];

  const maxTrips = Math.max(...weeklyTrends.map(d => d.trips));

  const metrics = [
    {
      id: '1',
      title: 'Acceptance Rate',
      value: `${performanceData.acceptanceRate}%`,
      target: 90,
      current: performanceData.acceptanceRate,
      icon: 'checkmark-circle',
      color: COLORS.accentGreen,
      status: 'excellent',
      tip: 'Excellent! Keep it above 90%',
    },
    {
      id: '2',
      title: 'Cancellation Rate',
      value: `${performanceData.cancellationRate}%`,
      target: 5,
      current: performanceData.cancellationRate,
      icon: 'close-circle',
      color: COLORS.accentGreen,
      status: 'excellent',
      tip: 'Perfect! Under 5% is great',
    },
    {
      id: '3',
      title: 'Completion Rate',
      value: `${performanceData.completionRate}%`,
      target: 95,
      current: performanceData.completionRate,
      icon: 'flag',
      color: COLORS.accentGreen,
      status: 'excellent',
      tip: 'Outstanding completion rate!',
    },
    {
      id: '4',
      title: 'Average Rating',
      value: performanceData.averageRating.toFixed(1),
      target: 4.5,
      current: performanceData.averageRating,
      icon: 'star',
      color: COLORS.accentOrange,
      status: 'excellent',
      tip: 'Nearly perfect rating!',
    },
  ];

  const improvements = [
    {
      id: '1',
      area: 'Peak Hours',
      current: 'Good',
      suggestion: 'Work more during 5-8 PM to earn ₦5,000 more daily',
      impact: 'High',
      impactColor: COLORS.accentGreen,
      icon: 'time',
    },
    {
      id: '2',
      area: 'Weekend Strategy',
      current: 'Average',
      suggestion: 'Focus on Saturdays near malls for 30% more trips',
      impact: 'Medium',
      impactColor: COLORS.accentOrange,
      icon: 'calendar',
    },
    {
      id: '3',
      area: 'Acceptance Speed',
      current: 'Good',
      suggestion: 'Accept rides within 10 seconds for priority status',
      impact: 'Medium',
      impactColor: COLORS.accentOrange,
      icon: 'flash',
    },
  ];

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
            <Ionicons name="analytics" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Performance Analytics</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {['day', 'week', 'month'].map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodButton, period === p && styles.periodButtonActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Performance Score Card */}
          <View style={styles.scoreCard}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
              style={styles.scoreGradient}
            >
              <Text style={styles.scoreLabel}>Your Performance Score</Text>
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreValue}>{performanceData.score}</Text>
                <Text style={styles.scoreMax}>/100</Text>
              </View>
              <View style={styles.scoreBadge}>
                <Ionicons name="trophy" size={16} color={COLORS.white} />
                <Text style={styles.scoreBadgeText}>Top 10% of Drivers</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Key Metrics */}
          <View style={styles.metricsSection}>
            <Text style={styles.sectionTitle}>📊 Key Metrics</Text>
            <View style={styles.metricsGrid}>
              {metrics.map((metric) => (
                <View key={metric.id} style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: metric.color }]}>
                    <Ionicons name={metric.icon as any} size={24} color={COLORS.white} />
                  </View>
                  <Text style={styles.metricTitle}>{metric.title}</Text>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min((metric.current / metric.target) * 100, 100)}%`,
                          backgroundColor: metric.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.metricTip}>{metric.tip}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Weekly Chart */}
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>📈 Weekly Performance</Text>
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.accentGreen }]} />
                    <Text style={styles.legendText}>Trips</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.accentBlue }]} />
                    <Text style={styles.legendText}>Earnings</Text>
                  </View>
                </View>
              </View>
              <View style={styles.chart}>
                {weeklyTrends.map((day, index) => (
                  <View key={index} style={styles.chartBar}>
                    <Text style={styles.chartValue}>₦{(day.earnings / 1000).toFixed(0)}K</Text>
                    <View style={styles.barContainer}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: (day.trips / maxTrips) * 100,
                            backgroundColor: COLORS.accentGreen,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartLabel}>{day.day}</Text>
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={10} color={COLORS.accentOrange} />
                      <Text style={styles.ratingText}>{day.rating}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Insights & Improvements */}
          <View style={styles.improvementsSection}>
            <Text style={styles.sectionTitle}>💡 AI Recommendations</Text>
            {improvements.map((improvement) => (
              <View key={improvement.id} style={styles.improvementCard}>
                <View style={[styles.improvementIcon, { backgroundColor: COLORS.accentBlue }]}>
                  <Ionicons name={improvement.icon as any} size={20} color={COLORS.white} />
                </View>
                <View style={styles.improvementContent}>
                  <View style={styles.improvementHeader}>
                    <Text style={styles.improvementArea}>{improvement.area}</Text>
                    <View style={[styles.impactBadge, { backgroundColor: `${improvement.impactColor}20` }]}>
                      <Text style={[styles.impactText, { color: improvement.impactColor }]}>
                        {improvement.impact} Impact
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.improvementCurrent}>Current: {improvement.current}</Text>
                  <Text style={styles.improvementSuggestion}>{improvement.suggestion}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Summary Stats */}
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>📋 Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Trips</Text>
                <Text style={styles.summaryValue}>{performanceData.totalTrips}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Earnings</Text>
                <Text style={styles.summaryValue}>₦{performanceData.totalEarnings.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Avg Trip Time</Text>
                <Text style={styles.summaryValue}>{performanceData.averageTripTime} min</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Best Day</Text>
                <Text style={styles.summaryValue}>{performanceData.bestDay}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Peak Hours</Text>
                <Text style={styles.summaryValue}>{performanceData.peakHours}</Text>
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
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  periodButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: COLORS.accentGreen,
  },
  periodText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#64748B',
  },
  periodTextActive: {
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  scoreCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  scoreGradient: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: FONT_SIZE.md,
    color: '#64748B',
    marginBottom: SPACING.md,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: '900',
    color: COLORS.white,
  },
  scoreMax: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.textSecondary,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  scoreBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.white,
  },
  metricsSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.md,
    letterSpacing: -0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  metricCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  metricTitle: {
    fontSize: FONT_SIZE.sm,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: SPACING.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.xs,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.lightSurface,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  progressFill: {
    height: '100%',
  },
  metricTip: {
    fontSize: FONT_SIZE.xs,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '700',
  },
  chartSection: {
    marginBottom: SPACING.lg,
  },
  chartCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  chartHeader: {
    marginBottom: SPACING.md,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: SPACING.lg,
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
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    fontWeight: '700',
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 150,
    marginBottom: SPACING.sm,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
  },
  chartValue: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.accentGreen,
    marginBottom: SPACING.xs,
  },
  barContainer: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 10,
  },
  chartLabel: {
    fontSize: FONT_SIZE.xs,
    color: '#475569',
    marginTop: SPACING.xs,
    fontWeight: '700',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  ratingText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#475569',
  },
  improvementsSection: {
    marginBottom: SPACING.lg,
  },
  improvementCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  improvementIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  improvementContent: {
    flex: 1,
  },
  improvementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  improvementArea: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  impactBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  impactText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  improvementCurrent: {
    fontSize: FONT_SIZE.sm,
    color: '#64748B',
    marginBottom: SPACING.xs,
    fontWeight: '700',
  },
  improvementSuggestion: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    lineHeight: 20,
    fontWeight: '700',
  },
  summarySection: {
    marginTop: SPACING.lg,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  summaryLabel: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#0F172A',
  },
});
