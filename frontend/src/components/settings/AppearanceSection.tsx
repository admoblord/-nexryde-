import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE } from '@/src/constants/designSystem';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { updateUserTheme } from '@/src/services/api';
import {
  persistThemePreference,
  useAppearancePreference,
  type ThemePreference,
} from '@/src/theme/appearanceTheme';

const OPTIONS: {
  key: ThemePreference;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  preview: 'light' | 'dark' | 'system';
}[] = [
  { key: 'light', title: 'Light', subtitle: 'Bright surfaces for daytime', icon: 'sunny-outline', preview: 'light' },
  { key: 'dark', title: 'Dark', subtitle: 'NEXRYDE navy night mode', icon: 'moon-outline', preview: 'dark' },
  { key: 'auto', title: 'System', subtitle: 'Match Android / iOS theme', icon: 'phone-portrait-outline', preview: 'system' },
];

function previewTokens(kind: 'light' | 'dark' | 'system', isDark: boolean) {
  const resolved = kind === 'system' ? (isDark ? 'dark' : 'light') : kind;
  if (resolved === 'dark') {
    return {
      bg: BRAND.bgDeep,
      card: SURFACE.cardDark,
      text: BRAND.textPrimary,
      sub: BRAND.textSecondary,
      border: SURFACE.hairline,
      input: SURFACE.tile,
      chip: BRAND.primary,
    };
  }
  return {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    text: '#0F172A',
    sub: '#64748B',
    border: '#E2E8F0',
    input: '#F1F5F9',
    chip: BRAND.primary,
  };
}

function PreviewCard({
  option,
  selected,
  onPress,
  saving,
  isDark,
}: {
  option: (typeof OPTIONS)[number];
  selected: boolean;
  onPress: () => void;
  saving: boolean;
  isDark: boolean;
}) {
  const p = previewTokens(option.preview, isDark);
  return (
    <TouchableOpacity
      style={[styles.previewShell, { borderColor: selected ? BRAND.primary : p.border }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.title}. ${option.subtitle}`}
    >
      <View style={[styles.previewCanvas, { backgroundColor: p.bg }]}>
        <View style={styles.previewTop}>
          <View>
            <Text style={[styles.previewHello, { color: p.text }]}>Hello, Rider</Text>
            <Text style={[styles.previewSub, { color: p.sub }]}>Where to today?</Text>
          </View>
          <View style={[styles.previewAvatar, { backgroundColor: p.chip }]}>
            <Ionicons name="person" size={14} color="#FFFFFF" />
          </View>
        </View>
        <View style={[styles.previewInput, { backgroundColor: p.input, borderColor: p.border }]}>
          <View style={[styles.previewDot, { backgroundColor: p.chip }]} />
          <Text style={[styles.previewInputText, { color: p.sub }]}>Where to?</Text>
        </View>
        <View style={[styles.previewHero, { backgroundColor: p.chip }]}>
          <Ionicons name="car-sport" size={20} color="#FFFFFF" />
          <Text style={styles.previewHeroText}>Book a Ride</Text>
        </View>
      </View>
      <View style={styles.optionTextRow}>
        <View style={[styles.optionIcon, { backgroundColor: selected ? BRAND.primaryMuted : 'rgba(148,163,184,0.14)' }]}>
          <Ionicons name={option.icon} size={18} color={selected ? BRAND.primary : p.sub} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionTitle, { color: selected ? BRAND.primary : p.text }]}>{option.title}</Text>
          <Text style={[styles.optionSubtitle, { color: p.sub }]}>{option.subtitle}</Text>
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={BRAND.primary} />
        ) : selected ? (
          <Ionicons name="checkmark-circle" size={22} color={BRAND.primary} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function AppearanceSection() {
  const { colors, isDark, systemTheme } = useThemeColors();
  const preference = useAppearancePreference();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const [saving, setSaving] = useState<ThemePreference | null>(null);

  const currentLabel = useMemo(() => {
    if (preference === 'auto') return `Following system (${systemTheme})`;
    return preference === 'dark' ? 'Dark' : 'Light';
  }, [preference, systemTheme]);

  const select = async (next: ThemePreference) => {
    const prev = preference;
    setSaving(next);
    try {
      await persistThemePreference(next);
      if (userId && canCallAuthedApi) {
        await updateUserTheme(userId, next);
      }
    } catch {
      await persistThemePreference(prev);
      Alert.alert('Could not save appearance', 'Your theme was restored. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? SURFACE.cardDark : colors.card,
          borderColor: isDark ? SURFACE.hairline : colors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <Ionicons name="color-palette-outline" size={18} color={BRAND.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {currentLabel}. Changes apply instantly across the app.
          </Text>
        </View>
      </View>
      <View style={styles.previewGrid}>
        {OPTIONS.map((option) => (
          <PreviewCard
            key={option.key}
            option={option}
            selected={preference === option.key}
            saving={saving === option.key}
            onPress={() => void select(option.key)}
            isDark={isDark}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.stack,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 3,
  },
  previewGrid: {
    gap: SPACING.stack,
  },
  previewShell: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    overflow: 'hidden',
  },
  previewCanvas: {
    padding: 12,
    gap: 10,
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewHello: {
    fontSize: 15,
    fontWeight: '900',
  },
  previewSub: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  previewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInput: {
    minHeight: 34,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  previewInputText: {
    fontSize: 12,
    fontWeight: '800',
  },
  previewHero: {
    minHeight: 46,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  previewHeroText: {
    color: BRAND.textInverse,
    fontSize: 15,
    fontWeight: '900',
  },
  optionTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.stack,
    padding: SPACING.sm,
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  optionSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
});
