import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';

type Props = {
  style?: ViewStyle | ViewStyle[];
};

/**
 * Lightweight skeleton pulse for low-end devices (no SVG). Prefer over spinners for layout placeholders.
 */
export function SkeletonBlock({ style }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.45],
  });

  return (
    <Animated.View style={[styles.base, { opacity }, style]} />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(148, 163, 184, 0.5)',
    overflow: 'hidden',
  },
});
