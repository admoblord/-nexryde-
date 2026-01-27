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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 80, left: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { top: 150, right: 40, backgroundColor: COLORS.accentBlue, width: 50, height: 50 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
            </View>
            <TouchableOpacity style={styles.profileButton}>
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
            <View style={[styles.modeDot, { backgroundColor: COLORS.accentBlue }]} />
            <Text style={[styles.modeText, { color: COLORS.accentBlue }]}>Rider Mode</Text>
          </View>

          {/* Where To Card */}
          <TouchableOpacity 
            style={styles.whereToCard}
            onPress={() => router.push('/rider/book')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.surface, COLORS.surfaceLight]}
              style={styles.whereToGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.whereToHeader}>
                <Text style={styles.whereToTitle}>Where to?</Text>
              </View>
              
              <View style={styles.whereToInput}>
                <View style={styles.whereToIcon}>
                  <Ionicons name="search" size={20} color={COLORS.accentGreen} />
                </View>
                <Text style={styles.whereToPlaceholder}>Enter your destination</Text>
              </View>
              
              <View style={styles.quickLocations}>
                <QuickLocation icon="home" label="Home" color={COLORS.accentBlue} />
                <QuickLocation icon="briefcase" label="Work" color={COLORS.accentGreen} />
                <QuickLocation icon="location" label="Map" color={COLORS.gold} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* Premium Services */}
          <View style={styles.servicesSection}>
            <Text style={styles.sectionTitle}>Premium Services</Text>
            <View style={styles.servicesGrid}>
              <ServiceCard
                icon="car-sport"
                title="Economy"
                desc="Affordable rides"
                color={COLORS.accentGreen}
              />
              <ServiceCard
                icon="diamond"
                title="Premium"
                desc="Luxury comfort"
                color={COLORS.gold}
              />
            </View>
          </View>

          {/* AI Assistant */}
          <TouchableOpacity 
            style={styles.aiCard}
            onPress={() => router.push('/assistant')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryLight]}
              style={styles.aiGradient}
            >
              <View style={styles.aiLeft}>
                <View style={styles.aiIcon}>
                  <Ionicons name="sparkles" size={24} color={COLORS.accentGreen} />
                </View>
                <View>
                  <Text style={styles.aiTitle}>AI Assistant</Text>
                  <Text style={styles.aiDesc}>Get help with your rides</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.accentGreen} />
            </LinearGradient>
          </TouchableOpacity>

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
                color={COLORS.info}
              />
              <WhyCard 
                icon="heart" 
                title="Driver Welfare" 
                color={COLORS.error}
              />
            </View>
          </View>
          
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const QuickLocation = ({ icon, label, color }: { icon: string; label: string; color: string }) => (
  <TouchableOpacity style={styles.quickLocation}>
    <View style={[styles.quickLocationIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={18} color={color} />
    </View>
    <Text style={styles.quickLocationLabel}>{label}</Text>
  </TouchableOpacity>
);

const ServiceCard = ({ icon, title, desc, color }: { icon: string; title: string; desc: string; color: string }) => (
  <TouchableOpacity style={styles.serviceCard}>
    <LinearGradient
      colors={[COLORS.surface, COLORS.surfaceLight]}
      style={styles.serviceGradient}
    >
      <View style={[styles.serviceIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.serviceTitle}>{title}</Text>
      <Text style={styles.serviceDesc}>{desc}</Text>
    </LinearGradient>
  </TouchableOpacity>
);

const WhyCard = ({ icon, title, color }: { icon: string; title: string; color: string }) => (
  <View style={styles.whyCard}>
    <View style={[styles.whyIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon as any} size={20} color={color} />
    </View>
    <Text style={styles.whyTitle}>{title}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.12,
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
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  profileButton: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  profileGradient: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentBlueSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  whereToCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  whereToGradient: {
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xxl,
  },
  whereToHeader: {
    marginBottom: SPACING.md,
  },
  whereToTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  whereToInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  whereToIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  whereToPlaceholder: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
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
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLocationLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  servicesSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  servicesGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  serviceCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  serviceGradient: {
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  serviceIcon: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  serviceTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  serviceDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  aiCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  aiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  aiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  aiDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  whySection: {
    marginBottom: SPACING.lg,
  },
  whyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  whyCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2 - SPACING.md / 2,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  whyIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  whyTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
