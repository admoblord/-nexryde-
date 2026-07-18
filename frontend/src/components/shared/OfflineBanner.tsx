/**
 * Offline / poor connection banner — quiet production policy.
 * Shows only Low Connection / Reconnecting / Offline (Connected only after long OFFLINE).
 * Driven by NetworkStateManager.bannerExposure — not every FSM transition.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type BannerExposure,
  usePlatformConnectionSnapshot,
} from '@/src/services/platformConnectionManager';
import { useDriverSessionStore } from '@/src/store/driverSessionStore';

const BANNER_META: Record<
  Exclude<BannerExposure, 'hidden'>,
  { label: string; icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }
> = {
  degraded: {
    label: 'Low Connection',
    icon: 'warning-outline',
    bg: '#713F12',
    fg: '#FEF3C7',
  },
  reconnecting: {
    label: 'Reconnecting',
    icon: 'sync-outline',
    bg: '#1D4ED8',
    fg: '#DBEAFE',
  },
  offline: {
    label: 'Offline',
    icon: 'cloud-offline-outline',
    bg: '#7F1D1D',
    fg: '#FEE2E2',
  },
  connected: {
    label: 'Connected',
    icon: 'checkmark-circle-outline',
    bg: '#064E3B',
    fg: '#D1FAE5',
  },
};

export const OfflineBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const connection = usePlatformConnectionSnapshot();
  const driverPhase = useDriverSessionStore((s) => s.connectionPhase);
  // Suppress network chrome while go-online CONNECTING — avoids Reconnecting banner racing the GO button.
  const exposure =
    driverPhase === 'connecting' ? 'hidden' : connection.bannerExposure;
  const slideY = useRef(new Animated.Value(-52)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bannerH = 44 + Math.max(insets.top, 8);

  const visible = exposure !== 'hidden';
  const meta = exposure === 'hidden' ? BANNER_META.degraded : BANNER_META[exposure];

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
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, slideY, opacity, bannerH, exposure]);

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
      accessibilityLiveRegion="polite"
      accessibilityLabel={visible ? meta.label : undefined}
    >
      {visible ? (
        <View style={styles.row}>
          <Ionicons name={meta.icon} size={16} color={meta.fg} />
          <Text style={[styles.text, { color: meta.fg }]}>{meta.label}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '800',
  },
});
