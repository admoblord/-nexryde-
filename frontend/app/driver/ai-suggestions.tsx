import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function AITripSuggestionsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('hotspots');

  const hotspots = [
    {
      id: '1',
      location: 'Lekki Phase 1',
      demand: 'High',
      demandColor: COLORS.accentGreen,
      waitTime: '3 min',
      avgFare: '₦2,500',
      distance: '2.1 km',
      reason: 'Rush hour, many ride requests',
      confidence: 94,
    },
    {
      id: '2',
      location: 'Victoria Island',
      demand: 'Medium',
      demandColor: COLORS.accentOrange,
      waitTime: '8 min',
      avgFare: '₦3,200',
      distance: '5.3 km',
      reason: 'Office closing time',
      confidence: 87,
    },
    {
      id: '3',
      location: 'Ikeja GRA',
      demand: 'High',
      demandColor: COLORS.accentGreen,
      waitTime: '5 min',
      avgFare: '₦1,800',
      distance: '8.7 km',
      reason: 'Evening traffic peak',
      confidence: 91,
    },
  ];

  const predictions = [
    {
      id: '1',
      time: '5:00 PM - 7:00 PM',
      title: 'Rush Hour Peak',
      earnings: '₦15,000 - ₦20,000',
      icon: 'trending-up',
      color: COLORS.accentGreen,
      tip: 'Position yourself near VI by 4:45 PM',
    },
    {
      id: '2',
      time: '10:00 PM - 12:00 AM',
      title: 'Late Night Surge',
      earnings: '₦8,000 - ₦12,000',
      icon: 'moon',
      color: COLORS.accentBlue,
      tip: 'Focus on bar/restaurant areas in Lekki',
    },
    {
      id: '3',
      time: 'Saturday 2:00 PM - 6:00 PM',
      title: 'Weekend Shopping',
      earnings: '₦12,000 - ₦18,000',
      icon: 'cart',
      color: COLORS.accentOrange,
      tip: 'Stay near Palms Mall & Ikeja City Mall',
    },
  ];

  const insights = [
    {
      id: '1',
      title: 'Your Best Hours',
      value: '5 PM - 8 PM',
      icon: 'time',
      color: COLORS.accentGreen,
      description: 'You earn 40% more during these hours',
    },
    {
      id: '2',
      title: 'Peak Day',
      value: 'Friday',
      icon: 'calendar',
      color: COLORS.accentBlue,
      description: 'Fridays bring you ₦8,500 more on average',
    },
    {
      id: '3',
      title: 'Best Routes',
      value: 'VI → Lekki',
      icon: 'navigate',
      color: COLORS.accentOrange,
      description: 'Highest demand & earnings route',
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
            <Ionicons name="sparkles" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>AI Trip Suggestions</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'hotspots' && styles.tabActive]}
            onPress={() => setActiveTab('hotspots')}
          >
            <Ionicons
              name="location"
              size={20}
              color={activeTab === 'hotspots' ? COLORS.white : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'hotspots' && styles.tabTextActive]}>
              Hotspots
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'predictions' && styles.tabActive]}
            onPress={() => setActiveTab('predictions')}
          >
            <Ionicons
              name="analytics"
              size={20}
              color={activeTab === 'predictions' ? COLORS.white : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'predictions' && styles.tabTextActive]}>
              Predictions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'insights' && styles.tabActive]}
            onPress={() => setActiveTab('insights')}
          >
            <Ionicons
              name="bulb"
              size={20}
              color={activeTab === 'insights' ? COLORS.white : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'insights' && styles.tabTextActive]}>
              Insights
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'hotspots' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🔥 Current Hotspots</Text>
                <Text style={styles.sectionSubtitle}>AI-powered real-time demand</Text>
              </View>

              {hotspots.map((spot) => (
                <View key={spot.id} style={styles.hotspotCard}>
                  <View style={styles.hotspotHeader}>
                    <View style={styles.hotspotInfo}>
                      <Text style={styles.hotspotLocation}>{spot.location}</Text>
                      <View style={[styles.demandBadge, { backgroundColor: `${spot.demandColor}20` }]}>
                        <View style={[styles.demandDot, { backgroundColor: spot.demandColor }]} />
                        <Text style={[styles.demandText, { color: spot.demandColor }]}>
                          {spot.demand} Demand
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.navigateButton}>
                      <Ionicons name="navigate" size={20} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.hotspotStats}>
                    <View style={styles.statItem}>
                      <Ionicons name="time" size={16} color={COLORS.accentBlue} />
                      <Text style={styles.statLabel}>Wait</Text>
                      <Text style={styles.statValue}>{spot.waitTime}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Ionicons name="cash" size={16} color={COLORS.accentGreen} />
                      <Text style={styles.statLabel}>Avg Fare</Text>
                      <Text style={styles.statValue}>{spot.avgFare}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Ionicons name="location" size={16} color={COLORS.accentOrange} />
                      <Text style={styles.statLabel}>Distance</Text>
                      <Text style={styles.statValue}>{spot.distance}</Text>
                    </View>
                  </View>

                  <View style={styles.hotspotFooter}>
                    <Text style={styles.reasonText}>{spot.reason}</Text>
                    <View style={styles.confidenceBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.accentGreen} />
                      <Text style={styles.confidenceText}>{spot.confidence}% confident</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {activeTab === 'predictions' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📊 Earnings Predictions</Text>
                <Text style={styles.sectionSubtitle}>Based on historical data & patterns</Text>
              </View>

              {predictions.map((pred) => (
                <View key={pred.id} style={styles.predictionCard}>
                  <View style={[styles.predictionIcon, { backgroundColor: pred.color }]}>
                    <Ionicons name={pred.icon as any} size={28} color={COLORS.white} />
                  </View>
                  <View style={styles.predictionContent}>
                    <Text style={styles.predictionTime}>{pred.time}</Text>
                    <Text style={styles.predictionTitle}>{pred.title}</Text>
                    <View style={styles.earningsRow}>
                      <Text style={styles.earningsLabel}>Potential Earnings:</Text>
                      <Text style={styles.earningsValue}>{pred.earnings}</Text>
                    </View>
                    <View style={styles.tipBox}>
                      <Ionicons name="bulb" size={14} color={COLORS.accentGreen} />
                      <Text style={styles.tipText}>{pred.tip}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {activeTab === 'insights' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>💡 Your Insights</Text>
                <Text style={styles.sectionSubtitle}>Personalized for you</Text>
              </View>

              {insights.map((insight) => (
                <View key={insight.id} style={styles.insightCard}>
                  <LinearGradient
                    colors={[insight.color, `${insight.color}CC`]}
                    style={styles.insightGradient}
                  >
                    <Ionicons name={insight.icon as any} size={32} color={COLORS.white} />
                  </LinearGradient>
                  <View style={styles.insightContent}>
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={styles.insightValue}>{insight.value}</Text>
                    <Text style={styles.insightDescription}>{insight.description}</Text>
                  </View>
                </View>
              ))}

              <View style={styles.aiCard}>
                <Ionicons name="sparkles" size={24} color={COLORS.accentGreen} />
                <Text style={styles.aiCardTitle}>AI Learning About You</Text>
                <Text style={styles.aiCardText}>
                  Our AI analyzes your driving patterns, peak hours, and best routes to give you
                  personalized suggestions that maximize your earnings.
                </Text>
              </View>
            </>
          )}
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: {
    backgroundColor: COLORS.accentGreen,
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#64748B',
  },
  tabTextActive: {
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  sectionHeader: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: '#64748B',
    fontWeight: '700',
  },
  hotspotCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  hotspotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  hotspotInfo: {
    flex: 1,
  },
  hotspotLocation: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  demandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
    gap: 4,
  },
  demandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  demandText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  navigateButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotspotStats: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.lightBorder,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: '#0F172A',
  },
  hotspotFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reasonText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    fontWeight: '700',
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  predictionCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  predictionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  predictionContent: {
    flex: 1,
  },
  predictionTime: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentBlue,
    marginBottom: 4,
  },
  predictionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.sm,
    letterSpacing: -0.5,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  earningsLabel: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    fontWeight: '700',
  },
  earningsValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: COLORS.successSoft,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentGreen,
    fontWeight: '700',
  },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  insightGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: FONT_SIZE.sm,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  insightDescription: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    fontWeight: '700',
  },
  aiCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  aiCardTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: SPACING.sm,
    letterSpacing: -0.5,
  },
  aiCardText: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '700',
  },
});
