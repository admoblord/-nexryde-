import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

// EXACT COLORS FROM THE DESIGN
const COLORS = {
  background: '#121212',      // Almost black
  cardBg: '#1E1E1E',         // Dark gray cards
  text: '#FFFFFF',           // Pure white
  textSecondary: '#A0A0A0',  // Medium gray
  yellow: '#FFB600',         // Vibrant yellow
  green: '#22E180',          // Bright green
  purple: '#A259FF',         // Vibrant purple
  red: '#F85D50',            // Bright red/orange
};

// ALL RIDER FEATURES - COMPREHENSIVE
const RIDER_FEATURES = [
  // CORE BOOKING
  {
    id: 'book',
    title: 'Book Ride',
    icon: 'car',
    color: COLORS.green,
    route: '/rider/book',
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: 'time',
    color: COLORS.purple,
    route: '/rider/schedule',
  },
  {
    id: 'delivery',
    title: 'Delivery',
    icon: 'cube',
    color: COLORS.yellow,
    route: '/rider/delivery',
  },
  {
    id: 'bid',
    title: 'Bid Ride',
    icon: 'pricetag',
    color: COLORS.red,
    route: '/rider/bid',
  },
  // SOCIAL & SHARING
  {
    id: 'split-fare',
    title: 'Split Fare',
    icon: 'people',
    color: COLORS.green,
    route: '/rider/split-fare',
  },
  {
    id: 'family',
    title: 'Family',
    icon: 'home',
    color: COLORS.purple,
    route: '/rider/family',
  },
  {
    id: 'share-trip',
    title: 'Share Trip',
    icon: 'share-social',
    color: COLORS.blue,
    route: '/rider/share-trip',
  },
  // PREFERENCES
  {
    id: 'favorite-drivers',
    title: 'Favorites',
    icon: 'star',
    color: COLORS.yellow,
    route: '/rider/favorite-drivers',
  },
  {
    id: 'car-type-preference',
    title: 'Car Type',
    icon: 'car-sport',
    color: COLORS.purple,
    route: '/rider/car-type-preference',
  },
  {
    id: 'mood-preferences',
    title: 'Mood',
    icon: 'happy',
    color: COLORS.green,
    route: '/rider/mood-preferences',
  },
  // SAFETY & SECURITY
  {
    id: 'safety-check',
    title: 'Safety',
    icon: 'shield-checkmark',
    color: COLORS.green,
    route: '/rider/safety-check',
  },
  {
    id: 'security-code',
    title: 'Security',
    icon: 'lock-closed',
    color: COLORS.red,
    route: '/rider/security-code',
  },
  {
    id: 'ride-recording',
    title: 'Recording',
    icon: 'videocam',
    color: COLORS.red,
    route: '/rider/ride-recording',
  },
  // TRACKING & INFO
  {
    id: 'tracking',
    title: 'Tracking',
    icon: 'navigate',
    color: COLORS.blue,
    route: '/rider/tracking',
  },
  {
    id: 'traffic-status',
    title: 'Traffic',
    icon: 'car',
    color: COLORS.yellow,
    route: '/rider/traffic-status',
  },
  {
    id: 'driver-details',
    title: 'Driver Info',
    icon: 'person-circle',
    color: COLORS.purple,
    route: '/rider/driver-details',
  },
  // HISTORY & WALLET
  {
    id: 'trips',
    title: 'My Trips',
    icon: 'list',
    color: COLORS.green,
    route: '/(rider-tabs)/rider-trips',
  },
  {
    id: 'trip-receipt',
    title: 'Receipts',
    icon: 'receipt',
    color: COLORS.blue,
    route: '/rider/trip-receipt',
  },
  {
    id: 'wallet',
    title: 'Wallet',
    icon: 'wallet',
    color: COLORS.green,
    route: '/(rider-tabs)/rider-wallet',
  },
];

