import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';

export type QuickActionItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  onPress: () => void;
};

type ThemeColors = {
  card: string;
  text: string;
  textMuted: string;
};

type Props = {
  title: string;
  actions: QuickActionItem[];
  colors: ThemeColors;
  /** Divider / tile border — use theme `colors.border` for light & dark. */
  tileBorderColor?: string;
};

export function ProfileQuickActions({ title, actions, colors, tileBorderColor }: Props) {
  const border = tileBorderColor ?? COLORS.gray100;
  return (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={styles.grid}>
        {actions.map((a) => (
          <TouchableOpacity
            key={a.key}
            style={[styles.tile, { backgroundColor: colors.card, borderColor: border }]}
            onPress={a.onPress}
            activeOpacity={0.75}
          >
            <View style={[styles.tileIcon, { backgroundColor: a.iconBg }]}>
              <Ionicons name={a.icon} size={22} color={a.iconColor} />
            </View>
            <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={2}>
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    ...SHADOWS.sm,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.sm,
    gap: SPACING.sm,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    minWidth: '44%',
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.md,
    alignItems: 'flex-start',
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  tileLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    lineHeight: 18,
  },
});
