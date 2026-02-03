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

// ALL OTHER FEATURES - IN NAVIGATION
const MORE_FEATURES = [
  { id: 'vehicle', label: 'Vehicle', icon: 'car-sport-outline', route: '/driver/vehicle' },
  { id: 'documents', label: 'Documents', icon: 'document-text-outline', route: '/driver/documents' },
  { id: 'verification', label: 'Verification', icon: 'shield-checkmark-outline', route: '/driver/verification' },
  { id: 'smart-mode', label: 'Smart Mode', icon: 'bulb-outline', route: '/driver/smart-mode' },
  { id: 'heatmap', label: 'Heatmap', icon: 'map-outline', route: '/driver/heatmap' },
  { id: 'ai-coach', label: 'AI Coach', icon: 'chatbubbles-outline', route: '/driver/ai-suggestions' },
  { id: 'leaderboard', label: 'Leaderboard', icon: 'trophy-outline', route: '/driver/leaderboard' },
  { id: 'wellness', label: 'Wellness', icon: 'fitness-outline', route: '/driver/wellness' },
  { id: 'fuel', label: 'Fuel Tracker', icon: 'water-outline', route: '/driver/fuel-tracker' },
  { id: 'prayer', label: 'Prayer Times', icon: 'moon-outline', route: '/driver/prayer-times' },
];

export default function ModernDriverHome() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [earnings, setEarnings] = useState({ today: 0, week: 0, trips: 0 });
  
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
            <Text style={styles.driverName}>Driver</Text>
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

        {/* MORE FEATURES - COMPACT LIST */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>More Features</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.moreList}>
            {MORE_FEATURES.slice(0, 6).map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={styles.moreItem}
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
