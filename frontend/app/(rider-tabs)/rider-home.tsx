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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SupportedLanguage } from '@/src/i18n/translations';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';

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

export default function ModernRiderHome() {
  const router = useRouter();
  const { user, currentTrip } = useAppStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const [showLangPicker, setShowLangPicker] = useState(false);
  const { language, setLanguage, availableLanguages, t } = useLanguage();

  const PRIORITY_FEATURES = [
    { id: 'book', label: t.home.bookRide, subtitle: t.home.whereTo, icon: 'car', route: '/rider/book', gradient: [COLORS.primary, COLORS.primaryDark], size: 'large' },
    { id: 'trips', label: t.home.myTrips, subtitle: t.ride.distance, icon: 'time', route: '/(rider-tabs)/rider-trips', gradient: [COLORS.secondary, COLORS.secondaryDark], size: 'small' },
    { id: 'wallet', label: t.home.wallet, subtitle: t.wallet.payment, icon: 'wallet', route: '/(rider-tabs)/rider-wallet', gradient: [COLORS.warning, '#F97316'], size: 'small' },
  ];

  const QUICK_FEATURES = [
    { id: 'safety', label: t.safety.emergencySOS.split(' ')[0] || 'Safety', icon: 'shield-checkmark-outline', route: '/(rider-tabs)/rider-safety', color: COLORS.danger },
    { id: 'support', label: t.home.support, icon: 'help-circle-outline', route: '/support', color: COLORS.warning },
    { id: 'trips-quick', label: t.tabs.trips.split(' ')[0] || 'Trips', icon: 'time-outline', route: '/(rider-tabs)/rider-trips', color: COLORS.secondary },
    { id: 'receipts', label: t.home.receipts, icon: 'receipt-outline', route: '/(rider-tabs)/rider-trips', color: COLORS.primary },
  ];

  const ALL_FEATURES = [
    { id: 'favorites', label: 'My Drivers', icon: 'heart', route: '/rider/favorite-drivers', color: COLORS.danger },
    { id: 'tracking', label: t.home.liveTrack, icon: 'navigate', route: '/rider/tracking', color: COLORS.secondary },
    { id: 'share-trip', label: t.home.shareTrip, icon: 'share-social', route: '/rider/share-trip', color: COLORS.primary },
    { id: 'security-code', label: t.home.security, icon: 'lock-closed', route: '/rider/security-code', color: COLORS.warning },
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    const enforceRiderVerification = async () => {
      if (!user?.id || user?.role !== 'rider') return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/${user.id}/rider-verification-status`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (!res.ok || !data?.completed) {
          router.replace('/(auth)/rider-verification');
        }
      } catch {
        router.replace('/(auth)/rider-verification');
      }
    };
    enforceRiderVerification();
  }, [router, user?.id, user?.role]);

  const normalizedCurrentTripStatus = normalizeTripStatus(currentTrip?.status, (currentTrip as any)?.payment_status);
  const showResumeChip = Boolean(currentTrip?.id && isActiveTripStatus(normalizedCurrentTripStatus));
  const resumeStatusLabel =
    normalizedCurrentTripStatus === 'pending' || normalizedCurrentTripStatus === 'pending_driver_offers'
      ? 'Finding drivers'
      : normalizedCurrentTripStatus === 'accepted'
        ? 'Driver on the way'
        : normalizedCurrentTripStatus === 'arrived'
          ? 'Driver arrived'
          : normalizedCurrentTripStatus === 'ongoing'
            ? 'Trip in progress'
            : normalizedCurrentTripStatus === 'pending_payment'
              ? 'Payment pending'
              : 'Active trip';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t.common.hello}!</Text>
          <Text style={styles.userName}>{t.home.whereTo}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity 
            onPress={() => setShowLangPicker(true)}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 18 }}>{availableLanguages.find(l => l.code === language)?.flag || '🌐'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/(rider-tabs)/rider-profile' as any)} accessibilityLabel="Open profile" accessibilityRole="button">
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              style={styles.profileGradient}
            >
              <Ionicons name="person" size={24} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {showResumeChip ? (
        <TouchableOpacity
          style={styles.resumeTripChip}
          onPress={() => router.push({ pathname: '/rider/tracking', params: { tripId: currentTrip?.id } } as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="navigate-circle" size={16} color="#065F46" />
          <Text style={styles.resumeTripChipText}>
            Resume Trip #{String(currentTrip?.id || '').slice(-6).toUpperCase()} - {resumeStatusLabel}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#065F46" />
        </TouchableOpacity>
      ) : null}

      {/* Language Picker Modal */}
      <Modal visible={showLangPicker} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', paddingTop: 100 }} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={{ marginHorizontal: 20, backgroundColor: '#FFF', borderRadius: 16, padding: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#6B7280', paddingHorizontal: 12, paddingVertical: 8 }}>SELECT LANGUAGE</Text>
            {availableLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => { setLanguage(lang.code as SupportedLanguage); setShowLangPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: language === lang.code ? '#ECFDF5' : 'transparent', gap: 12 }}
              >
                <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{lang.nativeName}</Text>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{lang.name}</Text>
                </View>
                {language === lang.code && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* PRIORITY ACTIONS - HERO SECTION */}
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity
            style={styles.heroCard}
            onPress={() => router.push('/rider/book' as any)}
            activeOpacity={0.9}
            accessibilityLabel="Book a ride"
            accessibilityRole="button"
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
                accessibilityLabel={feature.label}
                accessibilityRole="button"
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
                accessibilityLabel={feature.label}
                accessibilityRole="button"
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
                accessibilityLabel="Book your first ride"
                accessibilityRole="button"
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

        {/* ALL FEATURES GRID - COMPLETE ACCESS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>All Features</Text>
          <View style={styles.allFeaturesGrid}>
            {ALL_FEATURES.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.featureCard}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.7}
                accessibilityLabel={feature.label}
                accessibilityRole="button"
              >
                <View style={[styles.featureIcon, { backgroundColor: feature.color + '15' }]}>
                  <Ionicons name={feature.icon as any} size={24} color={feature.color} />
                </View>
                <Text style={styles.featureLabel} numberOfLines={2}>{feature.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
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
  resumeTripChip: {
    marginHorizontal: 20,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resumeTripChipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    textTransform: 'capitalize',
  },
  heroSection: {
    marginTop: 8,
  },
  heroCard: {
    height: 150,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  heroGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
    paddingVertical: 24,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 4,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.3,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroSmallCard: {
    width: (width - 52) / 2,
    height: 130,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroSmallGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  heroSmallTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    marginTop: 12,
    marginBottom: 3,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroSmallSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.3,
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
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  seeAll: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.2,
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
  // ALL FEATURES GRID
  allFeaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  featureCard: {
    width: (width - 60) / 4,
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  featureIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  featureLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
});
