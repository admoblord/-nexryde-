import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// EXACT COLORS FROM DESIGN
const COLORS = {
  background: '#121212',
  cardBg: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  yellow: '#FFB600',
  green: '#22E180',
  purple: '#A259FF',
  red: '#F85D50',
};

// DRIVER ACTIONS WITH DESIGN COLORS
const DRIVER_ACTIONS = [
  // CORE
  {
    id: 'earnings',
    label: 'Earnings',
    icon: 'cash',
    color: COLORS.yellow,
    route: '/driver/earnings-dashboard',
  },
  {
    id: 'trips',
    label: 'My Trips',
    icon: 'list',
    color: COLORS.green,
    route: '/(driver-tabs)/driver-trips',
  },
  {
    id: 'subscription',
    label: 'Subscription',
    icon: 'card',
    color: COLORS.purple,
    route: '/driver/subscription',
  },
  {
    id: 'verification',
    label: 'Verification',
    icon: 'shield-checkmark',
    color: COLORS.green,
    route: '/driver/verification',
  },
  // VEHICLE
  {
    id: 'vehicle',
    label: 'My Vehicle',
    icon: 'car-sport',
    color: COLORS.blue,
    route: '/driver/vehicle',
  },
  {
    id: 'vehicle-registration',
    label: 'Registration',
    icon: 'document-text',
    color: COLORS.yellow,
    route: '/driver/vehicle-registration',
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: 'documents',
    color: COLORS.purple,
    route: '/driver/documents',
  },
  // PERFORMANCE
  {
    id: 'performance',
    label: 'Performance',
    icon: 'analytics',
    color: COLORS.green,
    route: '/driver/performance',
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    icon: 'trophy',
    color: COLORS.yellow,
    route: '/driver/leaderboard',
  },
  {
    id: 'badges',
    label: 'Badges',
    icon: 'star',
    color: COLORS.purple,
    route: '/driver/badges',
  },
  {
    id: 'tiers',
    label: 'Driver Tiers',
    icon: 'ribbon',
    color: COLORS.green,
    route: '/driver/tiers',
  },
  {
    id: 'challenges',
    label: 'Challenges',
    icon: 'flame',
    color: COLORS.red,
    route: '/driver/challenges',
  },
  // SMART FEATURES
  {
    id: 'smart-mode',
    label: 'Smart Mode',
    icon: 'bulb',
    color: COLORS.yellow,
    route: '/driver/smart-mode',
  },
  {
    id: 'heatmap',
    label: 'Heatmap',
    icon: 'map',
    color: COLORS.red,
    route: '/driver/heatmap',
  },
  {
    id: 'traffic',
    label: 'Traffic',
    icon: 'car',
    color: COLORS.yellow,
    route: '/driver/traffic',
  },
  {
    id: 'traffic-prediction',
    label: 'Traffic AI',
    icon: 'speedometer',
    color: COLORS.purple,
    route: '/driver/traffic-prediction',
  },
  {
    id: 'accident-prediction',
    label: 'Accident AI',
    icon: 'warning',
    color: COLORS.red,
    route: '/driver/accident-prediction',
  },
  // AI & INSIGHTS
  {
    id: 'ai-suggestions',
    label: 'AI Coach',
    icon: 'chatbubbles',
    color: COLORS.purple,
    route: '/driver/ai-suggestions',
  },
  {
    id: 'data-insights',
    label: 'Insights',
    icon: 'stats-chart',
    color: COLORS.blue,
    route: '/driver/data-insights',
  },
  // SAFETY & WELLNESS
  {
    id: 'safety-alerts',
    label: 'Safety',
    icon: 'shield',
    color: COLORS.green,
    route: '/driver/safety-alerts',
  },
  {
    id: 'wellness',
    label: 'Wellness',
    icon: 'fitness',
    color: COLORS.green,
    route: '/driver/wellness',
  },
  // LIFESTYLE
  {
    id: 'fuel-tracker',
    label: 'Fuel Tracker',
    icon: 'water',
    color: COLORS.yellow,
    route: '/driver/fuel-tracker',
  },
  {
    id: 'prayer-times',
    label: 'Prayer Times',
    icon: 'moon',
    color: COLORS.purple,
    route: '/driver/prayer-times',
  },
  {
    id: 'story-mode',
    label: 'Stories',
    icon: 'book',
    color: COLORS.blue,
    route: '/driver/story-mode',
  },
  {
    id: 'radio',
    label: 'Radio',
    icon: 'radio',
    color: COLORS.red,
    route: '/driver/radio',
  },
  // FINANCE
  {
    id: 'bank',
    label: 'Bank Account',
    icon: 'business',
    color: COLORS.green,
    route: '/driver/bank',
  },
];

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    loadDriverData();
    
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadDriverData = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/stats`);
      if (response.ok) {
        const data = await response.json();
        setEarnings({
          today: data.earnings_today || 0,
          week: data.earnings_this_week || 0,
          trips: data.total_trips || 0,
        });
      }
    } catch (error) {
      console.error('Error loading driver data:', error);
    }
  };

  const toggleOnlineStatus = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    try {
      await fetch(`${BACKEND_URL}/api/drivers/${user?.id}/online`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: newStatus }),
      });
    } catch (error) {
      console.error('Error updating online status:', error);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {/* GREETING SECTION */}
          <Animated.View 
            style={[
              styles.greeting, 
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View>
              <Text style={styles.greetingSubtitle}>Drive Smart</Text>
              <Text style={styles.greetingTitle}>{user?.name || 'Driver'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.avatar}
              onPress={() => router.push('/(driver-tabs)/driver-profile')}
            >
              <Ionicons name="person" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </Animated.View>

          {/* ONLINE/OFFLINE TOGGLE */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={[styles.statusCard, isOnline && styles.statusCardOnline]}>
              <View style={styles.statusLeft}>
                <View style={[styles.statusIcon, isOnline && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Ionicons 
                    name={isOnline ? "flash" : "flash-off"} 
                    size={28} 
                    color={isOnline ? COLORS.text : COLORS.textSecondary} 
                  />
                </View>
                <View>
                  <Text style={[styles.statusLabel, isOnline && { color: COLORS.text }]}>
                    {isOnline ? 'You\'re Online' : 'You\'re Offline'}
                  </Text>
                  <Text style={[styles.statusDesc, isOnline && { color: 'rgba(255,255,255,0.8)' }]}>
                    {isOnline ? 'Ready to accept rides' : 'Go online to start earning'}
                  </Text>
                </View>
              </View>
              <Switch
                value={isOnline}
                onValueChange={toggleOnlineStatus}
                trackColor={{ false: '#4A5568', true: 'rgba(255,255,255,0.3)' }}
                thumbColor={isOnline ? COLORS.text : '#E2E8F0'}
                ios_backgroundColor="#4A5568"
              />
            </View>
          </Animated.View>

          {/* EARNINGS CARDS */}
          <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
            <Text style={styles.sectionTitle}>Earnings</Text>
            <View style={styles.earningsRow}>
              <TouchableOpacity 
                style={[styles.earningCard, { backgroundColor: COLORS.yellow + '20' }]}
                onPress={() => router.push('/(driver-tabs)/driver-earnings' as any)}
                activeOpacity={0.8}
              >
                <View style={[styles.earningIconBg, { backgroundColor: COLORS.yellow + '30' }]}>
                  <Ionicons name="today" size={24} color={COLORS.yellow} />
                </View>
                <Text style={styles.earningLabel}>Today</Text>
                <Text style={styles.earningValue}>₦{earnings.today.toLocaleString()}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.earningCard, { backgroundColor: COLORS.green + '20' }]}
                onPress={() => router.push('/(driver-tabs)/driver-earnings' as any)}
                activeOpacity={0.8}
              >
                <View style={[styles.earningIconBg, { backgroundColor: COLORS.green + '30' }]}>
                  <Ionicons name="calendar" size={24} color={COLORS.green} />
                </View>
                <Text style={styles.earningLabel}>This Week</Text>
                <Text style={styles.earningValue}>₦{earnings.week.toLocaleString()}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* STATS CARD */}
          <View style={styles.statsCard}>
            <View style={[styles.statItem, { backgroundColor: COLORS.purple + '20' }]}>
              <Ionicons name="car" size={28} color={COLORS.purple} />
              <Text style={styles.statValue}>{earnings.trips}</Text>
              <Text style={styles.statLabel}>Total Trips</Text>
            </View>
          </View>

          {/* ALL DRIVER FEATURES GRID */}
          <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
            <Text style={styles.sectionTitle}>All Features</Text>
            <View style={styles.actionsGrid}>
              {DRIVER_ACTIONS.map((action, index) => (
                <Animated.View
                  key={action.id}
                  style={{
                    width: (width - 52) / 2,
                    marginBottom: 12,
                    transform: [{
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 50],
                        outputRange: [0, 50 + (index * 10)],
                      })
                    }]
                  }}
                >
                  <TouchableOpacity
                    style={[styles.actionCard, { backgroundColor: action.color + '20' }]}
                    onPress={() => router.push(action.route as any)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.actionIconBg, { backgroundColor: action.color + '30' }]}>
                      <Ionicons name={action.icon as any} size={28} color={action.color} />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </Animated.View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  // GREETING
  greeting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greetingSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  greetingTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // STATUS CARD
  statusCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusCardOnline: {
    backgroundColor: COLORS.green,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statusDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // SECTION
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },

  // EARNINGS
  earningsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  earningCard: {
    flex: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  earningIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  earningLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
  },
  earningValue: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1,
  },

  // STATS
  statsCard: {
    marginBottom: 24,
  },
  statItem: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.text,
    marginTop: 12,
    marginBottom: 4,
    letterSpacing: 2,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  // ACTIONS GRID
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  actionIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
});
