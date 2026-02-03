import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

// FUTURISTIC ASIAN/EUROPEAN COLOR PALETTE
const COLORS = {
  dark: '#0A0E27',           // Deep space blue
  darkAlt: '#151B3D',        // Dark navy
  accent1: '#00F5FF',        // Cyan neon
  accent2: '#FF006E',        // Magenta
  accent3: '#8338EC',        // Purple
  accent4: '#FFBE0B',        // Gold
  accent5: '#06FFA5',        // Mint green
  text: '#FFFFFF',
  textSecondary: '#A0AEC0',
  cardBg: 'rgba(255, 255, 255, 0.05)',
};

// SERVICE CARDS WITH VIBRANT COLORS
const SERVICES = [
  {
    id: 'ride',
    title: 'Book Ride',
    subtitle: 'Go anywhere',
    icon: 'car-sport',
    gradient: ['#00F5FF', '#0084FF'],
    route: '/rider/book',
  },
  {
    id: 'schedule',
    title: 'Schedule',
    subtitle: 'Plan ahead',
    icon: 'time',
    gradient: ['#FF006E', '#FF4589'],
    route: '/rider/schedule',
  },
  {
    id: 'delivery',
    title: 'Delivery',
    subtitle: 'Send packages',
    icon: 'cube',
    gradient: ['#8338EC', '#A855F7'],
    route: '/rider/delivery',
  },
  {
    id: 'bid',
    title: 'Bid Ride',
    subtitle: 'Best price',
    icon: 'cash',
    gradient: ['#FFBE0B', '#FB8500'],
    route: '/rider/bid',
  },
];

// QUICK ACTIONS
const QUICK_ACTIONS = [
  {
    id: 'wallet',
    label: 'Wallet',
    icon: 'wallet',
    color: '#00F5FF',
    route: '/rider/wallet',
  },
  {
    id: 'trips',
    label: 'Trips',
    icon: 'list',
    color: '#FF006E',
    route: '/rider/trips',
  },
  {
    id: 'safety',
    label: 'Safety',
    icon: 'shield-checkmark',
    color: '#06FFA5',
    route: '/rider/rider-safety',
  },
  {
    id: 'support',
    label: 'Support',
    icon: 'headset',
    color: '#8338EC',
    route: '/chat',
  },
];

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();

    // Glow pulse effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <View style={styles.container}>
      {/* FUTURISTIC DARK GRADIENT BACKGROUND */}
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
              <Text style={styles.greeting}>Welcome Back</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileBtn}
              onPress={() => router.push('/(rider-tabs)/rider-profile')}
            >
              <LinearGradient
                colors={['#00F5FF', '#0084FF']}
                style={styles.profileGradient}
              >
                <Ionicons name="person" size={22} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* MAIN HERO CARD - BOOK RIDE */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/rider/book')}
              style={styles.heroCard}
            >
              <LinearGradient
                colors={['#00F5FF', '#0084FF', '#0066CC']}
                style={styles.heroGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.heroContent}>
                  <View>
                    <Text style={styles.heroTitle}>Where to?</Text>
                    <Text style={styles.heroSubtitle}>Smart rides at your fingertips</Text>
                  </View>
                  <View style={styles.heroIconContainer}>
                    <Ionicons name="rocket" size={40} color="#FFFFFF" />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* SERVICES GRID - COLORFUL */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Services</Text>
            <View style={styles.servicesGrid}>
              {SERVICES.map((service, index) => (
                <Animated.View
                  key={service.id}
                  style={[
                    styles.serviceCardWrapper,
                    {
                      opacity: fadeAnim,
                      transform: [{
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 50],
                          outputRange: [0, 50 + (index * 10)],
                        })
                      }]
                    }
                  ]}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push(service.route as any)}
                    style={styles.serviceCard}
                  >
                    <LinearGradient
                      colors={service.gradient}
                      style={styles.serviceGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.serviceIconBg}>
                        <Ionicons name={service.icon as any} size={28} color="#FFFFFF" />
                      </View>
                      <Text style={styles.serviceTitle}>{service.title}</Text>
                      <Text style={styles.serviceSubtitle}>{service.subtitle}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>

          {/* QUICK ACTIONS - GLASSMORPHISM */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsRow}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={styles.quickAction}
                  onPress={() => router.push(action.route as any)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: action.color + '20' }]}>
                    <Ionicons name={action.icon as any} size={24} color={action.color} />
                  </View>
                  <Text style={styles.quickActionLabel}>{action.label}</Text>
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
    backgroundColor: '#00F5FF',
  },
  glow1: {
    top: -200,
    right: -100,
    opacity: 0.1,
  },
  glow2: {
    bottom: -150,
    left: -150,
    backgroundColor: '#FF006E',
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

  // HERO CARD
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 28,
    shadowColor: '#00F5FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  heroGradient: {
    padding: 28,
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  heroIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // SERVICES GRID
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
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  serviceCardWrapper: {
    width: (width - 52) / 2,
  },
  serviceCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  serviceGradient: {
    padding: 20,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  serviceIconBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  serviceSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
  },

  // QUICK ACTIONS
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickAction: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'center',
  },

  // STATS
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  statGradient: {
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
