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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ========== ANIMATED VEHICLE ROW - 3 CARS ==========
const AnimatedVehicleRow = () => {
  const car1Bounce = useRef(new Animated.Value(0)).current;
  const car2Bounce = useRef(new Animated.Value(0)).current;
  const car3Bounce = useRef(new Animated.Value(0)).current;
  const car1Move = useRef(new Animated.Value(-20)).current;
  const car3Move = useRef(new Animated.Value(20)).current;
  
  useEffect(() => {
    // Car 1 animation (left car)
    Animated.loop(
      Animated.sequence([
        Animated.timing(car1Bounce, { toValue: -10, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(car1Bounce, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    
    // Car 2 animation (center car - bigger bounce)
    Animated.loop(
      Animated.sequence([
        Animated.timing(car2Bounce, { toValue: -15, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(car2Bounce, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    
    // Car 3 animation (right car)
    Animated.loop(
      Animated.sequence([
        Animated.timing(car3Bounce, { toValue: -8, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(car3Bounce, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Side cars moving animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(car1Move, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(car1Move, { toValue: -20, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(car3Move, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(car3Move, { toValue: 20, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.vehicleRow}>
      <Animated.Text style={[styles.sideVehicle, { transform: [{ translateY: car1Bounce }, { translateX: car1Move }] }]}>
        🚕
      </Animated.Text>
      <Animated.Text style={[styles.centerVehicle, { transform: [{ translateY: car2Bounce }] }]}>
        🚖
      </Animated.Text>
      <Animated.Text style={[styles.sideVehicle, { transform: [{ translateY: car3Bounce }, { translateX: car3Move }] }]}>
        🚗
      </Animated.Text>
    </View>
  );
};

// ========== INTER-CITY ANIMATED VEHICLES ==========
const InterCityVehicles = () => {
  const plane = useRef(new Animated.Value(0)).current;
  const bus = useRef(new Animated.Value(0)).current;
  const suv = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(plane, { toValue: -12, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(plane, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(bus, { toValue: -8, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bus, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(suv, { toValue: -10, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(suv, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.vehicleRow}>
      <Animated.Text style={[styles.sideVehicle, { transform: [{ translateY: bus }] }]}>
        🚐
      </Animated.Text>
      <Animated.Text style={[styles.centerVehicleLarge, { transform: [{ translateY: plane }] }]}>
        ✈️
      </Animated.Text>
      <Animated.Text style={[styles.sideVehicle, { transform: [{ translateY: suv }] }]}>
        🚙
      </Animated.Text>
    </View>
  );
};

// ========== SPARKLE EFFECTS ==========
const Sparkle = ({ delay, x, y }: { delay: number; x: number; y: number }) => {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      scale.setValue(0);
      opacity.setValue(1);
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.5, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]).start(() => setTimeout(animate, 1500 + Math.random() * 1500));
    };
    setTimeout(animate, delay);
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: y, fontSize: 20, transform: [{ scale }], opacity }}>
      ✨
    </Animated.Text>
  );
};

// ========== INTER-CITY ROUTES ==========
const INTER_CITY_ROUTES = [
  { id: 'lagos-ibadan', from: 'Lagos', to: 'Ibadan', distance: '127 km', duration: '2h', price: 15000, emoji: '🚗', color: ['#667eea', '#764ba2'] },
  { id: 'lagos-abuja', from: 'Lagos', to: 'Abuja', distance: '536 km', duration: '7h', price: 45000, emoji: '✈️', color: ['#f093fb', '#f5576c'] },
  { id: 'lagos-benin', from: 'Lagos', to: 'Benin', distance: '305 km', duration: '4h', price: 25000, emoji: '🚙', color: ['#4facfe', '#00f2fe'] },
  { id: 'lagos-portharcourt', from: 'Lagos', to: 'Port Harcourt', distance: '460 km', duration: '6h', price: 38000, emoji: '🚐', color: ['#43e97b', '#38f9d7'] },
  { id: 'abuja-kano', from: 'Abuja', to: 'Kano', distance: '480 km', duration: '5h', price: 35000, emoji: '🛺', color: ['#fa709a', '#fee140'] },
];

// ========== CAR TYPES ==========
const CAR_TYPES = [
  { id: 'economy', name: 'ECONOMY', emoji: '🚗', price: 150, desc: 'AFFORDABLE', color: '#4CAF50' },
  { id: 'comfort', name: 'COMFORT', emoji: '🚙', price: 200, desc: 'SPACIOUS', color: '#2196F3' },
  { id: 'premium', name: 'PREMIUM', emoji: '🚘', price: 350, desc: 'LUXURY', color: '#9C27B0' },
  { id: 'xl', name: 'SUV/XL', emoji: '🚐', price: 250, desc: '6+ SEATS', color: '#FF9800' },
];

export default function BookScreen() {
  const router = useRouter();
  const [tripType, setTripType] = useState<'city' | 'intercity'>('city');
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedCar, setSelectedCar] = useState('economy');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.5, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [tripType]);

  const handleBookRide = () => {
    if (tripType === 'city' && (!pickup || !dropoff)) {
      Alert.alert('MISSING LOCATION', 'Please enter pickup and dropoff locations');
      return;
    }
    if (tripType === 'intercity' && !selectedRoute) {
      Alert.alert('SELECT ROUTE', 'Please select an inter-city route');
      return;
    }
    router.push('/rider/tracking');
  };

  return (
    <View style={styles.container}>
      {/* ========== STUNNING GRADIENT HEADER ========== */}
      <LinearGradient
        colors={tripType === 'city' 
          ? ['#0f0c29', '#302b63', '#24243e'] 
          : ['#8E2DE2', '#4A00E0', '#7B1FA2']}
        style={styles.headerGradient}
      >
        {/* Sparkle Effects for Inter-City */}
        {tripType === 'intercity' && (
          <>
            <Sparkle delay={0} x={30} y={60} />
            <Sparkle delay={400} x={120} y={40} />
            <Sparkle delay={800} x={200} y={70} />
            <Sparkle delay={1200} x={280} y={50} />
            <Sparkle delay={1600} x={350} y={80} />
            <Sparkle delay={300} x={80} y={100} />
            <Sparkle delay={700} x={320} y={90} />
          </>
        )}

        <SafeAreaView>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>

          {/* 3 ANIMATED VEHICLES */}
          {tripType === 'city' ? <AnimatedVehicleRow /> : <InterCityVehicles />}

          {/* Header Text - BOLD */}
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>
              {tripType === 'city' ? '🚖 CITY RIDE' : '✈️ INTER-CITY TRAVEL'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {tripType === 'city' 
                ? '⚡ FAST & AFFORDABLE RIDES WITHIN NIGERIA' 
                : '🌟 EXPLORE NIGERIA IN COMFORT & STYLE'}
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
                CITY RIDE
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, tripType === 'intercity' && styles.toggleBtnActive]}
              onPress={() => setTripType('intercity')}
            >
              <Text style={styles.toggleEmoji}>🛣️</Text>
              <Text style={[styles.toggleText, tripType === 'intercity' && styles.toggleTextActive]}>
                INTER-CITY
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
              {/* Location Card */}
              <View style={styles.locationCard}>
                <View style={styles.locationHeader}>
                  <Ionicons name="location" size={24} color={COLORS.accentGreen} />
                  <Text style={styles.locationTitle}>WHERE TO?</Text>
                </View>

                {/* Pickup */}
                <View style={styles.inputRow}>
                  <View style={[styles.dot, { backgroundColor: '#00E676' }]} />
                  <TextInput
                    style={styles.locationInput}
                    placeholder="ENTER PICKUP LOCATION"
                    placeholderTextColor="#888"
                    value={pickup}
                    onChangeText={setPickup}
                  />
                  <TouchableOpacity style={styles.inputIcon}>
                    <Ionicons name="locate" size={22} color="#00E676" />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputDivider} />

                {/* Dropoff */}
                <View style={styles.inputRow}>
                  <View style={[styles.dot, { backgroundColor: '#FF5252' }]} />
                  <TextInput
                    style={styles.locationInput}
                    placeholder="ENTER DESTINATION"
                    placeholderTextColor="#888"
                    value={dropoff}
                    onChangeText={setDropoff}
                  />
                  <TouchableOpacity style={styles.inputIcon}>
                    <Ionicons name="star" size={22} color="#FFD700" />
                  </TouchableOpacity>
                </View>

                {/* Quick Locations */}
                <View style={styles.quickLocations}>
                  <TouchableOpacity style={styles.quickBtn} onPress={() => setPickup('📍 CURRENT LOCATION')}>
                    <Ionicons name="navigate" size={18} color="#00E676" />
                    <Text style={styles.quickBtnText}>CURRENT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickBtn} onPress={() => setDropoff('🏠 HOME')}>
                    <Ionicons name="home" size={18} color="#2196F3" />
                    <Text style={styles.quickBtnText}>HOME</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickBtn} onPress={() => setDropoff('💼 WORK')}>
                    <Ionicons name="briefcase" size={18} color="#FF9800" />
                    <Text style={styles.quickBtnText}>WORK</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ========== CAR TYPE SELECTION - LARGER EMOJIS ========== */}
              <Text style={styles.sectionTitle}>🚗 CHOOSE YOUR RIDE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carScroll}>
                {CAR_TYPES.map((car) => (
                  <TouchableOpacity
                    key={car.id}
                    style={[
                      styles.carCard,
                      selectedCar === car.id && { borderColor: car.color, borderWidth: 4 }
                    ]}
                    onPress={() => setSelectedCar(car.id)}
                  >
                    <View style={[styles.carIconWrap, { backgroundColor: car.color + '30' }]}>
                      <Text style={styles.carEmoji}>{car.emoji}</Text>
                    </View>
                    <Text style={styles.carName}>{car.name}</Text>
                    <Text style={styles.carDesc}>{car.desc}</Text>
                    <Text style={[styles.carPrice, { color: car.color }]}>
                      {CURRENCY}{car.price}/KM
                    </Text>
                    {selectedCar === car.id && (
                      <View style={[styles.selectedBadge, { backgroundColor: car.color }]}>
                        <Ionicons name="checkmark" size={16} color="#fff" />
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
                    <Text style={{ fontSize: 36 }}>🎤</Text>
                  </View>
                  <View style={styles.voiceContent}>
                    <Text style={styles.voiceTitle}>VOICE BOOKING</Text>
                    <Text style={styles.voiceSubtitle}>
                      "BOOK ME GO LEKKI" - PIDGIN, YORUBA, IGBO, HAUSA!
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
                <Text style={styles.interCityTitle}>🌍 EXPLORE NIGERIA</Text>
                <Text style={styles.interCitySubtitle}>
                  PREMIUM INTER-CITY RIDES • FIXED PRICES • VERIFIED DRIVERS
                </Text>
                <View style={styles.saveBadge}>
                  <Text style={styles.saveText}>💰 SAVE UP TO 40%</Text>
                </View>
              </View>

              {/* Route Cards */}
              <Text style={styles.sectionTitle}>🛣️ POPULAR ROUTES</Text>
              
              {INTER_CITY_ROUTES.map((route) => (
                <TouchableOpacity
                  key={route.id}
                  style={[
                    styles.routeCard,
                    selectedRoute === route.id && styles.routeCardSelected
                  ]}
                  onPress={() => setSelectedRoute(route.id)}
                  activeOpacity={0.85}
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
                        <Text style={styles.routeFrom}>{route.from.toUpperCase()}</Text>
                        <View style={styles.routeArrow}>
                          <Text style={styles.routeArrowEmoji}>{route.emoji}</Text>
                        </View>
                        <Text style={styles.routeTo}>{route.to.toUpperCase()}</Text>
                      </View>
                      {selectedRoute === route.id && (
                        <View style={styles.routeCheckmark}>
                          <Ionicons name="checkmark-circle" size={32} color="#fff" />
                        </View>
                      )}
                    </View>

                    <View style={styles.routeBottom}>
                      <View style={styles.routeStat}>
                        <Ionicons name="speedometer" size={18} color="rgba(255,255,255,0.95)" />
                        <Text style={styles.routeStatText}>{route.distance}</Text>
                      </View>
                      <View style={styles.routeStat}>
                        <Ionicons name="time" size={18} color="rgba(255,255,255,0.95)" />
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
                  <Text style={styles.featureText}>VERIFIED{"\n"}DRIVERS</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureEmoji}>💳</Text>
                  <Text style={styles.featureText}>FIXED{"\n"}PRICE</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureEmoji}>📍</Text>
                  <Text style={styles.featureText}>LIVE{"\n"}TRACKING</Text>
                </View>
              </View>
            </>
          )}

        </Animated.View>
      </ScrollView>

      {/* ========== BOOK NOW BUTTON ========== */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bookButtonFull} onPress={handleBookRide}>
          <LinearGradient
            colors={['#00C853', '#00E676', '#69F0AE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bookButtonGradient}
          >
            <Text style={styles.bookButtonText}>BOOK NOW</Text>
            <Ionicons name="arrow-forward" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  headerGradient: {
    paddingBottom: SPACING.xl,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    zIndex: 10,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 3 VEHICLES ROW
  vehicleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginTop: SPACING.xxl + 30,
    marginBottom: SPACING.sm,
    gap: SPACING.lg,
  },
  sideVehicle: {
    fontSize: 50,
  },
  centerVehicle: {
    fontSize: 70,
  },
  centerVehicleLarge: {
    fontSize: 80,
  },
  headerContent: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.95)',
    marginTop: SPACING.sm,
    textAlign: 'center',
    letterSpacing: 1,
  },
  // TOGGLE
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 25,
    padding: 6,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md + 2,
    borderRadius: 20,
    gap: 10,
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
  },
  toggleEmoji: {
    fontSize: 24,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 1,
  },
  toggleTextActive: {
    color: '#1a1a2e',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 140,
  },
  // LOCATION CARD
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  locationTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a2e',
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  locationInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    paddingVertical: SPACING.md,
  },
  inputIcon: {
    padding: SPACING.sm,
  },
  inputDivider: {
    height: 2,
    backgroundColor: '#f0f0f0',
    marginLeft: 32,
    marginVertical: SPACING.md,
  },
  quickLocations: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 2,
    borderTopColor: '#f5f5f5',
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f7fa',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.full,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#444',
    letterSpacing: 0.5,
  },
  // SECTION TITLE
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a2e',
    marginBottom: SPACING.md,
    letterSpacing: 1,
  },
  // CAR SELECTION - LARGER
  carScroll: {
    marginBottom: SPACING.lg,
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  carCard: {
    width: 145,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: SPACING.lg,
    marginRight: SPACING.md,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  carIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  carEmoji: {
    fontSize: 50,
  },
  carName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1a1a2e',
    letterSpacing: 1,
  },
  carDesc: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  carPrice: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: SPACING.sm,
    letterSpacing: 0.5,
  },
  selectedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // VOICE PROMO
  voicePromo: {
    marginBottom: SPACING.lg,
  },
  voicePromoGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: 24,
    gap: SPACING.md,
  },
  voiceIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceContent: {
    flex: 1,
  },
  voiceTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  voiceSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  voiceNewBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.md,
  },
  voiceNewText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  // INTER-CITY
  interCityHero: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  interCityTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1a1a2e',
    letterSpacing: 2,
  },
  interCitySubtitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#555',
    marginTop: SPACING.sm,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  saveBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  // ROUTE CARDS
  routeCard: {
    marginBottom: SPACING.md,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  routeCardSelected: {
    transform: [{ scale: 1.02 }],
  },
  routeGradient: {
    padding: SPACING.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  routeDecor1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  routeDecor2: {
    position: 'absolute',
    bottom: -25,
    left: -25,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  routeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
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
    letterSpacing: 1,
  },
  routeArrow: {
    width: 55,
    height: 55,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeArrowEmoji: {
    fontSize: 30,
  },
  routeTo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  routeCheckmark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xl,
  },
  routeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeStatText: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.5,
  },
  routePriceTag: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  routePrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
  },
  // FEATURES
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: SPACING.xl,
    marginTop: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  featureItem: {
    alignItems: 'center',
  },
  featureEmoji: {
    fontSize: 36,
    marginBottom: SPACING.sm,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#444',
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  // BOTTOM BAR
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    paddingBottom: SPACING.xxl,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  pricePreview: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#888',
    letterSpacing: 1,
  },
  priceValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1a1a2e',
    letterSpacing: 0.5,
  },
  bookButton: {
    flex: 1.5,
  },
  bookButtonFull: {
    flex: 1,
    width: '100%',
  },
  bookButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg + 2,
    borderRadius: BORDER_RADIUS.xl,
  },
  bookButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
});
