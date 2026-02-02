import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Easing,
  Dimensions,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ========== ANIMATED CAR COMPONENT ==========
const AnimatedCar = ({ style, emoji }: { style?: any; emoji: string }) => {
  const bounce = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: -8,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.Text style={[{ fontSize: 50, transform: [{ translateY: bounce }] }, style]}>
      {emoji}
    </Animated.Text>
  );
};

// ========== SPARKLE EFFECT ==========
const Sparkle = ({ delay, x, y }: { delay: number; x: number; y: number }) => {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      scale.setValue(0);
      opacity.setValue(1);
      
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start(() => setTimeout(animate, 2000 + Math.random() * 2000));
    };
    
    setTimeout(animate, delay);
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: x,
        top: y,
        fontSize: 16,
        transform: [{ scale }],
        opacity,
      }}
    >
      ✨
    </Animated.Text>
  );
};

// ========== INTER-CITY ROUTES ==========
const INTER_CITY_ROUTES = [
  { id: 'lagos-ibadan', from: 'Lagos', to: 'Ibadan', distance: '127 km', duration: '2h', price: 15000, emoji: '🚗', color: ['#667eea', '#764ba2'] },
  { id: 'lagos-abuja', from: 'Lagos', to: 'Abuja', distance: '536 km', duration: '7h', price: 45000, emoji: '✈️', color: ['#f093fb', '#f5576c'] },
  { id: 'lagos-benin', from: 'Lagos', to: 'Benin', distance: '305 km', duration: '4h', price: 25000, emoji: '🚙', color: ['#4facfe', '#00f2fe'] },
  { id: 'lagos-ore', from: 'Lagos', to: 'Ore', distance: '192 km', duration: '2.5h', price: 18000, emoji: '🚕', color: ['#43e97b', '#38f9d7'] },
  { id: 'lagos-abeokuta', from: 'Lagos', to: 'Abeokuta', distance: '77 km', duration: '1.5h', price: 10000, emoji: '🛺', color: ['#fa709a', '#fee140'] },
];

// ========== CAR TYPES ==========
const CAR_TYPES = [
  { id: 'economy', name: 'Economy', emoji: '🚗', price: 150, desc: 'Affordable', color: '#4CAF50' },
  { id: 'comfort', name: 'Comfort', emoji: '🚙', price: 200, desc: 'Spacious', color: '#2196F3' },
  { id: 'premium', name: 'Premium', emoji: '🚘', price: 350, desc: 'Luxury', color: '#9C27B0' },
  { id: 'xl', name: 'SUV/XL', emoji: '🚐', price: 250, desc: '6+ Seats', color: '#FF9800' },
];

