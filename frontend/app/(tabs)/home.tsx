import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Badge, Button } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { getDriverStats, toggleDriverOnline, switchRole, getSubscription } from '@/src/services/api';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { user, setUser, currentLocation, setCurrentLocation, isOnline, setIsOnline, setSubscription } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);
  const [driverStats, setDriverStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const isDriver = user?.role === 'driver';

  useEffect(() => {
    requestLocationPermission();
    if (isDriver) {
      loadDriverData();
    }
  }, [user?.role]);

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
    if (isDriver) {
      await loadDriverData();
    }
    setRefreshing(false);
  }, [isDriver]);

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

  const handleSwitchRole = async () => {
    if (!user?.id) return;
    
    Alert.alert(
      'Switch Mode',
      `Switch to ${isDriver ? 'Rider' : 'Driver'} mode?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            try {
              const response = await switchRole(user.id);
              setUser(response.data);
              if (!isDriver) {
                await loadDriverData();
              }
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to switch role');
            }
          }
        }
      ]
    );
  };

  const handleBookRide = () => {
    router.push('/rider/book');
  };

  const handleViewTrips = () => {
    if (isDriver) {
      router.push('/driver/trips');
    }
  };

  return (
    <View style={styles.container}>
      {/* Gradient Header */}
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        style={styles.headerContainer}
      >
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.userName}>{user?.name || 'Guest'}</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity 
                style={styles.switchModeBtn}
                onPress={handleSwitchRole}
              >
                <Ionicons 
                  name={isDriver ? 'car' : 'person'} 
                  size={18} 
                  color={COLORS.accentGreen} 
                />
                <Text style={styles.switchModeText}>
                  {isDriver ? 'Rider' : 'Driver'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Role Badge */}
          <View style={styles.roleBadgeContainer}>
            <LinearGradient
              colors={isDriver 
                ? [COLORS.accentGreen + '30', COLORS.accentBlue + '30']
                : [COLORS.accentBlue + '30', COLORS.accentGreen + '30']
              }
              style={styles.roleBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={[styles.roleDot, { backgroundColor: isDriver ? COLORS.accentGreen : COLORS.accentBlue }]} />
              <Text style={[styles.roleBadgeText, { color: isDriver ? COLORS.accentGreen : COLORS.accentBlue }]}>
                {isDriver ? 'Driver Mode' : 'Rider Mode'}
              </Text>
            </LinearGradient>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={COLORS.accentGreen}
          />
        }
      >
        {isDriver ? (
          // DRIVER VIEW
          <>
            {/* Online Status Card */}
            <View style={styles.onlineCardWrapper}>
              <LinearGradient
                colors={isOnline 
                  ? ['#10B981', '#059669']
                  : ['#1E293B', '#334155']
                }
                style={styles.onlineCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.onlineCardInner}>
                  <View style={[
                    styles.statusIndicator,
                    { backgroundColor: isOnline ? 'rgba(255,255,255,0.25)' : '#475569' }
                  ]}>
                    <View style={[
                      styles.statusDotInner,
                      { backgroundColor: isOnline ? '#FFFFFF' : '#94A3B8' }
                    ]} />
                  </View>
                  <View style={styles.onlineInfo}>
                    <Text style={[
                      styles.onlineTitle,
                      { color: '#FFFFFF' }
                    ]}>
                      {isOnline ? "You're Online" : "You're Offline"}
                    </Text>
                    <Text style={[
                      styles.onlineSubtext,
                      { color: isOnline ? 'rgba(255,255,255,0.85)' : '#94A3B8' }
                    ]}>
                      {isOnline ? 'Accepting ride requests' : 'Go online to start earning'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.onlineToggle,
                    { backgroundColor: isOnline ? 'rgba(255,255,255,0.25)' : '#10B981' }
                  ]}
                  onPress={handleToggleOnline}
                  disabled={loading}
                >
                  <Ionicons 
                    name={isOnline ? 'pause' : 'play'} 
                    size={20} 
                    color={'#FFFFFF'} 
                  />
                  <Text style={[styles.onlineToggleText, { color: '#FFFFFF' }]}>
                    {loading ? '...' : isOnline ? 'Stop' : 'Start'}
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>

            {/* Stats Grid - Enhanced */}
            <View style={styles.statsGrid}>
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={[styles.statBox, styles.statBoxLarge]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.statIconWrapWhite}>
                  <Ionicons name="wallet" size={26} color="#10B981" />
                </View>
                <Text style={styles.statLabelWhite}>Today's Earnings</Text>
                <Text style={styles.statValueLarge}>
                  {CURRENCY}{driverStats?.today_earnings?.toLocaleString() || '0'}
                </Text>
              </LinearGradient>
              <View style={styles.statBoxRow}>
                <View style={styles.statBoxSmall}>
                  <View style={[styles.smallStatIcon, { backgroundColor: '#3B82F620' }]}>
                    <Ionicons name="car" size={24} color="#3B82F6" />
                  </View>
                  <Text style={styles.statValueSmall}>{driverStats?.today_trips || 0}</Text>
                  <Text style={styles.statLabelSmall}>Trips</Text>
                </View>
                <View style={styles.statBoxSmall}>
                  <View style={[styles.smallStatIcon, { backgroundColor: '#F59E0B20' }]}>
                    <Ionicons name="star" size={24} color="#F59E0B" />
                  </View>
                  <Text style={styles.statValueSmall}>{driverStats?.rating?.toFixed(1) || '5.0'}</Text>
                  <Text style={styles.statLabelSmall}>Rating</Text>
                </View>
              </View>
            </View>

            {/* Subscription Status - Enhanced */}
            <TouchableOpacity 
              style={styles.subscriptionCard}
              onPress={() => router.push('/driver/subscription')}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={driverStats?.subscription_active 
                  ? ['#10B98120', '#10B98110']
                  : ['#EF444420', '#EF444410']
                }
                style={styles.subscriptionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.subscriptionLeft}>
                  <View style={[
                    styles.subscriptionIcon,
                    { backgroundColor: driverStats?.subscription_active ? '#10B981' : '#EF4444' }
                  ]}>
                    <Ionicons 
                      name="card" 
                      size={24} 
                      color="#FFFFFF" 
                    />
                  </View>
                  <View>
                    <Text style={styles.subscriptionTitle}>
                      {driverStats?.subscription_active ? 'Subscription Active' : 'Subscribe Now'}
                    </Text>
                    <Text style={styles.subscriptionDays}>
                      {driverStats?.subscription_days_left 
                        ? `${driverStats.subscription_days_left} days remaining`
                        : '₦25,000/month • Unlimited earnings'}
                    </Text>
                  </View>
                </View>
                <View style={styles.subscriptionArrow}>
                  <Ionicons name="chevron-forward" size={22} color="#64748B" />
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Quick Actions - Enhanced */}
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsGrid}>
              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/driver/challenges')}
              >
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  style={styles.quickActionIconGradient}
                >
                  <Ionicons name="trophy" size={26} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Challenges</Text>
                <Text style={styles.quickActionSubtext}>Earn bonuses</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/driver/earnings-dashboard')}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.quickActionIconGradient}
                >
                  <Ionicons name="stats-chart" size={26} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Earnings</Text>
                <Text style={styles.quickActionSubtext}>View reports</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/driver/tiers')}
              >
                <LinearGradient
                  colors={['#F59E0B', '#D97706']}
                  style={styles.quickActionIconGradient}
                >
                  <Ionicons name="ribbon" size={26} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Driver Tier</Text>
                <Text style={styles.quickActionSubtext}>Gold status</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.quickActionCard}
                onPress={() => router.push('/driver/heatmap')}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#7C3AED']}
                  style={styles.quickActionIconGradient}
                >
                  <Ionicons name="flame" size={26} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Heatmap</Text>
                <Text style={styles.quickActionSubtext}>Busy areas</Text>
              </TouchableOpacity>
            </View>

            {/* View Requests CTA */}
            {isOnline && (
              <TouchableOpacity 
                style={styles.rideRequestsCta}
                onPress={handleViewTrips}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#10B981', '#3B82F6']}
                  style={styles.rideRequestsGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View style={styles.rideRequestsLeft}>
                    <View style={styles.rideRequestsIcon}>
                      <Ionicons name="notifications" size={26} color="#10B981" />
                    </View>
                    <View>
                      <Text style={styles.rideRequestsTitle}>View Ride Requests</Text>
                      <Text style={styles.rideRequestsSubtext}>Tap to see available rides nearby</Text>
                    </View>
                  </View>
                  <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </>
        ) : (
          // RIDER VIEW
          <>
            {/* Book Ride Card */}
            <View style={styles.bookRideCard}>
              <Text style={styles.bookRideTitle}>Where to?</Text>
              <TouchableOpacity 
                style={styles.searchBar}
                onPress={handleBookRide}
                activeOpacity={0.8}
              >
                <View style={styles.searchIconWrap}>
                  <Ionicons name="search" size={20} color={COLORS.accentGreen} />
                </View>
                <Text style={styles.searchPlaceholder}>Enter your destination</Text>
              </TouchableOpacity>
              
              <View style={styles.savedLocations}>
                <TouchableOpacity style={styles.savedLocation} onPress={handleBookRide}>
                  <View style={[styles.savedLocationIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
                    <Ionicons name="home" size={18} color={COLORS.accentBlue} />
                  </View>
                  <Text style={styles.savedLocationText}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.savedLocation} onPress={handleBookRide}>
                  <View style={[styles.savedLocationIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                    <Ionicons name="briefcase" size={18} color={COLORS.accentGreen} />
                  </View>
                  <Text style={styles.savedLocationText}>Work</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.savedLocation} onPress={handleBookRide}>
                  <View style={[styles.savedLocationIcon, { backgroundColor: COLORS.goldSoft }]}>
                    <Ionicons name="location" size={18} color={COLORS.gold} />
                  </View>
                  <Text style={styles.savedLocationText}>Map</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* AI Assistant Banner */}
            <TouchableOpacity 
              style={styles.aiAssistantBanner}
              onPress={() => router.push('/assistant')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryLight]}
                style={styles.aiAssistantGradient}
              >
                <View style={styles.aiAssistantLeft}>
                  <View style={styles.aiAssistantIcon}>
                    <Ionicons name="sparkles" size={22} color={COLORS.accentGreen} />
                  </View>
                  <View>
                    <Text style={styles.aiAssistantTitle}>AI Assistant</Text>
                    <Text style={styles.aiAssistantSubtext}>Get help with anything</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.accentGreen} />
              </LinearGradient>
            </TouchableOpacity>

            {/* Features */}
            <Text style={styles.sectionTitle}>Why NEXRYDE?</Text>
            <View style={styles.featuresGrid}>
              <View style={styles.featureCard}>
                <View style={[styles.featureIconWrap, { backgroundColor: COLORS.accentGreenSoft }]}>
                  <Ionicons name="shield-checkmark" size={24} color={COLORS.accentGreen} />
                </View>
                <Text style={styles.featureTitle}>Verified Drivers</Text>
                <Text style={styles.featureDesc}>All drivers verified with NIN</Text>
              </View>
              
              <View style={styles.featureCard}>
                <View style={[styles.featureIconWrap, { backgroundColor: COLORS.accentBlueSoft }]}>
                  <Ionicons name="cash" size={24} color={COLORS.accentBlue} />
                </View>
                <Text style={styles.featureTitle}>Fair Pricing</Text>
                <Text style={styles.featureDesc}>No hidden charges</Text>
              </View>
              
              <View style={styles.featureCard}>
                <View style={[styles.featureIconWrap, { backgroundColor: COLORS.infoSoft }]}>
                  <Ionicons name="location" size={24} color={COLORS.info} />
                </View>
                <Text style={styles.featureTitle}>Live Tracking</Text>
                <Text style={styles.featureDesc}>Real-time trip monitoring</Text>
              </View>
              
              <View style={styles.featureCard}>
                <View style={[styles.featureIconWrap, { backgroundColor: COLORS.errorSoft }]}>
                  <Ionicons name="heart" size={24} color={COLORS.error} />
                </View>
                <Text style={styles.featureTitle}>Driver Welfare</Text>
                <Text style={styles.featureDesc}>100% earnings to drivers</Text>
              </View>
            </View>
          </>
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
    backgroundColor: COLORS.background,
  },
  headerContainer: {
    paddingBottom: SPACING.lg,
    borderBottomLeftRadius: BORDER_RADIUS.xxxl,
    borderBottomRightRadius: BORDER_RADIUS.xxxl,
  },
  headerSafe: {
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: SPACING.md,
  },
  headerLeft: {},
  greeting: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerRight: {},
  switchModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  switchModeText: {
    color: COLORS.accentGreen,
    fontWeight: '600',
    fontSize: FONT_SIZE.sm,
  },
  roleBadgeContainer: {
    marginTop: SPACING.md,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.sm,
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  
  // Driver Styles
  onlineCardWrapper: {
    marginBottom: SPACING.lg,
  },
  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xxl,
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
  statBox: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  statBoxLarge: {
    flex: 1.2,
    padding: SPACING.lg,
  },
  statBoxRow: {
    flex: 1,
    gap: SPACING.md,
  },
  statBoxSmall: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
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
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  statValueSmall: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.white,
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
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
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
    color: COLORS.white,
  },
  subscriptionDays: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
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
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
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
    color: COLORS.white,
  },
  
  rideRequestsCta: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.glow,
  },
  rideRequestsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
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
    color: COLORS.white,
  },
  rideRequestsSubtext: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  
  // Rider Styles
  bookRideCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  bookRideTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  searchPlaceholder: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
  },
  savedLocations: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  savedLocation: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  savedLocationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedLocationText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  
  aiAssistantBanner: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  aiAssistantGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  aiAssistantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  aiAssistantIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiAssistantTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  aiAssistantSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  featureCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2 - SPACING.md / 2,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  featureTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  
  bottomSpacer: {
    height: SPACING.xxl,
  },
});
