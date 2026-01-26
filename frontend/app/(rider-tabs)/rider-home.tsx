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
import { FallingRoses } from '@/src/components/FallingRoses';

const { width } = Dimensions.get('window');

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Subtle Falling Roses */}
      <FallingRoses intensity="light" />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
            </View>
            <TouchableOpacity style={styles.profileButton}>
              <LinearGradient
                colors={[COLORS.accent, COLORS.accentDark]}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>{user?.name?.charAt(0) || 'R'}</Text>
              </LinearGradient>
            </TouchableOpacity>
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
                <View style={styles.whereToRose} />
              </View>
              
              <View style={styles.whereToInput}>
                <View style={styles.whereToIcon}>
                  <Ionicons name="search" size={20} color={COLORS.accent} />
                </View>
                <Text style={styles.whereToPlaceholder}>Enter your destination</Text>
              </View>
              
              <View style={styles.quickLocations}>
                <QuickLocation icon="home" label="Home" color={COLORS.rosePetal2} />
                <QuickLocation icon="briefcase" label="Work" color={COLORS.rosePetal3} />
                <QuickLocation icon="location" label="Map" color={COLORS.rosePetal4} />
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
                color={COLORS.rosePetal2}
              />
              <ServiceCard
                icon="diamond"
                title="Premium"
                desc="Luxury comfort"
                color={COLORS.gold}
              />
            </View>
          </View>

          {/* AI Assistant Card */}
          <TouchableOpacity 
            style={styles.aiCard}
            onPress={() => router.push('/assistant')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.rosePetal4, COLORS.rosePetal5]}
              style={styles.aiGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.aiIcon}>
                <Ionicons name="sparkles" size={24} color={COLORS.white} />
              </View>
              <View style={styles.aiContent}>
                <Text style={styles.aiTitle}>AI Assistant</Text>
                <Text style={styles.aiDesc}>Get help with anything</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={COLORS.white} />
            </LinearGradient>
          </TouchableOpacity>

          {/* NEXRYDE Family */}
          <TouchableOpacity 
            style={styles.familyCard}
            onPress={() => router.push('/rider/family')}
            activeOpacity={0.9}
          >
            <View style={styles.familyIconWrap}>
              <Ionicons name="people" size={24} color={COLORS.accent} />
            </View>
            <View style={styles.familyContent}>
              <Text style={styles.familyTitle}>NEXRYDE Family</Text>
              <Text style={styles.familyDesc}>Share trips with loved ones</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Why NEXRYDE Section */}
          <View style={styles.whySection}>
            <Text style={styles.sectionTitle}>Why NEXRYDE?</Text>
            <View style={styles.whyGrid}>
              <WhyCard
                icon="shield-checkmark"
                title="Verified Drivers"
                desc="All drivers verified with NIN"
                color={COLORS.success}
              />
              <WhyCard
                icon="wallet"
                title="Fair Pricing"
                desc="No hidden charges"
                color={COLORS.gold}
              />
              <WhyCard
                icon="location"
                title="Live Tracking"
                desc="Real-time trip monitoring"
                color={COLORS.info}
              />
              <WhyCard
                icon="heart"
                title="Premium Care"
                desc="24/7 support available"
                color={COLORS.rosePetal3}
              />
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const QuickLocation = ({ icon, label, color }: any) => (
  <TouchableOpacity style={styles.quickLocation}>
    <View style={[styles.quickIcon, { backgroundColor: `${color}20` }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

const ServiceCard = ({ icon, title, desc, color }: any) => (
  <TouchableOpacity style={styles.serviceCard} activeOpacity={0.8}>
    <View style={[styles.serviceIcon, { backgroundColor: `${color}20` }]}>
      <Ionicons name={icon} size={26} color={color} />
    </View>
    <Text style={styles.serviceTitle}>{title}</Text>
    <Text style={styles.serviceDesc}>{desc}</Text>
  </TouchableOpacity>
);

const WhyCard = ({ icon, title, desc, color }: any) => (
  <View style={styles.whyCard}>
    <View style={[styles.whyIcon, { backgroundColor: `${color}15` }]}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={styles.whyTitle}>{title}</Text>
    <Text style={styles.whyDesc}>{desc}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
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
    borderRadius: 25,
    ...SHADOWS.rose,
  },
  profileGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  whereToCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  whereToGradient: {
    padding: SPACING.lg,
  },
  whereToHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  whereToTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  whereToRose: {
    width: 12,
    height: 14,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 12,
    transform: [{ rotate: '-45deg' }],
    opacity: 0.7,
  },
  whereToInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray800,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  whereToIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentSoft,
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
  },
  quickIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  quickLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  servicesSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
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
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray800,
  },
  serviceIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  serviceTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  serviceDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  aiCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  aiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  aiIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  aiContent: {
    flex: 1,
  },
  aiTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  aiDesc: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  familyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.gray800,
  },
  familyIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  familyContent: {
    flex: 1,
  },
  familyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  familyDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  whySection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  whyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  whyCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray800,
  },
  whyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  whyTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  whyDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  bottomSpacer: {
    height: 100,
  },
});
