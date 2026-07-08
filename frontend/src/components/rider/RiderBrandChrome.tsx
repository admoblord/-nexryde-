import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { BRAND, SURFACE } from '@/src/constants/designSystem';

/** Matches rider booking / search chrome — NX badge, NEXRYDE wordmark, RIDER pill. */
export function RiderBrandHeaderRow({ topInset }: { topInset: number }) {
  return (
    <View style={[styles.wrap, { paddingTop: topInset + 8 }]}>
      <View style={styles.left}>
        <View style={styles.logo}>
          <Text style={styles.logoTxt}>NX</Text>
        </View>
        <Text style={styles.brand}>NEXRYDE</Text>
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
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: 'rgba(2,6,23,0.98)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.hairline,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTxt: { fontSize: 13, fontWeight: '900', color: BRAND.textInverse, letterSpacing: -0.5 },
  brand: { fontSize: 17, fontWeight: '900', color: BRAND.textPrimary, letterSpacing: 0.5 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: BRAND.primaryMuted,
    borderWidth: 1,
    borderColor: 'rgba(34,225,128,0.42)',
  },
  pillTxt: { fontSize: 11, fontWeight: '900', color: BRAND.primaryLight, letterSpacing: 1 },
});
