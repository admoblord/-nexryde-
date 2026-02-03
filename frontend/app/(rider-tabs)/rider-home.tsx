import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Clean Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Good {getTimeOfDay()},</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
              <View style={styles.profileCircle}>
                <Text style={styles.profileInitial}>
                  {(user?.name && user.name.length > 0) ? user.name.charAt(0).toUpperCase() : 'R'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Where To Card - Clean Design */}
          <TouchableOpacity 
            style={styles.whereToCard}
            onPress={() => router.push('/rider/book')}
            activeOpacity={0.9}
          >
            <View style={styles.whereToHeader}>
              <Text style={styles.whereToTitle}>Where to?</Text>
              <Ionicons name="arrow-forward" size={24} color={COLORS.lightTextPrimary} />
            </View>
            
            <View style={styles.whereToInput}>
              <Ionicons name="search" size={20} color={COLORS.lightTextMuted} />
              <Text style={styles.whereToPlaceholder}>Search destination</Text>
            </View>
            
            <View style={styles.quickLocations}>
              <View style={styles.quickLocation}>
                <Ionicons name="home-outline" size={18} color={COLORS.lightTextSecondary} />
                <Text style={styles.quickLocationLabel}>Home</Text>
              </View>
              <View style={styles.quickLocation}>
                <Ionicons name="briefcase-outline" size={18} color={COLORS.lightTextSecondary} />
                <Text style={styles.quickLocationLabel}>Work</Text>
              </View>
              <View style={styles.quickLocation}>
                <Ionicons name="location-outline" size={18} color={COLORS.lightTextSecondary} />
                <Text style={styles.quickLocationLabel}>Saved</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Services Section */}
          <View style={styles.servicesSection}>
            <Text style={styles.sectionTitle}>Services</Text>
            <View style={styles.servicesGrid}>
              <ServiceCard
                icon="car-sport-outline"
                title="Book Ride"
                desc="Standard ride"
                onPress={() => router.push('/rider/book')}
              />
              <ServiceCard
                icon="pricetag-outline"
                title="Bid Ride"
                desc="Your price"
                onPress={() => router.push('/rider/bid')}
              />
              <ServiceCard
                icon="calendar-outline"
                title="Schedule"
                desc="Book ahead"
                onPress={() => router.push('/rider/schedule')}
              />
              <ServiceCard
                icon="cube-outline"
                title="Delivery"
                desc="Send items"
                onPress={() => router.push('/rider/delivery')}
              />
            </View>
          </View>

          {/* More Features */}
          <View style={styles.featuresSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More Features</Text>
              <TouchableOpacity>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon="people-outline"
                label="Family"
                onPress={() => router.push('/rider/family')}
              />
              <FeatureCard
                icon="navigate-outline"
                label="Tracking"
                onPress={() => router.push('/rider/tracking')}
              />
              <FeatureCard
                icon="wallet-outline"
                label="Wallet"
                onPress={() => router.push('/rider/wallet')}
              />
              <FeatureCard
                icon="time-outline"
                label="History"
                onPress={() => router.push('/rider/trips')}
              />
              <FeatureCard
                icon="chatbubble-outline"
                label="Support"
                onPress={() => router.push('/chat')}
              />
              <FeatureCard
                icon="settings-outline"
                label="Settings"
                onPress={() => router.push('/settings')}
              />
            </View>
          </View>

          {/* Why NEXRYDE */}
          <View style={styles.whySection}>
            <Text style={styles.sectionTitle}>Why Choose NEXRYDE</Text>
            <View style={styles.whyGrid}>
              <WhyCard 
                icon="shield-checkmark-outline" 
                title="Verified Drivers"
              />
              <WhyCard 
                icon="cash-outline" 
                title="Fair Pricing"
              />
              <WhyCard 
                icon="location-outline" 
                title="Live Tracking"
              />
              <WhyCard 
                icon="heart-outline" 
                title="24/7 Support"
              />
            </View>
          </View>
          
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const ServiceCard = ({ icon, title, desc, onPress }: { icon: string; title: string; desc: string; onPress?: () => void }) => (
  <TouchableOpacity style={styles.serviceCard} onPress={onPress} activeOpacity={0.7}>
    <Ionicons name={icon as any} size={32} color={COLORS.lightTextPrimary} />
    <Text style={styles.serviceTitle}>{title}</Text>
    <Text style={styles.serviceDesc}>{desc}</Text>
  </TouchableOpacity>
);

const WhyCard = ({ icon, title }: { icon: string; title: string }) => (
  <View style={styles.whyCard}>
    <Ionicons name={icon as any} size={22} color={COLORS.lightTextSecondary} />
    <Text style={styles.whyTitle}>{title}</Text>
  </View>
);

const FeatureCard = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.featureCard} onPress={onPress} activeOpacity={0.7}>
    <Ionicons name={icon as any} size={22} color={COLORS.lightTextSecondary} />
    <Text style={styles.featureLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.5,
  },
  profileButton: {
    borderRadius: 22,
  },
  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  whereToCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  whereToHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  whereToTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
  },
  whereToInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  whereToPlaceholder: {
    fontSize: 15,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  quickLocations: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  quickLocationLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  servicesSection: {
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
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  serviceCard: {
    width: (width - 64) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  serviceDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  featuresSection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    width: (width - 64) / 3,
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  featureLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  whySection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  whyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  whyCard: {
    width: (width - 64) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 1,
  },
  whyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
  bottomSpacer: {
    height: 32,
  },
});
