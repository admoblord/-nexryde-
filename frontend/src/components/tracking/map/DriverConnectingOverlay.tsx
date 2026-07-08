import React, { memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';

type Props = {
  visible: boolean;
};

/** Shown while live trip is active but driver GPS has not landed yet. */
export const DriverConnectingOverlay = memo(function DriverConnectingOverlay({ visible }: Props) {
  if (!visible) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <ActivityIndicator size="small" color={LIVE.green} />
        <Text style={styles.title}>Connecting to your driver…</Text>
        <Text style={styles.sub}>Live location will appear on the map shortly</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    zIndex: 12,
  },
  card: {
    maxWidth: 320,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(10,16,24,0.88)',
    borderWidth: 1,
    borderColor: LIVE.glassBorder,
  },
  title: {
    color: LIVE.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  sub: {
    color: LIVE.sub,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
