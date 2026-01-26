import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { COLORS } from '../constants/theme';

const { width, height } = Dimensions.get('window');

interface RosePetal {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  rotation: Animated.Value;
  scale: number;
  color: string;
  delay: number;
  duration: number;
  swayAmount: number;
}

interface FallingRosesProps {
  intensity?: 'light' | 'medium' | 'heavy';
  style?: any;
}

const PETAL_COLORS = [
  COLORS.rosePetal1,
  COLORS.rosePetal2,
  COLORS.rosePetal3,
  COLORS.rosePetal4,
  COLORS.rosePetal5,
];

export const FallingRoses: React.FC<FallingRosesProps> = ({ 
  intensity = 'medium',
  style 
}) => {
  const petalCounts = { light: 8, medium: 15, heavy: 25 };
  const count = petalCounts[intensity];
  
  const petalsRef = useRef<RosePetal[]>([]);
  
  if (petalsRef.current.length === 0) {
    for (let i = 0; i < count; i++) {
      petalsRef.current.push({
        id: i,
        x: new Animated.Value(Math.random() * width),
        y: new Animated.Value(-50 - Math.random() * 200),
        rotation: new Animated.Value(0),
        scale: 0.4 + Math.random() * 0.6,
        color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
        delay: Math.random() * 3000,
        duration: 8000 + Math.random() * 6000,
        swayAmount: 30 + Math.random() * 50,
      });
    }
  }
  
  useEffect(() => {
    const animations = petalsRef.current.map((petal) => {
      const animatePetal = () => {
        petal.y.setValue(-50 - Math.random() * 100);
        petal.x.setValue(Math.random() * width);
        petal.rotation.setValue(0);
        
        Animated.parallel([
          Animated.timing(petal.y, {
            toValue: height + 100,
            duration: petal.duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.sequence([
            ...Array(6).fill(null).map((_, i) => 
              Animated.timing(petal.x, {
                toValue: petal.x._value + (i % 2 === 0 ? petal.swayAmount : -petal.swayAmount),
                duration: petal.duration / 6,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              })
            ),
          ]),
          Animated.timing(petal.rotation, {
            toValue: 360 * (Math.random() > 0.5 ? 1 : -1),
            duration: petal.duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]).start(() => {
          animatePetal();
        });
      };
      
      const timeout = setTimeout(animatePetal, petal.delay);
      return () => clearTimeout(timeout);
    });
    
    return () => {
      animations.forEach(cleanup => cleanup && cleanup());
    };
  }, []);
  
  return (
    <View style={[styles.container, style]} pointerEvents="none">
      {petalsRef.current.map((petal) => (
        <Animated.View
          key={petal.id}
          style={[
            styles.petal,
            {
              transform: [
                { translateX: petal.x },
                { translateY: petal.y },
                { rotate: petal.rotation.interpolate({
                  inputRange: [0, 360],
                  outputRange: ['0deg', '360deg'],
                })},
                { scale: petal.scale },
              ],
            },
          ]}
        >
          <View style={[styles.petalShape, { backgroundColor: petal.color }]}>
            <View style={[styles.petalInner, { backgroundColor: petal.color }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

// Floating rose bloom animation
export const FloatingRoseBloom: React.FC<{ style?: any }> = ({ style }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.2,
            duration: 3000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 3000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.8,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(rotation, {
          toValue: 360,
          duration: 20000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start(() => {
        rotation.setValue(0);
        animate();
      });
    };
    animate();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.bloomContainer, 
        style,
        {
          transform: [
            { scale },
            { rotate: rotation.interpolate({
              inputRange: [0, 360],
              outputRange: ['0deg', '360deg'],
            })},
          ],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <View
          key={i}
          style={[
            styles.bloomPetal,
            {
              transform: [{ rotate: `${i * 45}deg` }, { translateY: -20 }],
              backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length],
            },
          ]}
        />
      ))}
      <View style={styles.bloomCenter} />
    </Animated.View>
  );
};

// Rose border decoration
export const RoseBorder: React.FC<{ position: 'top' | 'bottom'; style?: any }> = ({ position, style }) => {
  return (
    <View style={[styles.borderContainer, position === 'top' ? styles.borderTop : styles.borderBottom, style]} pointerEvents="none">
      {Array(12).fill(null).map((_, i) => (
        <View
          key={i}
          style={[
            styles.borderPetal,
            {
              left: `${(i / 12) * 100}%`,
              backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length],
              opacity: 0.15 + (i % 3) * 0.05,
              transform: [
                { rotate: `${-45 + Math.random() * 20}deg` },
                { scale: 0.5 + Math.random() * 0.3 },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

// Pulsing rose glow effect
export const RoseGlow: React.FC<{ size?: number; color?: string; style?: any }> = ({ 
  size = 200, 
  color = COLORS.rosePetal3,
  style 
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.3,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.5,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => animate());
    };
    animate();
  }, []);

  return (
    <Animated.View
      style={[
        styles.glowContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        },
        style,
      ]}
      pointerEvents="none"
    />
  );
};

// Scattered static petals for backgrounds
export const RosePetalsStatic: React.FC<{ count?: number; style?: any }> = ({ 
  count = 12, 
  style 
}) => {
  const petals = Array(count).fill(null).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    rotation: Math.random() * 360,
    scale: 0.3 + Math.random() * 0.5,
    color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
    opacity: 0.08 + Math.random() * 0.12,
  }));
  
  return (
    <View style={[styles.staticContainer, style]} pointerEvents="none">
      {petals.map((petal) => (
        <View
          key={petal.id}
          style={[
            styles.staticPetal,
            {
              left: `${petal.x}%`,
              top: `${petal.y}%`,
              transform: [
                { rotate: `${petal.rotation}deg` },
                { scale: petal.scale },
              ],
              opacity: petal.opacity,
            },
          ]}
        >
          <View style={[styles.petalShape, { backgroundColor: petal.color }]}>
            <View style={[styles.petalInner, { backgroundColor: petal.color }]} />
          </View>
        </View>
      ))}
    </View>
  );
};

// Rose corner accent
export const RoseCornerAccent: React.FC<{ 
  position?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  size?: number;
}> = ({ position = 'topRight', size = 80 }) => {
  const positionStyles: any = {
    topLeft: { top: -size/3, left: -size/3 },
    topRight: { top: -size/3, right: -size/3 },
    bottomLeft: { bottom: -size/3, left: -size/3 },
    bottomRight: { bottom: -size/3, right: -size/3 },
  };
  
  return (
    <View style={[styles.cornerAccent, positionStyles[position], { width: size, height: size }]} pointerEvents="none">
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.cornerPetal,
            {
              transform: [
                { rotate: `${i * 72}deg` },
                { translateX: size * 0.2 + i * 3 },
              ],
              opacity: 0.1 + i * 0.04,
              backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length],
              width: size * 0.25,
              height: size * 0.3,
            },
          ]}
        />
      ))}
    </View>
  );
};

// Animated rose ring
export const RoseRing: React.FC<{ size?: number; style?: any }> = ({ size = 150, style }) => {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 360,
        duration: 30000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <Animated.View 
      style={[
        styles.ringContainer,
        { 
          width: size, 
          height: size,
          transform: [{ rotate: rotation.interpolate({
            inputRange: [0, 360],
            outputRange: ['0deg', '360deg'],
          })}],
        },
        style,
      ]}
      pointerEvents="none"
    >
      {Array(8).fill(null).map((_, i) => (
        <View
          key={i}
          style={[
            styles.ringPetal,
            {
              position: 'absolute',
              left: size/2 - 8,
              top: 0,
              transform: [
                { rotate: `${i * 45}deg` },
                { translateY: size * 0.1 },
              ],
              backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length],
              opacity: 0.3,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 1,
  },
  petal: {
    position: 'absolute',
    width: 24,
    height: 24,
  },
  petalShape: {
    width: 24,
    height: 28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 20,
    transform: [{ rotate: '-45deg' }],
  },
  petalInner: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 10,
    height: 12,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    opacity: 0.6,
  },
  staticContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  staticPetal: {
    position: 'absolute',
    width: 30,
    height: 30,
  },
  cornerAccent: {
    position: 'absolute',
  },
  cornerPetal: {
    position: 'absolute',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 16,
  },
  bloomContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloomPetal: {
    position: 'absolute',
    width: 16,
    height: 22,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 14,
  },
  bloomCenter: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.gold,
  },
  borderContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 30,
    flexDirection: 'row',
  },
  borderTop: {
    top: 0,
  },
  borderBottom: {
    bottom: 0,
  },
  borderPetal: {
    position: 'absolute',
    width: 16,
    height: 20,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 14,
  },
  glowContainer: {
    position: 'absolute',
  },
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPetal: {
    width: 16,
    height: 20,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 14,
  },
});

export default FallingRoses;
