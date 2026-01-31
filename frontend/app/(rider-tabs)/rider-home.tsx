import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
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

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'} 👋</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>{user?.name?.charAt(0) || 'R'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Rider Mode Badge */}
          <View style={styles.modeBadge}>
            <View style={styles.modeDotOuter}>
              <View style={styles.modeDot} />
            </View>
            <Text style={styles.modeText}>RIDER MODE</Text>
          </View>

          {/* Where To Card - PREMIUM DESIGN */}
          <TouchableOpacity 
            style={styles.whereToCard}
            onPress={() => router.push('/rider/book')}
            activeOpacity={0.95}
          >
            <LinearGradient
              colors={['#22C55E', '#16A34A', '#3B82F6']}
              style={styles.whereToGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Decorative circles */}
              <View style={styles.decorCircle1} />
              <View style={styles.decorCircle2} />
              
              <View style={styles.whereToHeader}>
                <Text style={styles.whereToTitle}>Where to?</Text>
                <View style={styles.whereToArrow}>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </View>
              </View>
              
              <View style={styles.whereToInput}>
                <View style={styles.searchIconContainer}>
                  <Ionicons name="search" size={20} color={COLORS.accentGreen} />
                </View>
                <Text style={styles.whereToPlaceholder}>Enter your destination</Text>
              </View>
              
              <View style={styles.quickLocations}>
                <QuickLocation icon="home" label="Home" />
                <QuickLocation icon="briefcase" label="Work" />
                <QuickLocation icon="location" label="Saved" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Services Section - Book a Ride */}
          <View style={styles.servicesSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Book a Ride</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>QUICK</Text>
              </View>
            </View>
            <View style={styles.servicesGrid}>
              <ServiceCard
                icon="car-sport"
                title="Standard"
                desc="Quick rides"
                color={COLORS.accentGreen}
                onPress={() => router.push('/rider/book')}
              />
              <ServiceCard
                icon="pricetag"
                title="Bid Ride"
                desc="Name your price"
                color="#F59E0B"
                onPress={() => router.push('/rider/bid')}
                badge="SAVE"
              />
            </View>
          </View>

          {/* More Services */}
          <View style={styles.servicesSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More Services</Text>
              <View style={[styles.sectionBadge, { backgroundColor: COLORS.accentPurpleSoft }]}>
                <Text style={[styles.sectionBadgeText, { color: COLORS.accentPurple }]}>NEW</Text>
              </View>
            </View>
            <View style={styles.servicesGrid}>
              <ServiceCard
                icon="calendar"
                title="Schedule"
                desc="Book ahead"
                color={COLORS.accentPurple}
                onPress={() => router.push('/rider/schedule')}
              />
              <ServiceCard
                icon="cube"
                title="Delivery"
                desc="Send packages"
                color="#06B6D4"
                onPress={() => router.push('/rider/delivery')}
              />
            </View>
          </View>

          {/* AI Assistant - Premium Card */}
          <TouchableOpacity 
            style={styles.aiCard}
            onPress={() => router.push('/chat')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#8B5CF6', '#6366F1']}
              style={styles.aiGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.aiContent}>
                <View style={styles.aiLeft}>
                  <View style={styles.aiIcon}>
                    <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.aiTitle}>AI Assistant</Text>
                    <Text style={styles.aiDesc}>Powered by GPT-4o • 24/7</Text>
                  </View>
                </View>
                <View style={styles.aiArrow}>
                  <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Quick Access Features */}
          <View style={styles.featuresSection}>
            <Text style={styles.sectionTitle}>More Services</Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon="cube"
                label="Package Delivery"
                color="#FF6B35"
                onPress={() => router.push('/rider/delivery')}
              />
              <FeatureCard
                icon="calendar"
                label="Schedule Ride"
                color="#2979FF"
                onPress={() => router.push('/rider/schedule')}
              />
              <FeatureCard
                icon="people"
                label="Family"
                color="#9C27B0"
                onPress={() => router.push('/rider/family')}
              />
              <FeatureCard
                icon="pricetag"
                label="Bid for Ride"
                color="#00BCD4"
                onPress={() => router.push('/rider/bid')}
              />
              <FeatureCard
                icon="car-sport"
                label="Car Preference"
                color="#FF9100"
                onPress={() => router.push('/rider/car-type-preference')}
              />
              <FeatureCard
                icon="navigate"
                label="Live Tracking"
                color="#4CAF50"
                onPress={() => router.push('/rider/tracking')}
              />
              <FeatureCard
                icon="wallet"
                label="Wallet"
                color="#673AB7"
                onPress={() => router.push('/rider/wallet')}
              />
              <FeatureCard
                icon="time"
                label="Trip History"
                color="#607D8B"
                onPress={() => router.push('/rider/trips')}
              />
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <QuickAction icon="time" label="History" onPress={() => router.push('/ride-history')} />
            <QuickAction icon="wallet" label="Rewards" onPress={() => router.push('/wallet')} />
            <QuickAction icon="settings" label="Settings" onPress={() => router.push('/settings')} />
            <QuickAction icon="help-circle" label="Support" onPress={() => router.push('/chat')} />
          </View>

          {/* Why NEXRYDE */}
          <View style={styles.whySection}>
            <Text style={styles.sectionTitle}>Why NEXRYDE?</Text>
            <View style={styles.whyGrid}>
              <WhyCard 
                icon="shield-checkmark" 
                title="Verified Drivers" 
                color={COLORS.accentGreen}
              />
              <WhyCard 
                icon="cash" 
                title="Fair Pricing" 
                color={COLORS.accentBlue}
              />
              <WhyCard 
                icon="location" 
                title="Live Tracking" 
                color={COLORS.accentPurple}
              />
              <WhyCard 
                icon="heart" 
                title="Driver Welfare" 
                color="#EF4444"
              />
            </View>
          </View>
          
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const QuickLocation = ({ icon, label }: { icon: string; label: string }) => (
  <TouchableOpacity style={styles.quickLocation}>
    <View style={styles.quickLocationIcon}>
      <Ionicons name={icon as any} size={20} color={COLORS.white} />
    </View>
    <Text style={styles.quickLocationLabel}>{label}</Text>
  </TouchableOpacity>
);

const ServiceCard = ({ icon, title, desc, color, onPress, badge }: { icon: string; title: string; desc: string; color: string; onPress?: () => void; badge?: string }) => (
  <TouchableOpacity style={styles.serviceCard} onPress={onPress} activeOpacity={0.8}>
    {badge && (
      <View style={[styles.cardBadge, { backgroundColor: color }]}>
        <Text style={styles.cardBadgeText}>{badge}</Text>
      </View>
    )}
    <View style={[styles.serviceIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={28} color={color} />
    </View>
    <Text style={styles.serviceTitle}>{title}</Text>
    <Text style={styles.serviceDesc}>{desc}</Text>
  </TouchableOpacity>
);

const QuickAction = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.quickActionIcon}>
      <Ionicons name={icon as any} size={22} color={COLORS.accentGreen} />
    </View>
    <Text style={styles.quickActionLabel}>{label}</Text>
  </TouchableOpacity>
);

const WhyCard = ({ icon, title, color }: { icon: string; title: string; color: string }) => (
  <View style={styles.whyCard}>
    <View style={[styles.whyIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <Text style={styles.whyTitle}>{title}</Text>
  </View>
);


const FeatureCard = ({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.featureCard} onPress={onPress}>
    <View style={[styles.featureIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <Text style={styles.featureLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  greeting: {
    fontSize: FONT_SIZE.lg + 2,
    fontWeight: '700',
    color: COLORS.lightTextSecondary,
    letterSpacing: 0.3,
  },
  userName: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    letterSpacing: -0.5,
  },
  profileButton: {
    borderRadius: 26,
    overflow: 'hidden',
    ...SHADOWS.glow,
  },
  profileGradient: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 4,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.accentGreen + '30',
  },
  modeDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.accentGreen + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accentGreen,
  },
  modeText: {
    fontSize: FONT_SIZE.xs + 1,
    fontWeight: '900',
    color: COLORS.accentGreen,
    letterSpacing: 1.5,
  },
  whereToCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    ...SHADOWS.xl,
  },
  whereToGradient: {
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xxl,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  whereToHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  whereToTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  whereToArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whereToInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md + 2,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  searchIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whereToPlaceholder: {
    fontSize: FONT_SIZE.md + 1,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  quickLocations: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickLocation: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  quickLocationIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  quickLocationLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  servicesSection: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg + 2,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    letterSpacing: -0.3,
  },
  sectionBadge: {
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accentGreen,
    letterSpacing: 0.5,
  },
  servicesGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  serviceCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.lightBorder,
    position: 'relative',
    ...SHADOWS.card,
  },
  cardBadge: {
    position: 'absolute',
    top: -8,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  cardBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  serviceIcon: {
    width: 60,
    height: 60,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  serviceTitle: {
    fontSize: FONT_SIZE.md + 1,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    letterSpacing: -0.2,
  },
  serviceDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    marginTop: 4,
  },
  aiCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    ...SHADOWS.glowPurple,
  },
  aiGradient: {
    padding: SPACING.lg,
  },
  aiContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  aiIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTitle: {
    fontSize: FONT_SIZE.md + 1,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.2,
  },
  aiDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  aiArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  quickAction: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.accentGreen + '30',
  },
  quickActionLabel: {
    fontSize: FONT_SIZE.xs + 1,
    fontWeight: '800',
    color: COLORS.lightTextSecondary,
    letterSpacing: 0.2,
  },
  whySection: {
    marginBottom: SPACING.lg,
  },
  whyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  whyCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2 - SPACING.md / 2,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.lightBorder,
    ...SHADOWS.sm,
  },
  whyIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  whyTitle: {
    fontSize: FONT_SIZE.sm + 1,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    letterSpacing: -0.1,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
