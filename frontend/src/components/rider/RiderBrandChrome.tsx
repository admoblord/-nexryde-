import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { BRAND } from '@/src/constants/designSystem';
import { useThemeColors } from '@/src/constants/theme';

/** Matches rider booking / search chrome — NX badge, NEXRYDE wordmark, RIDER pill. */
export function RiderBrandHeaderRow({ topInset }: { topInset: number }) {
  const { colors, isDark } = useThemeColors();
  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: topInset + 8,
          backgroundColor: isDark ? 'rgba(2,6,23,0.98)' : colors.card,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.left}>
        <View style={styles.logo}>
          <Text style={styles.logoTxt}>NX</Text>
        </View>
        <Text style={[styles.brand, { color: colors.text }]}>NEXRYDE</Text>
      </View>
      <View style={styles.pill}>
        <Text style={styles.pillTxt}>RIDER</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: BRAND.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTxt: { fontSize: 12, fontWeight: '900', color: BRAND.textInverse, letterSpacing: -0.4 },
  brand: { fontSize: 16, fontWeight: '900', letterSpacing: 0.6 },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: BRAND.primaryMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,225,128,0.42)',
  },
  pillTxt: { fontSize: 10, fontWeight: '900', color: BRAND.primaryLight, letterSpacing: 1.1 },
});
