import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileTokens as t, typography } from '@/src/theme/tokens';

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

export function ProfileQuickActions({ title, actions, colors: _colors, tileBorderColor }: Props) {
  const border = tileBorderColor ?? 'rgba(255,255,255,0.04)';
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.grid}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            style={({ pressed }) => [
              styles.tile,
              { borderColor: border, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
            onPress={a.onPress}
          >
            <View style={[styles.tileIcon, { backgroundColor: a.iconBg }]}>
              <Ionicons name={a.icon} size={24} color={a.iconColor} />
            </View>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: t.space.xxl,
  },
  sectionTitle: {
    ...typography.label,
    color: t.text.label,
    paddingLeft: 16,
    paddingBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space.md,
  },
  tile: {
    width: '48.5%',
    aspectRatio: 1.15,
    borderRadius: 16,
    borderWidth: 1,
    padding: t.space.lg,
    backgroundColor: t.bg.cardElevated,
    alignItems: 'flex-start',
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.space.md,
  },
  tileLabel: {
    ...typography.body,
    color: t.text.primary,
  },
});
