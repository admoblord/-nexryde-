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
  ActivityIndicator,
  Alert,
  Modal,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/src/store/appStore';
import ActiveTripBar from '@/src/components/ActiveTripBar';

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
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  cardShadow: 'rgba(0, 0, 0, 0.04)',
};

// PRIORITY FEATURES - SHOWN UPFRONT
const PRIORITY_FEATURES = [
  { id: 'earnings', label: 'Earnings', icon: 'cash-outline', route: '/driver/earnings-dashboard', color: COLORS.primary },
  { id: 'trips', label: 'My Trips', icon: 'list-outline', route: '/(driver-tabs)/driver-trips', color: COLORS.secondary },
  { id: 'subscription', label: 'Subscription', icon: 'card-outline', route: '/driver/subscription', color: COLORS.warning },
  { id: 'performance', label: 'Performance', icon: 'analytics-outline', route: '/driver/performance', color: COLORS.success },
];

// ALL FEATURES GRID - COMPREHENSIVE ACCESS  
const ALL_FEATURES = [
  // Verification & Setup
  { id: 'verification', label: 'Verification', icon: 'shield-checkmark', route: '/driver/verification', color: COLORS.success },
  { id: 'vehicle', label: 'Vehicle', icon: 'car-sport', route: '/driver/vehicle', color: COLORS.primary },
  { id: 'vehicle-reg', label: 'Register Car', icon: 'create', route: '/driver/vehicle-registration', color: COLORS.secondary },
  { id: 'documents', label: 'Documents', icon: 'document-text', route: '/driver/documents', color: COLORS.warning },
  { id: 'bank', label: 'Bank Details', icon: 'wallet', route: '/driver/bank', color: COLORS.primary },
  
  // Business & Earnings
  { id: 'challenges', label: 'Challenges', icon: 'trophy', route: '/driver/challenges', color: COLORS.warning },
  { id: 'badges', label: 'Badges', icon: 'medal', route: '/driver/badges', color: COLORS.success },
  { id: 'tiers', label: 'Tiers', icon: 'ribbon', route: '/driver/tiers', color: COLORS.primary },
  { id: 'leaderboard', label: 'Leaderboard', icon: 'podium', route: '/driver/leaderboard', color: COLORS.secondary },
  { id: 'data-insights', label: 'Insights', icon: 'bar-chart', route: '/driver/data-insights', color: COLORS.primary },
  
  // AI & Smart Features
  { id: 'smart-mode', label: 'Smart Mode', icon: 'bulb', route: '/driver/smart-mode', color: COLORS.success },
  { id: 'ai-coach', label: 'AI Coach', icon: 'chatbubbles', route: '/driver/ai-suggestions', color: COLORS.primary },
  { id: 'heatmap', label: 'Heatmap', icon: 'map', route: '/driver/heatmap', color: COLORS.warning },
  { id: 'traffic', label: 'Traffic', icon: 'speedometer', route: '/driver/traffic', color: COLORS.danger },
  { id: 'traffic-predict', label: 'Traffic AI', icon: 'analytics', route: '/driver/traffic-prediction', color: COLORS.secondary },
  { id: 'accident-predict', label: 'Accident AI', icon: 'warning', route: '/driver/accident-prediction', color: COLORS.danger },
  
  // Wellness & Lifestyle
  { id: 'wellness', label: 'Wellness', icon: 'fitness', route: '/driver/wellness', color: COLORS.success },
  { id: 'prayer', label: 'Prayer Times', icon: 'moon', route: '/driver/prayer-times', color: COLORS.primary },
  { id: 'story', label: 'Story Mode', icon: 'book', route: '/driver/story-mode', color: COLORS.secondary },
  { id: 'radio', label: 'Radio', icon: 'radio', route: '/driver/radio', color: COLORS.warning },
  
  // Operations & Tools
  { id: 'fuel', label: 'Fuel Tracker', icon: 'water', route: '/driver/fuel-tracker', color: COLORS.primary },
  { id: 'safety-alerts', label: 'Safety Alerts', icon: 'notifications', route: '/driver/safety-alerts', color: COLORS.danger },
  { id: 'community', label: 'Community', icon: 'people', route: '/driver/community', color: '#7C3AED' },
  { id: 'fleet-tracker', label: 'Fleet Tracker', icon: 'locate', route: '/driver/fleet-tracker', color: '#0E7490' },
  { id: 'awareness', label: 'Awareness', icon: 'eye', route: '/driver/driver-awareness', color: '#1E3A5F' },
  { id: 'support', label: 'Support', icon: 'help-circle', route: '/support', color: COLORS.secondary },
  { id: 'settings', label: 'Settings', icon: 'settings', route: '/settings', color: COLORS.primary },
];

