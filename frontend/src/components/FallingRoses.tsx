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
  
  // Initialize petals
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
        // Reset position
        petal.y.setValue(-50 - Math.random() * 100);
        petal.x.setValue(Math.random() * width);
        petal.rotation.setValue(0);
        
        // Create falling animation
        Animated.parallel([
          // Fall down
          Animated.timing(petal.y, {
            toValue: height + 100,
            duration: petal.duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          // Sway left and right
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
          // Rotate
          Animated.timing(petal.rotation, {
            toValue: 360 * (Math.random() > 0.5 ? 1 : -1),
            duration: petal.duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Loop the animation
          animatePetal();
        });
      };
      
      // Start with delay
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
          {/* Rose Petal Shape */}
          <View style={[styles.petalShape, { backgroundColor: petal.color }]}>
            <View style={[styles.petalInner, { backgroundColor: petal.color }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

// Simple static rose petals for backgrounds
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
    opacity: 0.1 + Math.random() * 0.2,
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

// Decorative rose corner accent
export const RoseCornerAccent: React.FC<{ position?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }> = ({ 
  position = 'topRight' 
}) => {
  const positionStyles: any = {
    topLeft: { top: -20, left: -20 },
    topRight: { top: -20, right: -20 },
    bottomLeft: { bottom: -20, left: -20 },
    bottomRight: { bottom: -20, right: -20 },
  };
  
  return (
    <View style={[styles.cornerAccent, positionStyles[position]]} pointerEvents="none">
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.cornerPetal,
            {
              transform: [
                { rotate: `${i * 72}deg` },
                { translateX: 15 + i * 5 },
              ],
              opacity: 0.15 + i * 0.05,
              backgroundColor: PETAL_COLORS[i % PETAL_COLORS.length],
            },
          ]}
        />
      ))}
    </View>
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
    width: 100,
    height: 100,
  },
  cornerPetal: {
    position: 'absolute',
    width: 20,
    height: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 16,
  },
});

export default FallingRoses;
