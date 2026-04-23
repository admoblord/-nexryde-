import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileTokens as t, typography } from '@/src/theme/tokens';

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
      <Ionicons name="warning" size={compact ? 18 : 22} color={t.text.primary} />
      {!compact ? <Text style={styles.text}>{label}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.sm,
    backgroundColor: t.accent.red,
    borderRadius: 28,
    height: 56,
    paddingHorizontal: t.space.xl,
    shadowColor: 'rgba(239,68,68,0.25)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 6,
  },
  compact: {
    width: 48,
    height: 48,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  text: {
    ...typography.h3,
    color: t.text.primary,
  },
});