export default function BookScreen() {
  const router = useRouter();
  const [tripType, setTripType] = useState<'city' | 'intercity'>('city');
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedCar, setSelectedCar] = useState('economy');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  
  // Animations
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Animate on trip type change
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [tripType]);

  const handleBookRide = () => {
    if (tripType === 'city' && (!pickup || !dropoff)) {
      Alert.alert('Missing Location', 'Please enter pickup and dropoff locations');
      return;
    }
    if (tripType === 'intercity' && !selectedRoute) {
      Alert.alert('Select Route', 'Please select an inter-city route');
      return;
    }
    router.push('/rider/tracking');
  };

  return (
    <View style={styles.container}>
      {/* ========== BEAUTIFUL GRADIENT HEADER ========== */}
      <LinearGradient
        colors={tripType === 'city' ? ['#1a1a2e', '#16213e', '#0f3460'] : ['#667eea', '#764ba2', '#f093fb']}
        style={styles.headerGradient}
      >
        {/* Sparkle Effects */}
        {tripType === 'intercity' && (
          <>
            <Sparkle delay={0} x={50} y={80} />
            <Sparkle delay={500} x={150} y={60} />
            <Sparkle delay={1000} x={280} y={90} />
            <Sparkle delay={1500} x={100} y={120} />
            <Sparkle delay={2000} x={320} y={70} />
          </>
        )}

        <SafeAreaView>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {/* Header Content */}
          <View style={styles.headerContent}>
            <AnimatedCar emoji={tripType === 'city' ? '🚖' : '✈️'} />
            <Text style={styles.headerTitle}>
              {tripType === 'city' ? 'City Ride' : 'Inter-City Travel'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {tripType === 'city' 
                ? 'Fast & affordable rides within Lagos' 
                : '🌟 Explore Nigeria in comfort & style'}
            </Text>
          </View>

          {/* ========== BEAUTIFUL TRIP TYPE TOGGLE ========== */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleBtn, tripType === 'city' && styles.toggleBtnActive]}
              onPress={() => setTripType('city')}
            >
              <Text style={styles.toggleEmoji}>🏙️</Text>
              <Text style={[styles.toggleText, tripType === 'city' && styles.toggleTextActive]}>
                City Ride
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, tripType === 'intercity' && styles.toggleBtnActive]}
              onPress={() => setTripType('intercity')}
            >
              <Text style={styles.toggleEmoji}>🛣️</Text>
              <Text style={[styles.toggleText, tripType === 'intercity' && styles.toggleTextActive]}>
                Inter-City
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* ========== MAIN CONTENT ========== */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          
          {/* ========== CITY RIDE INTERFACE ========== */}
          {tripType === 'city' && (
            <>
              {/* Location Inputs */}
              <View style={styles.locationCard}>
                <View style={styles.locationHeader}>
                  <Ionicons name="location" size={20} color={COLORS.accentGreen} />
                  <Text style={styles.locationTitle}>Where to?</Text>
                </View>

                {/* Pickup */}
                <View style={styles.inputRow}>
                  <View style={[styles.dot, { backgroundColor: COLORS.accentGreen }]} />
                  <TextInput
                    style={styles.locationInput}
                    placeholder="Enter pickup location"
                    placeholderTextColor="#999"
                    value={pickup}
                    onChangeText={setPickup}
                  />
                  <TouchableOpacity style={styles.inputIcon}>
                    <Ionicons name="locate" size={20} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputDivider} />

                {/* Dropoff */}
                <View style={styles.inputRow}>
                  <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
                  <TextInput
                    style={styles.locationInput}
                    placeholder="Enter destination"
                    placeholderTextColor="#999"
                    value={dropoff}
                    onChangeText={setDropoff}
                  />
                  <TouchableOpacity style={styles.inputIcon}>
                    <Ionicons name="star" size={20} color="#FFD700" />
                  </TouchableOpacity>
                </View>

                {/* Quick Locations */}
                <View style={styles.quickLocations}>
                  <TouchableOpacity style={styles.quickBtn} onPress={() => setPickup('📍 Current Location')}>
                    <Ionicons name="navigate" size={16} color={COLORS.accentGreen} />
                    <Text style={styles.quickBtnText}>Current</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickBtn} onPress={() => setDropoff('🏠 Home')}>
                    <Ionicons name="home" size={16} color={COLORS.primary} />
                    <Text style={styles.quickBtnText}>Home</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickBtn} onPress={() => setDropoff('💼 Work')}>
                    <Ionicons name="briefcase" size={16} color="#FF9800" />
                    <Text style={styles.quickBtnText}>Work</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ========== CAR TYPE SELECTION ========== */}
              <Text style={styles.sectionTitle}>🚗 Choose Your Ride</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carScroll}>
                {CAR_TYPES.map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    style={[
                      styles.carCard,
                      selectedCar === car.id && { borderColor: car.color, borderWidth: 3 }
                    ]}
                    onPress={() => setSelectedCar(car.id)}
                  >
                    <View style={[styles.carIconWrap, { backgroundColor: car.color + '20' }]}>
                      <Text style={styles.carEmoji}>{car.emoji}</Text>
                    </View>
                    <Text style={styles.carName}>{car.name}</Text>
                    <Text style={styles.carDesc}>{car.desc}</Text>
                    <Text style={[styles.carPrice, { color: car.color }]}>
                      {CURRENCY}{car.price}/km
                    </Text>
                    {selectedCar === car.id && (
                      <View style={[styles.selectedBadge, { backgroundColor: car.color }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Voice Booking Promo */}
              <TouchableOpacity 
                style={styles.voicePromo}
                onPress={() => router.push('/rider/voice-booking')}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.voicePromoGradient}
                >
                  <View style={styles.voiceIcon}>
                    <Text style={{ fontSize: 28 }}>🎤</Text>
                  </View>
                  <View style={styles.voiceContent}>
                    <Text style={styles.voiceTitle}>Voice Booking</Text>
                    <Text style={styles.voiceSubtitle}>
                      "Book me go Lekki" - Speak in Pidgin, Yoruba, Igbo!
                    </Text>
                  </View>
                  <View style={styles.voiceNewBadge}>
                    <Text style={styles.voiceNewText}>NEW</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {/* ========== INTER-CITY INTERFACE ========== */}
          {tripType === 'intercity' && (
            <>
              {/* Beautiful Hero Section */}
              <View style={styles.interCityHero}>
                <Text style={styles.interCityTitle}>🌍 Explore Nigeria</Text>
                <Text style={styles.interCitySubtitle}>
                  Premium inter-city rides • Fixed prices • Verified drivers
                </Text>
                <View style={styles.saveBadge}>
                  <Text style={styles.saveText}>💰 SAVE UP TO 40%</Text>
                </View>
              </View>

              {/* Route Cards */}
              <Text style={styles.sectionTitle}>🛣️ Popular Routes</Text>
              
              {INTER_CITY_ROUTES.map((route) => (
                <TouchableOpacity
                  key={route.id}
                  style={[
                    styles.routeCard,
                    selectedRoute === route.id && styles.routeCardSelected
                  ]}
                  onPress={() => setSelectedRoute(route.id)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={route.color as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.routeGradient}
                  >
                    {/* Decorative Elements */}
                    <View style={styles.routeDecor1} />
                    <View style={styles.routeDecor2} />

                    {/* Route Content */}
                    <View style={styles.routeTop}>
                      <View style={styles.routeCities}>
                        <Text style={styles.routeFrom}>{route.from}</Text>
                        <View style={styles.routeArrow}>
                          <Text style={{ fontSize: 24 }}>{route.emoji}</Text>
                        </View>
                        <Text style={styles.routeTo}>{route.to}</Text>
                      </View>
                      {selectedRoute === route.id && (
                        <View style={styles.routeCheckmark}>
                          <Ionicons name="checkmark-circle" size={28} color="#fff" />
                        </View>
                      )}
                    </View>

                    <View style={styles.routeBottom}>
                      <View style={styles.routeStat}>
                        <Ionicons name="speedometer" size={16} color="rgba(255,255,255,0.9)" />
                        <Text style={styles.routeStatText}>{route.distance}</Text>
                      </View>
                      <View style={styles.routeStat}>
                        <Ionicons name="time" size={16} color="rgba(255,255,255,0.9)" />
                        <Text style={styles.routeStatText}>{route.duration}</Text>
                      </View>
                      <View style={styles.routePriceTag}>
                        <Text style={styles.routePrice}>{CURRENCY}{route.price.toLocaleString()}</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}

              {/* Inter-City Features */}
              <View style={styles.featuresRow}>
                <View style={styles.featureItem}>
                  <Text style={styles.featureEmoji}>🛡️</Text>
                  <Text style={styles.featureText}>Verified Drivers</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureEmoji}>💳</Text>
                  <Text style={styles.featureText}>Fixed Price</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureEmoji}>📍</Text>
                  <Text style={styles.featureText}>Live Tracking</Text>
                </View>
              </View>
            </>
          )}

        </Animated.View>
      </ScrollView>

      {/* ========== BOOK NOW BUTTON ========== */}
      <View style={styles.bottomBar}>
        <View style={styles.pricePreview}>
          <Text style={styles.priceLabel}>Estimated</Text>
          <Text style={styles.priceValue}>
            {tripType === 'city' 
              ? `${CURRENCY}${(CAR_TYPES.find(c => c.id === selectedCar)?.price || 150) * 10}`
              : selectedRoute 
                ? `${CURRENCY}${(INTER_CITY_ROUTES.find(r => r.id === selectedRoute)?.price || 0).toLocaleString()}`
                : '---'
            }
          </Text>
        </View>
        <TouchableOpacity style={styles.bookButton} onPress={handleBookRide}>
          <LinearGradient
            colors={['#00C853', '#00E676']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bookButtonGradient}
          >
            <Text style={styles.bookButtonText}>Book Now</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  headerGradient: {
    paddingBottom: SPACING.lg,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: SPACING.xxl + 20,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginTop: SPACING.md,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.md,
    color: 'rgba(255,255,255,0.9)',
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 6,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: 16,
    gap: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
  },
  toggleEmoji: {
    fontSize: 20,
  },
  toggleText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  toggleTextActive: {
    color: '#1a1a2e',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 120,
  },
  // Location Card
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  locationTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: '#1a1a2e',
    paddingVertical: SPACING.md,
  },
  inputIcon: {
    padding: SPACING.sm,
  },
  inputDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginLeft: 28,
    marginVertical: SPACING.sm,
  },
  quickLocations: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f5f7fa',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  quickBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#666',
  },
  // Section Title
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#1a1a2e',
    marginBottom: SPACING.md,
  },
  // Car Selection
  carScroll: {
    marginBottom: SPACING.lg,
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  carCard: {
    width: 130,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: SPACING.md,
    marginRight: SPACING.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  carIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  carEmoji: {
    fontSize: 32,
  },
  carName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  carDesc: {
    fontSize: FONT_SIZE.xs,
    color: '#999',
    marginTop: 2,
  },
  carPrice: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    marginTop: SPACING.sm,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Voice Promo
  voicePromo: {
    marginBottom: SPACING.lg,
  },
  voicePromoGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 20,
    gap: SPACING.md,
  },
  voiceIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceContent: {
    flex: 1,
  },
  voiceTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#fff',
  },
  voiceSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  voiceNewBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  voiceNewText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
  },
  // Inter-City
  interCityHero: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  interCityTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  interCitySubtitle: {
    fontSize: FONT_SIZE.sm,
    color: '#666',
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  saveBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
  },
  saveText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: '#000',
  },
  // Route Cards
  routeCard: {
    marginBottom: SPACING.md,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  routeCardSelected: {
    transform: [{ scale: 1.02 }],
  },
  routeGradient: {
    padding: SPACING.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  routeDecor1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  routeDecor2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  routeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  routeFrom: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  routeArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeTo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  routeCheckmark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  routeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeStatText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  routePriceTag: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  routePrice: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#fff',
  },
  // Features
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: SPACING.lg,
    marginTop: SPACING.md,
  },
  featureItem: {
    alignItems: 'center',
  },
  featureEmoji: {
    fontSize: 28,
    marginBottom: SPACING.xs,
  },
  featureText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#666',
  },
  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: SPACING.md,
  },
  pricePreview: {
    flex: 1,
  },
  priceLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: '#999',
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  bookButton: {
    flex: 1.5,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
  },
  bookButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#fff',
  },
});
