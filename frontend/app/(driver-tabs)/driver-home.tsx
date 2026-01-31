import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  background: '#FFFFFF',
  card: '#FFFFFF',
  primary: '#000000',
  green: '#00C853',
  greenLight: '#69F0AE',
  blue: '#2979FF',
  purple: '#7C4DFF',
  orange: '#FF9100',
  red: '#FF1744',
  textPrimary: '#000000',
  textSecondary: '#1A1A1A',  // Darker for better readability
  textMuted: '#333333',      // Darker for better readability
  border: '#E0E0E0',
};

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    loadDriverData();
  }, []);

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

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'} 🚗</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
              <LinearGradient
                colors={[COLORS.green, COLORS.blue]}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>{user?.name?.charAt(0) || 'D'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Driver Mode Badge */}
          <View style={styles.modeBadge}>
            <View style={styles.modeDotOuter}>
              <View style={styles.modeDot} />
            </View>
            <Text style={styles.modeText}>DRIVER MODE</Text>
          </View>

          {/* Online/Offline Toggle Card - Premium Design */}
          <TouchableOpacity 
            style={styles.statusCard}
            onPress={toggleOnline}
            activeOpacity={0.95}
          >
            <LinearGradient
              colors={isOnline ? [COLORS.green, '#16A34A'] : ['#475569', '#334155']}
              style={styles.statusGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Decorative circles */}
              <View style={[styles.decorCircle, { top: -20, right: -20 }]} />
              <View style={[styles.decorCircle, { bottom: -30, left: 30, width: 80, height: 80 }]} />
              
              <View style={styles.statusContent}>
                <View style={styles.statusLeft}>
                  <View style={styles.statusIconOuter}>
                    <View style={[styles.statusIcon, isOnline && styles.statusIconOnline]}>
                      <Ionicons 
                        name={isOnline ? "radio" : "radio-outline"} 
                        size={32} 
                        color="#FFFFFF" 
                      />
                    </View>
                  </View>
                  <View>
                    <Text style={styles.statusTitle}>
                      {isOnline ? "You're Online" : "You're Offline"}
                    </Text>
                    <Text style={styles.statusDesc}>
                      {isOnline ? 'Tap to go offline' : 'Tap to start accepting rides'}
                    </Text>
                  </View>
                </View>
                <View style={styles.statusArrow}>
                  <Ionicons name="power" size={24} color="rgba(255,255,255,0.9)" />
                </View>
              </View>
              
              {isOnline && (
                <View style={styles.pulseIndicator}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.pulseText}>LIVE</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Earnings Card */}
          <View style={styles.earningsCard}>
            <View style={styles.earningsHeader}>
              <Text style={styles.earningsTitle}>Today's Earnings</Text>
              <TouchableOpacity style={styles.viewAllBtn}>
                <Text style={styles.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.blue} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.earningsGrid}>
              <View style={styles.earningItem}>
                <View style={[styles.earningIcon, { backgroundColor: COLORS.green + '15' }]}>
                  <Ionicons name="wallet" size={24} color={COLORS.green} />
                </View>
                <Text style={styles.earningValue}>₦{earnings.today.toLocaleString()}</Text>
                <Text style={styles.earningLabel}>Today</Text>
              </View>
              
              <View style={styles.earningDivider} />
              
              <View style={styles.earningItem}>
                <View style={[styles.earningIcon, { backgroundColor: COLORS.blue + '15' }]}>
                  <Ionicons name="trending-up" size={24} color={COLORS.blue} />
                </View>
                <Text style={styles.earningValue}>₦{earnings.week.toLocaleString()}</Text>
                <Text style={styles.earningLabel}>This Week</Text>
              </View>
              
              <View style={styles.earningDivider} />
              
              <View style={styles.earningItem}>
                <View style={[styles.earningIcon, { backgroundColor: COLORS.purple + '15' }]}>
                  <Ionicons name="car" size={24} color={COLORS.purple} />
                </View>
                <Text style={styles.earningValue}>{earnings.trips}</Text>
                <Text style={styles.earningLabel}>Trips</Text>
              </View>
            </View>
          </View>

          {/* Subscription Status */}
          <TouchableOpacity 
            style={styles.subscriptionCard}
            onPress={() => router.push('/driver/subscription')}
          >
            <LinearGradient
              colors={subscription?.status === 'active' 
                ? [COLORS.green + '20', COLORS.green + '10'] 
                : [COLORS.orange + '20', COLORS.orange + '10']}
              style={styles.subscriptionGradient}
            >
              <View style={styles.subscriptionContent}>
                <View style={[styles.subscriptionIcon, { 
                  backgroundColor: subscription?.status === 'active' ? COLORS.green : COLORS.orange 
                }]}>
                  <Ionicons 
                    name={subscription?.status === 'active' ? "checkmark-circle" : "alert-circle"} 
                    size={24} 
                    color="#FFFFFF" 
                  />
                </View>
                <View style={styles.subscriptionInfo}>
                  <Text style={styles.subscriptionTitle}>
                    {subscription?.status === 'active' ? 'Subscription Active' : 'Subscribe Now'}
                  </Text>
                  <Text style={styles.subscriptionDesc}>
                    {subscription?.status === 'active' 
                      ? `${subscription.days_remaining || 0} days remaining` 
                      : 'Activate to start earning'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Quick Actions */}
          <View style={styles.quickSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickGrid}>
              <QuickAction 
                icon="time" 
                label="History" 
                color={COLORS.blue}
                onPress={() => router.push('/ride-history')} 
              />
              <QuickAction 
                icon="map" 
                label="Heatmap" 
                color={COLORS.orange}
                onPress={() => router.push('/driver/heatmap')} 
              />
              <QuickAction 
                icon="settings" 
                label="Settings" 
                color={COLORS.purple}
                onPress={() => router.push('/settings')} 
              />
              <QuickAction 
                icon="help-circle" 
                label="Support" 
                color={COLORS.green}
                onPress={() => router.push('/chat')} 
              />
            </View>
          </View>

          {/* Quick Access Features */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Access</Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon="radio"
                label="Radio"
                color="#FF6B35"
                onPress={() => router.push('/driver/radio')}
              />
              <FeatureCard
                icon="stats-chart"
                label="Performance"
                color="#2979FF"
                onPress={() => router.push('/driver/performance')}
              />
              <FeatureCard
                icon="trophy"
                label="Leaderboard"
                color="#FFD700"
                onPress={() => router.push('/driver/leaderboard')}
              />
              <FeatureCard
                icon="flame"
                label="Fuel Tracker"
                color="#FF5722"
                onPress={() => router.push('/driver/fuel-tracker')}
              />
              <FeatureCard
                icon="map"
                label="Heatmap"
                color="#9C27B0"
                onPress={() => router.push('/driver/heatmap')}
              />
              <FeatureCard
                icon="bulb"
                label="AI Tips"
                color="#00BCD4"
                onPress={() => router.push('/driver/ai-suggestions')}
              />
              <FeatureCard
                icon="ribbon"
                label="Badges"
                color="#FF9100"
                onPress={() => router.push('/driver/badges')}
              />
              <FeatureCard
                icon="flash"
                label="Challenges"
                color="#E91E63"
                onPress={() => router.push('/driver/challenges')}
              />
              <FeatureCard
                icon="trending-up"
                label="Traffic"
                color="#4CAF50"
                onPress={() => router.push('/driver/traffic-prediction')}
              />
              <FeatureCard
                icon="analytics"
                label="Insights"
                color="#673AB7"
                onPress={() => router.push('/driver/data-insights')}
              />
              <FeatureCard
                icon="car"
                label="Vehicle"
                color="#607D8B"
                onPress={() => router.push('/driver/vehicle')}
              />
              <FeatureCard
                icon="layers"
                label="Tiers"
                color="#795548"
                onPress={() => router.push('/driver/tiers')}
              />
            </View>
          </View>

          {/* Zero Commission Banner */}
          <View style={styles.bannerCard}>
            <LinearGradient
              colors={[COLORS.purple, '#6366F1']}
              style={styles.bannerGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.bannerContent}>
                <Ionicons name="trophy" size={28} color="#FFFFFF" />
                <View style={styles.bannerText}>
                  <Text style={styles.bannerTitle}>100% Earnings</Text>
                  <Text style={styles.bannerDesc}>Keep everything you earn with NEXRYDE</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const QuickAction = ({ icon, label, color, onPress }: any) => (
  <TouchableOpacity style={styles.quickAction} onPress={onPress}>
    <View style={[styles.quickIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

const FeatureCard = ({ icon, label, color, onPress }: any) => (
  <TouchableOpacity style={styles.featureCard} onPress={onPress}>
    <View style={[styles.featureIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
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
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginBottom: 8,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  userName: {
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  profileButton: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  profileGradient: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.green + '15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.green + '30',
  },
  modeDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.green + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.green,
    letterSpacing: 1.5,
  },
  statusCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  statusGradient: {
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statusIconOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconOnline: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statusDesc: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  statusArrow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  pulseText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  earningsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  earningsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  earningsTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.blue,
  },
  earningsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  earningValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  earningLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  earningDivider: {
    width: 1,
    height: 60,
    backgroundColor: COLORS.border,
  },
  subscriptionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  subscriptionGradient: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  subscriptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  subscriptionDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quickSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickAction: {
    alignItems: 'center',
    gap: 8,
  },
  quickIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  bannerCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  bannerGradient: {
    padding: 20,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bannerDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
});
