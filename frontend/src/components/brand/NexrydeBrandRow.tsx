import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { NexrydeLogo } from '@/src/components/brand/NexrydeLogo';
import { NexrydeWordmark } from '@/src/components/brand/NexrydeWordmark';
import type { NexrydeBrandTheme } from '@/src/constants/nexrydeBrand';

type Props = {
  theme?: NexrydeBrandTheme;
  padH?: number;
  topInset?: number;
  right?: React.ReactNode;
  style?: ViewStyle;
  showBorder?: boolean;
};

/**
 * Unified header row: logo + NEXRYDE (no role pills, no alternate NX/split marks).
 */
export function NexrydeBrandRow({
  theme = 'light',
  padH = 16,
  topInset = 0,
  right,
  style,
  showBorder = false,
}: Props) {
  const isDark = theme === 'dark';

  return (
    <View
      style={[
        styles.wrap,
        isDark ? styles.wrapDark : styles.wrapLight,
        showBorder && (isDark ? styles.borderDark : styles.borderLight),
        { paddingTop: topInset + 10, paddingHorizontal: padH },
        style,
      ]}
    >
      <View style={styles.left}>
        <NexrydeLogo />
        <NexrydeWordmark theme={theme} />
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  wrapLight: {
    backgroundColor: '#FFFFFF',
  },
  wrapDark: {
    backgroundColor: 'rgba(2,6,23,0.98)',
  },
  borderLight: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  borderDark: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(51,65,85,0.45)',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
