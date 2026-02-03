import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

// NEXRYDE BRAND COLORS - ASIAN DESIGN
const COLORS = {
  primary: '#22E180', // NEXRYDE Green
  primaryDark: '#1BC770',
  secondary: '#6366F1', // Indigo
  secondaryDark: '#4F46E5',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  warning: '#F59E0B',
  danger: '#EF4444',
  cardShadow: 'rgba(0, 0, 0, 0.04)',
};

// PRIORITY FEATURES - SHOWN UPFRONT
const PRIORITY_FEATURES = [
  { 
    id: 'book', 
    label: 'Book Ride', 
    subtitle: 'Quick booking',
    icon: 'car', 
    route: '/rider/book', 
    gradient: [COLORS.primary, COLORS.primaryDark],
    size: 'large',
  },
  { 
    id: 'schedule', 
    label: 'Schedule', 
    subtitle: 'Plan ahead',
    icon: 'time', 
    route: '/rider/schedule', 
    gradient: [COLORS.secondary, COLORS.secondaryDark],
    size: 'small',
  },
  { 
    id: 'delivery', 
    label: 'Delivery', 
    subtitle: 'Send packages',
    icon: 'cube', 
    route: '/rider/delivery', 
    gradient: [COLORS.warning, '#F97316'],
    size: 'small',
  },
];

// QUICK ACCESS FEATURES
const QUICK_FEATURES = [
  { id: 'wallet', label: 'Wallet', icon: 'wallet-outline', route: '/(rider-tabs)/rider-wallet', color: COLORS.primary },
  { id: 'trips', label: 'My Trips', icon: 'list-outline', route: '/(rider-tabs)/rider-trips', color: COLORS.secondary },
  { id: 'safety', label: 'Safety', icon: 'shield-checkmark-outline', route: '/rider/safety-check', color: COLORS.danger },
  { id: 'favorites', label: 'Favorites', icon: 'star-outline', route: '/rider/favorite-drivers', color: COLORS.warning },
];

// MORE FEATURES - IN NAVIGATION
const MORE_FEATURES = [
  { id: 'bid', label: 'Bid Ride', icon: 'pricetag-outline', route: '/rider/bid' },
  { id: 'split-fare', label: 'Split Fare', icon: 'people-outline', route: '/rider/split-fare' },
  { id: 'family', label: 'Family', icon: 'home-outline', route: '/rider/family' },
  { id: 'tracking', label: 'Live Tracking', icon: 'navigate-outline', route: '/rider/tracking' },
  { id: 'recording', label: 'Ride Recording', icon: 'videocam-outline', route: '/rider/ride-recording' },
];

export default function ModernRiderHome() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello!</Text>
          <Text style={styles.userName}>Where to today?</Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            style={styles.profileGradient}
          >
            <Ionicons name="person" size={24} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* PRIORITY ACTIONS - HERO SECTION */}
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity
            style={styles.heroCard}
            onPress={() => router.push('/rider/book' as any)}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={PRIORITY_FEATURES[0].gradient}
              style={styles.heroGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.heroContent}>
                <View style={styles.heroIcon}>
                  <Ionicons name={PRIORITY_FEATURES[0].icon as any} size={32} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.heroTitle}>{PRIORITY_FEATURES[0].label}</Text>
                  <Text style={styles.heroSubtitle}>{PRIORITY_FEATURES[0].subtitle}</Text>
                </View>
              </View>
              <Ionicons name="arrow-forward-circle" size={40} color="rgba(255,255,255,0.9)" />
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.heroRow}>
            {PRIORITY_FEATURES.slice(1).map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.heroSmallCard}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={feature.gradient}
                  style={styles.heroSmallGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={feature.icon as any} size={28} color="#FFF" />
                  <Text style={styles.heroSmallTitle}>{feature.label}</Text>
                  <Text style={styles.heroSmallSubtitle}>{feature.subtitle}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* QUICK ACCESS - ICON ROW */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
          <View style={styles.quickGrid}>
            {QUICK_FEATURES.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.quickCard}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickIcon, { backgroundColor: feature.color + '15' }]}>
                  <Ionicons name={feature.icon as any} size={28} color={feature.color} />
                </View>
                <Text style={styles.quickLabel}>{feature.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* RECENT TRIPS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Trips</Text>
            <TouchableOpacity onPress={() => router.push('/(rider-tabs)/rider-trips' as any)}>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.tripsCard}>
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: COLORS.primary + '15' }]}>
                <Ionicons name="car-outline" size={48} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>No trips yet</Text>
              <Text style={styles.emptyText}>Book your first ride to get started</Text>
              <TouchableOpacity 
                style={styles.emptyButton}
                onPress={() => router.push('/rider/book' as any)}
              >
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  style={styles.emptyButtonGradient}
                >
                  <Text style={styles.emptyButtonText}>Book Now</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* MORE FEATURES - COMPACT LIST */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>More Features</Text>
          <View style={styles.moreList}>
            {MORE_FEATURES.map((feature, index) => (
              <TouchableOpacity
                key={feature.id}
                style={[styles.moreItem, index === MORE_FEATURES.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.7}
              >
                <View style={styles.moreIcon}>
                  <Ionicons name={feature.icon as any} size={22} color={COLORS.primary} />
                </View>
                <Text style={styles.moreLabel}>{feature.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  userName: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  profileGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heroSection: {
    marginTop: 8,
  },
  heroCard: {
    height: 140,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 5,
  },
  heroGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroSmallCard: {
    width: (width - 52) / 2,
    height: 120,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  heroSmallGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  heroSmallTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 12,
    marginBottom: 2,
  },
  heroSmallSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  section: {
    marginTop: 32,
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
    color: COLORS.text,
    marginBottom: 16,
  },
  seeAll: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickCard: {
    width: (width - 60) / 4,
    alignItems: 'center',
  },
  quickIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  tripsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 32,
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  moreList: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  moreIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  moreLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
});
