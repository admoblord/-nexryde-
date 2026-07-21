/**
 * Connection status indicator — Uber-model quiet chrome.
 * A 2px strip + small tappable dot; NEVER a full-width banner, never blocks controls.
 * Exposure is policy-gated by NetworkStateManager (hysteresis lives there).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type BannerExposure,
  usePlatformConnectionSnapshot,
} from '@/src/services/platformConnectionManager';
import { useDriverSessionStore } from '@/src/store/driverSessionStore';

const STATUS_META: Record<
  Exclude<BannerExposure, 'hidden'>,
  { label: string; color: string }
> = {
  degraded: { label: 'Low Connection', color: '#D97706' },
  reconnecting: { label: 'Reconnecting…', color: '#94A3B8' },
  offline: { label: 'Offline', color: '#EF4444' },
  connected: { label: 'Connected', color: '#22C55E' },
};

const DETAIL_AUTO_HIDE_MS = 4000;

export const OfflineBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const connection = usePlatformConnectionSnapshot();
  const driverPhase = useDriverSessionStore((s) => s.connectionPhase);
  // Suppress network chrome while go-online CONNECTING/session reconnect —
  // map chip already shows session status; avoid dual "Reconnecting" surfaces.
  const exposure =
    driverPhase === 'connecting' || driverPhase === 'reconnecting'
      ? 'hidden'
      : connection.bannerExposure;

  const [detailOpen, setDetailOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Collapse detail whenever status changes or clears.
    setDetailOpen(false);
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, [exposure]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  if (exposure === 'hidden') return null;
  const meta = STATUS_META[exposure];

  const toggleDetail = () => {
    setDetailOpen((open) => {
      const next = !open;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (next) {
        hideTimer.current = setTimeout(() => setDetailOpen(false), DETAIL_AUTO_HIDE_MS);
      }
      return next;
    });
  };

  return (
    <View style={[styles.wrap, { top: insets.top }]} pointerEvents="box-none">
      <View style={[styles.strip, { backgroundColor: meta.color }]} pointerEvents="none" />
      <TouchableOpacity
        style={styles.pill}
        onPress={toggleDetail}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Connection status: ${meta.label}`}
        accessibilityLiveRegion="polite"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.dot, { backgroundColor: meta.color }]} />
        {detailOpen ? <Text style={styles.pillText}>{meta.label}</Text> : null}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  strip: {
    height: 2,
    width: '100%',
    opacity: 0.9,
  },
  pill: {
    position: 'absolute',
    top: 6,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.72)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },
});
