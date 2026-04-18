import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';

type Props = {
  onPress: () => void;
  label?: string;
  compact?: boolean;
  style?: ViewStyle;
};

export const EmergencyButton: React.FC<Props> = ({ onPress, label = 'Emergency', compact = false, style }) => {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.base, compact && styles.compact, style]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name="warning" size={compact ? 18 : 22} color={COLORS.white} />
      {!compact ? <Text style={styles.text}>{label}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.md,
  },
  compact: {
    width: 48,
    height: 48,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  text: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
});
