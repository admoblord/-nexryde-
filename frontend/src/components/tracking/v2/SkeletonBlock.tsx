import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { TV2_SKELETON } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: ViewStyle;
};

export function SkeletonBlock({ width = '100%', height, radius = 8, style }: Props) {
  return (
    <View
      style={[
        styles.block,
        { width, height, borderRadius: radius },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: TV2_SKELETON.base,
  },
});
