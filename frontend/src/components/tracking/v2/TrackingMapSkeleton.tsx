import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SkeletonBlock } from '@/src/components/tracking/v2/SkeletonBlock';
import { TV2_SKELETON } from '@/src/components/tracking/v2/trackingV2Layout';

/** Fixed-height map placeholder — no spinner, no layout collapse. */
export function TrackingMapSkeleton() {
  return (
    <View style={styles.root} accessibilityLabel="Map loading">
      <SkeletonBlock width="100%" height={12} radius={0} style={styles.gridLine} />
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} width="30%" height={48} radius={10} />
        ))}
      </View>
      <View style={styles.route}>
        <SkeletonBlock width={14} height={14} radius={7} />
        <SkeletonBlock width="72%" height={4} radius={2} />
        <SkeletonBlock width={14} height={14} radius={7} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A111C',
    padding: 20,
    justifyContent: 'center',
    gap: 28,
  },
  gridLine: {
    position: 'absolute',
    top: '38%',
    left: 0,
    backgroundColor: TV2_SKELETON.highlight,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    opacity: 0.35,
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    width: '88%',
  },
});
