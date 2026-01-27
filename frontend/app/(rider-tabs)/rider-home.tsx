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
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
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
            <View style={[styles.modeDot, { backgroundColor: COLORS.accentGreen }]} />
            <Text style={styles.modeText}>Rider Mode</Text>
          </View>

          {/* Where To Card */}
          <TouchableOpacity 
            style={styles.whereToCard}
            onPress={() => router.push('/rider/book')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.whereToGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.whereToHeader}>
                <Text style={styles.whereToTitle}>Where to?</Text>
              </View>
              
              <View style={styles.whereToInput}>
                <Ionicons name="search" size={20} color={COLORS.lightTextMuted} />
                <Text style={styles.whereToPlaceholder}>Enter your destination</Text>
              </View>
              
              <View style={styles.quickLocations}>
                <QuickLocation icon="home" label="Home" />
                <QuickLocation icon="briefcase" label="Work" />
                <QuickLocation icon="location" label="Map" />
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
            <View style={styles.aiContent}>
              <View style={styles.aiLeft}>
                <View style={styles.aiIcon}>
                  <Ionicons name="sparkles" size={24} color={COLORS.accentGreen} />
                </View>
                <View>
                  <Text style={styles.aiTitle}>AI Assistant</Text>
                  <Text style={styles.aiDesc}>Get help with your rides</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color={COLORS.accentGreen} />
            </View>
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

const QuickLocation = ({ icon, label }: { icon: string; label: string }) => (
  <TouchableOpacity style={styles.quickLocation}>
    <View style={styles.quickLocationIcon}>
      <Ionicons name={icon as any} size={18} color={COLORS.white} />
    </View>
    <Text style={styles.quickLocationLabel}>{label}</Text>
  </TouchableOpacity>
);

const ServiceCard = ({ icon, title, desc, color }: { icon: string; title: string; desc: string; color: string }) => (
  <TouchableOpacity style={styles.serviceCard}>
    <View style={[styles.serviceIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={26} color={color} />
    </View>
    <Text style={styles.serviceTitle}>{title}</Text>
    <Text style={styles.serviceDesc}>{desc}</Text>
  </TouchableOpacity>
);

const WhyCard = ({ icon, title, color }: { icon: string; title: string; color: string }) => (
  <View style={styles.whyCard}>
    <View style={[styles.whyIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={22} color={color} />
    </View>
    <Text style={styles.whyTitle}>{title}</Text>
  </View>
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
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  profileButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  profileGradient: {
    width: 50,
    height: 50,
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
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  modeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  whereToCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  whereToGradient: {
    padding: SPACING.lg,
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
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  whereToPlaceholder: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
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
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  quickLocationLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
    fontWeight: '600',
  },
  servicesSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
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
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  serviceIcon: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  serviceTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  serviceDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    color: COLORS.lightTextSecondary,
    marginTop: 4,
  },
  aiCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  aiContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  aiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  aiIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  aiDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    color: COLORS.lightTextSecondary,
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
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  whyIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  whyTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
