import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { COLORS } from '@/src/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Single glowing particle moving upward
const GlowingParticle = ({ 
  delay, 
  startX, 
  duration,
  size,
  color,
}: { 
  delay: number; 
  startX: number; 
  duration: number;
  size: number;
  color: string;
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      progress.value,
      [0, 1],
      [SCREEN_HEIGHT + 50, -100]
    );
    
    const translateX = interpolate(
      progress.value,
      [0, 0.25, 0.5, 0.75, 1],
      [0, Math.sin(startX) * 20, 0, Math.sin(startX) * -15, 0]
    );
    
    const opacity = interpolate(
      progress.value,
      [0, 0.1, 0.5, 0.9, 1],
      [0, 0.8, 1, 0.6, 0]
    );

    const scale = interpolate(
      progress.value,
      [0, 0.5, 1],
      [0.5, 1, 0.3]
    );

    return {
      transform: [
        { translateY },
        { translateX },
        { scale },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: startX,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: size,
        },
        animatedStyle,
      ]}
    />
  );
};

// Light streak moving upward (like road lines)
const LightStreak = ({ 
  delay, 
  startX, 
  duration,
  height,
}: { 
  delay: number; 
  startX: number; 
  duration: number;
  height: number;
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration, easing: Easing.out(Easing.quad) }),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      progress.value,
      [0, 1],
      [SCREEN_HEIGHT + 100, -200]
    );
    
    const opacity = interpolate(
      progress.value,
      [0, 0.1, 0.4, 0.8, 1],
      [0, 0.6, 0.8, 0.3, 0]
    );

    const scaleY = interpolate(
      progress.value,
      [0, 0.3, 0.7, 1],
      [0.2, 1, 1.2, 0.5]
    );

    return {
      transform: [
        { translateY },
        { scaleY },
      ],
      opacity,
    };
  });

  const isGreen = Math.random() > 0.5;

  return (
    <Animated.View
      style={[
        styles.streak,
        {
          left: startX,
          height,
          backgroundColor: isGreen ? COLORS.accentGreen : COLORS.accentBlue,
          shadowColor: isGreen ? COLORS.accentGreen : COLORS.accentBlue,
        },
        animatedStyle,
      ]}
    />
  );
};

// Floating orb with pulsing glow
const FloatingOrb = ({
  x,
  y,
  size,
  color,
  pulseDelay,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  pulseDelay: number;
}) => {
  const pulse = useSharedValue(0);
  const float = useSharedValue(0);

  useEffect(() => {
    pulse.value = withDelay(
      pulseDelay,
      withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
    
    float.value = withDelay(
      pulseDelay * 0.5,
      withRepeat(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.8, 1.2]);
    const translateY = interpolate(float.value, [0, 1], [-10, 10]);
    const opacity = interpolate(pulse.value, [0, 0.5, 1], [0.3, 0.6, 0.3]);

    return {
      transform: [{ scale }, { translateY }],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowRadius: size * 0.8,
        },
        animatedStyle,
      ]}
    />
  );
};

// Main component - Rising particles effect
interface RisingParticlesProps {
  intensity?: 'light' | 'medium' | 'heavy';
  showStreaks?: boolean;
}

export const RisingParticles: React.FC<RisingParticlesProps> = ({ 
  intensity = 'medium',
  showStreaks = true,
}) => {
  const particleCount = intensity === 'light' ? 8 : intensity === 'medium' ? 15 : 25;
  const streakCount = showStreaks ? (intensity === 'light' ? 3 : intensity === 'medium' ? 6 : 10) : 0;
  
  const colors = [
    COLORS.glow1,  // Bright green
    COLORS.glow2,  // Medium green
    COLORS.glow3,  // Blue
    COLORS.glow4,  // Deep blue
    COLORS.glow5,  // Light blue
  ];

  const particles = Array.from({ length: particleCount }, (_, i) => ({
    id: i,
    delay: Math.random() * 5000,
    startX: Math.random() * SCREEN_WIDTH,
    duration: 6000 + Math.random() * 4000,
    size: 4 + Math.random() * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const streaks = Array.from({ length: streakCount }, (_, i) => ({
    id: i,
    delay: Math.random() * 3000,
    startX: Math.random() * SCREEN_WIDTH,
    duration: 4000 + Math.random() * 2000,
    height: 30 + Math.random() * 50,
  }));

  if (Platform.OS === 'web') {
    // Simplified version for web
    return (
      <View style={styles.container} pointerEvents="none">
        {particles.slice(0, Math.floor(particleCount / 2)).map((particle) => (
          <GlowingParticle key={`p-${particle.id}`} {...particle} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {streaks.map((streak) => (
        <LightStreak key={`s-${streak.id}`} {...streak} />
      ))}
      {particles.map((particle) => (
        <GlowingParticle key={`p-${particle.id}`} {...particle} />
      ))}
    </View>
  );
};

// Static background orbs
interface StaticOrbsProps {
  count?: number;
}

export const StaticOrbs: React.FC<StaticOrbsProps> = ({ count = 8 }) => {
  const colors = [
    COLORS.accentGreen,
    COLORS.accentBlue,
    COLORS.accentGreenLight,
    COLORS.accentBlueDark,
  ];

  const orbs = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * (SCREEN_WIDTH - 60),
    y: Math.random() * (SCREEN_HEIGHT - 60),
    size: 20 + Math.random() * 40,
    color: colors[Math.floor(Math.random() * colors.length)],
    pulseDelay: Math.random() * 2000,
  }));

  return (
    <View style={styles.container} pointerEvents="none">
      {orbs.map((orb) => (
        <FloatingOrb key={orb.id} {...orb} />
      ))}
    </View>
  );
};

// Road lines animation (for splash screen)
export const RoadLines: React.FC = () => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const lines = [0, 1, 2, 3, 4];

  return (
    <View style={styles.roadContainer} pointerEvents="none">
      {lines.map((_, index) => {
        const animatedStyle = useAnimatedStyle(() => {
          const baseDelay = index * 0.2;
          const adjustedProgress = (progress.value + baseDelay) % 1;
          
          const translateY = interpolate(
            adjustedProgress,
            [0, 1],
            [SCREEN_HEIGHT * 0.7, -50]
          );
          
          const opacity = interpolate(
            adjustedProgress,
            [0, 0.2, 0.8, 1],
            [0, 1, 1, 0]
          );

          const scaleY = interpolate(
            adjustedProgress,
            [0, 0.5, 1],
            [0.3, 1, 0.5]
          );

          return {
            transform: [{ translateY }, { scaleY }],
            opacity,
          };
        });

        return (
          <Animated.View
            key={index}
            style={[styles.roadLine, animatedStyle]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    shadowOpacity: 0.8,
  },
  streak: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  orb: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
  },
  roadContainer: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 4,
    marginLeft: -2,
    overflow: 'hidden',
  },
  roadLine: {
    position: 'absolute',
    width: 4,
    height: 30,
    backgroundColor: COLORS.white,
    borderRadius: 2,
    left: 0,
  },
});

// Legacy export for backward compatibility
export const FallingRoses = RisingParticles;
export const RosePetalsStatic = StaticOrbs;

export default RisingParticles;
