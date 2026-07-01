/**
 * Driver full-map — right floating actions (chat, earnings).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HYBRID, HYBRID_BTN_SECONDARY_H } from '@/src/constants/nexrydeHybridBrand';

type Props = {
  bottom: number;
  right: number;
  unread: number;
  onChat: () => void;
  onEarnings: () => void;
};

export function DriverMapHybridSideFabs({ bottom, right, unread, onChat, onEarnings }: Props) {
  return (
    <View style={[styles.col, { bottom, right }]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.fab}
        onPress={onChat}
        activeOpacity={0.88}
        accessibilityLabel="Messages and notifications"
        accessibilityRole="button"
      >
        <LinearGradient colors={[HYBRID.blue, '#0047B3']} style={styles.fabGrad}>
          <Ionicons name="chatbubble-ellipses" size={24} color={HYBRID.text} />
        </LinearGradient>
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.fab}
        onPress={onEarnings}
        activeOpacity={0.88}
        accessibilityLabel="Earnings and stats"
        accessibilityRole="button"
      >
        <LinearGradient colors={[HYBRID.blue, '#0047B3']} style={styles.fabGrad}>
          <Ionicons name="stats-chart" size={24} color={HYBRID.text} />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  col: { position: 'absolute', zIndex: 12, gap: 10, alignItems: 'center' },
  fab: {
    width: HYBRID_BTN_SECONDARY_H,
    height: HYBRID_BTN_SECONDARY_H,
    borderRadius: 16,
    overflow: 'visible',
    shadowColor: HYBRID.blue,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabGrad: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: HYBRID.navy,
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: HYBRID.text },
});
