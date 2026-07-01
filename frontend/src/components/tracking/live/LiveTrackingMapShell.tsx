import React, { forwardRef, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LiveTrackingMap, type LiveTrackingMapHandle, type LiveTrackingMapProps } from './LiveTrackingMap';

export const LiveTrackingMapShell = memo(
  forwardRef<LiveTrackingMapHandle, LiveTrackingMapProps>(
    function LiveTrackingMapShell(props, ref) {
      return (
        <View style={styles.shell}>
          <LiveTrackingMap ref={ref} {...props} />
        </View>
      );
    },
  ),
);

const styles = StyleSheet.create({
  shell: { flex: 1, width: '100%', overflow: 'hidden' },
});
