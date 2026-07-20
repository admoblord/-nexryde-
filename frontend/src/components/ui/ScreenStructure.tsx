/**
 * Shared screen structure primitives — finer rhythm across driver/rider/auth.
 * Prefer these over ad-hoc title/card stacks so every surface feels one product.
 */
import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useThemeColors } from '@/src/constants/theme';

export function ScreenBackdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={[BRAND.bgDeep, BRAND.bgCard, BRAND.bgDeep]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

export function ScreenColumn({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const flow = useFlowLayout();
  return (
    <View
      style={[
        styles.column,
        {
          paddingHorizontal: flow.padH,
          maxWidth: flow.maxContentWidth,
          gap: Math.round(flow.sectionGap * 0.72),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ScreenHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  const { colors, isDark } = useThemeColors();
  return (
    <View style={styles.hero}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: isDark ? BRAND.primary : BRAND.primaryDark }]}>
          {eyebrow}
        </Text>
      ) : null}
      <Text style={[styles.heroTitle, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.heroSub, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  const { colors } = useThemeColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action}
    </View>
  );
}

export function AppCard({
  children,
  style,
  elevated = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}) {
  const { colors, isDark } = useThemeColors();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark
            ? elevated
              ? SURFACE.cardElevated
              : SURFACE.cardDark
            : colors.card,
          borderColor: isDark ? SURFACE.hairline : colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BRAND.bgDeep },
  column: {
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    gap: 6,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  eyebrow: {
    ...TYPOGRAPHY.label,
    textTransform: 'uppercase',
  },
  heroTitle: {
    ...TYPOGRAPHY.headline,
    letterSpacing: -0.4,
  },
  heroSub: {
    ...TYPOGRAPHY.body,
    marginTop: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    ...TYPOGRAPHY.subhead,
    letterSpacing: -0.2,
  },
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    overflow: 'hidden',
  },
});
