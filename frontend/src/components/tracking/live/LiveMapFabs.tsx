import React, { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';
import { LIVE_LAYOUT } from '@/src/components/tracking/live/liveTrackingLayout';
import { colors, alpha, shadow } from '@/src/theme/tokens';

type Props = {
  bottomOffset: number;
  onSos: () => void;
  onRecenter: () => void;
  onToggleLayers: () => void;
  trafficOn: boolean;
};

function LiveMapFabsInner({ bottomOffset, onSos, onRecenter, onToggleLayers, trafficOn }: Props) {
  return (
    <View style={[styles.col, { bottom: bottomOffset }]} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.fab, styles.sosFab]}
        onPress={onSos}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Emergency SOS"
      >
        <Ionicons name="warning" size={22} color={alpha.white} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.fab}
        onPress={onRecenter}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
      >
        <Ionicons name="locate" size={21} color={colors.navy} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.fab, trafficOn && styles.fabActive]}
        onPress={onToggleLayers}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Toggle map traffic layer"
      >
        <Ionicons name="layers" size={21} color={trafficOn ? colors.textOnGreen : colors.navy} />
      </TouchableOpacity>
    </View>
  );
}

export const LiveMapFabs = memo(LiveMapFabsInner);

const styles = StyleSheet.create({
  col: {
    position: 'absolute',
    right: LIVE_LAYOUT.fabRight,
    zIndex: 45,
    gap: LIVE_LAYOUT.fabGap,
    alignItems: 'center',
  },
  fab: {
    width: LIVE_LAYOUT.fabSize,
    height: LIVE_LAYOUT.fabSize,
    borderRadius: LIVE_LAYOUT.fabSize / 2,
    backgroundColor: LIVE.glass,
    borderWidth: 1,
    borderColor: LIVE.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  fabActive: {
    backgroundColor: LIVE.green,
    borderColor: LIVE.greenBright,
  },
  sosFab: {
    backgroundColor: LIVE.red,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
