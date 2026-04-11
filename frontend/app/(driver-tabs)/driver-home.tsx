import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Vibration,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SupportedLanguage } from '@/src/i18n/translations';
import { BACKEND_URL, getAuthHeaders, getDriverSubscriptionStatus } from '@/src/services/api';
import DriverRideRequestModal, {
  DRIVER_OFFER_TIMER_SECONDS,
} from '@/src/components/DriverRideRequestModal';

const { width } = Dimensions.get('window');

const COLORS = {
  primary: '#22E180',
  primaryDark: '#1BC770',
  accentGreen: '#22E180',
  secondary: '#6366F1',
  secondaryDark: '#4F46E5',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  cardShadow: 'rgba(0, 0, 0, 0.04)',
};

// Feature arrays built inside component to use translations

export default function ModernDriverHome() {
  const router = useRouter();
  const { user, setCurrentTrip } = useAppStore();
  const { language, setLanguage, availableLanguages, t } = useLanguage();
  const [isOnline, setIsOnline] = useState(false);

  const PRIORITY_FEATURES = [
    { id: 'earnings', label: t.driver.earnings, icon: 'cash-outline', route: '/(driver-tabs)/driver-earnings', color: COLORS.primary },
    { id: 'trips', label: t.home.myTrips, icon: 'list-outline', route: '/(driver-tabs)/driver-trips', color: COLORS.secondary },
    { id: 'subscription', label: t.wallet.payment, icon: 'card-outline', route: '/driver/subscription', color: COLORS.warning },
    { id: 'support', label: t.home.support, icon: 'help-circle-outline', route: '/support', color: COLORS.success },
  ];

  const ALL_FEATURES = [
    { id: 'vehicle', label: t.verification.vehicleVerified.split(' ')[0] || 'Vehicle', icon: 'car-sport', route: '/driver/vehicle', color: COLORS.primary },
    { id: 'documents', label: t.verification.uploadDocuments.split(' ')[0] || 'Documents', icon: 'document-text', route: '/driver/documents', color: COLORS.warning },
    { id: 'bank', label: t.wallet.withdraw.split(' ')[0] || 'Bank', icon: 'wallet', route: '/driver/bank', color: COLORS.primary },
    { id: 'fleet-tracker', label: 'Fleet', icon: 'locate', route: '/driver/fleet-tracker', color: '#0E7490' },
    { id: 'traffic', label: 'Traffic', icon: 'speedometer', route: '/driver/traffic', color: COLORS.danger },
    { id: 'safety-alerts', label: t.safety.safetyTips.split(' ')[0] || 'Alerts', icon: 'notifications', route: '/driver/safety-alerts', color: COLORS.danger },
    { id: 'performance', label: t.driver.rating, icon: 'analytics', route: '/driver/performance', color: COLORS.secondary },
    { id: 'community', label: 'Community', icon: 'people', route: '/driver/community', color: '#7C3AED' },
    { id: 'shield', label: 'NEXRYDE Shield', icon: 'shield-checkmark', route: '/shield-disputes', color: '#0D9488' },
  ];
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });

  // Load real earnings from backend
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const fetchEarnings = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/driver/earnings/${user.id}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (mounted && data) {
          setEarnings({
            today: data.today_earnings || data.projections?.daily || 0,
            week: data.week_earnings || data.projections?.weekly || 0,
            trips: data.today_trips || data.total_trips || 0,
          });
        }
      } catch { /* keep defaults */ }
    };
    fetchEarnings();
    const interval = setInterval(fetchEarnings, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, [user?.id]);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [incomingRide, setIncomingRide] = useState<any>(null);
  const [rideCountdown, setRideCountdown] = useState(DRIVER_OFFER_TIMER_SECONDS);
  const [counterFareInput, setCounterFareInput] = useState('');
  const [acceptingRide, setAcceptingRide] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const hydrateOnlineState = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/profile`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return;
      const profile = await response.json();
      const serverOnline = Boolean(profile?.is_online);
      setIsOnline(serverOnline);
    } catch {}
  };
  const fetchIncomingRide = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/trips/offers/${user.id}`,
        { headers: getAuthHeaders() }
      );
      const trips = await res.json();
      if (Array.isArray(trips) && trips.length > 0) {
        setIncomingRide((prev: any) => prev || trips[0]);
        setRideCountdown(DRIVER_OFFER_TIMER_SECONDS);
      }
    } catch (e) {
      console.error('Offer polling error:', e);
    }
  };
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
    
    // Check onboarding status first — this is the verification gate
    checkOnboardingStatus();
    hydrateOnlineState();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        hydrateOnlineState();
      }
    });
    return () => {
      sub.remove();
    };
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    let locationSub: Location.LocationSubscription | null = null;

    const bootstrapLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (mounted && lastKnown) {
          setDriverCoords({ lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude });
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (mounted) {
          setDriverCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (update) => {
            if (mounted) {
              setDriverCoords({ lat: update.coords.latitude, lng: update.coords.longitude });
            }
          }
        );
      } catch (e) {
        console.log('Driver location bootstrap failed:', e);
      }
    };
    bootstrapLocation();
    return () => {
      mounted = false;
      if (locationSub) locationSub.remove();
    };
  }, []);

  // Push live location to backend for dispatch accuracy and rider tracking
  useEffect(() => {
    if (!isOnline || !user?.id || !driverCoords) return;
    const pushLocation = async () => {
      try {
        await fetch(`${BACKEND_URL}/api/drivers/${user.id}/location`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ latitude: driverCoords.lat, longitude: driverCoords.lng }),
        });
      } catch {}
    };
    pushLocation();
  }, [isOnline, user?.id, driverCoords?.lat, driverCoords?.lng]);

  // Poll for ride requests when online
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    
    if (isOnline && !incomingRide) {
      fetchIncomingRide();
      pollInterval = setInterval(async () => {
        await fetchIncomingRide();
      }, 6000); // Poll every 6 seconds
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOnline, incomingRide, driverCoords?.lat, driverCoords?.lng, user?.id]);

  useEffect(() => {
    if (!incomingRide?.id) return;
    const r = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    setCounterFareInput(r > 0 ? String(r) : '');
  }, [incomingRide?.id]);

  const declineHandlerRef = useRef<() => Promise<void>>(async () => {});
  const offerTimerExpiredRef = useRef(false);

  const handleDeclineRide = useCallback(async () => {
    const ride = incomingRide;
    if (!ride) return;
    try {
      if (ride.offer_id && user?.id) {
        await fetch(`${BACKEND_URL}/api/trips/offers/${ride.offer_id}/decline`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ driver_id: user.id }),
        });
      }
    } catch {}
    setIncomingRide(null);
    setRideCountdown(DRIVER_OFFER_TIMER_SECONDS);
  }, [incomingRide, user?.id]);

  useEffect(() => {
    declineHandlerRef.current = handleDeclineRide;
  }, [handleDeclineRide]);

  useEffect(() => {
    if (!incomingRide?.id) {
      offerTimerExpiredRef.current = false;
      return;
    }
    offerTimerExpiredRef.current = false;
    setRideCountdown(DRIVER_OFFER_TIMER_SECONDS);
    const id = setInterval(() => {
      setRideCountdown((p) => {
        if (p <= 1) {
          if (!offerTimerExpiredRef.current) {
            offerTimerExpiredRef.current = true;
            clearInterval(id);
            void declineHandlerRef.current();
          }
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [incomingRide?.id]);

  const handleAcceptRide = async () => {
    if (!incomingRide) return;
    if (!user?.id) {
      Alert.alert('Profile Required', 'Please login again to accept rides.');
      return;
    }
    setAcceptingRide(true);
    try {
      const tripId = incomingRide.id;
      const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
      const maxP = incomingRide.max_price != null ? Math.round(Number(incomingRide.max_price)) : null;
      const proposed = Math.round(Number(String(counterFareInput).replace(/,/g, '').trim()) || riderOffer);
      if (!Number.isFinite(proposed) || proposed < 1) {
        Alert.alert('Fare', 'Enter a valid fare.');
        setAcceptingRide(false);
        return;
      }
      if (riderOffer > 0 && proposed < riderOffer) {
        Alert.alert('Fare', 'Your counter cannot be below the rider’s offer.');
        setAcceptingRide(false);
        return;
      }
      if (maxP != null && maxP > 0 && proposed > maxP) {
        Alert.alert('Maximum fare', `Maximum allowed price is ₦${maxP.toLocaleString()}`);
        setAcceptingRide(false);
        return;
      }
      const res = await fetch(`${BACKEND_URL}/api/trips/${tripId}/accept`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          driver_id: user.id,
          offer_id: incomingRide?.offer_id,
          proposed_fare: proposed,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentTrip(data);
        const pickup = incomingRide?.pickup_location;
        const pickupAddress =
          typeof pickup === 'string'
            ? pickup
            : pickup?.address || 'Pickup location';
        const pickupLat = typeof pickup === 'object' ? pickup?.lat : null;
        const pickupLng = typeof pickup === 'object' ? pickup?.lng : null;

        const openNavigation = () => {
          if (pickupLat && pickupLng) {
            const url = Platform.select({
              ios: `maps:0,0?q=${pickupLat},${pickupLng}`,
              android: `google.navigation:q=${pickupLat},${pickupLng}`,
            }) || `https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`;
            Linking.openURL(url).catch(() => {
              Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`);
            });
          } else if (pickupAddress && pickupAddress !== 'Pickup location') {
            const encoded = encodeURIComponent(pickupAddress);
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`);
          }
        };

        Alert.alert(
          'Ride Accepted!',
          `Navigate to pickup:\n${pickupAddress}`,
          [
            {
              text: 'Open Trip',
              onPress: () => router.push('/driver/trips'),
              style: 'default',
            },
            { text: 'Navigate', onPress: openNavigation, style: 'default' },
            {
              text: 'Later',
              style: 'cancel',
              onPress: () => router.push('/driver/trips'),
            },
          ]
        );
        setIncomingRide(null);
      } else {
        const msg = typeof data?.detail === 'string' ? data.detail : 'Could not accept ride';
        Alert.alert('Error', msg);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to accept ride');
    } finally {
      setAcceptingRide(false);
    }
  };

  const handleToggleOnline = async () => {
    if (!user?.id) {
      Alert.alert('Profile Required', 'Please login again to continue.');
      return;
    }

    const nextStatus = !isOnline;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/drivers/${user.id}/online?is_online=${nextStatus}`,
        { method: 'PUT', headers: getAuthHeaders() }
      );
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Status Update Failed', data?.detail || 'Unable to update online status.');
        return;
      }
      setIsOnline(nextStatus);
      if (nextStatus) {
        fetchIncomingRide();
      } else {
        setIncomingRide(null);
      }
    } catch {
      Alert.alert('Network Error', 'Could not update online status.');
    }
  };
  
  const checkOnboardingStatus = async () => {
    try {
      if (!user?.id) {
        setCheckingOnboarding(false);
        return;
      }
      
      // Check if driver has completed onboarding
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/onboarding-status`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const status = await response.json();
        
        if (!status.completed) {
          // Redirect driver to the appropriate onboarding step
          if (status.step === 'terms') {
            router.replace({
              pathname: '/(auth)/driver-terms',
              params: { phone: user.phone, name: user.name || '', email: user.email || '' },
            });
            return;
          } else if (status.step === 'documents') {
            router.replace({
              pathname: '/(auth)/driver-documents',
              params: { driver_id: user.id, phone: user.phone, name: user.name || '' },
            });
            return;
          } else if (status.step === 'profile') {
            router.replace({
              pathname: '/(auth)/driver-profile',
              params: { driver_id: user.id, phone: user.phone, name: user.name || '' },
            });
            return;
          }
        }
        
        // Driver is approved — set verification status and show dashboard
        setVerificationStatus(status.verification_status || 'approved');
        try {
          const subRes = await getDriverSubscriptionStatus();
          const sub = subRes.data || {};
          setSubscriptionStatus(sub.status || 'none');
          if (!['trial', 'active', 'grace_period'].includes(sub.status || 'none')) {
            router.replace('/driver/subscription');
            return;
          }
        } catch {
          router.replace('/driver/subscription');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setCheckingOnboarding(false);
    }
  };
  
  // Show loading while checking onboarding
  if (checkingOnboarding) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 16, color: COLORS.textSecondary, fontSize: 16, fontWeight: '600' }}>
            Checking your status...
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  
  // Keep compliance and setup tools visible even after approval so drivers can
  // review/update documents, vehicle info, and bank details like major ride apps.
  const filteredFeatures = ALL_FEATURES.filter(feature => {
    if (feature.id === 'verification') {
      return verificationStatus !== 'approved';
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      
      {/* HEADER WITH GRADIENT */}
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>{(() => { const h = new Date().getHours(); return h < 12 ? t.home.goodMorning : h < 17 ? t.home.goodAfternoon : t.home.goodEvening; })()}</Text>
            <Text style={styles.driverName}>{user?.name || 'Driver'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity 
              onPress={() => setShowLangPicker(true)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18 }}>{availableLanguages.find(l => l.code === language)?.flag || '🌐'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/(driver-tabs)/driver-profile')}>
              <Ionicons name="person-circle" size={40} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ONLINE STATUS TOGGLE - PROMINENT */}
        <Animated.View style={[styles.statusCard, { opacity: fadeAnim }]}>
          <View style={styles.statusLeft}>
            <Ionicons 
              name={isOnline ? "radio-button-on" : "radio-button-off"} 
              size={24} 
              color={isOnline ? COLORS.success : COLORS.danger} 
            />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>{isOnline ? t.driver.goOffline.replace(/Go |Fita |Jáde |Pụọ |Go /i, '') + ' ✓' : t.driver.goOnline}</Text>
              <Text style={styles.statusSubtitle}>
                {isOnline ? t.driver.acceptRide : t.driver.earnings}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={[styles.toggleButton, isOnline && styles.toggleButtonActive]}
            onPress={handleToggleOnline}
            activeOpacity={0.8}
          >
            <View style={[styles.toggleThumb, isOnline && styles.toggleThumbActive]} />
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* EARNINGS CARDS - PRIORITY */}
        <Animated.View style={[styles.section, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.sectionTitle}>{t.driver.todayEarnings}</Text>
          <View style={styles.earningsGrid}>
            <View style={[styles.earningCard, { backgroundColor: '#FEF3C7' }]}>
              <View style={[styles.earningIcon, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="wallet" size={24} color="#FFF" />
              </View>
              <Text style={styles.earningLabel}>Today</Text>
              <Text style={styles.earningValue}>₦{earnings.today.toLocaleString()}</Text>
            </View>

            <View style={[styles.earningCard, { backgroundColor: '#D1FAE5' }]}>
              <View style={[styles.earningIcon, { backgroundColor: COLORS.success }]}>
                <Ionicons name="calendar" size={24} color="#FFF" />
              </View>
              <Text style={styles.earningLabel}>This Week</Text>
              <Text style={styles.earningValue}>₦{earnings.week.toLocaleString()}</Text>
            </View>

            <View style={[styles.earningCard, { backgroundColor: '#E0E7FF' }]}>
              <View style={[styles.earningIcon, { backgroundColor: COLORS.secondary }]}>
                <Ionicons name="car" size={24} color="#FFF" />
              </View>
              <Text style={styles.earningLabel}>Total Trips</Text>
              <Text style={styles.earningValue}>{earnings.trips}</Text>
            </View>
          </View>
        </Animated.View>

        {/* PRIORITY FEATURES - BIG CARDS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Core Actions</Text>
          <View style={styles.priorityGrid}>
            {PRIORITY_FEATURES.map((feature, index) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.priorityCard}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[feature.color, feature.color + 'CC']}
                  style={styles.priorityGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={feature.icon as any} size={28} color="#FFF" />
                  <Text style={styles.priorityLabel}>{feature.label}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ALL FEATURES GRID - COMPLETE ACCESS */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tools</Text>
            <Text style={styles.featureCount}>{filteredFeatures.length} items</Text>
          </View>
          <View style={styles.allFeaturesGrid}>
            {filteredFeatures.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.featureCard}
                onPress={() => router.push(feature.route as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.featureIconBox, { backgroundColor: feature.color + '15' }]}>
                  <Ionicons name={feature.icon as any} size={24} color={feature.color} />
                </View>
                <Text style={styles.featureText} numberOfLines={2}>{feature.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
      <DriverRideRequestModal
        visible={!!incomingRide}
        trip={incomingRide}
        countdownSeconds={rideCountdown}
        countdownTotal={DRIVER_OFFER_TIMER_SECONDS}
        fareInput={counterFareInput}
        onFareInputChange={setCounterFareInput}
        accepting={acceptingRide}
        onAccept={handleAcceptRide}
        onIgnore={handleDeclineRide}
      />

      {/* Language Picker Modal */}
      <Modal visible={showLangPicker} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', paddingTop: 100 }} activeOpacity={1} onPress={() => setShowLangPicker(false)}>
          <View style={{ marginHorizontal: 20, backgroundColor: '#1E293B', borderRadius: 16, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#94A3B8', paddingHorizontal: 12, paddingVertical: 8 }}>SELECT LANGUAGE</Text>
            {availableLanguages.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => { setLanguage(lang.code as SupportedLanguage); setShowLangPicker(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: language === lang.code ? 'rgba(34,225,128,0.15)' : 'transparent', gap: 12 }}
              >
                <Text style={{ fontSize: 22 }}>{lang.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{lang.nativeName}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>{lang.name}</Text>
                </View>
                {language === lang.code && <Ionicons name="checkmark-circle" size={22} color="#22E180" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  driverName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  profileButton: {
    width: 48,
    height: 48,
  },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    marginLeft: 14,
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  statusSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  toggleButton: {
    width: 60,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
    padding: 3,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  toggleButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 24,
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
  earningsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  earningCard: {
    width: (width - 56) / 3,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  earningIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  earningLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  earningValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 1,
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  priorityCard: {
    width: (width - 52) / 2,
    height: 100,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  priorityGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  priorityLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  featureCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
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
  featureIconBox: {
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
  featureText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 14,
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
