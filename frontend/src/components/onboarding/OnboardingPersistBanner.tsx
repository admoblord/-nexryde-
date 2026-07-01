import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

type Appearance = 'light' | 'dark';

/**
 * Reassures users they can close the app and resume the same onboarding step.
 */
export function OnboardingPersistBanner({
  stepLabel,
  appearance = 'light',
}: {
  stepLabel: string;
  appearance?: Appearance;
}) {
  const dark = appearance === 'dark';
  return (
    <View
      style={[styles.wrap, dark ? styles.wrapDark : styles.wrapLight]}
      accessibilityRole="text"
    >
      <View style={[styles.iconWrap, dark && styles.iconWrapDark]}>
        <Ionicons name="bookmark-outline" size={18} color={dark ? '#00D084' : '#059669'} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, dark && styles.titleDark]}>You can continue later</Text>
        <Text style={[styles.body, dark && styles.bodyDark]}>
          Close the app anytime — when you return, we bring you back to{' '}
          <Text style={[styles.em, dark && styles.emDark]}>{stepLabel}</Text>.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
  },
  wrapLight: {
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderColor: 'rgba(52,211,153,0.28)',
  },
  wrapDark: {
    backgroundColor: 'rgba(0,208,132,0.08)',
    borderColor: 'rgba(0,208,132,0.22)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(52,211,153,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDark: {
    backgroundColor: 'rgba(0,208,132,0.12)',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  titleDark: {
    color: '#F8FAFC',
  },
  body: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 17,
  },
  bodyDark: {
    color: '#94A3B8',
  },
  em: {
    fontWeight: '800',
    color: '#059669',
  },
  emDark: {
    color: '#00D084',
  },
});
