import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  Animated,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// PREMIUM IMAGE - Nigerian Yoruba man smiling in his car!
// Using relative path for guaranteed compatibility
const DRIVER_HERO = require('../../assets/images/nigerian-driver.jpg');

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });

  // Animations
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 40)).current;
  const scaleAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadDriverData();
    
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const loadDriverData = async () => {
    if (!user?.id) return;
    try {
      const statsRes = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/stats`);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setEarnings({
          today: stats.today_earnings || 0,
          week: stats.week_earnings || 0,
          trips: stats.total_trips || 0,
        });
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
        await fetch(`${BACKEND_URL}/api/drivers/${user.id}/online?is_online=${newStatus}`, { method: 'PUT' });
      } catch (error) {
        console.error('Error updating online status:', error);
      }
    }
    
    Alert.alert(
      newStatus ? '🟢 You\'re Now Online!' : '🔴 You\'re Offline',
      newStatus ? 'Get ready to receive ride requests!' : 'You won\'t receive new requests.'
    );
  };

  const formatCurrency = (amount: number) => '₦' + amount.toLocaleString();

  return (
    <View style={styles.container}>
      {/* BRIGHT Gradient Background */}
      <LinearGradient
        colors={['#FFFFFF', '#F0FDF4', '#ECFEFF', '#FFF7ED']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* ✨ PREMIUM HEADER */}
          <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
            <View>
              <Text style={styles.greeting}>Welcome back! 🚗</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileBtn}
              onPress={() => router.push('/driver/profile')}
            >
              <LinearGradient
                colors={isOnline ? ['#10B981', '#06B6D4'] : ['#64748B', '#475569']}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'D'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* 🌟 HERO - SMILING NIGERIAN DRIVER */}
          <Animated.View style={[styles.heroSection, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.heroCard}>
              {/* Nigerian Driver Image - MOBILE OPTIMIZED */}
              <View style={styles.imageContainer}>
                <Image
                  source={DRIVER_HERO}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
                {/* Gradient overlay for better text readability */}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.3)']}
                  style={styles.imageOverlay}
                />
              </View>
              
              {/* Content Section Below Image */}
              <LinearGradient
                colors={isOnline ? ['#10B981', '#059669'] : ['#374151', '#1F2937']}
                style={styles.heroContentSection}
              >
                {/* Status Badge */}
                <View style={[styles.statusBadge, isOnline && styles.statusBadgeOnline]}>
                  <View style={[styles.statusDot, isOnline && styles.statusDotOnline]} />
                  <Text style={[styles.statusText, isOnline && styles.statusTextOnline]}>
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </Text>
                </View>

                <Text style={styles.heroTagline}>
                  {isOnline ? '🟢 YOU\'RE LIVE!' : '🚗 START EARNING TODAY'}
                </Text>
                <Text style={styles.heroTitle}>
                  {isOnline ? 'Waiting for\nriders...' : 'Ready to hit\nthe road?'}
                </Text>
                
                {/* BIG GO ONLINE BUTTON */}
                <Animated.View style={{ transform: [{ scale: isOnline ? 1 : pulseAnim }] }}>
                  <TouchableOpacity 
                    style={styles.goOnlineBtn}
                    onPress={toggleOnline}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={isOnline ? ['#EF4444', '#DC2626'] : ['#22C55E', '#16A34A']}
                      style={styles.goOnlineGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Ionicons 
                        name={isOnline ? 'pause-circle' : 'power'} 
                        size={32} 
                        color="#FFF" 
                      />
                      <Text style={styles.goOnlineText}>
                        {isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* 💰 EARNINGS DASHBOARD */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Earnings</Text>
              <TouchableOpacity onPress={() => router.push('/driver/earnings')} style={styles.viewAllBtn}>
                <Text style={styles.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={18} color="#10B981" />
              </TouchableOpacity>
            </View>

            <View style={styles.earningsCard}>
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.earningsGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.earningsMain}>
                  <Text style={styles.earningsLabel}>TODAY</Text>
                  <Text style={styles.earningsAmount}>{formatCurrency(earnings.today)}</Text>
                </View>
                <View style={styles.earningsStats}>
                  <View style={styles.earningsStat}>
                    <Text style={styles.earningsStatValue}>{earnings.trips}</Text>
                    <Text style={styles.earningsStatLabel}>Trips</Text>
                  </View>
                  <View style={styles.earningsDivider} />
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
              <View style={styles.essentialBadge}>
                <Text style={styles.essentialText}>⚡ ESSENTIAL</Text>
              </View>
            </View>

            <View style={styles.quickGrid}>
              <QuickCard icon="car" title="Vehicle" subtitle="Register car" color="#10B981" onPress={() => router.push('/driver/vehicle-registration')} />
              <QuickCard icon="card" title="Subscription" subtitle="Manage plan" color="#3B82F6" onPress={() => router.push('/driver/subscription')} />
              <QuickCard icon="document" title="Verification" subtitle="Documents" color="#8B5CF6" onPress={() => router.push('/driver/verification')} />
              <QuickCard icon="wallet" title="Bank" subtitle="Withdrawals" color="#F59E0B" onPress={() => router.push('/driver/bank')} />
            </View>
          </View>

          {/* 🗺️ SMART FEATURES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Smart Features</Text>
              <View style={[styles.essentialBadge, { backgroundColor: '#EDE9FE' }]}>
                <Text style={[styles.essentialText, { color: '#8B5CF6' }]}>✨ AI</Text>
              </View>
            </View>

            <View style={styles.smartRow}>
              <SmartCard icon="flame" title="Heatmap" subtitle="Find hot zones" gradient={['#EF4444', '#DC2626']} onPress={() => router.push('/driver/heatmap')} />
              <SmartCard icon="flash" title="Smart Mode" subtitle="AI optimize" gradient={['#8B5CF6', '#7C3AED']} onPress={() => router.push('/driver/smart-mode')} />
            </View>
            <View style={styles.smartRow}>
              <SmartCard icon="warning" title="Safety Alerts" subtitle="Stay safe" gradient={['#F59E0B', '#D97706']} onPress={() => router.push('/driver/safety-alerts')} />
              <SmartCard icon="car" title="Traffic" subtitle="Live updates" gradient={['#06B6D4', '#0891B2']} onPress={() => router.push('/driver/traffic')} />
            </View>
          </View>

          {/* 🏆 ACHIEVEMENTS */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Achievements</Text>
              <View style={[styles.essentialBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.essentialText, { color: '#D97706' }]}>🏆 EARN</Text>
              </View>
            </View>

            <View style={styles.achieveRow}>
              <AchieveCard icon="trophy" label="Leaderboard" color="#F59E0B" onPress={() => router.push('/driver/leaderboard')} />
              <AchieveCard icon="ribbon" label="Challenges" color="#10B981" onPress={() => router.push('/driver/challenges')} />
              <AchieveCard icon="medal" label="Badges" color="#3B82F6" onPress={() => router.push('/driver/badges')} />
              <AchieveCard icon="trending-up" label="Tiers" color="#8B5CF6" onPress={() => router.push('/driver/tiers')} />
            </View>
          </View>

          {/* 😊 WELLNESS */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Wellness & More</Text>
            <View style={styles.wellnessGrid}>
              <WellnessBtn icon="fitness" label="Wellness" color="#EC4899" onPress={() => router.push('/driver/wellness')} />
              <WellnessBtn icon="radio" label="Radio" color="#8B5CF6" onPress={() => router.push('/driver/radio')} />
              <WellnessBtn icon="time" label="Prayer" color="#10B981" onPress={() => router.push('/driver/prayer-times')} />
              <WellnessBtn icon="speedometer" label="Fuel" color="#F59E0B" onPress={() => router.push('/driver/fuel-tracker')} />
              <WellnessBtn icon="chatbubbles" label="Stories" color="#3B82F6" onPress={() => router.push('/driver/story-mode')} />
              <WellnessBtn icon="stats-chart" label="Stats" color="#06B6D4" onPress={() => router.push('/driver/performance')} />
            </View>
          </View>

          {/* 🆘 SUPPORT */}
          <View style={styles.section}>
            <TouchableOpacity style={styles.supportCard} onPress={() => router.push('/chat')} activeOpacity={0.9}>
              <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.supportGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <View style={styles.supportIcon}>
                  <Text style={styles.supportEmoji}>🤖</Text>
                </View>
                <View style={styles.supportText}>
                  <Text style={styles.supportTitle}>24/7 AI Support</Text>
                  <Text style={styles.supportSubtitle}>Get help anytime</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// === COMPONENTS ===

const QuickCard = ({ icon, title, subtitle, color, onPress }: any) => (
  <TouchableOpacity style={styles.quickCard} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.quickIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={26} color={color} />
    </View>
    <Text style={styles.quickTitle}>{title}</Text>
    <Text style={styles.quickSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

const SmartCard = ({ icon, title, subtitle, gradient, onPress }: any) => (
  <TouchableOpacity style={styles.smartCard} onPress={onPress} activeOpacity={0.9}>
    <LinearGradient colors={gradient} style={styles.smartGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={styles.smartIcon}>
        <Ionicons name={icon} size={24} color="#FFF" />
      </View>
      <View style={styles.smartText}>
        <Text style={styles.smartTitle}>{title}</Text>
        <Text style={styles.smartSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
    </LinearGradient>
  </TouchableOpacity>
);

const AchieveCard = ({ icon, label, color, onPress }: any) => (
  <TouchableOpacity style={styles.achieveCard} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.achieveIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.achieveLabel}>{label}</Text>
  </TouchableOpacity>
);

const WellnessBtn = ({ icon, label, color, onPress }: any) => (
  <TouchableOpacity style={styles.wellnessBtn} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={styles.wellnessLabel}>{label}</Text>
  </TouchableOpacity>
);

// === STYLES ===

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20 },
  greeting: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  userName: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  profileBtn: { borderRadius: 28 },
  profileGradient: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  profileInitial: { fontSize: 24, fontWeight: '800', color: '#FFF' },

  // Hero - MOBILE OPTIMIZED
  heroSection: { paddingHorizontal: 20, marginBottom: 24 },
  heroCard: { borderRadius: 28, overflow: 'hidden', elevation: 10, shadowColor: '#10B981', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, backgroundColor: '#fff' },
  imageContainer: { width: '100%', height: 220, overflow: 'hidden', position: 'relative' },
  heroImage: { width: '100%', height: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  heroContentSection: { padding: 24, position: 'relative' },
  heroImageContainer: { width: '100%', height: 320, position: 'relative', borderRadius: 28, overflow: 'hidden' },
  heroBackgroundImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 28 },
  heroImage: { width: '100%', height: 320, borderRadius: 28, overflow: 'hidden' },
  heroImageStyle: { borderRadius: 28 },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 24, justifyContent: 'flex-end' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 12 },
  statusBadgeOnline: { backgroundColor: 'rgba(16,185,129,0.95)' },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 8 },
  statusDotOnline: {},
  statusText: { fontSize: 12, fontWeight: '800', color: '#FFF', letterSpacing: 1 },
  statusTextOnline: {},
  heroContent: {},
  heroTagline: { fontSize: 14, fontWeight: '700', color: '#FFF', letterSpacing: 1.5, marginBottom: 8, marginTop: 40 },
  heroTitle: { fontSize: 38, fontWeight: '900', color: '#FFF', lineHeight: 46, marginBottom: 24 },
  goOnlineBtn: { borderRadius: 20, overflow: 'hidden', elevation: 10, shadowColor: '#10B981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 },
  goOnlineGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20, paddingHorizontal: 40, gap: 14 },
  goOnlineText: { fontSize: 22, fontWeight: '900', color: '#FFF', letterSpacing: 1 },

  // Section
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 16 },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { fontSize: 15, fontWeight: '700', color: '#10B981' },
  essentialBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  essentialText: { fontSize: 12, fontWeight: '800', color: '#10B981' },

  // Earnings Card
  earningsCard: { borderRadius: 24, overflow: 'hidden', elevation: 8, shadowColor: '#10B981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
  earningsGradient: { padding: 24 },
  earningsMain: { alignItems: 'center', marginBottom: 24 },
  earningsLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  earningsAmount: { fontSize: 48, fontWeight: '900', color: '#FFF' },
  earningsStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  earningsStat: { alignItems: 'center' },
  earningsStatValue: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  earningsStatLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  earningsDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)' },

  // Quick Grid
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  quickCard: { width: (width - 54) / 2, backgroundColor: '#FFF', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#F1F5F9' },
  quickIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  quickTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  quickSubtitle: { fontSize: 13, color: '#64748B' },

  // Smart Row
  smartRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  smartCard: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  smartGradient: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  smartIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  smartText: { flex: 1 },
  smartTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  smartSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Achieve Row
  achieveRow: { flexDirection: 'row', gap: 12 },
  achieveCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: '#F1F5F9' },
  achieveIcon: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  achieveLabel: { fontSize: 12, fontWeight: '700', color: '#374151' },

  // Wellness Grid
  wellnessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wellnessBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, gap: 10 },
  wellnessLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },

  // Support Card
  supportCard: { borderRadius: 22, overflow: 'hidden' },
  supportGradient: { flexDirection: 'row', alignItems: 'center', padding: 22 },
  supportIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  supportEmoji: { fontSize: 30 },
  supportText: { flex: 1 },
  supportTitle: { fontSize: 19, fontWeight: '900', color: '#FFF' },
  supportSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
});
