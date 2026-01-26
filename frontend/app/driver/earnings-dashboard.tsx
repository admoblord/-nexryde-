import React, { useState, useEffect } from 'react';
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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { FallingRoses, RosePetalsStatic, RoseGlow, FloatingRoseBloom } from '@/src/components/FallingRoses';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function EarningsDashboardScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [earnings, setEarnings] = useState<any>(null);

  useEffect(() => {
    fetchEarnings();
  }, [period]);

  const fetchEarnings = async () => {
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/driver/earnings/${user?.id || 'demo'}?period=${period}`
      );
      const data = await response.json();
      setEarnings(data);
    } catch (error) {
      // Demo data
      setEarnings({
        tier: { name: 'NEXRYDE Basic', earning_potential: { min: 200, max: 300 }, monthly_fee: 25000 },
        summary: {
          total_earnings: period === 'today' ? 15600 : period === 'week' ? 98500 : 385000,
          total_trips: period === 'today' ? 8 : period === 'week' ? 52 : 198,
          total_distance_km: period === 'today' ? 45.2 : period === 'week' ? 312.8 : 1245.6,
          traffic_compensation: period === 'today' ? 2400 : period === 'week' ? 15200 : 58000,
          keep_percentage: 100
        },
        averages: {
          per_trip: period === 'today' ? 1950 : period === 'week' ? 1894 : 1944,
          per_km: 345,
          hourly: 3200
        },
        projections: {
          daily: 18500,
          weekly: 111000,
          monthly: 444000
        },
        commission_message: "You keep 100% of all earnings. Only ₦25,000 monthly subscription."
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return `${CURRENCY}${amount.toLocaleString()}`;
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      <RosePetalsStatic count={10} />
      <FallingRoses intensity="light" />
      <RoseGlow size={200} style={styles.glowTop} />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earnings</Text>
          <TouchableOpacity style={styles.tierButton} onPress={() => router.push('/driver/tiers')}>
            <Ionicons name="diamond" size={18} color={COLORS.gold} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Hero Earnings Card */}
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[COLORS.rosePetal4, COLORS.rosePetal5]}
              style={styles.heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <FloatingRoseBloom style={{ position: 'absolute', top: 10, right: 10, opacity: 0.3 }} />
              
              <Text style={styles.heroLabel}>
                {period === 'today' ? "Today's" : period === 'week' ? "This Week's" : "This Month's"} Earnings
              </Text>
              <Text style={styles.heroValue}>
                {formatCurrency(earnings?.summary?.total_earnings || 0)}
              </Text>
              
              {/* Keep 100% Badge */}
              <View style={styles.keepBadge}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                <Text style={styles.keepBadgeText}>Keep 100% - Zero commission!</Text>
              </View>
              
              {/* Quick Stats */}
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{earnings?.summary?.total_trips || 0}</Text>
                  <Text style={styles.heroStatLabel}>Trips</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{earnings?.summary?.total_distance_km || 0}km</Text>
                  <Text style={styles.heroStatLabel}>Distance</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatValue}>{formatCurrency(earnings?.averages?.per_trip || 0)}</Text>
                  <Text style={styles.heroStatLabel}>Avg/Trip</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Period Selector */}
          <View style={styles.periodSelector}>
            {(['today', 'week', 'month'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodButton, period === p && styles.periodButtonActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                  {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Traffic Compensation */}
          <View style={styles.compensationCard}>
            <View style={styles.compensationIcon}>
              <Ionicons name="car" size={24} color={COLORS.info} />
            </View>
            <View style={styles.compensationContent}>
              <Text style={styles.compensationTitle}>Traffic Compensation</Text>
              <Text style={styles.compensationSubtitle}>Extra earned for delays</Text>
            </View>
            <Text style={styles.compensationValue}>
              +{formatCurrency(earnings?.summary?.traffic_compensation || 0)}
            </Text>
          </View>

          {/* Averages Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance</Text>
            <View style={styles.averagesGrid}>
              <AverageCard
                icon="cash"
                label="Per Trip"
                value={formatCurrency(earnings?.averages?.per_trip || 0)}
                color={COLORS.success}
              />
              <AverageCard
                icon="speedometer"
                label="Per Kilometer"
                value={formatCurrency(earnings?.averages?.per_km || 0)}
                color={COLORS.info}
              />
              <AverageCard
                icon="time"
                label="Hourly Rate"
                value={formatCurrency(earnings?.averages?.hourly || 0)}
                color={COLORS.rosePetal3}
              />
            </View>
          </View>

          {/* Projections */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Earnings Projections</Text>
            <View style={styles.projectionsCard}>
              <LinearGradient
                colors={[COLORS.surface, COLORS.surfaceLight]}
                style={styles.projectionsGradient}
              >
                <ProjectionRow
                  label="Daily"
                  value={formatCurrency(earnings?.projections?.daily || 0)}
                  icon="today"
                />
                <View style={styles.projectionDivider} />
                <ProjectionRow
                  label="Weekly (6 days)"
                  value={formatCurrency(earnings?.projections?.weekly || 0)}
                  icon="calendar"
                />
                <View style={styles.projectionDivider} />
                <ProjectionRow
                  label="Monthly (24 days)"
                  value={formatCurrency(earnings?.projections?.monthly || 0)}
                  icon="calendar-outline"
                  highlight
                />
              </LinearGradient>
            </View>
          </View>

          {/* Subscription Info */}
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionRow}>
              <View style={styles.subscriptionIcon}>
                <Ionicons name="diamond" size={20} color={COLORS.gold} />
              </View>
              <View style={styles.subscriptionContent}>
                <Text style={styles.subscriptionTitle}>{earnings?.tier?.name || 'NEXRYDE Basic'}</Text>
                <Text style={styles.subscriptionFee}>Monthly fee: {CURRENCY}25,000</Text>
              </View>
              <TouchableOpacity 
                style={styles.upgradeMiniBtn}
                onPress={() => router.push('/driver/tiers')}
              >
                <Text style={styles.upgradeMiniText}>Upgrade</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subscriptionNote}>
              {earnings?.commission_message || "You keep 100% of all earnings!"}
            </Text>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsRow}>
              <ActionButton icon="download" label="Export" color={COLORS.info} />
              <ActionButton icon="analytics" label="Analytics" color={COLORS.rosePetal3} />
              <ActionButton icon="card" label="Withdraw" color={COLORS.success} />
            </View>
          </View>

          {/* Fair Pricing Note */}
          <View style={styles.fairPricingCard}>
            <View style={styles.fairPricingHeader}>
              <View style={styles.fairPricingPetal} />
              <Text style={styles.fairPricingTitle}>NEXRYDE Fair Pricing</Text>
              <View style={styles.fairPricingPetal} />
            </View>
            <Text style={styles.fairPricingText}>
              • Automatic traffic compensation{'\n'}
              • Weather surcharges applied{'\n'}
              • 50% max increase cap protects riders{'\n'}
              • You get 100% of the final fare
            </Text>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const AverageCard = ({ icon, label, value, color }: any) => (
  <View style={styles.averageCard}>
    <View style={[styles.averageIcon, { backgroundColor: `${color}20` }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={styles.averageValue}>{value}</Text>
    <Text style={styles.averageLabel}>{label}</Text>
  </View>
);

const ProjectionRow = ({ label, value, icon, highlight }: any) => (
  <View style={styles.projectionRow}>
    <View style={styles.projectionLeft}>
      <Ionicons name={icon} size={18} color={highlight ? COLORS.gold : COLORS.textMuted} />
      <Text style={[styles.projectionLabel, highlight && styles.projectionLabelHighlight]}>{label}</Text>
    </View>
    <Text style={[styles.projectionValue, highlight && styles.projectionValueHighlight]}>{value}</Text>
  </View>
);

const ActionButton = ({ icon, label, color }: any) => (
  <TouchableOpacity style={styles.actionButton}>
    <View style={[styles.actionIcon, { backgroundColor: `${color}20` }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  glowTop: {
    position: 'absolute',
    top: -60,
    left: -60,
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
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  tierButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  heroGradient: {
    padding: SPACING.xl,
  },
  heroLabel: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  heroValue: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '900',
    color: COLORS.white,
    marginVertical: SPACING.sm,
  },
  keepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  keepBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  heroStat: {
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  heroStatLabel: {
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  heroStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xs,
  },
  periodButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
  },
  periodButtonActive: {
    backgroundColor: COLORS.accent,
  },
  periodText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  periodTextActive: {
    color: COLORS.primary,
  },
  compensationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.infoSoft,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
  },
  compensationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.info,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  compensationContent: {
    flex: 1,
  },
  compensationTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.info,
  },
  compensationSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.info,
    opacity: 0.8,
  },
  compensationValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.info,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  averagesGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  averageCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
  },
  averageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  averageValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  averageLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  projectionsCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  projectionsGradient: {
    padding: SPACING.lg,
  },
  projectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  projectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  projectionLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  projectionLabelHighlight: {
    color: COLORS.gold,
    fontWeight: '600',
  },
  projectionValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  projectionValueHighlight: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gold,
  },
  projectionDivider: {
    height: 1,
    backgroundColor: COLORS.gray700,
  },
  subscriptionCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.goldSoft,
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subscriptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  subscriptionContent: {
    flex: 1,
  },
  subscriptionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  subscriptionFee: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  upgradeMiniBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  upgradeMiniText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subscriptionNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.success,
    marginTop: SPACING.sm,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  actionLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  fairPricingCard: {
    backgroundColor: COLORS.accentSoft,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
  },
  fairPricingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  fairPricingPetal: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
    opacity: 0.7,
  },
  fairPricingTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accent,
  },
  fairPricingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    lineHeight: 22,
    opacity: 0.9,
  },
  bottomSpacer: {
    height: 40,
  },
});
