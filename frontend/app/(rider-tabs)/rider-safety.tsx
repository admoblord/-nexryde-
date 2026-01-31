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

export default function RiderSafetyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Safety Center</Text>
        <Text style={styles.headerSubtext}>Your safety is our priority</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* SOS Button */}
        <TouchableOpacity style={styles.sosButton} activeOpacity={0.8}>
          <Ionicons name="alert-circle" size={32} color={COLORS.white} />
          <Text style={styles.sosText}>Emergency SOS</Text>
          <Text style={styles.sosSubtext}>Tap in case of emergency</Text>
        </TouchableOpacity>

        {/* Safety Features */}
        <Text style={styles.sectionTitle}>Safety Features</Text>
        <View style={styles.featuresList}>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Verified Drivers</Text>
              <Text style={styles.featureDesc}>All drivers verified with NIN</Text>
            </View>
          </View>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="location" size={24} color={COLORS.info} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Live Trip Tracking</Text>
              <Text style={styles.featureDesc}>Share your ride in real-time</Text>
            </View>
          </View>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="call" size={24} color={COLORS.accent} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>24/7 Support</Text>
              <Text style={styles.featureDesc}>Always here to help you</Text>
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
    fontWeight: '700',
    color: '#FDE68A',
    marginTop: SPACING.xs,
  },
  content: {
    padding: SPACING.lg,
  },
  sosButton: {
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
  },
  sosText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.sm,
    letterSpacing: -0.5,
  },
  sosSubtext: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#FEE2E2',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.md,
    letterSpacing: -0.3,
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
    fontWeight: '800',
    color: '#0F172A',
  },
  featureDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
  },
});
