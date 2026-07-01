import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export type RiderOnboardingStep = 'nin' | 'verify';

const LABELS: Record<RiderOnboardingStep, string> = {
  nin: 'National ID (NIN)',
  verify: 'Profile & biometric',
};

const FLOW_PREVIEW = 'NIN → Profile, address & face scan';

function stepIndex(s: RiderOnboardingStep): number {
  return s === 'nin' ? 0 : 1;
}

/** Macro rider signup progress (NIN → secure verification). */
export function RiderOnboardingProgress({
  current,
  subtitle,
  preview,
  appearance = 'light',
}: {
  current: RiderOnboardingStep;
  subtitle?: string;
  preview?: boolean;
  appearance?: 'light' | 'dark';
}) {
  const dark = appearance === 'dark';
  const c = dark ? darkColors : lightColors;

  if (preview) {
    return (
      <View style={[styles.wrap, dark && styles.wrapDark]} accessibilityRole="header">
        <Text style={[styles.stepText, { color: c.step }]}>Rider verification: 2 steps after Continue</Text>
        <Text style={[styles.previewFlow, { color: c.preview }]}>{FLOW_PREVIEW}</Text>
        <View style={[styles.track, { backgroundColor: c.trackBg }]}>
          <View style={[styles.fill, { width: '12%', backgroundColor: c.fill }]} />
        </View>
        {subtitle ? <Text style={[styles.subtitle, { color: c.sub }]}>{subtitle}</Text> : null}
      </View>
    );
  }

  const idx = stepIndex(current);
  const pct = ((idx + 1) / 2) * 100;
  return (
    <View style={[styles.wrap, dark && styles.wrapDark]} accessibilityRole="header">
      <Text style={[styles.stepText, { color: c.step }]}>
        Step {idx + 1} of 2 · {LABELS[current]}
      </Text>
      <View style={[styles.track, { backgroundColor: c.trackBg }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: c.fill }]} />
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: c.sub }]}>{subtitle}</Text> : null}
    </View>
  );
}

const lightColors = {
  step: COLORS.lightTextPrimary,
  preview: COLORS.lightTextSecondary,
  trackBg: COLORS.lightBorder,
  fill: COLORS.accentGreen,
  sub: COLORS.lightTextSecondary,
};

const darkColors = {
  step: '#F8FAFC',
  preview: '#94A3B8',
  trackBg: 'rgba(148,163,184,0.2)',
  fill: '#00D084',
  sub: '#94A3B8',
};

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
  wrapDark: {
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderColor: 'rgba(0,208,132,0.22)',
  },
  stepText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    textAlign: 'center',
  },
  previewFlow: {
    marginTop: 4,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textAlign: 'center',
  },
  track: {
    marginTop: SPACING.sm,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  subtitle: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    lineHeight: 17,
    fontWeight: '600',
  },
});
