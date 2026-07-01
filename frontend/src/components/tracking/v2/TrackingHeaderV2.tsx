/**
 * V2 floating header — circular back button, branded "NEXRYDE TRACKING"
 * pill in the centre, circular menu button on the right.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TV2 } from '@/src/components/tracking/v2/trackingV2Theme';

type Props = {
  topInset: number;
  onBack: () => void;
  onMenu: () => void;
};

export function TrackingHeaderV2({ topInset, onBack, onMenu }: Props) {
  const tap = (fn: () => void) => () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    fn();
  };

  return (
    <View style={[styles.row, { top: topInset + 8 }]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.circleBtn}
        onPress={tap(onBack)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={21} color={TV2.text} />
      </TouchableOpacity>

      <View style={styles.brandPill}>
        <View style={styles.brandIcon}>
          <Ionicons name="car-sport" size={14} color={TV2.greenInk} />
        </View>
        <Text style={styles.brandTxt}>
          NEXRYDE <Text style={styles.brandTxtGreen}>TRACKING</Text>
        </Text>
      </View>

      <TouchableOpacity
        style={styles.circleBtn}
        onPress={tap(onMenu)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Trip options"
      >
        <Ionicons name="ellipsis-vertical" size={19} color={TV2.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: TV2.edge,
    right: TV2.edge,
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: TV2.glass,
    borderWidth: 1,
    borderColor: TV2.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: TV2.radiusPill,
    backgroundColor: TV2.glass,
    borderWidth: 1,
    borderColor: TV2.glassBorder,
    shadowColor: TV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  brandIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: TV2.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTxt: {
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: TV2.text,
  },
  brandTxtGreen: { color: TV2.green },
});
