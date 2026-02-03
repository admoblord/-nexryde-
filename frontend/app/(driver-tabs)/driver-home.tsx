import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// FUTURISTIC ASIAN/EUROPEAN COLOR PALETTE
const COLORS = {
  dark: '#0A0E27',
  darkAlt: '#151B3D',
  cyan: '#00F5FF',
  magenta: '#FF006E',
  purple: '#8338EC',
  gold: '#FFBE0B',
  mint: '#06FFA5',
  blue: '#0084FF',
  text: '#FFFFFF',
  textSecondary: '#A0AEC0',
  cardBg: 'rgba(255, 255, 255, 0.05)',
};

// QUICK ACTIONS FOR DRIVERS
const DRIVER_ACTIONS = [
  {
    id: 'earnings',
    label: 'Earnings',
    icon: 'cash',
    gradient: ['#FFBE0B', '#FB8500'],
    route: '/(driver-tabs)/driver-earnings',
  },
  {
    id: 'trips',
    label: 'My Trips',
    icon: 'list',
    gradient: ['#00F5FF', '#0084FF'],
    route: '/(driver-tabs)/driver-trips',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'person',
    gradient: ['#8338EC', '#A855F7'],
    route: '/(driver-tabs)/driver-profile',
  },
  {
    id: 'safety',
    label: 'Safety',
    icon: 'shield-checkmark',
    gradient: ['#06FFA5', '#00D98C'],
    route: '/(driver-tabs)/driver-safety',
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
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadDriverData();
    
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
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
    // API call to update online status
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

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  return (
    <View style={styles.container}>
      {/* FUTURISTIC DARK GRADIENT */}
      <LinearGradient
        colors={['#0A0E27', '#151B3D', '#1E2749']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ANIMATED GLOW EFFECTS */}
      <Animated.View style={[styles.glowCircle, styles.glow1, { opacity: glowOpacity }]} />
      <Animated.View style={[styles.glowCircle, styles.glow2, { opacity: glowOpacity }]} />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {/* FUTURISTIC HEADER */}
          <Animated.View 
            style={[
              styles.header, 
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Drive Smart</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileBtn}
              onPress={() => router.push('/(driver-tabs)/driver-profile')}
            >
              <LinearGradient
                colors={[COLORS.cyan, COLORS.blue]}
                style={styles.profileGradient}
              >
                <Ionicons name="person" size={22} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ONLINE/OFFLINE TOGGLE - POWERFUL */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <LinearGradient
              colors={isOnline ? [COLORS.mint, '#00D98C'] : [COLORS.cardBg, COLORS.cardBg]}
              style={styles.statusCard}
            >
              <View style={styles.statusContent}>
                <View style={styles.statusLeft}>
                  <View style={[styles.statusIcon, isOnline && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                    <Ionicons 
                      name={isOnline ? "flash" : "flash-off"} 
                      size={28} 
                      color={isOnline ? "#FFFFFF" : COLORS.textSecondary} 
                    />
                  </View>
                  <View>
                    <Text style={[styles.statusLabel, isOnline && { color: '#FFFFFF' }]}>
                      {isOnline ? 'You\'re Online' : 'You\'re Offline'}
                    </Text>
                    <Text style={[styles.statusSubtitle, isOnline && { color: 'rgba(255,255,255,0.9)' }]}>
                      {isOnline ? 'Ready to accept rides' : 'Go online to start earning'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={isOnline}
                  onValueChange={toggleOnlineStatus}
                  trackColor={{ false: '#4A5568', true: 'rgba(255,255,255,0.4)' }}
                  thumbColor={isOnline ? '#FFFFFF' : '#E2E8F0'}
                  ios_backgroundColor="#4A5568"
                />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* EARNINGS STATS - GLASSMORPHISM */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Earnings</Text>
            <View style={styles.earningsRow}>
              <TouchableOpacity 
                style={styles.earningCard}
                onPress={() => router.push('/(driver-tabs)/driver-earnings' as any)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['rgba(255, 190, 11, 0.15)', 'rgba(251, 133, 0, 0.15)']}
                  style={styles.earningGradient}
                >
                  <View style={styles.earningIcon}>
                    <Ionicons name="today" size={24} color={COLORS.gold} />
                  </View>
                  <Text style={styles.earningLabel}>Today</Text>
                  <Text style={styles.earningValue}>₦{earnings.today.toLocaleString()}</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.earningCard}
                onPress={() => router.push('/(driver-tabs)/driver-earnings' as any)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['rgba(0, 245, 255, 0.15)', 'rgba(0, 132, 255, 0.15)']}
                  style={styles.earningGradient}
                >
                  <View style={styles.earningIcon}>
                    <Ionicons name="calendar" size={24} color={COLORS.cyan} />
                  </View>
                  <Text style={styles.earningLabel}>This Week</Text>
                  <Text style={styles.earningValue}>₦{earnings.week.toLocaleString()}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* STATS - COLORFUL */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <LinearGradient
                colors={['rgba(255, 0, 110, 0.15)', 'rgba(255, 69, 137, 0.15)']}
                style={styles.statGradient}
              >
                <Ionicons name="car" size={28} color={COLORS.magenta} />
                <Text style={styles.statValue}>{earnings.trips}</Text>
                <Text style={styles.statLabel}>Total Trips</Text>
              </LinearGradient>
            </View>

            <View style={styles.statCard}>
              <LinearGradient
                colors={['rgba(6, 255, 165, 0.15)', 'rgba(0, 217, 140, 0.15)']}
                style={styles.statGradient}
              >
                <Ionicons name="star" size={28} color={COLORS.mint} />
                <Text style={styles.statValue}>4.8</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </LinearGradient>
            </View>
          </View>

          {/* QUICK ACTIONS - VIBRANT GRID */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              {DRIVER_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={styles.actionCard}
                  onPress={() => router.push(action.route as any)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={action.gradient}
                    style={styles.actionGradient}
                  >
                    <View style={styles.actionIconBg}>
                      <Ionicons name={action.icon as any} size={26} color="#FFFFFF" />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  // GLOW EFFECTS
  glowCircle: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
  },
  glow1: {
    top: -200,
    right: -100,
    backgroundColor: '#00F5FF',
    opacity: 0.1,
  },
  glow2: {
    bottom: -150,
    left: -150,
    backgroundColor: '#FFBE0B',
    opacity: 0.1,
  },

  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  userName: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 4,
    letterSpacing: -0.5,
  },
  profileBtn: {
    shadowColor: '#00F5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  profileGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // STATUS CARD
  statusCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#06FFA5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  statusContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // SECTION
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },

  // EARNINGS
  earningsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  earningCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  earningGradient: {
    padding: 20,
    alignItems: 'center',
  },
  earningIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  earningLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
  },
  earningValue: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
  },

  // STATS
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statGradient: {
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    marginTop: 8,
    marginBottom: 4,
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
    width: (width - 52) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionGradient: {
    padding: 20,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
