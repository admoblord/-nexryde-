/**
 * Smooth pickup label — cross-fades text updates to avoid flicker.
 * Never renders raw coordinates (engine sanitizes before pass-in).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TextStyle } from 'react-native';
import { safePickupDisplay } from '@/src/services/instantPickupEngine';

type Props = {
  label: string;
  style?: TextStyle;
  numberOfLines?: number;
  detecting?: boolean;
};

export function AnimatedPickupLabel({
  label,
  style,
  numberOfLines = 1,
  detecting,
}: Props) {
  const display = safePickupDisplay(label, detecting);
  const opacity = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState(display);
  const pending = useRef(display);

  useEffect(() => {
    if (display === shown) return;
    pending.current = display;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 90,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setShown(pending.current);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }).start();
    });
  }, [display, shown, opacity]);

  const MAP_PICKUP_PLACEHOLDER = 'Pickup';
  const isDetecting = Boolean(detecting) && !shown;

  return (
    <Animated.Text
      style={[styles.text, isDetecting && styles.detecting, style, { opacity }]}
      numberOfLines={numberOfLines}
      accessibilityLabel={shown || MAP_PICKUP_PLACEHOLDER}
    >
      {shown || MAP_PICKUP_PLACEHOLDER}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  detecting: {
    color: 'rgba(226,232,240,0.85)',
    fontWeight: '500',
  },
});
