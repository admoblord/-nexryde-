/**
 * Full-bleed lifestyle photo for splash / onboarding — Uber-style classy hero.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Animated,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  /** Soft ken-burns drift for presence */
  animate?: boolean;
};

export function OnboardingPhotoHero({ source, style, animate = true }: Props) {
  const scale = useRef(new Animated.Value(1.06)).current;

  useEffect(() => {
    if (!animate) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.1,
          duration: 12000,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 12000,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, scale]);

  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ scale }] }]}>
        <Image source={source} style={styles.image} resizeMode="cover" />
      </Animated.View>
      {/* Top brand readability */}
      <LinearGradient
        colors={['rgba(7,12,22,0.55)', 'rgba(7,12,22,0.12)', 'transparent']}
        locations={[0, 0.35, 1]}
        style={styles.topFade}
      />
      {/* Bottom copy / CTA plane — deeper wash so warm hero faces stay readable */}
      <LinearGradient
        colors={[
          'transparent',
          'rgba(7,12,22,0.28)',
          'rgba(7,12,22,0.78)',
          'rgba(7,12,22,0.97)',
        ]}
        locations={[0, 0.28, 0.62, 1]}
        style={styles.bottomFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D1420',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '32%',
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
  },
});
