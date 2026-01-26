import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { getDriverStats, toggleDriverOnline, getSubscription } from '@/src/services/api';

const { width } = Dimensions.get('window');

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user, setCurrentLocation, isOnline, setIsOnline, setSubscription } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [driverStats, setDriverStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    requestLocationPermission();
    loadDriverData();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: 'Current Location',
        });
      }
    } catch (error) {
      console.log('Location permission error:', error);
    }
  };

  const loadDriverData = async () => {
    if (!user?.id) return;
    try {
      const [statsRes, subRes] = await Promise.all([
        getDriverStats(user.id),
        getSubscription(user.id)
      ]);
      setDriverStats(statsRes.data);
      if (subRes.data) {
        setSubscription(subRes.data);
      }
      setIsOnline(statsRes.data.is_online);
    } catch (error) {
      console.log('Error loading driver data:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDriverData();
    setRefreshing(false);
  }, []);

  const handleToggleOnline = async () => {
    if (!user?.id) return;
    
    if (!isOnline && !driverStats?.subscription_active) {
      Alert.alert(
        'Subscription Required',
        'You need an active subscription to go online and accept rides.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Subscribe Now', onPress: () => router.push('/driver/subscription') }
        ]
      );
      return;
    }

    setLoading(true);
    try {
      await toggleDriverOnline(user.id, !isOnline);
      setIsOnline(!isOnline);
      await loadDriverData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Premium Header */}
      <View style={styles.headerContainer}>
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name?.split(' ')[0] || 'Driver'}</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.notificationBtn}>
                <Ionicons name="notifications-outline" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Driver Badge */}
          <View style={styles.driverBadge}>
            <View style={styles.driverDot} />
            <Text style={styles.driverBadgeText}>Driver Mode</Text>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Online Status Card */}
        <View style={[
          styles.onlineCard,
          { backgroundColor: isOnline ? COLORS.primary : COLORS.white }
        ]}>
          <View style={styles.onlineCardInner}>
            <View style={[
              styles.statusIndicator,
              { backgroundColor: isOnline ? COLORS.success : COLORS.gray300 }
            ]}>
              <View style={styles.statusDotInner} />
            </View>
            <View style={styles.onlineInfo}>
              <Text style={[
                styles.onlineTitle,
                { color: isOnline ? COLORS.white : COLORS.textPrimary }
              ]}>
                {isOnline ? "You're Online" : "You're Offline"}
              </Text>
              <Text style={[
                styles.onlineSubtext,
                { color: isOnline ? COLORS.gray400 : COLORS.textSecondary }
              ]}>
                {isOnline ? 'Ready to accept rides' : 'Go online to start earning'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.onlineToggle,
              { backgroundColor: isOnline ? 'rgba(255,59,48,0.15)' : COLORS.accent }
            ]}
            onPress={handleToggleOnline}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Ionicons 
              name={isOnline ? 'pause' : 'play'} 
              size={20} 
              color={isOnline ? COLORS.error : COLORS.primary} 
            />
            <Text style={[
              styles.onlineToggleText,
              { color: isOnline ? COLORS.error : COLORS.primary }
            ]}>
              {loading ? '...' : (isOnline ? 'Stop' : 'Start')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Earnings Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statBoxMain}>
            <View style={styles.statIconWrap}>
              <Ionicons name="cash" size={24} color={COLORS.accent} />
            </View>
            <Text style={styles.statLabel}>Today's Earnings</Text>
            <Text style={styles.statValueLarge}>
              {CURRENCY}{driverStats?.today_earnings?.toLocaleString() || '0'}
            </Text>
            <Text style={styles.statSubLabel}>Keep 100% - Zero commission</Text>
          </View>
          <View style={styles.statBoxColumn}>
            <View style={styles.statBoxSmall}>
              <Ionicons name="car" size={22} color={COLORS.info} />
              <Text style={styles.statValueSmall}>{driverStats?.total_trips || 0}</Text>
              <Text style={styles.statLabelSmall}>Total Trips</Text>
            </View>
            <View style={styles.statBoxSmall}>
              <Ionicons name="star" size={22} color={COLORS.accent} />
              <Text style={styles.statValueSmall}>{driverStats?.rating?.toFixed(1) || '5.0'}</Text>
              <Text style={styles.statLabelSmall}>Rating</Text>
            </View>
          </View>
        </View>

        {/* Subscription Status */}
        <TouchableOpacity 
          style={styles.subscriptionCard}
          onPress={() => router.push('/driver/subscription')}
          activeOpacity={0.8}
        >
          <View style={styles.subscriptionLeft}>
            <View style={[
              styles.subscriptionIcon,
              { backgroundColor: driverStats?.subscription_active ? COLORS.successSoft : COLORS.warningSoft }
            ]}>
              <Ionicons 
                name={driverStats?.subscription_active ? 'checkmark-circle' : 'alert-circle'} 
                size={24} 
                color={driverStats?.subscription_active ? COLORS.success : COLORS.warning} 
              />
            </View>
            <View>
              <Text style={styles.subscriptionTitle}>
                {driverStats?.subscription_active ? 'Subscription Active' : 'No Active Subscription'}
              </Text>
              <Text style={styles.subscriptionDays}>
                {driverStats?.subscription_active 
                  ? `${driverStats.subscription_days_remaining} days remaining`
                  : 'Subscribe to go online'
                }
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
        </TouchableOpacity>

        {/* Challenges Banner */}
        <TouchableOpacity 
          style={styles.challengesBanner}
          onPress={() => router.push('/driver/challenges')}
          activeOpacity={0.85}
        >
          <View style={styles.challengesBannerLeft}>
            <View style={styles.challengesBannerIcon}>
              <Ionicons name="flame" size={24} color={COLORS.error} />
            </View>
            <View>
              <Text style={styles.challengesBannerTitle}>Daily Challenges</Text>
              <Text style={styles.challengesBannerSubtext}>3 active \u2022 Earn up to ₦30K extra</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => router.push('/driver/challenges')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.errorSoft }]}>
              <Ionicons name="flame" size={24} color={COLORS.error} />
            </View>
            <Text style={styles.quickActionText}>Challenges</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => router.push('/driver/leaderboard')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="trophy" size={24} color={COLORS.accent} />
            </View>
            <Text style={styles.quickActionText}>Leaderboard</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => router.push('/assistant')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.info} />
            </View>
            <Text style={styles.quickActionText}>AI Assistant</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.quickActionCard}
            onPress={() => router.push('/(driver-tabs)/driver-safety')}
            activeOpacity={0.8}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
            </View>
            <Text style={styles.quickActionText}>Safety</Text>
          </TouchableOpacity>
        </View>

        {/* Ride Requests CTA */}
        {isOnline && (
          <TouchableOpacity 
            style={styles.rideRequestsCta}
            onPress={() => router.push('/driver/trips')}
            activeOpacity={0.8}
          >
            <View style={styles.rideRequestsLeft}>
              <View style={styles.rideRequestsIcon}>
                <Ionicons name="notifications" size={24} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.rideRequestsTitle}>View Ride Requests</Text>
                <Text style={styles.rideRequestsSubtext}>Tap to see available rides</Text>
              </View>
            </View>
            <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  headerContainer: {
    backgroundColor: COLORS.primary,
    paddingBottom: SPACING.lg,
    borderBottomLeftRadius: BORDER_RADIUS.xxxl,
    borderBottomRightRadius: BORDER_RADIUS.xxxl,
    ...SHADOWS.lg,
  },
  headerSafe: {
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
  },
  greeting: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray400,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerRight: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  driverDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  driverBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  onlineCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  statusDotInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
  },
  onlineInfo: {
    flex: 1,
  },
  onlineTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  onlineSubtext: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  onlineToggleText: {
    fontWeight: '700',
    fontSize: FONT_SIZE.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  statBoxMain: {
    flex: 1.3,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  statBoxColumn: {
    flex: 1,
    gap: SPACING.md,
  },
  statBoxSmall: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  statIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  statValueLarge: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statSubLabel: {
    fontSize: FONT_SIZE.xxs,
    color: COLORS.success,
    marginTop: SPACING.xs,
  },
  statValueSmall: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  statLabelSmall: {
    fontSize: FONT_SIZE.xxs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  subscriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  subscriptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  subscriptionDays: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  quickActionCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2 - SPACING.md / 2,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  quickActionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  rideRequestsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.accent,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.gold,
  },
  rideRequestsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rideRequestsIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideRequestsTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  rideRequestsSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    opacity: 0.7,
  },
  bottomSpacer: {
    height: SPACING.xxl,
  },
});
