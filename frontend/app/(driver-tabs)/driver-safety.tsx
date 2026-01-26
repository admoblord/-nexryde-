import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function DriverSafetyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Driver Safety</Text>
        <Text style={styles.headerSubtext}>Your protection is our priority</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Risk Alert Button */}
        <TouchableOpacity style={styles.riskButton} activeOpacity={0.8}>
          <Ionicons name="warning" size={32} color={COLORS.white} />
          <Text style={styles.riskText}>Risk Alert</Text>
          <Text style={styles.riskSubtext}>Report unsafe passenger</Text>
        </TouchableOpacity>

        {/* Safety Features */}
        <Text style={styles.sectionTitle}>Driver Protection</Text>
        <View style={styles.featuresList}>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Rider Verification</Text>
              <Text style={styles.featureDesc}>All riders are verified</Text>
            </View>
          </View>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="recording" size={24} color={COLORS.info} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Trip Recording</Text>
              <Text style={styles.featureDesc}>Audio protection during rides</Text>
            </View>
          </View>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="time" size={24} color={COLORS.accent} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Fatigue Monitoring</Text>
              <Text style={styles.featureDesc}>Break reminders for safety</Text>
            </View>
          </View>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.errorSoft }]}>
              <Ionicons name="call" size={24} color={COLORS.error} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>24/7 Support</Text>
              <Text style={styles.featureDesc}>Emergency assistance anytime</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerSubtext: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
  content: {
    padding: SPACING.lg,
  },
  riskButton: {
    backgroundColor: COLORS.warning,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
  },
  riskText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
    marginTop: SPACING.sm,
  },
  riskSubtext: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  featuresList: {
    gap: SPACING.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    ...SHADOWS.sm,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  featureTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  featureDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});
