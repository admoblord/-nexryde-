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
import { useAppStore } from '@/src/store/appStore';
import { Image } from 'expo-image';

const { width, height } = Dimensions.get('window');

// PREMIUM IMAGES - Nigerian riders (Igbo, Yoruba, Hausa together!)
// These images will display properly on the native mobile app
const RIDER_HERO = 'https://images.pexels.com/photos/6146978/pexels-photo-6146978.jpeg?auto=compress&cs=tinysrgb&w=600&h=300&dpr=1'; // Three African friends smiling!

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 40)).current;
  const scaleAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0.9)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();

    // Continuous bounce for CTA
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 800, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* BRIGHT Gradient Background */}
      <LinearGradient
        colors={['#FFFFFF', '#F0FDF4', '#ECFEFF', '#F0F9FF']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* ✨ PREMIUM HEADER */}
          <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
            <View>
              <Text style={styles.greeting}>Hello there! 👋</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileBtn}
              onPress={() => router.push('/profile')}
            >
              <LinearGradient
                colors={['#10B981', '#06B6D4']}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'R'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* 🌟 HERO SECTION - Nigerian Riders (Igbo, Yoruba, Hausa) */}
          <Animated.View style={[styles.heroSection, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity 
              activeOpacity={0.95}
              onPress={() => router.push('/rider/book')}
              style={styles.heroCard}
            >
              {/* Nigerian People Image - VISIBLE AT TOP */}
              <Image
                source={{ uri: RIDER_HERO }}
                style={{ width: '100%', height: 200, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
                contentFit="cover"
              />
              
              {/* Content Section Below Image */}
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.heroContentSection}
              >
                {/* LIVE Badge */}
                <View style={styles.liveBadge}>
                  <View style={styles.liveIndicator} />
                  <Text style={styles.liveText}>LIVE NOW</Text>
                </View>

                <Text style={styles.heroTagline}>🇳🇬 FOR ALL NIGERIANS</Text>
                <Text style={styles.heroTitle}>Where would you{'\n'}like to go?</Text>
                
                {/* Search Box */}
                <Animated.View style={[styles.searchBox, { transform: [{ translateY: bounceAnim }] }]}>
                  <View style={styles.searchIconWrap}>
                    <Ionicons name="search" size={24} color="#10B981" />
                  </View>
                  <Text style={styles.searchPlaceholder}>Enter your destination</Text>
                  <LinearGradient
                    colors={['#10B981', '#06B6D4']}
                    style={styles.searchArrow}
                  >
                    <Ionicons name="arrow-forward" size={20} color="#FFF" />
                  </LinearGradient>
                </Animated.View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* 📍 QUICK DESTINATIONS */}
          <View style={styles.quickDest}>
            <QuickDestBtn icon="home" label="Home" color="#10B981" />
            <QuickDestBtn icon="briefcase" label="Work" color="#3B82F6" />
            <QuickDestBtn icon="star" label="Saved" color="#F59E0B" />
            <QuickDestBtn icon="time" label="Recent" color="#8B5CF6" />
          </View>

          {/* 🚗 RIDE OPTIONS - BOLD & COLORFUL */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Book Your Ride</Text>
            <View style={styles.rideGrid}>
              <RideCard
                icon="car-sport"
                title="STANDARD"
                subtitle="Everyday comfort"
                price="From ₦800"
                gradient={['#10B981', '#059669']}
                onPress={() => router.push('/rider/book')}
              />
              <RideCard
                icon="flash"
                title="BID RIDE"
                subtitle="Name your price"
                price="You decide!"
                gradient={['#F59E0B', '#D97706']}
                badge="SAVE"
                onPress={() => router.push('/rider/bid')}
              />
            </View>
            <View style={styles.rideGrid}>
              <RideCard
                icon="calendar"
                title="SCHEDULE"
                subtitle="Book ahead"
                price="Plan trips"
                gradient={['#8B5CF6', '#7C3AED']}
                onPress={() => router.push('/rider/schedule')}
              />
              <RideCard
                icon="cube"
                title="DELIVERY"
                subtitle="Send packages"
                price="From ₦500"
                gradient={['#06B6D4', '#0891B2']}
                onPress={() => router.push('/rider/delivery')}
              />
            </View>
          </View>

          {/* 🤖 AI ASSISTANT - PREMIUM CARD */}
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.aiCard}
              onPress={() => router.push('/chat')}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#6366F1', '#8B5CF6', '#A855F7']}
                style={styles.aiGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.aiIconWrap}>
                  <Text style={styles.aiEmoji}>🤖</Text>
                </View>
                <View style={styles.aiText}>
                  <Text style={styles.aiTitle}>AI Trip Assistant</Text>
                  <Text style={styles.aiSubtitle}>Powered by GPT-4o • 24/7 Help</Text>
                </View>
                <View style={styles.aiArrow}>
                  <Ionicons name="chevron-forward" size={24} color="#FFF" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ✨ AI FEATURES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Smart Features</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>✨ NEW</Text>
              </View>
            </View>
            <View style={styles.featuresRow}>
              <FeatureCard
                icon="mic"
                title="Voice Book"
                subtitle="Speak to book"
                color="#667EEA"
                onPress={() => router.push('/rider/voice-booking')}
              />
              <FeatureCard
                icon="happy"
                title="Mood Match"
                subtitle="Driver vibes"
                color="#EC4899"
                onPress={() => router.push('/rider/mood-preferences')}
              />
            </View>
          </View>

          {/* 🛡️ SAFETY FEATURES */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Safety First</Text>
              <View style={[styles.newBadge, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[styles.newBadgeText, { color: '#EF4444' }]}>🛡️ SAFE</Text>
              </View>
            </View>
            <View style={styles.safetyGrid}>
              <SafetyBtn icon="shield-checkmark" label="Security Code" color="#EF4444" onPress={() => router.push('/rider/security-code')} />
              <SafetyBtn icon="videocam" label="Record Ride" color="#9C27B0" onPress={() => router.push('/rider/ride-recording')} />
              <SafetyBtn icon="people" label="Split Fare" color="#00BCD4" onPress={() => router.push('/rider/split-fare')} />
              <SafetyBtn icon="share-social" label="Share Trip" color="#F59E0B" onPress={() => router.push('/rider/share-trip')} />
            </View>
          </View>

          {/* 💎 MORE FEATURES */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>More Features</Text>
            <View style={styles.moreGrid}>
              <MoreBtn icon="heart" label="Favorites" color="#EF4444" onPress={() => router.push('/rider/favorite-drivers')} />
              <MoreBtn icon="people" label="Family" color="#9C27B0" onPress={() => router.push('/rider/family')} />
              <MoreBtn icon="navigate" label="Track" color="#10B981" onPress={() => router.push('/rider/tracking')} />
              <MoreBtn icon="wallet" label="Wallet" color="#3B82F6" onPress={() => router.push('/wallet')} />
              <MoreBtn icon="receipt" label="Receipts" color="#6B7280" onPress={() => router.push('/rider/trip-receipt')} />
              <MoreBtn icon="car" label="Car Pref" color="#F59E0B" onPress={() => router.push('/rider/car-type-preference')} />
              <MoreBtn icon="time" label="History" color="#8B5CF6" onPress={() => router.push('/ride-history')} />
              <MoreBtn icon="settings" label="Settings" color="#374151" onPress={() => router.push('/settings')} />
            </View>
          </View>

          {/* 🌟 TRUST BADGES */}
          <View style={styles.trustSection}>
            <Text style={styles.trustTitle}>Why Riders Love Us</Text>
            <View style={styles.trustGrid}>
              <TrustBadge emoji="✅" text="Verified Drivers" />
              <TrustBadge emoji="⚡" text="Fast Pickups" />
              <TrustBadge emoji="💳" text="Easy Payments" />
              <TrustBadge emoji="⭐" text="5-Star Rated" />
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// === COMPONENTS ===

const QuickDestBtn = ({ icon, label, color }: any) => (
  <TouchableOpacity style={styles.quickDestBtn}>
    <View style={[styles.quickDestIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={styles.quickDestLabel}>{label}</Text>
  </TouchableOpacity>
);

const RideCard = ({ icon, title, subtitle, price, gradient, badge, onPress }: any) => (
  <TouchableOpacity style={styles.rideCard} onPress={onPress} activeOpacity={0.9}>
    <LinearGradient colors={gradient} style={styles.rideGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      {badge && <View style={styles.rideBadge}><Text style={styles.rideBadgeText}>{badge}</Text></View>}
      <View style={styles.rideIconWrap}>
        <Ionicons name={icon} size={28} color="#FFF" />
      </View>
      <Text style={styles.rideTitle}>{title}</Text>
      <Text style={styles.rideSubtitle}>{subtitle}</Text>
      <Text style={styles.ridePrice}>{price}</Text>
    </LinearGradient>
  </TouchableOpacity>
);

const FeatureCard = ({ icon, title, subtitle, color, onPress }: any) => (
  <TouchableOpacity style={styles.featureCard} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.featureIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.featureTitle}>{title}</Text>
    <Text style={styles.featureSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

const SafetyBtn = ({ icon, label, color, onPress }: any) => (
  <TouchableOpacity style={styles.safetyBtn} onPress={onPress} activeOpacity={0.9}>
    <View style={[styles.safetyIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.safetyLabel}>{label}</Text>
  </TouchableOpacity>
);

const MoreBtn = ({ icon, label, color, onPress }: any) => (
  <TouchableOpacity style={styles.moreBtn} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={styles.moreBtnLabel}>{label}</Text>
  </TouchableOpacity>
);

const TrustBadge = ({ emoji, text }: any) => (
  <View style={styles.trustBadge}>
    <Text style={styles.trustEmoji}>{emoji}</Text>
    <Text style={styles.trustText}>{text}</Text>
  </View>
);

// === STYLES ===

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  safeArea: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  greeting: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  userName: { fontSize: 32, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  profileBtn: { borderRadius: 28 },
  profileGradient: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  profileInitial: { fontSize: 24, fontWeight: '800', color: '#FFF' },

  // Hero
  heroSection: { paddingHorizontal: 20, marginBottom: 20 },
  heroCard: { borderRadius: 28, overflow: 'hidden', elevation: 12, shadowColor: '#10B981', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
  heroImageContainer: { width: '100%', height: 340, position: 'relative', borderRadius: 28, overflow: 'hidden' },
  heroBackgroundImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 28 },
  heroImage: { width: '100%', height: 340 },
  heroImageStyle: { borderRadius: 28 },
  heroContentSection: { padding: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 24, justifyContent: 'flex-end' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 12 },
  liveIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 8 },
  liveText: { fontSize: 12, fontWeight: '800', color: '#FFF', letterSpacing: 1 },
  heroContent: {},
  heroTagline: { fontSize: 13, fontWeight: '700', color: '#FFF', letterSpacing: 2, marginBottom: 8 },
  heroTitle: { fontSize: 32, fontWeight: '900', color: '#FFF', lineHeight: 40, marginBottom: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 20, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  searchIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  searchPlaceholder: { flex: 1, fontSize: 17, color: '#64748B', fontWeight: '600' },
  searchArrow: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },

  // Quick Dest
  quickDest: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20, marginBottom: 28 },
  quickDestBtn: { alignItems: 'center' },
  quickDestIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickDestLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },

  // Section
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A', marginBottom: 16 },
  newBadge: { backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  newBadgeText: { fontSize: 12, fontWeight: '800', color: '#10B981' },

  // Ride Grid
  rideGrid: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  rideCard: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  rideGradient: { padding: 20, minHeight: 160 },
  rideBadge: { position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  rideBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  rideIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  rideTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  rideSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 8 },
  ridePrice: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

  // AI Card
  aiCard: { borderRadius: 24, overflow: 'hidden', marginBottom: 8 },
  aiGradient: { flexDirection: 'row', alignItems: 'center', padding: 22 },
  aiIconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  aiEmoji: { fontSize: 32 },
  aiText: { flex: 1 },
  aiTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  aiSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  aiArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

  // Feature Card
  featuresRow: { flexDirection: 'row', gap: 14 },
  featureCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 20, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: '#F1F5F9' },
  featureIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  featureTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  featureSubtitle: { fontSize: 13, color: '#64748B' },

  // Safety Grid
  safetyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  safetyBtn: { width: (width - 56) / 2, backgroundColor: '#FFF', borderRadius: 18, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: '#F1F5F9' },
  safetyIcon: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  safetyLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  // More Grid
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, gap: 10 },
  moreBtnLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },

  // Trust Section
  trustSection: { paddingHorizontal: 20, marginTop: 10 },
  trustTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center', marginBottom: 20 },
  trustGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  trustBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, gap: 8 },
  trustEmoji: { fontSize: 18 },
  trustText: { fontSize: 14, fontWeight: '700', color: '#166534' },
});
