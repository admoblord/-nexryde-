import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type TrackingLiveDebug = {
  driverLat: number | null;
  driverLng: number | null;
  lastGpsAt: string | null;
  updateCount: number;
  wsConnected: boolean;
  lastWsAt: string | null;
  markerAnimating: boolean;
  routePoints: number;
  tripId?: string | null;
  tripStatus?: string | null;
  driverId?: string | null;
  riderId?: string | null;
  lastBackendUpdate?: string | null;
  driverAssigned?: boolean;
};

type Props = {
  debug: TrackingLiveDebug;
};

/** Temporary dev overlay — trip sync + live tracking audit. */
export function TrackingLiveDebugPanel({ debug }: Props) {
  if (!__DEV__) return null;

  return (
    <View style={styles.panel} pointerEvents="none">
      <Text style={styles.title}>Trip sync debug</Text>
      <Text style={styles.row}>Trip: {debug.tripId ?? '—'}</Text>
      <Text style={styles.row}>Status: {debug.tripStatus ?? '—'}</Text>
      <Text style={styles.row}>Driver ID: {debug.driverId ?? '—'}</Text>
      <Text style={styles.row}>Rider ID: {debug.riderId ?? '—'}</Text>
      <Text style={styles.row}>Assigned: {debug.driverAssigned ? 'yes' : 'no'}</Text>
      <Text style={styles.row}>Last API: {debug.lastBackendUpdate ?? '—'}</Text>
      <Text style={styles.row}>WS: {debug.wsConnected ? 'connected' : 'disconnected'}</Text>
      <Text style={styles.row}>Driver Lat: {debug.driverLat ?? '—'}</Text>
      <Text style={styles.row}>Driver Lng: {debug.driverLng ?? '—'}</Text>
      <Text style={styles.row}>GPS updates: {debug.updateCount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 8,
    top: 120,
    zIndex: 99,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 220,
  },
  title: {
    color: '#00D9A3',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  row: {
    color: '#E2E8F0',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 14,
  },
});
