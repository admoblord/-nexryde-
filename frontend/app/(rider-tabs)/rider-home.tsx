import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ImageBackground,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');

// Premium Images
const HERO_IMAGE = 'https://images.unsplash.com/photo-1449965408869-ebd3fee6a4ce?w=800&q=80';
const CAR_IMAGE = 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400&q=80';

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 30)).current;
  const scaleAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0.95)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entry animations
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();

    // Pulse animation for CTA
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#0A0F1C', '#0F172A', '#1E293B']}
        style={StyleSheet.absoluteFillObject}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {/* Premium Header with User Greeting */}
          <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.headerLeft}>
              <Text style={styles.welcomeText}>Welcome back,</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'} 👋</Text>
              <View style={styles.riderBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.riderBadgeText}>RIDER MODE</Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
              <LinearGradient
                colors={['#22C55E', '#10B981', '#06B6D4']}
                style={styles.profileGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.profileInitial}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'R'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* ✨ HERO BOOKING CARD - Premium Design with Image */}
          <Animated.View style={[styles.heroCard, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity 
              activeOpacity={0.95}
              onPress={() => router.push('/rider/book')}
            >
              <ImageBackground
                source={{ uri: HERO_IMAGE }}
                style={styles.heroImage}
                imageStyle={styles.heroImageStyle}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
                  style={styles.heroOverlay}
                >
                  {/* Decorative Elements */}
                  <View style={styles.heroDecor1} />
                  <View style={styles.heroDecor2} />
                  
                  <View style={styles.heroContent}>
                    <View style={styles.heroTop}>
                      <Text style={styles.heroSmall}>🚗 YOUR RIDE AWAITS</Text>
                      <View style={styles.liveBadge}>
                        <View style={styles.liveIndicator} />
                        <Text style={styles.liveText}>LIVE</Text>
                      </View>
                    </View>
                    
                    <Text style={styles.heroTitle}>Where are you{'\n'}going today?</Text>
                    
                    <Animated.View style={[styles.searchBox, { transform: [{ scale: pulseAnim }] }]}>
                      <View style={styles.searchIcon}>
                        <Ionicons name="search" size={22} color="#22C55E" />
                      </View>
                      <Text style={styles.searchPlaceholder}>Enter destination...</Text>
                      <View style={styles.searchArrow}>
                        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                      </View>
                    </Animated.View>

                    {/* Quick Saved Places */}
                    <View style={styles.quickPlaces}>
                      <TouchableOpacity style={styles.quickPlace}>
                        <Ionicons name="home" size={16} color="#22C55E" />
                        <Text style={styles.quickPlaceText}>Home</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.quickPlace}>
                        <Ionicons name="briefcase" size={16} color="#3B82F6" />
                        <Text style={styles.quickPlaceText}>Work</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.quickPlace}>
                        <Ionicons name="star" size={16} color="#F59E0B" />
                        <Text style={styles.quickPlaceText}>Saved</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </LinearGradient>
              </ImageBackground>
            </TouchableOpacity>
          </Animated.View>

          {/* 🚖 RIDE OPTIONS - Premium Cards */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Book a Ride</Text>
              <View style={styles.tagPill}>
                <Text style={styles.tagPillText}>QUICK</Text>
              </View>
            </View>
            
            <View style={styles.rideOptionsRow}>
              <RideOption
                icon="car-sport"
                title="Standard"
                subtitle="Everyday rides"
                price="From ₦800"
                gradient={['#22C55E', '#16A34A']}
                onPress={() => router.push('/rider/book')}
              />
              <RideOption
                icon="flash"
                title="Bid Ride"
                subtitle="Name your price"
                price="You decide"
                gradient={['#F59E0B', '#D97706']}
                badge="SAVE 💰"
                onPress={() => router.push('/rider/bid')}
              />
            </View>
            
            <View style={styles.rideOptionsRow}>
              <RideOption
                icon="calendar"
                title="Schedule"
                subtitle="Book ahead"
                price="Plan trips"
                gradient={['#8B5CF6', '#7C3AED']}
                onPress={() => router.push('/rider/schedule')}
              />
              <RideOption
                icon="cube"
                title="Delivery"
                subtitle="Send packages"
                price="From ₦500"
                gradient={['#06B6D4', '#0891B2']}
                onPress={() => router.push('/rider/delivery')}
              />
            </View>
          </View>

          {/* 🤖 AI FEATURES - Premium Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>AI Features</Text>
              <View style={[styles.tagPill, { backgroundColor: 'rgba(139,92,246,0.2)' }]}>
                <Text style={[styles.tagPillText, { color: '#A78BFA' }]}>✨ AI</Text>
              </View>
            </View>

            {/* AI Assistant Card */}
            <TouchableOpacity 
              style={styles.aiCard}
              onPress={() => router.push('/chat')}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#8B5CF6', '#6366F1', '#4F46E5']}
                style={styles.aiGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.aiDecor} />
                <View style={styles.aiContent}>
                  <View style={styles.aiIconBox}>
                    <Ionicons name="sparkles" size={28} color="#FFFFFF" />
                  </View>
                  <View style={styles.aiText}>
                    <Text style={styles.aiTitle}>AI Trip Assistant</Text>
                    <Text style={styles.aiSubtitle}>Powered by GPT-4o • Ask anything</Text>
                  </View>
                  <View style={styles.aiArrow}>
                    <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.rideOptionsRow}>
              <MiniFeatureCard
                icon="mic"
                title="Voice Book"
                subtitle="Speak to book"
                color="#667EEA"
                badge="NEW"
                onPress={() => router.push('/rider/voice-booking')}
              />
              <MiniFeatureCard
                icon="happy"
                title="Mood Match"
                subtitle="Driver vibes"
                color="#EC4899"
                onPress={() => router.push('/rider/mood-preferences')}
              />
            </View>
          </View>

          {/* 🛡️ SAFETY SECTION */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Safety & Security</Text>
              <View style={[styles.tagPill, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
                <Text style={[styles.tagPillText, { color: '#F87171' }]}>🛡️ SAFE</Text>
              </View>
            </View>

            <View style={styles.safetyGrid}>
              <SafetyCard
                icon="shield-checkmark"
                title="Security Code"
                color="#EF4444"
                onPress={() => router.push('/rider/security-code')}
              />
              <SafetyCard
                icon="videocam"
                title="Record Ride"
                color="#9C27B0"
                onPress={() => router.push('/rider/ride-recording')}
              />
              <SafetyCard
                icon="people"
                title="Split Fare"
                color="#00BCD4"
                onPress={() => router.push('/rider/split-fare')}
              />
              <SafetyCard
                icon="share-social"
                title="Share Trip"
                color="#F59E0B"
                onPress={() => router.push('/rider/share-trip')}
              />
            </View>
          </View>

          {/* 💎 MORE FEATURES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More Features</Text>
            </View>

            <View style={styles.featuresGrid}>
              <FeatureChip icon="heart" label="Favorites" color="#EF4444" onPress={() => router.push('/rider/favorite-drivers')} />
              <FeatureChip icon="people" label="Family" color="#9C27B0" onPress={() => router.push('/rider/family')} />
              <FeatureChip icon="navigate" label="Track" color="#22C55E" onPress={() => router.push('/rider/tracking')} />
              <FeatureChip icon="wallet" label="Wallet" color="#3B82F6" onPress={() => router.push('/wallet')} />
              <FeatureChip icon="receipt" label="Receipts" color="#6B7280" onPress={() => router.push('/rider/trip-receipt')} />
              <FeatureChip icon="car-sport" label="Car Pref" color="#F59E0B" onPress={() => router.push('/rider/car-type-preference')} />
              <FeatureChip icon="time" label="History" color="#8B5CF6" onPress={() => router.push('/ride-history')} />
              <FeatureChip icon="settings" label="Settings" color="#374151" onPress={() => router.push('/settings')} />
            </View>
          </View>

          {/* 🌟 WHY NEXRYDE */}
          <View style={styles.whySection}>
            <Text style={styles.whyTitle}>Why riders love NEXRYDE</Text>
            <View style={styles.whyCards}>
              <WhyCard icon="shield-checkmark" text="Verified Drivers" color="#22C55E" />
              <WhyCard icon="time" text="24/7 Support" color="#3B82F6" />
              <WhyCard icon="card" text="Easy Payment" color="#8B5CF6" />
              <WhyCard icon="star" text="Top Rated" color="#F59E0B" />
            </View>
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// === COMPONENTS ===

const RideOption = ({ icon, title, subtitle, price, gradient, badge, onPress }: any) => (
  <TouchableOpacity style={styles.rideOption} onPress={onPress} activeOpacity={0.9}>
    <LinearGradient colors={gradient} style={styles.rideOptionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      {badge && (
        <View style={styles.rideOptionBadge}>
          <Text style={styles.rideOptionBadgeText}>{badge}</Text>
        </View>
      )}
      <View style={styles.rideOptionIcon}>
        <Ionicons name={icon} size={26} color="#FFFFFF" />
      </View>
      <Text style={styles.rideOptionTitle}>{title}</Text>
      <Text style={styles.rideOptionSubtitle}>{subtitle}</Text>
      <Text style={styles.rideOptionPrice}>{price}</Text>
    </LinearGradient>
  </TouchableOpacity>
);

const MiniFeatureCard = ({ icon, title, subtitle, color, badge, onPress }: any) => (
  <TouchableOpacity style={styles.miniFeature} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.miniFeatureIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <View style={styles.miniFeatureText}>
      <View style={styles.miniFeatureTitleRow}>
        <Text style={styles.miniFeatureTitle}>{title}</Text>
        {badge && <View style={styles.newBadge}><Text style={styles.newBadgeText}>{badge}</Text></View>}
      </View>
      <Text style={styles.miniFeatureSubtitle}>{subtitle}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color="#64748B" />
  </TouchableOpacity>
);

const SafetyCard = ({ icon, title, color, onPress }: any) => (
  <TouchableOpacity style={styles.safetyCard} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.safetyCardIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.safetyCardTitle}>{title}</Text>
  </TouchableOpacity>
);

const FeatureChip = ({ icon, label, color, onPress }: any) => (
  <TouchableOpacity style={styles.featureChip} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name={icon} size={18} color={color} />
    <Text style={styles.featureChipText}>{label}</Text>
  </TouchableOpacity>
);

const WhyCard = ({ icon, text, color }: any) => (
  <View style={styles.whyCard}>
    <View style={[styles.whyCardIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={styles.whyCardText}>{text}</Text>
  </View>
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
  riderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  riderBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 1,
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
    height: 320,
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
  heroDecor2: {
    position: 'absolute',
    top: 60,
    right: 60,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59,130,246,0.2)',
  },
  heroContent: {},
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22C55E',
    letterSpacing: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 40,
    marginBottom: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  searchIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(34,197,94,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  searchArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickPlaces: {
    flexDirection: 'row',
    gap: 10,
  },
  quickPlace: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  quickPlaceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
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

  // Ride Options
  rideOptionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  rideOption: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  rideOptionGradient: {
    padding: 18,
    minHeight: 140,
  },
  rideOptionBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rideOptionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rideOptionIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  rideOptionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  rideOptionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  rideOptionPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },

  // AI Card
  aiCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
  },
  aiGradient: {
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  aiDecor: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  aiContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  aiText: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  aiSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  aiArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Mini Feature Card
  miniFeature: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
  },
  miniFeatureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  miniFeatureText: {
    flex: 1,
  },
  miniFeatureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniFeatureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  newBadge: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  miniFeatureSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  // Safety Grid
  safetyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  safetyCard: {
    width: (width - 52) / 2,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  safetyCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  safetyCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Features Grid
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  featureChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
  },

  // Why Section
  whySection: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  whyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  whyCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  whyCard: {
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: (width - 60) / 2,
  },
  whyCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  whyCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
  },
});
