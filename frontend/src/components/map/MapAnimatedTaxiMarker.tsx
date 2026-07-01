import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MAP } from '@/src/constants/nexrydeMapBehavior';

type Props = {
  size?: number;
  searchMode?: boolean;
};

/** Yellow taxi marker with gentle float animation (booking / request). */
export function MapAnimatedTaxiMarker({ size = 32, searchMode }: Props) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const box = size;
  const icon = Math.round(size * 0.44);

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateY: float.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -4],
            }),
          },
        ],
      }}
    >
      <View
        style={[
          styles.taxi,
          {
            width: box,
            height: box,
            borderRadius: box / 2,
            backgroundColor: searchMode ? MAP.driverTaxi : 'rgba(250,204,21,0.92)',
          },
        ]}
      >
        <Ionicons name="car-sport" size={icon} color={searchMode ? '#0F1419' : '#422006'} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  taxi: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
});
