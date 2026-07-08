/**
 * Offline / poor connection banner shown at the top of screens when network is unavailable.
 * Animates in/out with a smooth slide + fade.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type PlatformConnectionState,
  usePlatformConnectionSnapshot,
} from '@/src/services/platformConnectionManager';

const BANNER_META: Record<
  PlatformConnectionState,
  { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }
> = {
  CONNECTED: {
    label: 'Connected',
    icon: 'checkmark-circle-outline',
    bg: '#064E3B',
    fg: '#D1FAE5',
  },
  DEGRADED: {
    label: 'Weak Connection',
    icon: 'warning-outline',
    bg: '#713F12',
    fg: '#FEF3C7',
  },
  RECONNECTING: {
    label: 'Reconnecting...',
    icon: 'sync-outline',
    bg: '#1D4ED8',
    fg: '#DBEAFE',
  },
  OFFLINE: {
    label: 'Offline',
    icon: 'cloud-offline-outline',
    bg: '#7F1D1D',
    fg: '#FEE2E2',
  },
};

export const OfflineBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const connection = usePlatformConnectionSnapshot();
  const slideY = useRef(new Animated.Value(-52)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bannerH = 44 + Math.max(insets.top, 8);
  const visible = true;
  const meta = BANNER_META[connection.state];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: visible ? 0 : -bannerH,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, slideY, opacity, bannerH]);

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: meta.bg,
          height: bannerH,
          paddingTop: Math.max(insets.top, 8),
          transform: [{ translateY: slideY }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons name={meta.icon} size={16} color={meta.fg} />
      <Text style={[styles.text, { color: meta.fg }]}>{meta.label}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 9999,
  },
  text: {
    fontSize: 13,
    fontWeight: '800',
  },
});
