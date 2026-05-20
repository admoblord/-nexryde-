/**
 * Floating map chrome for premium map-first rider tracking.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type RiderTrackingMapChromeProps = {
  topInset: number;
  padH: number;
  onBack: () => void;
  onMenu: () => void;
  /** Center title e.g. "On trip" during in-ride phase */
  phaseLabel?: string | null;
};

export function RiderTrackingMapChrome({
  topInset,
  padH,
  onBack,
  onMenu,
  phaseLabel,
}: RiderTrackingMapChromeProps) {
  return (
    <View
      style={[styles.wrap, { paddingTop: topInset + 8, paddingHorizontal: padH }]}
      pointerEvents="box-none"
    >
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.pill}
          onPress={onBack}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#F8FAFC" />
        </TouchableOpacity>

        {phaseLabel ? (
          <View style={styles.phasePill} pointerEvents="none">
            <Text style={styles.phaseTxt}>{phaseLabel}</Text>
          </View>
        ) : (
          <View style={styles.spacer} />
        )}

        <TouchableOpacity
          style={styles.pill}
          onPress={onMenu}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Trip menu"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#F8FAFC" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function RiderTrackingRecenterButton({
  bottom,
  right,
  onPress,
}: {
  bottom: number;
  right: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.recenter, { bottom, right }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="Center map on driver"
    >
      <Ionicons name="locate" size={22} color="#F8FAFC" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spacer: { flex: 1 },
  phasePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  phaseTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 0.3,
  },
  pill: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
    }),
  },
  recenter: {
    position: 'absolute',
    zIndex: 38,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 8 },
    }),
  },
});
