import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
    borderBottomColor: 'rgba(51,65,85,0.45)',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTxt: { fontSize: 13, fontWeight: '900', color: '#022C22', letterSpacing: -0.5 },
  brand: { fontSize: 17, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.5 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.42)',
  },
  pillTxt: { fontSize: 11, fontWeight: '900', color: '#86EFAC', letterSpacing: 1 },
});
