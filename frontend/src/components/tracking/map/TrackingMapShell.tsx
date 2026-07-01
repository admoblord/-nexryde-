import React, { forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  TrackingMap,
  type TrackingMapHandle,
  type TrackingMapProps,
} from '@/src/components/tracking/map/TrackingMap';

/** Map container — 85% of tracking screen height. */
export const TrackingMapShell = forwardRef<TrackingMapHandle, TrackingMapProps>(
  function TrackingMapShell(props, ref) {
    return (
      <View style={styles.shell}>
        <TrackingMap ref={ref} {...props} />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
});
