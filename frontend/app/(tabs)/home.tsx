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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Badge, Button } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { getDriverStats, toggleDriverOnline, switchRole, getSubscription } from '@/src/services/api';

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
    
    // Check subscription first
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
                // Switching to driver
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
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'User'}</Text>
            <View style={styles.roleContainer}>
              <Badge
                text={isDriver ? 'Driver Mode' : 'Rider Mode'}
                variant={isDriver ? 'success' : 'info'}
              />
            </View>
          </View>
          <TouchableOpacity style={styles.switchButton} onPress={handleSwitchRole}>
            <Ionicons name="swap-horizontal" size={20} color={COLORS.primary} />
            <Text style={styles.switchText}>Switch</Text>
          </TouchableOpacity>
        </View>

        {isDriver ? (
          // Driver View
          <>
            {/* Online Toggle */}
            <Card style={styles.onlineCard}>
              <View style={styles.onlineHeader}>
                <View style={[
                  styles.statusDot,
                  { backgroundColor: isOnline ? COLORS.online : COLORS.offline }
                ]} />
                <Text style={styles.onlineStatus}>
                  {isOnline ? 'You are Online' : 'You are Offline'}
                </Text>
              </View>
              <Text style={styles.onlineSubtext}>
                {isOnline 
                  ? 'Ready to accept ride requests' 
                  : 'Go online to start accepting rides'
                }
              </Text>
              <Button
                title={loading ? 'Updating...' : (isOnline ? 'Go Offline' : 'Go Online')}
                onPress={handleToggleOnline}
                variant={isOnline ? 'outline' : 'primary'}
                loading={loading}
                icon={isOnline ? 'pause-circle' : 'play-circle'}
                style={styles.onlineButton}
              />
            </Card>

            {/* Stats */}
            {driverStats && (
              <View style={styles.statsContainer}>
                <Card style={styles.statCard}>
                  <Ionicons name="cash" size={24} color={COLORS.primary} />
                  <Text style={styles.statValue}>{CURRENCY}{driverStats.today_earnings?.toLocaleString() || 0}</Text>
                  <Text style={styles.statLabel}>Today's Earnings</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Ionicons name="car" size={24} color={COLORS.info} />
                  <Text style={styles.statValue}>{driverStats.total_trips || 0}</Text>
                  <Text style={styles.statLabel}>Total Trips</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Ionicons name="star" size={24} color={COLORS.accent} />
                  <Text style={styles.statValue}>{driverStats.rating?.toFixed(1) || '5.0'}</Text>
                  <Text style={styles.statLabel}>Rating</Text>
                </Card>
              </View>
            )}

            {/* Subscription Status */}
            <Card style={styles.subscriptionCard}>
              <View style={styles.subscriptionHeader}>
                <Ionicons 
                  name={driverStats?.subscription_active ? 'checkmark-circle' : 'alert-circle'} 
                  size={24} 
                  color={driverStats?.subscription_active ? COLORS.success : COLORS.warning} 
                />
                <View style={styles.subscriptionInfo}>
                  <Text style={styles.subscriptionTitle}>
                    {driverStats?.subscription_active ? 'Subscription Active' : 'No Active Subscription'}
                  </Text>
                  {driverStats?.subscription_active && (
                    <Text style={styles.subscriptionDays}>
                      {driverStats.subscription_days_remaining} days remaining
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity 
                style={styles.subscriptionButton}
                onPress={() => router.push('/driver/subscription')}
              >
                <Text style={styles.subscriptionButtonText}>
                  {driverStats?.subscription_active ? 'Manage' : 'Subscribe Now'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </Card>

            {/* Quick Actions for Driver */}
            <View style={styles.driverQuickActions}>
              <TouchableOpacity 
                style={styles.driverQuickAction}
                onPress={() => router.push('/assistant')}
              >
                <View style={[styles.driverQuickIcon, { backgroundColor: COLORS.info + '20' }]}>
                  <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.info} />
                </View>
                <Text style={styles.driverQuickText}>AI Assistant</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.driverQuickAction}
                onPress={() => router.push('/driver/leaderboard')}
              >
                <View style={[styles.driverQuickIcon, { backgroundColor: COLORS.accent + '20' }]}>
                  <Ionicons name="trophy" size={24} color={COLORS.accent} />
                </View>
                <Text style={styles.driverQuickText}>Leaderboard</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.driverQuickAction}
                onPress={() => router.push('/(tabs)/safety')}
              >
                <View style={[styles.driverQuickIcon, { backgroundColor: COLORS.success + '20' }]}>
                  <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
                </View>
                <Text style={styles.driverQuickText}>Safety</Text>
              </TouchableOpacity>
            </View>

            {/* Pending Trips */}
            {isOnline && (
              <TouchableOpacity 
                style={styles.tripRequestsCard}
                onPress={handleViewTrips}
              >
                <View style={styles.tripRequestsIcon}>
                  <Ionicons name="notifications" size={28} color={COLORS.white} />
                </View>
                <View style={styles.tripRequestsInfo}>
                  <Text style={styles.tripRequestsTitle}>View Ride Requests</Text>
                  <Text style={styles.tripRequestsSubtext}>Tap to see available rides nearby</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={COLORS.gray400} />
              </TouchableOpacity>
            )}
          </>
        ) : (
          // Rider View
          <>
            {/* Book Ride Card */}
            <Card style={styles.bookCard}>
              <Text style={styles.bookTitle}>Where are you going?</Text>
              <TouchableOpacity style={styles.searchBar} onPress={handleBookRide}>
                <Ionicons name="search" size={20} color={COLORS.gray400} />
                <Text style={styles.searchPlaceholder}>Enter destination</Text>
              </TouchableOpacity>
              
              <View style={styles.quickActions}>
                <TouchableOpacity style={styles.quickAction} onPress={handleBookRide}>
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.primary + '20' }]}>
                    <Ionicons name="location" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.quickActionText}>Set on Map</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickAction} onPress={handleBookRide}>
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.info + '20' }]}>
                    <Ionicons name="home" size={20} color={COLORS.info} />
                  </View>
                  <Text style={styles.quickActionText}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickAction} onPress={handleBookRide}>
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.accent + '20' }]}>
                    <Ionicons name="briefcase" size={20} color={COLORS.accent} />
                  </View>
                  <Text style={styles.quickActionText}>Work</Text>
                </TouchableOpacity>
              </View>
            </Card>

            {/* AI Assistant for Riders */}
            <TouchableOpacity 
              style={styles.aiAssistantCard}
              onPress={() => router.push('/assistant')}
            >
              <View style={styles.aiAssistantIcon}>
                <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.white} />
              </View>
              <View style={styles.aiAssistantInfo}>
                <Text style={styles.aiAssistantTitle}>Need Help?</Text>
                <Text style={styles.aiAssistantSubtext}>Ask our AI Assistant anything</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>

            {/* Info Cards */}
            <Card style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Verified Drivers</Text>
                <Text style={styles.infoText}>All drivers are verified with NIN and documents</Text>
              </View>
            </Card>

            <Card style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <Ionicons name="cash" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Fair Pricing</Text>
                <Text style={styles.infoText}>System-calculated fares with no hidden charges</Text>
              </View>
            </Card>

            <Card style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <Ionicons name="card" size={24} color={COLORS.info} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Flexible Payment</Text>
                <Text style={styles.infoText}>Pay with cash or bank transfer to driver</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  greeting: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  roleContainer: {
    flexDirection: 'row',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  switchText: {
    marginLeft: SPACING.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
  onlineCard: {
    marginBottom: SPACING.md,
    alignItems: 'center',
    padding: SPACING.lg,
  },
  onlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: SPACING.sm,
  },
  onlineStatus: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  onlineSubtext: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  onlineButton: {
    width: '100%',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.md,
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  subscriptionCard: {
    marginBottom: SPACING.md,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  subscriptionInfo: {
    marginLeft: SPACING.md,
  },
  subscriptionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  subscriptionDays: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  subscriptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  subscriptionButtonText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  tripRequestsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOWS.md,
  },
  tripRequestsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripRequestsInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  tripRequestsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.white,
  },
  tripRequestsSubtext: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  bookCard: {
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  bookTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  searchPlaceholder: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.gray400,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickAction: {
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  quickActionText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  infoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  driverQuickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  driverQuickAction: {
    alignItems: 'center',
  },
  driverQuickIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
    ...SHADOWS.sm,
  },
  driverQuickText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  aiAssistantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.info,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  aiAssistantIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiAssistantInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  aiAssistantTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  aiAssistantSubtext: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
});
