/**
 * V2 action row — Call · Chat · Share Trip · SOS.
 * Four equal glass tiles; SOS gets the red treatment.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TV2, glassCard } from '@/src/components/tracking/v2/trackingV2Theme';
import { TV2_LAYOUT } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  callEnabled: boolean;
  onCall: () => void;
  onChat: () => void;
  onShare: () => void;
  onSos: () => void;
};

function ActionButtonsCardV2Inner({ callEnabled, onCall, onChat, onShare, onSos }: Props) {
  const tap = (fn: () => void, heavy = false) => () => {
    if (Platform.OS !== 'web') {
      void (heavy
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
        : Haptics.selectionAsync());
    }
    fn();
  };

  return (
    <View style={styles.card}>
      <ActionTile
        icon="call"
        label="Call"
        color={TV2.green}
        disabled={!callEnabled}
        onPress={tap(onCall)}
      />
      <View style={styles.sep} />
      <ActionTile icon="chatbubble-ellipses" label="Chat" color={TV2.green} onPress={tap(onChat)} />
      <View style={styles.sep} />
      <ActionTile icon="share-social" label="Share Trip" color={TV2.blue} onPress={tap(onShare)} />
      <View style={styles.sep} />
      <ActionTile icon="alert-circle" label="SOS" color={TV2.red} sos onPress={tap(onSos, true)} />
    </View>
  );
}

function ActionTile({
  icon,
  label,
  color,
  onPress,
  disabled,
  sos,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  sos?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tile, disabled && styles.tileOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.tileIcon, sos && styles.tileIconSos]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <Text style={[styles.tileLbl, sos && { color: TV2.red }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export const ActionButtonsCardV2 = memo(ActionButtonsCardV2Inner);

const styles = StyleSheet.create({
  card: {
    ...glassCard,
    flexDirection: 'row',
    alignItems: 'stretch',
    height: TV2_LAYOUT.actionCard,
    paddingVertical: 11,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  tile: { flex: 1, alignItems: 'center', gap: 6 },
  tileOff: { opacity: 0.4 },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: TV2.tile,
    borderWidth: 1,
    borderColor: TV2.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconSos: {
    backgroundColor: TV2.redSoft,
    borderColor: 'rgba(255,82,82,0.4)',
  },
  tileLbl: { fontSize: 10.5, fontWeight: '800', color: TV2.sub },
  sep: { width: 1, backgroundColor: TV2.hairline, marginVertical: 6 },
});