// MOCK RIDE HISTORY (this will come from API later)
const RIDE_HISTORY = [
  {
    id: '1',
    orderId: 'PO123RT',
    driverName: 'Steve Palmin',
    driverAvatar: 'https://i.pravatar.cc/150?img=12',
    pickup: 'Banasree',
    destination: 'Dhaka',
    carType: 'sedan',
  },
  {
    id: '2',
    orderId: 'RO213KS',
    driverName: 'Tianna Moore',
    driverAvatar: 'https://i.pravatar.cc/150?img=45',
    pickup: 'Kashipur',
    destination: 'Rampura',
    carType: 'suv',
  },
];

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const renderServiceCard = (service: any, index: number) => {
    const isSmall = service.size === 'small';
    const isLarge = service.size === 'large';

    return (
      <Animated.View
        key={service.id}
        style={[
          isSmall && styles.serviceCardSmall,
          isLarge && styles.serviceCardLarge,
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
          style={{ flex: 1 }}
        >
          {service.gradient ? (
            <LinearGradient
              colors={service.gradient}
              style={[styles.serviceCardContent, { flex: 1 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.serviceCardInner}>
                {isSmall && (
                  <View style={styles.serviceIconSmall}>
                    <Ionicons name={service.icon as any} size={32} color="#FFFFFF" />
                  </View>
                )}
                <View>
                  <Text style={[styles.serviceTitle, isLarge && styles.serviceTitleLarge]}>
                    {service.title}
                  </Text>
                  {service.subtitle && (
                    <Text style={styles.serviceSubtitle}>{service.subtitle}</Text>
                  )}
                </View>
                {isLarge && (
                  <View style={styles.serviceLargeIcon}>
                    <Ionicons name="bicycle" size={80} color="rgba(255,255,255,0.9)" />
                  </View>
                )}
              </View>
            </LinearGradient>
          ) : (
            <View style={[styles.serviceCardContent, { backgroundColor: service.bgColor, flex: 1 }]}>
              <View style={styles.serviceCardInner}>
                <View style={styles.serviceIconSmall}>
                  <Ionicons name={service.icon as any} size={32} color={COLORS.red} />
                </View>
                <Text style={styles.serviceTitle}>{service.title}</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* GREETING SECTION */}
          <Animated.View style={[styles.greeting, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <View>
              <Text style={styles.greetingTitle}>Hello, {user?.name || 'Newton'}</Text>
              <Text style={styles.greetingSubtitle}>Where do you want to go?</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(rider-tabs)/rider-profile' as any)}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={24} color={COLORS.text} />
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* 3D MAP PREVIEW */}
          <Animated.View style={[styles.mapPreview, { opacity: fadeAnim }]}>
            <View style={styles.mapContainer}>
              <View style={styles.mapBuildings}>
                <View style={[styles.building, { height: 60, width: 70, backgroundColor: '#2A2A2A', left: 20, top: 30 }]} />
                <View style={[styles.building, { height: 80, width: 60, backgroundColor: '#2F2F2F', left: 100, top: 20 }]} />
                <View style={[styles.building, { height: 50, width: 50, backgroundColor: '#353535', right: 80, top: 40 }]} />
                <View style={[styles.building, { height: 70, width: 65, backgroundColor: '#2D2D2D', right: 20, bottom: 50 }]} />
                {/* Yellow highlighted area */}
                <View style={[styles.building, { height: 40, width: 50, backgroundColor: COLORS.yellow, left: '45%', top: '40%' }]} />
                {/* House icon */}
                <View style={styles.houseMarker}>
                  <Ionicons name="home" size={16} color={COLORS.green} />
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ALL RIDER FEATURES GRID */}
          <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
            <Text style={styles.sectionTitle}>All Features</Text>
            <View style={styles.featuresGrid}>
              {RIDER_FEATURES.map((feature, index) => (
                <TouchableOpacity
                  key={feature.id}
                  style={[styles.featureCard, { backgroundColor: feature.color + '20' }]}
                  onPress={() => router.push(feature.route as any)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.featureIconBg, { backgroundColor: feature.color + '30' }]}>
                    <Ionicons name={feature.icon as any} size={24} color={feature.color} />
                  </View>
                  <Text style={styles.featureTitle} numberOfLines={2}>{feature.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>

          {/* ONBOARD SECTION - RIDE HISTORY */}
          <Animated.View style={[styles.onboardSection, { opacity: fadeAnim }]}>
            <View style={styles.onboardHeader}>
              <Text style={styles.onboardTitle}>Recent Trips</Text>
              <TouchableOpacity onPress={() => router.push('/(rider-tabs)/rider-trips' as any)}>
                <Text style={styles.viewHistory}>View All</Text>
              </TouchableOpacity>
            </View>

            {RIDE_HISTORY.map((ride) => (
              <View key={ride.id} style={styles.rideCard}>
                <View style={styles.rideCardTop}>
                  <View style={styles.rideCardLeft}>
                    <View style={styles.driverAvatar}>
                      <Ionicons name="person" size={20} color={COLORS.text} />
                    </View>
                    <View>
                      <Text style={styles.orderId}>{ride.orderId}</Text>
                      <Text style={styles.driverName}>{ride.driverName}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.orderAgainBtn}>
                    <Text style={styles.orderAgainText}>Order again</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.rideCardBottom}>
                  <View style={styles.rideLocation}>
                    <Text style={styles.rideLabel}>Pick-up</Text>
                    <Text style={styles.rideValue}>{ride.pickup}</Text>
                  </View>
                  <View style={styles.rideLocation}>
                    <Text style={styles.rideLabel}>Destination</Text>
                    <Text style={styles.rideValue}>{ride.destination}</Text>
                  </View>
                  <View style={styles.carIcon}>
                    <Ionicons name="car" size={40} color={COLORS.text} />
                  </View>
                </View>
              </View>
            ))}
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
    marginBottom: 20,
  },
  greetingTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  greetingSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 3D MAP PREVIEW
  mapPreview: {
    marginBottom: 20,
  },
  mapContainer: {
    height: 200,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    overflow: 'hidden',
    position: 'relative',
  },
  mapBuildings: {
    flex: 1,
    position: 'relative',
  },
  building: {
    position: 'absolute',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  houseMarker: {
    position: 'absolute',
    top: '50%',
    left: '48%',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(34, 225, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.green,
  },

  // SERVICE CARDS
  servicesGrid: {
    marginBottom: 30,
  },
  servicesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  serviceCardSmall: {
    flex: 1,
    height: 120,
    borderRadius: 20,
    overflow: 'hidden',
  },
  serviceCardLarge: {
    flex: 1.5,
    height: 120,
    borderRadius: 20,
    overflow: 'hidden',
  },
  serviceCardContent: {
    borderRadius: 20,
    padding: 16,
  },
  serviceCardInner: {
    flex: 1,
    justifyContent: 'space-between',
  },
  serviceIconSmall: {
    marginBottom: 8,
  },
  serviceTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  serviceTitleLarge: {
    fontSize: 24,
  },
  serviceSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '400',
    marginTop: 4,
  },
  serviceLargeIcon: {
    position: 'absolute',
    right: -10,
    bottom: -10,
  },

  // ONBOARD SECTION
  onboardSection: {
    marginBottom: 20,
  },
  onboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  onboardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  viewHistory: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // RIDE CARDS
  rideCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  rideCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rideCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderId: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  driverName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  orderAgainBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  orderAgainText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.green,
  },
  rideCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rideLocation: {
    flex: 1,
  },
  rideLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  rideValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  carIcon: {
    marginLeft: 12,
  },
});
