import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export type DriverOnboardingStep = 'terms' | 'documents' | 'profile';

const LABELS: Record<DriverOnboardingStep, string> = {
  terms: 'Terms & signup',
  documents: 'Verify documents',
  profile: 'Complete profile',
};

function stepIndex(s: DriverOnboardingStep): number {
  const order: DriverOnboardingStep[] = ['terms', 'documents', 'profile'];
  return order.indexOf(s);
}

/** Compact driver onboarding progress (terms → documents → profile). */
export function DriverOnboardingProgress({
  current,
  subtitle,
  preview,
}: {
  current: DriverOnboardingStep;
  subtitle?: string;
  /** Register screen: show what comes next before step 1. */
  preview?: boolean;
}) {
  if (preview) {
    return (
      <View style={styles.wrap} accessibilityRole="header">
        <Text style={styles.stepText}>Driver verification: 3 steps after Continue</Text>
        <Text style={styles.previewFlow}>Terms → Documents → Driver profile</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: '12%' }]} />
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    );
  }

  const idx = stepIndex(current);
  const pct = ((idx + 1) / 3) * 100;
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Text style={styles.stepText}>
        Step {idx + 1} of 3 · {LABELS[current]}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  stepText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
  },
  previewFlow: {
    marginTop: 4,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
  },
  track: {
    marginTop: SPACING.sm,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.lightBorder,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.accentGreen,
  },
  subtitle: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
    lineHeight: 17,
    fontWeight: '600',
  },
});
