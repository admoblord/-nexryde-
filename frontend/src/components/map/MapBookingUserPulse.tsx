import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { BOOKING_PERFECT } from '@/src/constants/riderBookingPerfectBrand';

/** Bright blue user/pickup dot with pulse ring (booking spec). */
export function MapBookingUserPulse({ size = 40 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const core = Math.round(size * 0.3);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });

  return (
    <View style={[styles.wrap, { width: size * 1.6, height: size * 1.6 }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            width: core,
            height: core,
            borderRadius: core / 2,
            borderWidth: Math.max(2, Math.round(size * 0.075)),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    backgroundColor: 'rgba(0,102,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,102,255,0.5)',
  },
  dot: {
    backgroundColor: BOOKING_PERFECT.blue,
    borderColor: '#FFFFFF',
    shadowColor: BOOKING_PERFECT.blue,
    shadowOpacity: 0.65,
    shadowRadius: 8,
    elevation: 6,
  },
});
