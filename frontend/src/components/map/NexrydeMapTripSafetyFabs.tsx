import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  top: number;
  right: number;
  onEmergency?: () => void;
  onShare?: () => void;
  onCall?: () => void;
  onNavigate?: () => void;
};

function Fab({
  icon,
  onPress,
  bg,
  color,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  bg: string;
  color: string;
  label: string;
}) {
  if (!onPress) return null;
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={color} />
    </TouchableOpacity>
  );
}

/** Top-right trip safety & actions (emergency, share, call, navigate). */
export function NexrydeMapTripSafetyFabs({ top, right, onEmergency, onShare, onCall, onNavigate }: Props) {
  const hasAny = onEmergency || onShare || onCall || onNavigate;
  if (!hasAny) return null;

  return (
    <View style={[styles.col, { top, right }]} pointerEvents="box-none">
      {onEmergency ? (
        <Fab icon="warning" onPress={onEmergency} bg="rgba(127,29,29,0.92)" color="#FCA5A5" label="Emergency" />
      ) : null}
      {onShare ? (
        <Fab icon="share-social" onPress={onShare} bg="rgba(30,58,138,0.9)" color="#BFDBFE" label="Share trip" />
      ) : null}
      {onCall ? (
        <Fab icon="call" onPress={onCall} bg="rgba(6,78,59,0.9)" color="#6EE7B7" label="Call" />
      ) : null}
      {onNavigate ? (
        <Fab icon="navigate" onPress={onNavigate} bg="rgba(0,217,163,0.92)" color="#0F1419" label="Navigate" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    position: 'absolute',
    zIndex: 28,
    gap: 10,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
