import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';

/** Full-screen map placeholder — fixed footprint, no layout jump. */
function LiveTrackingSkeletonInner() {
  return <View style={styles.map} />;
}

export const LiveTrackingSkeleton = memo(LiveTrackingSkeletonInner);

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: LIVE.mapBg,
  },
});
