import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  background: '#F8F9FA',
  card: '#FFFFFF',
  cardDark: '#000000',
  primary: '#000000',
  green: '#00C853',
  greenLight: '#10B981',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  orange: '#F59E0B',
  red: '#EF4444',
  textPrimary: '#000000',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textWhite: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  shadow: 'rgba(0,0,0,0.08)',
};

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    loadDriverData();
  }, []); // ✅ FIX: Empty array = run once on mount (user.id checked inside function)

  const loadDriverData = async () => {
    if (!user?.id) return;
    try {
      // Load earnings
      const earningsRes = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/earnings`);
      if (earningsRes.ok) {
        const data = await earningsRes.json();
        setEarnings(data);
      }
      
      // Load subscription
      const subRes = await fetch(`${BACKEND_URL}/api/subscriptions/${user.id}`);
      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscription(subData);
      }
    } catch (e) {
      console.error('Load driver data error:', e);
    }
  };

  const toggleOnline = async () => {
    if (!user?.id) return;
    
    // Check subscription status
    if (!subscription || subscription.status !== 'active') {
      Alert.alert(
        'Subscription Required',
        'You need an active subscription to go online. Subscribe now to start earning!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Subscribe', onPress: () => router.push('/driver/subscription') }
        ]
      );
      return;
    }
    
    try {
      await fetch(`${BACKEND_URL}/api/drivers/${user.id}/toggle-online`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_online: !isOnline }),
      });
      setIsOnline(!isOnline);
    } catch (e) {
      console.error('Toggle online error:', e);
    }
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Clean Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Good {getTimeOfDay()},</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
              <View style={styles.profileCircle}>
                <Text style={styles.profileInitial}>
                  {(user?.name && user.name.length > 0) ? user.name.charAt(0).toUpperCase() : 'D'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Clean Status Card */}
          <TouchableOpacity 
            style={[styles.statusCard, isOnline && styles.statusCardOnline]}
            onPress={toggleOnline}
            activeOpacity={0.9}
          >
            <View style={styles.statusContent}>
              <View style={styles.statusLeft}>
                <View style={[styles.statusDot, isOnline && styles.statusDotOnline]} />
                <View style={styles.statusTextContainer}>
                  <Text style={[styles.statusTitle, isOnline && styles.statusTitleOnline]}>
                    {isOnline ? "You're Online" : "You're Offline"}
                  </Text>
                  <Text style={styles.statusDesc}>
                    {isOnline ? 'Accepting ride requests' : 'Tap to start earning'}
                  </Text>
                </View>
              </View>
              <Ionicons 
                name={isOnline ? "toggle" : "toggle-outline"} 
                size={40} 
                color={isOnline ? COLORS.green : COLORS.textMuted} 
              />
            </View>
          </TouchableOpacity>

          {/* Earnings Summary */}
          <View style={styles.earningsCard}>
            <View style={styles.earningsHeader}>
              <Text style={styles.earningsTitle}>Earnings</Text>
              <TouchableOpacity 
                style={styles.viewAllBtn}
                onPress={() => router.push('/driver/earnings-dashboard')}
              >
                <Text style={styles.viewAllText}>View details</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.earningsGrid}>
              <View style={styles.earningItem}>
                <Text style={styles.earningLabel}>Today</Text>
                <Text style={styles.earningValue}>₦{earnings.today.toLocaleString()}</Text>
              </View>
              
              <View style={styles.earningDivider} />
              
              <View style={styles.earningItem}>
                <Text style={styles.earningLabel}>This Week</Text>
                <Text style={styles.earningValue}>₦{earnings.week.toLocaleString()}</Text>
              </View>
              
              <View style={styles.earningDivider} />
              
              <View style={styles.earningItem}>
                <Text style={styles.earningLabel}>Trips</Text>
                <Text style={styles.earningValue}>{earnings.trips}</Text>
              </View>
            </View>
          </View>

          {/* Subscription Status */}
          {subscription?.status !== 'active' && (
            <TouchableOpacity 
              style={styles.subscriptionAlert}
              onPress={() => router.push('/driver/subscription')}
            >
              <View style={styles.subscriptionContent}>
                <Ionicons name="information-circle" size={24} color={COLORS.orange} />
                <View style={styles.subscriptionInfo}>
                  <Text style={styles.subscriptionTitle}>Subscription Required</Text>
                  <Text style={styles.subscriptionDesc}>Subscribe to start earning</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={COLORS.textMuted} />
              </View>
            </TouchableOpacity>
          )}

          {/* Quick Access */}
          <View style={styles.quickSection}>
            <Text style={styles.sectionTitle}>Quick Access</Text>
            <View style={styles.quickGrid}>
              <MenuCard
                icon="time-outline"
                label="Trip History"
                onPress={() => router.push('/ride-history')}
              />
              <MenuCard
                icon="wallet-outline"
                label="Earnings"
                onPress={() => router.push('/driver/earnings-dashboard')}
              />
              <MenuCard
                icon="card-outline"
                label="Subscription"
                onPress={() => router.push('/driver/subscription')}
              />
              <MenuCard
                icon="chatbubble-outline"
                label="Support"
                onPress={() => router.push('/chat')}
              />
            </View>
          </View>

          {/* More Features */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More Features</Text>
              <TouchableOpacity>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon="map-outline"
                label="Heatmap"
                onPress={() => router.push('/driver/heatmap')}
              />
              <FeatureCard
                icon="trophy-outline"
                label="Leaderboard"
                onPress={() => router.push('/driver/leaderboard')}
              />
              <FeatureCard
                icon="flash-outline"
                label="Challenges"
                onPress={() => router.push('/driver/challenges')}
              />
              <FeatureCard
                icon="analytics-outline"
                label="Insights"
                onPress={() => router.push('/driver/data-insights')}
              />
              <FeatureCard
                icon="car-outline"
                label="Vehicle"
                onPress={() => router.push('/driver/vehicle')}
              />
              <FeatureCard
                icon="settings-outline"
                label="Settings"
                onPress={() => router.push('/settings')}
              />
            </View>
          </View>

          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <View style={styles.infoBannerIcon}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.green} />
            </View>
            <View style={styles.infoBannerText}>
              <Text style={styles.infoBannerTitle}>0% Commission</Text>
              <Text style={styles.infoBannerDesc}>Keep 100% of your earnings</Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const MenuCard = ({ icon, label, onPress }: any) => (
  <TouchableOpacity style={styles.menuCard} onPress={onPress} activeOpacity={0.7}>
    <Ionicons name={icon} size={24} color={COLORS.textPrimary} />
    <Text style={styles.menuLabel}>{label}</Text>
  </TouchableOpacity>
);

const FeatureCard = ({ icon, label, onPress }: any) => (
  <TouchableOpacity style={styles.featureCard} onPress={onPress} activeOpacity={0.7}>
    <Ionicons name={icon} size={22} color={COLORS.textSecondary} />
    <Text style={styles.featureLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  profileButton: {
    borderRadius: 22,
  },
  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textWhite,
  },
  statusCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  statusCardOnline: {
    borderColor: COLORS.green,
    backgroundColor: COLORS.green + '08',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.textMuted,
  },
  statusDotOnline: {
    backgroundColor: COLORS.green,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  statusTitleOnline: {
    color: COLORS.green,
  },
  statusDesc: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  earningsCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  earningsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  earningsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  earningsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  earningItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  earningValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  earningDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.borderLight,
  },
  subscriptionAlert: {
    backgroundColor: COLORS.orange + '10',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.orange + '30',
  },
  subscriptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  subscriptionDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  quickSection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  menuCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  menuLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    width: (width - 64) / 3,
    aspectRatio: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  featureLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.green + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerText: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  infoBannerDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
});
