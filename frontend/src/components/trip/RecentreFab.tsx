/** White circular recentre control, bottom-right, floating above the sheet. */
import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, shadow } from '@/src/theme/tokens';

export function RecentreFab({
  onPress,
  bottom = 24,
  style,
  accessibilityLabel = 'Recentre map',
}: {
  onPress: () => void;
  /** Sit above whatever the current sheet height is. */
  bottom?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.pressed, style]}
      hitSlop={8}
    >
      <Ionicons name="locate" size={22} color={colors.navy} />
    </Pressable>
  );
}

const SIZE = 48;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  pressed: { opacity: 0.85 },
});
