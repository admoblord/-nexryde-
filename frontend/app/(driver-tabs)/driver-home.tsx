import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  ImageBackground,
  Animated,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Premium Images
const DRIVER_HERO_IMAGE = 'https://images.unsplash.com/photo-1449965408869-ebd3fee6a4ce?w=800&q=80';
const CAR_INTERIOR_IMAGE = 'https://images.unsplash.com/photo-1533630217389-3a5e4dff5683?w=600&q=80';

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });
  const [subscription, setSubscription] = useState<any>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 30)).current;
  const scaleAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0.95)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadDriverData();
    
    // Entry animations
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();

    // Pulse for online button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const loadDriverData = async () => {
    if (!user?.id) return;
    try {
      // Load earnings
      const statsRes = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/stats`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setEarnings({
          today: stats.today_earnings || 0,
          week: stats.week_earnings || 0,
          trips: stats.total_trips || 0,
        });
      }
      
      // Load subscription
      const subRes = await fetch(`${BACKEND_URL}/api/subscription/status/${user.id}`);
      if (subRes.ok) {
        const sub = await subRes.json();
        setSubscription(sub);
      }
    } catch (error) {
      console.error('Error loading driver data:', error);
    }
  };

  const toggleOnline = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    
    if (user?.id) {
      try {
        await fetch(`${BACKEND_URL}/api/drivers/${user.id}/online?is_online=${newStatus}`, {
          method: 'PUT',
        });
      } catch (error) {
        console.error('Error updating online status:', error);
      }
    }
    
    if (newStatus) {
      Alert.alert('🟢 You\'re Online!', 'Start receiving ride requests now.');
    }
  };

  const formatCurrency = (amount: number) => {
    return '₦' + amount.toLocaleString();
  };

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#0A0F1C', '#0F172A', '#1E293B']}
        style={StyleSheet.absoluteFillObject}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* Premium Header */}
          <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.welcomeText}>Good to see you,</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'} 🚗</Text>
              <View style={[styles.modeBadge, isOnline && styles.modeBadgeOnline]}>
                <View style={[styles.statusDot, isOnline && styles.statusDotOnline]} />
                <Text style={[styles.modeBadgeText, isOnline && styles.modeBadgeTextOnline]}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/driver/profile')}
            >
              <LinearGradient
                colors={isOnline ? ['#22C55E', '#10B981'] : ['#64748B', '#475569']}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'D'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ✨ HERO - GO ONLINE CARD */}
          <Animated.View style={[styles.heroCard, { transform: [{ scale: scaleAnim }] }]}>
            <ImageBackground
              source={{ uri: DRIVER_HERO_IMAGE }}
              style={styles.heroImage}
              imageStyle={styles.heroImageStyle}
            >
              <LinearGradient
                colors={isOnline 
                  ? ['rgba(34,197,94,0.3)', 'rgba(16,185,129,0.7)', 'rgba(6,182,212,0.9)']
                  : ['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
                style={styles.heroOverlay}
              >
                {/* Decorative Elements */}
                <View style={[styles.heroDecor1, isOnline && { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                
                <View style={styles.heroContent}>
                  <Text style={styles.heroSmall}>
                    {isOnline ? '🟢 YOU\'RE LIVE' : '🔴 GO ONLINE TO START'}
                  </Text>
                  
                  <Text style={styles.heroTitle}>
                    {isOnline ? 'Waiting for\nride requests...' : 'Ready to\nearn today?'}
                  </Text>
                  
                  {/* Big Online Toggle */}
                  <Animated.View style={{ transform: [{ scale: isOnline ? 1 : pulseAnim }] }}>
                    <TouchableOpacity 
                      style={[styles.onlineButton, isOnline && styles.onlineButtonActive]}
                      onPress={toggleOnline}
                      activeOpacity={0.9}
                    >
                      <LinearGradient
                        colors={isOnline ? ['#EF4444', '#DC2626'] : ['#22C55E', '#16A34A']}
                        style={styles.onlineButtonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Ionicons 
                          name={isOnline ? 'pause-circle' : 'power'} 
                          size={28} 
                          color="#FFFFFF" 
                        />
                        <Text style={styles.onlineButtonText}>
                          {isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </LinearGradient>
            </ImageBackground>
          </Animated.View>

          {/* 💰 EARNINGS DASHBOARD */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Earnings</Text>
              <TouchableOpacity 
                style={styles.viewAllBtn}
                onPress={() => router.push('/driver/earnings')}
              >
                <Text style={styles.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={16} color="#22C55E" />
              </TouchableOpacity>
            </View>

            <View style={styles.earningsCard}>
              <LinearGradient
                colors={['#1E293B', '#334155']}
                style={styles.earningsGradient}
              >
                <View style={styles.earningsMain}>
                  <Text style={styles.earningsLabel}>Today</Text>
                  <Text style={styles.earningsAmount}>{formatCurrency(earnings.today)}</Text>
                </View>
                <View style={styles.earningsDivider} />
                <View style={styles.earningsStats}>
                  <View style={styles.earningsStat}>
                    <Text style={styles.earningsStatValue}>{earnings.trips}</Text>
                    <Text style={styles.earningsStatLabel}>Trips</Text>
                  </View>
                  <View style={styles.earningsStat}>
                    <Text style={styles.earningsStatValue}>{formatCurrency(earnings.week)}</Text>
                    <Text style={styles.earningsStatLabel}>This Week</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* 📋 QUICK ACTIONS */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.tagPill}>
                <Text style={styles.tagPillText}>ESSENTIAL</Text>
              </View>
            </View>

            <View style={styles.quickActionsGrid}>
              <QuickActionCard
                icon="car"
                title="Vehicle"
                subtitle="Register car"
                color="#22C55E"
                onPress={() => router.push('/driver/vehicle-registration')}
              />
              <QuickActionCard
                icon="card"
                title="Subscription"
                subtitle="Manage plan"
                color="#3B82F6"
                onPress={() => router.push('/driver/subscription')}
              />
              <QuickActionCard
                icon="document-text"
                title="Verification"
                subtitle="Documents"
                color="#8B5CF6"
                onPress={() => router.push('/driver/verification')}
              />
              <QuickActionCard
                icon="wallet"
                title="Bank"
                subtitle="Withdrawals"
                color="#F59E0B"
                onPress={() => router.push('/driver/bank')}
              />
            </View>
          </View>

          {/* 🗺️ SMART FEATURES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Smart Features</Text>
              <View style={[styles.tagPill, { backgroundColor: 'rgba(139,92,246,0.2)' }]}>
                <Text style={[styles.tagPillText, { color: '#A78BFA' }]}>✨ AI</Text>
              </View>
            </View>

            <View style={styles.smartFeaturesRow}>
              <SmartFeatureCard
                icon="flame"
                title="Heatmap"
                subtitle="Find hot zones"
                gradient={['#EF4444', '#DC2626']}
                onPress={() => router.push('/driver/heatmap')}
              />
              <SmartFeatureCard
                icon="flash"
                title="Smart Mode"
                subtitle="AI optimization"
                gradient={['#8B5CF6', '#7C3AED']}
                onPress={() => router.push('/driver/smart-mode')}
              />
            </View>

            <View style={styles.smartFeaturesRow}>
              <SmartFeatureCard
                icon="warning"
                title="Safety Alerts"
                subtitle="Area warnings"
                gradient={['#F59E0B', '#D97706']}
                onPress={() => router.push('/driver/safety-alerts')}
              />
              <SmartFeatureCard
                icon="car"
                title="Traffic"
                subtitle="Live updates"
                gradient={['#06B6D4', '#0891B2']}
                onPress={() => router.push('/driver/traffic')}
              />
            </View>
          </View>

          {/* 🏆 GAMIFICATION */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Achievements</Text>
              <View style={[styles.tagPill, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
                <Text style={[styles.tagPillText, { color: '#FBBF24' }]}>🏆 EARN</Text>
              </View>
            </View>

            <View style={styles.achievementsRow}>
              <AchievementCard
                icon="trophy"
                title="Leaderboard"
                color="#F59E0B"
                onPress={() => router.push('/driver/leaderboard')}
              />
              <AchievementCard
                icon="ribbon"
                title="Challenges"
                color="#22C55E"
                onPress={() => router.push('/driver/challenges')}
              />
              <AchievementCard
                icon="medal"
                title="Badges"
                color="#3B82F6"
                onPress={() => router.push('/driver/badges')}
              />
              <AchievementCard
                icon="trending-up"
                title="Tiers"
                color="#8B5CF6"
                onPress={() => router.push('/driver/tiers')}
              />
            </View>
          </View>

          {/* 😊 WELLNESS & LIFESTYLE */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Wellness & More</Text>
            </View>

            <View style={styles.wellnessGrid}>
              <WellnessCard icon="fitness" title="Wellness" color="#EC4899" onPress={() => router.push('/driver/wellness')} />
              <WellnessCard icon="radio" title="Radio" color="#8B5CF6" onPress={() => router.push('/driver/radio')} />
              <WellnessCard icon="time" title="Prayer" color="#22C55E" onPress={() => router.push('/driver/prayer-times')} />
              <WellnessCard icon="speedometer" title="Fuel" color="#F59E0B" onPress={() => router.push('/driver/fuel-tracker')} />
              <WellnessCard icon="chatbubbles" title="Stories" color="#3B82F6" onPress={() => router.push('/driver/story-mode')} />
              <WellnessCard icon="stats-chart" title="Stats" color="#06B6D4" onPress={() => router.push('/driver/performance')} />
            </View>
          </View>

          {/* 🆘 SUPPORT */}
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.supportCard}
              onPress={() => router.push('/chat')}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#4F46E5', '#6366F1']}
                style={styles.supportGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.supportIcon}>
                  <Ionicons name="headset" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.supportText}>
                  <Text style={styles.supportTitle}>24/7 AI Support</Text>
                  <Text style={styles.supportSubtitle}>Get help anytime</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// === COMPONENTS ===

const QuickActionCard = ({ icon, title, subtitle, color, onPress }: any) => (
  <TouchableOpacity style={styles.quickActionCard} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.quickActionIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.quickActionTitle}>{title}</Text>
    <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

const SmartFeatureCard = ({ icon, title, subtitle, gradient, onPress }: any) => (
  <TouchableOpacity style={styles.smartFeatureCard} onPress={onPress} activeOpacity={0.9}>
    <LinearGradient colors={gradient} style={styles.smartFeatureGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={styles.smartFeatureIcon}>
        <Ionicons name={icon} size={22} color="#FFFFFF" />
      </View>
      <View style={styles.smartFeatureText}>
        <Text style={styles.smartFeatureTitle}>{title}</Text>
        <Text style={styles.smartFeatureSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
    </LinearGradient>
  </TouchableOpacity>
);

const AchievementCard = ({ icon, title, color, onPress }: any) => (
  <TouchableOpacity style={styles.achievementCard} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.achievementIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.achievementTitle}>{title}</Text>
  </TouchableOpacity>
);

const WellnessCard = ({ icon, title, color, onPress }: any) => (
  <TouchableOpacity style={styles.wellnessCard} onPress={onPress} activeOpacity={0.9}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={styles.wellnessTitle}>{title}</Text>
  </TouchableOpacity>
);

// === STYLES ===

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1C',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerLeft: {},
  welcomeText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
  userName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  modeBadgeOnline: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 8,
  },
  statusDotOnline: {
    backgroundColor: '#22C55E',
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
    letterSpacing: 1,
  },
  modeBadgeTextOnline: {
    color: '#22C55E',
  },
  profileButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  profileGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Hero Card
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  heroImage: {
    width: '100%',
    height: 280,
  },
  heroImageStyle: {
    borderRadius: 24,
  },
  heroOverlay: {
    flex: 1,
    padding: 24,
    justifyContent: 'flex-end',
  },
  heroDecor1: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  heroContent: {},
  heroSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 40,
    marginBottom: 24,
  },
  onlineButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  onlineButtonActive: {},
  onlineButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    gap: 12,
  },
  onlineButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // Section
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tagPill: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },

  // Earnings Card
  earningsCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  earningsGradient: {
    padding: 20,
  },
  earningsMain: {
    alignItems: 'center',
    marginBottom: 20,
  },
  earningsLabel: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 8,
  },
  earningsAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: '#22C55E',
  },
  earningsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  earningsStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  earningsStat: {
    alignItems: 'center',
  },
  earningsStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  earningsStatLabel: {
    fontSize: 13,
    color: '#64748B',
  },

  // Quick Actions Grid
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    width: (width - 52) / 2,
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  quickActionSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },

  // Smart Features
  smartFeaturesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  smartFeatureCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  smartFeatureGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  smartFeatureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  smartFeatureText: {
    flex: 1,
  },
  smartFeatureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  smartFeatureSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },

  // Achievements
  achievementsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  achievementCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  achievementIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  achievementTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
  },

  // Wellness Grid
  wellnessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  wellnessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  wellnessTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
  },

  // Support Card
  supportCard: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  supportGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
  },
  supportIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  supportText: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  supportSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
});