export default function ModernDriverHome() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [incomingRide, setIncomingRide] = useState<any>(null);
  const [rideCountdown, setRideCountdown] = useState(20);
  const [acceptingRide, setAcceptingRide] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();
    
    // Check onboarding status first — this is the verification gate
    checkOnboardingStatus();
  }, []);

  // Poll for ride requests when online
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    
    if (isOnline && !incomingRide) {
      pollInterval = setInterval(async () => {
        try {
          // Default Lagos location
          const lat = 6.5244;
          const lng = 3.3792;
          const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/trips/pending?driver_lat=${lat}&driver_lng=${lng}`);
          const trips = await res.json();
          
          if (Array.isArray(trips) && trips.length > 0 && !incomingRide) {
            setIncomingRide(trips[0]);
            setRideCountdown(20);
          }
        } catch (e) {
          console.error('Polling error:', e);
        }
      }, 6000); // Poll every 6 seconds
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isOnline, incomingRide]);

  // Countdown timer for ride request
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    
    if (incomingRide && rideCountdown > 0) {
      timer = setInterval(() => {
        setRideCountdown(prev => {
          if (prev <= 1) {
            // Time's up — auto-decline
            setIncomingRide(null);
            return 20;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [incomingRide, rideCountdown]);

  const handleAcceptRide = async () => {
    if (!incomingRide) return;
    setAcceptingRide(true);
    try {
      const tripId = incomingRide.id;
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/trips/${tripId}/accept`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: user?.id || 'demo-driver' }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Ride Accepted!', `Navigate to pickup: ${incomingRide.pickup_location || 'Pickup location'}`, [{ text: 'Start Navigation' }]);
        setIncomingRide(null);
      } else {
        Alert.alert('Error', data.detail || 'Could not accept ride');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to accept ride');
    } finally {
      setAcceptingRide(false);
    }
  };

  const handleDeclineRide = () => {
    setIncomingRide(null);
    setRideCountdown(20);
  };
  
  const checkOnboardingStatus = async () => {
    try {
      if (!user?.id) {
        setCheckingOnboarding(false);
        return;
      }
      
      // Check if driver has completed onboarding
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/drivers/${user.id}/onboarding-status`);
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
  
  // Filter features based on verification status
  const filteredFeatures = ALL_FEATURES.filter(feature => {
    // Hide "Documents" if driver is already approved
    if (feature.id === 'documents' && verificationStatus === 'approved') {
      return false;
    }
    
    // Hide "Verification" if driver is already approved
    if (feature.id === 'verification' && verificationStatus === 'approved') {
      return false;
    }
    
    // Hide "Vehicle" and "Register Car" if vehicle is already registered
    // We'll check this from backend profile data
    if ((feature.id === 'vehicle' || feature.id === 'vehicle-reg') && verificationStatus === 'approved') {
      // Only hide if vehicle is registered (we'll add vehicle_registered check)
      return false;
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
            <Text style={styles.greeting}>Good Morning</Text>
            <Text style={styles.driverName}>{user?.name || 'Driver'}</Text>
          </View>
          <TouchableOpacity style={styles.profileButton}>
            <Ionicons name="person-circle" size={40} color="#FFF" />
          </TouchableOpacity>
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
              <Text style={styles.statusTitle}>{isOnline ? "You're Online" : "You're Offline"}</Text>
              <Text style={styles.statusSubtitle}>
                {isOnline ? "Ready to accept rides" : "Go online to start earning"}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={[styles.toggleButton, isOnline && styles.toggleButtonActive]}
            onPress={() => setIsOnline(!isOnline)}
            activeOpacity={0.8}
          >
            <View style={[styles.toggleThumb, isOnline && styles.toggleThumbActive]} />
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* EARNINGS CARDS - PRIORITY */}
        <Animated.View style={[styles.section, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.sectionTitle}>Today's Performance</Text>
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
          <Text style={styles.sectionTitle}>Quick Actions</Text>
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
            <Text style={styles.sectionTitle}>All Features</Text>
            <Text style={styles.featureCount}>{filteredFeatures.length} features</Text>
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

      <ActiveTripBar />

      {/* INCOMING RIDE REQUEST POPUP */}
      <Modal visible={!!incomingRide} transparent animationType="slide">
        <View style={styles.rideOverlay}>
          <View style={styles.ridePopup}>
            {/* Countdown Timer */}
            <View style={styles.rideCountdownBar}>
              <View style={[styles.rideCountdownFill, { width: `${(rideCountdown / 20) * 100}%` }]} />
            </View>
            <Text style={styles.rideCountdownText}>{rideCountdown}s to respond</Text>

            {/* New Ride Header */}
            <View style={styles.rideHeader}>
              <Ionicons name="car-sport" size={32} color={COLORS.primary} />
              <Text style={styles.rideHeaderText}>New Ride Request!</Text>
            </View>

            {/* Fare */}
            <View style={styles.rideFareBox}>
              <Text style={styles.rideFareLabel}>Offered Fare</Text>
              <Text style={styles.rideFareAmount}>
                {'\u20A6'}{(incomingRide?.offered_fare || incomingRide?.fare || 0).toLocaleString()}
              </Text>
            </View>

            {/* Route Info */}
            <View style={styles.rideRouteBox}>
              <View style={styles.rideRouteItem}>
                <View style={[styles.rideRouteDot, { backgroundColor: COLORS.accentGreen }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rideRouteLabel}>PICKUP</Text>
                  <Text style={styles.rideRouteText} numberOfLines={2}>
                    {typeof incomingRide?.pickup_location === 'string' 
                      ? incomingRide.pickup_location 
                      : incomingRide?.pickup_location?.address || 'Pickup location'}
                  </Text>
                </View>
              </View>
              <View style={styles.rideRouteLine} />
              <View style={styles.rideRouteItem}>
                <View style={[styles.rideRouteDot, { backgroundColor: '#EF4444' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rideRouteLabel}>DESTINATION</Text>
                  <Text style={styles.rideRouteText} numberOfLines={2}>
                    {typeof incomingRide?.destination === 'string'
                      ? incomingRide.destination
                      : incomingRide?.destination?.address || 'Destination'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Trip Details */}
            <View style={styles.rideDetailsRow}>
              <View style={styles.rideDetail}>
                <Ionicons name="navigate" size={18} color="#64748B" />
                <Text style={styles.rideDetailText}>
                  {incomingRide?.distance_to_pickup ? `${incomingRide.distance_to_pickup}km away` : 'Nearby'}
                </Text>
              </View>
              <View style={styles.rideDetail}>
                <Ionicons name="car" size={18} color="#64748B" />
                <Text style={styles.rideDetailText}>
                  {incomingRide?.vehicle_type || 'Standard'}
                </Text>
              </View>
              <View style={styles.rideDetail}>
                <Ionicons name="swap-horizontal" size={18} color="#64748B" />
                <Text style={styles.rideDetailText}>
                  {incomingRide?.trip_type === 'inter' ? 'Interstate' : 'City'}
                </Text>
              </View>
            </View>

            {/* Accept / Decline Buttons */}
            <View style={styles.rideActions}>
              <TouchableOpacity style={styles.rideDeclineBtn} onPress={handleDeclineRide}>
                <Ionicons name="close" size={28} color="#EF4444" />
                <Text style={styles.rideDeclineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.rideAcceptBtn} 
                onPress={handleAcceptRide}
                disabled={acceptingRide}
              >
                {acceptingRide ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={28} color="#FFF" />
                    <Text style={styles.rideAcceptText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  // Ride Request Popup Styles
  rideOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  ridePopup: {
    backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingBottom: 40,
  },
  rideCountdownBar: {
    height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, marginBottom: 6, overflow: 'hidden',
  },
  rideCountdownFill: {
    height: 4, backgroundColor: COLORS.primary, borderRadius: 2,
  },
  rideCountdownText: {
    fontSize: 12, fontWeight: '700', color: '#94A3B8', textAlign: 'center', marginBottom: 12,
  },
  rideHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16,
  },
  rideHeaderText: {
    fontSize: 22, fontWeight: '900', color: '#0F172A',
  },
  rideFareBox: {
    backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 16,
  },
  rideFareLabel: {
    fontSize: 13, fontWeight: '600', color: '#64748B',
  },
  rideFareAmount: {
    fontSize: 32, fontWeight: '900', color: COLORS.accentGreen, marginTop: 4,
  },
  rideRouteBox: {
    backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 16,
  },
  rideRouteItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  rideRouteDot: {
    width: 12, height: 12, borderRadius: 6, marginTop: 4,
  },
  rideRouteLabel: {
    fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1,
  },
  rideRouteText: {
    fontSize: 15, fontWeight: '700', color: '#0F172A', marginTop: 2,
  },
  rideRouteLine: {
    width: 2, height: 20, backgroundColor: '#CBD5E1', marginLeft: 5, marginVertical: 4,
  },
  rideDetailsRow: {
    flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20,
  },
  rideDetail: {
    alignItems: 'center', gap: 4,
  },
  rideDetailText: {
    fontSize: 12, fontWeight: '700', color: '#64748B',
  },
  rideActions: {
    flexDirection: 'row', gap: 12,
  },
  rideDeclineBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FEF2F2', paddingVertical: 16, borderRadius: 16, borderWidth: 2, borderColor: '#FECACA',
  },
  rideDeclineText: {
    fontSize: 17, fontWeight: '800', color: '#EF4444',
  },
  rideAcceptBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accentGreen, paddingVertical: 16, borderRadius: 16,
  },
  rideAcceptText: {
    fontSize: 17, fontWeight: '900', color: '#FFF',
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
