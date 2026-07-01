import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HYBRID, HYBRID_BTN_SECONDARY_H } from '@/src/constants/nexrydeHybridBrand';

type Props = {
  side: 'left' | 'right';
  bottom: number;
  left?: number;
  right?: number;
  onRecenter?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onTrafficToggle?: () => void;
  trafficOn?: boolean;
  showTraffic?: boolean;
};

function FabBtn({
  icon,
  onPress,
  color,
  bg,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color: string;
  bg: string;
}) {
  if (!onPress) return null;
  return (
    <TouchableOpacity style={[styles.fab, { backgroundColor: bg }]} onPress={onPress} activeOpacity={0.88}>
      <Ionicons name={icon} size={22} color={color} />
    </TouchableOpacity>
  );
}

export function NexrydeMapFloatingControls({
  side,
  bottom,
  left,
  right,
  onRecenter,
  onZoomIn,
  onZoomOut,
  onTrafficToggle,
  trafficOn,
  showTraffic,
}: Props) {
  const pos = side === 'left' ? { left: left ?? 12, bottom } : { right: right ?? 12, bottom };

  return (
    <View style={[styles.col, pos]} pointerEvents="box-none">
      {showTraffic ? (
        <FabBtn
          icon={trafficOn ? 'layers' : 'layers-outline'}
          onPress={onTrafficToggle}
          color={HYBRID.text}
          bg="rgba(26,31,46,0.94)"
        />
      ) : null}
      {onRecenter ? (
        <FabBtn icon="locate" onPress={onRecenter} color={HYBRID.navy} bg={HYBRID.teal} />
      ) : null}
      {(onZoomIn || onZoomOut) && (
        <View style={styles.zoomStack}>
          <FabBtn icon="add" onPress={onZoomIn} color={HYBRID.text} bg="rgba(26,31,46,0.94)" />
          <View style={styles.divider} />
          <FabBtn icon="remove" onPress={onZoomOut} color={HYBRID.text} bg="rgba(26,31,46,0.94)" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { position: 'absolute', zIndex: 11, gap: 10, alignItems: 'center' },
  fab: {
    width: HYBRID_BTN_SECONDARY_H,
    height: HYBRID_BTN_SECONDARY_H,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: HYBRID.border,
  },
  zoomStack: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: HYBRID.border,
  },
  divider: { height: 1, backgroundColor: HYBRID.border },
});
