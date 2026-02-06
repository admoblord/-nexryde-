import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import {
  VerificationBadge,
  TrustScore,
  DriverVerificationCard,
} from '@/src/components/DriverVerification';

interface DriverDetails {
  id: string;
  name: string;
  rating: number;
  totalTrips: number;
  yearsActive: number;
  vehicle: string;
  plate: string;
  color: string;
  profileImage?: string;
  ninVerified: boolean;
  licenseVerified: boolean;
  vehicleVerified: boolean;
  backgroundCheck: boolean;
  trustScore: number;
  phoneNumber: string;
}

export default function DriverDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Real driver data from route params or show empty state
  const driverId = params.driverId as string;
  const driverData = params.driver ? JSON.parse(params.driver as string) : null;
  
  const [driver] = useState<DriverDetails | null>(driverData);

  const allVerified = driver.ninVerified && driver.licenseVerified && driver.vehicleVerified && driver.backgroundCheck;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Driver Profile Card */}
        <View style={styles.profileCard}>
          <LinearGradient
            colors={allVerified ? [COLORS.success, COLORS.accentGreen] : [COLORS.warning, COLORS.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileGradient}
          >
            {/* Top Section */}
            <View style={styles.profileTop}>
              <View style={styles.avatarContainer}>
                {driver.profileImage ? (
                  <Image source={{ uri: driver.profileImage }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {driver.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                {allVerified && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={28} color={COLORS.success} />
                  </View>
                )}
              </View>
              
              <View style={styles.profileInfo}>
                <Text style={styles.driverName}>{driver.name}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={18} color={COLORS.accent} />
                  <Text style={styles.ratingText}>{driver.rating}</Text>
                  <Text style={styles.tripsText}>• {driver.totalTrips} trips</Text>
                </View>
                <Text style={styles.experienceText}>
                  🚗 {driver.yearsActive} years of driving
                </Text>
              </View>

              <TrustScore score={driver.trustScore} size="large" />
            </View>
          </LinearGradient>

          {/* Quick Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="car-sport" size={20} color={COLORS.accentBlue} />
              <Text style={styles.statValue}>{driver.totalTrips}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="star" size={20} color={COLORS.accent} />
              <Text style={styles.statValue}>{driver.rating}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="time" size={20} color={COLORS.accentGreen} />
              <Text style={styles.statValue}>{driver.yearsActive}y</Text>
              <Text style={styles.statLabel}>Experience</Text>
            </View>
          </View>
        </View>

        {/* Verification Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛡️ Verification Status</Text>
          <DriverVerificationCard
            driverName={driver.name}
            ninVerified={driver.ninVerified}
            licenseVerified={driver.licenseVerified}
            vehicleVerified={driver.vehicleVerified}
            backgroundCheck={driver.backgroundCheck}
            trustScore={driver.trustScore}
          />
        </View>

        {/* Vehicle Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚗 Vehicle Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="car" size={20} color={COLORS.accentBlue} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Vehicle Model</Text>
                <Text style={styles.infoValue}>{driver.vehicle}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="card" size={20} color={COLORS.accentGreen} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Plate Number</Text>
                <Text style={styles.infoValue}>{driver.plate}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="color-palette" size={20} color={COLORS.accentPurple} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Vehicle Color</Text>
                <Text style={styles.infoValue}>{driver.color}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Safety Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛡️ Safety & Compliance</Text>
          <View style={styles.safetyCard}>
            <View style={styles.safetyItem}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
              <View style={styles.safetyInfo}>
                <Text style={styles.safetyTitle}>Background Verified</Text>
                <Text style={styles.safetyDesc}>Criminal record check passed</Text>
              </View>
              {driver.backgroundCheck && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              )}
            </View>
            
            <View style={styles.safetyItem}>
              <Ionicons name="document-text" size={24} color={COLORS.accentGreen} />
              <View style={styles.safetyInfo}>
                <Text style={styles.safetyTitle}>Valid Driver's License</Text>
                <Text style={styles.safetyDesc}>Verified and up-to-date</Text>
              </View>
              {driver.licenseVerified && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              )}
            </View>
            
            <View style={styles.safetyItem}>
              <Ionicons name="car" size={24} color={COLORS.accentPurple} />
              <View style={styles.safetyInfo}>
                <Text style={styles.safetyTitle}>Vehicle Inspected</Text>
                <Text style={styles.safetyDesc}>Roadworthy certificate valid</Text>
              </View>
              {driver.vehicleVerified && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              )}
            </View>
            
            <View style={styles.safetyItem}>
              <Ionicons name="card" size={24} color={COLORS.accentBlue} />
              <View style={styles.safetyInfo}>
                <Text style={styles.safetyTitle}>NIN Verified</Text>
                <Text style={styles.safetyDesc}>Government ID confirmed</Text>
              </View>
              {driver.ninVerified && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              )}
            </View>
          </View>
        </View>

        {/* Trust Score Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Trust Score Breakdown</Text>
          <View style={styles.trustCard}>
            <View style={styles.trustHeader}>
              <TrustScore score={driver.trustScore} size="large" showLabel />
            </View>
            <View style={styles.trustMetrics}>
              <TrustMetric label="Safety Record" value={100} />
              <TrustMetric label="Customer Ratings" value={99} />
              <TrustMetric label="Completion Rate" value={98} />
              <TrustMetric label="Verification Status" value={100} />
            </View>
            <Text style={styles.trustNote}>
              Trust score is calculated based on verification status, driving history, and customer feedback.
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity 
          style={styles.requestButton}
          onPress={() => router.push({
            pathname: '/rider/book',
            params: { requestedDriverId: driver.id }
          })}
        >
          <LinearGradient
            colors={[COLORS.accentGreen, COLORS.accentBlue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.requestGradient}
          >
            <Ionicons name="car" size={24} color={COLORS.white} />
            <Text style={styles.requestText}>Request This Driver</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const TrustMetric = ({ label, value }: { label: string; value: number }) => (
  <View style={styles.trustMetricItem}>
    <View style={styles.trustMetricHeader}>
      <Text style={styles.trustMetricLabel}>{label}</Text>
      <Text style={styles.trustMetricValue}>{value}%</Text>
    </View>
    <View style={styles.trustMetricBar}>
      <View style={[styles.trustMetricFill, { width: `${value}%` }]} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 44,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  
  // Profile Card
  profileCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  profileGradient: {
    padding: SPACING.lg,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  avatarText: {
    fontSize: FONT_SIZE.xxl + 10,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 2,
  },
  profileInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs / 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs / 2,
  },
  ratingText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  tripsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  experienceText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginTop: SPACING.xs / 2,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.lightBorder,
  },
  
  // Sections
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  
  // Info Card
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    gap: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  
  // Safety Card
  safetyCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    gap: SPACING.md,
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  safetyInfo: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  safetyDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  
  // Trust Card
  trustCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  trustHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
    marginBottom: SPACING.md,
  },
  trustMetrics: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  trustMetricItem: {
    gap: SPACING.xs,
  },
  trustMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trustMetricLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  trustMetricValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  trustMetricBar: {
    height: 6,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  trustMetricFill: {
    height: '100%',
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.full,
  },
  trustNote: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  
  // Action Button
  requestButton: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.md,
  },
  requestGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md + 4,
  },
  requestText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
});
