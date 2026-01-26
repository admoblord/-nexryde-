import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Button, Badge } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { getDriverStats, getWallet, getFatigueStatus } from '@/src/services/api';

export default function EarningsScreen() {
  const { user } = useAppStore();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [driverStats, setDriverStats] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [fatigueStatus, setFatigueStatus] = useState<any>(null);

  const isDriver = user?.role === 'driver';

  useEffect(() => {
    loadData();
  }, [user?.role]);

  const loadData = async () => {
    if (!user?.id) return;
    try {
      if (isDriver) {
        const [statsRes, fatigueRes] = await Promise.all([
          getDriverStats(user.id),
          getFatigueStatus(user.id)
        ]);
        setDriverStats(statsRes.data);
        setFatigueStatus(fatigueRes.data);
      }
      const walletRes = await getWallet(user.id);
      setWallet(walletRes.data);
    } catch (error) {
      console.log('Error loading data:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [isDriver]);

  const getFatigueBadge = () => {
    if (!fatigueStatus) return null;
    const level = fatigueStatus.fatigue_level;
    if (level === 'critical') return { text: 'Take Break Now!', variant: 'error' as const };
    if (level === 'high') return { text: 'Rest Recommended', variant: 'warning' as const };
    if (level === 'medium') return { text: 'Moderate', variant: 'info' as const };
    return { text: 'Well Rested', variant: 'success' as const };
  };

  const renderComfortRatings = () => {
    if (!driverStats?.comfort_ratings) return null;
    const ratings = driverStats.comfort_ratings;
    
    return (
      <Card style={styles.comfortCard}>
        <Text style={styles.comfortTitle}>Comfort Ratings</Text>
        <Text style={styles.comfortSubtitle}>How riders rate your service</Text>
        
        <View style={styles.comfortGrid}>
          <View style={styles.comfortItem}>
            <Ionicons name="speedometer" size={20} color={COLORS.primary} />
            <Text style={styles.comfortValue}>{ratings.smoothness?.toFixed(1) || '5.0'}</Text>
            <Text style={styles.comfortLabel}>Smoothness</Text>
          </View>
          <View style={styles.comfortItem}>
            <Ionicons name="happy" size={20} color={COLORS.success} />
            <Text style={styles.comfortValue}>{ratings.politeness?.toFixed(1) || '5.0'}</Text>
            <Text style={styles.comfortLabel}>Politeness</Text>
          </View>
          <View style={styles.comfortItem}>
            <Ionicons name="sparkles" size={20} color={COLORS.info} />
            <Text style={styles.comfortValue}>{ratings.cleanliness?.toFixed(1) || '5.0'}</Text>
            <Text style={styles.comfortLabel}>Cleanliness</Text>
          </View>
          <View style={styles.comfortItem}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.accent} />
            <Text style={styles.comfortValue}>{ratings.safety?.toFixed(1) || '5.0'}</Text>
            <Text style={styles.comfortLabel}>Safety</Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{isDriver ? 'Earnings' : 'Wallet'}</Text>
          {isDriver && getFatigueBadge() && (
            <Badge text={getFatigueBadge()!.text} variant={getFatigueBadge()!.variant} />
          )}
        </View>

        {isDriver ? (
          // Driver Earnings View
          <>
            {/* Total Earnings Card */}
            <Card style={styles.earningsCard}>
              <Text style={styles.earningsLabel}>Total Earnings</Text>
              <Text style={styles.earningsAmount}>
                {CURRENCY}{(driverStats?.total_earnings || 0).toLocaleString()}
              </Text>
              <Text style={styles.earningsSubtext}>
                You keep 100% - No commissions!
              </Text>
            </Card>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <Card style={styles.statItem}>
                <Ionicons name="today" size={24} color={COLORS.primary} />
                <Text style={styles.statValue}>
                  {CURRENCY}{(driverStats?.today_earnings || 0).toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Today</Text>
              </Card>
              <Card style={styles.statItem}>
                <Ionicons name="car" size={24} color={COLORS.info} />
                <Text style={styles.statValue}>{driverStats?.total_trips || 0}</Text>
                <Text style={styles.statLabel}>Total Trips</Text>
              </Card>
              <Card style={styles.statItem}>
                <Ionicons name="star" size={24} color={COLORS.accent} />
                <Text style={styles.statValue}>{driverStats?.rating?.toFixed(1) || '5.0'}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </Card>
              <Card style={styles.statItem}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                <Text style={styles.statValue}>{driverStats?.completion_rate?.toFixed(0) || 100}%</Text>
                <Text style={styles.statLabel}>Completion</Text>
              </Card>
            </View>

            {/* Streaks Card */}
            {driverStats?.streaks && (
              <Card style={styles.streaksCard}>
                <View style={styles.streaksHeader}>
                  <Ionicons name="flame" size={24} color={COLORS.warning} />
                  <View style={styles.streaksInfo}>
                    <Text style={styles.streaksTitle}>
                      {driverStats.streaks.current || 0} Day Streak
                    </Text>
                    <Text style={styles.streaksSubtext}>
                      Best: {driverStats.streaks.best || 0} days
                    </Text>
                  </View>
                </View>
                <TouchableOpacity 
                  style={styles.viewLeaderboard}
                  onPress={() => router.push('/driver/leaderboard')}
                >
                  <Text style={styles.viewLeaderboardText}>View Leaderboard</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </TouchableOpacity>
              </Card>
            )}

            {/* Comfort Ratings */}
            {renderComfortRatings()}

            {/* Fatigue Warning */}
            {fatigueStatus?.needs_break && (
              <Card style={styles.fatigueCard}>
                <View style={styles.fatigueHeader}>
                  <Ionicons name="warning" size={24} color={COLORS.warning} />
                  <View style={styles.fatigueInfo}>
                    <Text style={styles.fatigueTitle}>Take a Break</Text>
                    <Text style={styles.fatigueText}>
                      You've been driving for {fatigueStatus.hours_driven?.toFixed(1) || 0} hours.
                    </Text>
                  </View>
                </View>
                <Text style={styles.fatigueRecommendation}>
                  {fatigueStatus.recommendation}
                </Text>
              </Card>
            )}

            {/* Payment Info */}
            <Card style={styles.paymentInfoCard}>
              <View style={styles.paymentInfoHeader}>
                <Ionicons name="information-circle" size={24} color={COLORS.info} />
                <Text style={styles.paymentInfoTitle}>How Payments Work</Text>
              </View>
              <Text style={styles.paymentInfoText}>
                Riders pay you directly via cash or bank transfer. KODA doesn't deduct any commission from your rides.
              </Text>
              <View style={styles.paymentMethods}>
                <View style={styles.paymentMethod}>
                  <Ionicons name="cash" size={20} color={COLORS.success} />
                  <Text style={styles.paymentMethodText}>Cash</Text>
                </View>
                <View style={styles.paymentMethod}>
                  <Ionicons name="card" size={20} color={COLORS.info} />
                  <Text style={styles.paymentMethodText}>Bank Transfer</Text>
                </View>
              </View>
            </Card>

            {/* Subscription Reminder */}
            <TouchableOpacity 
              style={styles.subscriptionReminder}
              onPress={() => router.push('/driver/subscription')}
            >
              <Ionicons name="calendar" size={24} color={COLORS.warning} />
              <View style={styles.subscriptionReminderContent}>
                <Text style={styles.subscriptionReminderTitle}>Subscription</Text>
                <Text style={styles.subscriptionReminderText}>
                  {driverStats?.subscription_active 
                    ? `${driverStats.subscription_days_remaining} days remaining`
                    : 'Subscribe to continue driving'
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={COLORS.gray400} />
            </TouchableOpacity>
          </>
        ) : (
          // Rider Wallet View
          <>
            <Card style={styles.walletCard}>
              <Text style={styles.walletLabel}>Wallet Balance</Text>
              <Text style={styles.walletAmount}>
                {CURRENCY}{(wallet?.balance || 0).toLocaleString()}
              </Text>
              <Button
                title="Top Up Wallet"
                onPress={() => {}}
                variant="outline"
                icon="add-circle"
                style={styles.topUpButton}
              />
            </Card>

            <Card style={styles.paymentInfoCard}>
              <View style={styles.paymentInfoHeader}>
                <Ionicons name="card" size={24} color={COLORS.primary} />
                <Text style={styles.paymentInfoTitle}>Payment Options</Text>
              </View>
              <Text style={styles.paymentInfoText}>
                Pay your driver directly using any of these methods:
              </Text>
              <View style={styles.paymentOptions}>
                <View style={styles.paymentOption}>
                  <View style={styles.paymentOptionIcon}>
                    <Ionicons name="cash" size={24} color={COLORS.success} />
                  </View>
                  <View style={styles.paymentOptionInfo}>
                    <Text style={styles.paymentOptionTitle}>Cash</Text>
                    <Text style={styles.paymentOptionText}>Pay cash to driver</Text>
                  </View>
                </View>
                <View style={styles.paymentOption}>
                  <View style={styles.paymentOptionIcon}>
                    <Ionicons name="phone-portrait" size={24} color={COLORS.info} />
                  </View>
                  <View style={styles.paymentOptionInfo}>
                    <Text style={styles.paymentOptionTitle}>Bank Transfer</Text>
                    <Text style={styles.paymentOptionText}>Transfer to driver's bank</Text>
                  </View>
                </View>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  earningsCard: {
    alignItems: 'center',
    padding: SPACING.xl,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.primary,
  },
  earningsLabel: {
    fontSize: FONT_SIZE.md,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: SPACING.xs,
  },
  earningsAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  earningsSubtext: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: SPACING.md,
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  paymentInfoCard: {
    marginBottom: SPACING.md,
  },
  paymentInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  paymentInfoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginLeft: SPACING.sm,
  },
  paymentInfoText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentMethodText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  subscriptionReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '20',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  subscriptionReminderContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  subscriptionReminderTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  subscriptionReminderText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  walletCard: {
    alignItems: 'center',
    padding: SPACING.xl,
    marginBottom: SPACING.md,
  },
  walletLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  walletAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  topUpButton: {
    width: '100%',
  },
  paymentOptions: {
    gap: SPACING.md,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentOptionInfo: {
    marginLeft: SPACING.md,
  },
  paymentOptionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  paymentOptionText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});
