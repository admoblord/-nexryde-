import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';

const { width, height } = Dimensions.get('window');

// Simple particle component
const Particle = ({ x, y, size, color, delay }: { x: number; y: number; size: number; color: string; delay: number }) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  
  useEffect(() => {
    opacity.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(0.8, { duration: 2000 }),
        withTiming(0, { duration: 2000 })
      ),
      -1,
      false
    ));
    translateY.value = withDelay(delay, withRepeat(
      withTiming(-100, { duration: 4000 }),
      -1,
      false
    ));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
};

export default function SplashScreen() {
  const router = useRouter();
  
  // Animation values
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const contentOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
    logoScale.value = withDelay(300, withTiming(1, { duration: 1000, easing: Easing.out(Easing.back(1.2)) }));
    contentOpacity.value = withDelay(1000, withTiming(1, { duration: 600 }));
    buttonOpacity.value = withDelay(1600, withTiming(1, { duration: 600 }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: interpolate(contentOpacity.value, [0, 1], [30, 0]) }],
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: interpolate(buttonOpacity.value, [0, 1], [0.9, 1]) }],
  }));

  const handleBeginJourney = () => {
    router.push('/(auth)/login');
  };

  // Generate particles
  const particles = [
    { x: 30, y: 100, size: 8, color: '#3AD173', delay: 0 },
    { x: width - 60, y: 150, size: 6, color: '#3A8CD1', delay: 500 },
    { x: 80, y: 300, size: 5, color: '#80EE50', delay: 1000 },
    { x: width - 100, y: 400, size: 7, color: '#5BA3E0', delay: 1500 },
    { x: 50, y: 500, size: 6, color: '#3AD173', delay: 2000 },
    { x: width - 80, y: 600, size: 8, color: '#3A8CD1', delay: 2500 },
  ];

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#0D1420', '#19253F', '#0F1729']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      {/* Particles */}
      {particles.map((p, i) => (
        <Particle key={i} {...p} />
      ))}

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Logo Section */}
        <Animated.View style={[styles.logoSection, logoStyle]}>
          {/* Stylized N Logo */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={['#80EE50', '#3AD173']}
              style={styles.logoLeft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <LinearGradient
              colors={['#3A8CD1', '#1A5AA6']}
              style={styles.logoRight}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.roadLine}>
              <View style={styles.roadDash} />
              <View style={styles.roadDash} />
              <View style={styles.roadDash} />
            </View>
          </View>
          
          {/* Brand Name */}
          <View style={styles.brandContainer}>
            <Text style={styles.brandNex}>NEX</Text>
            <Text style={styles.brandRyde}>RYDE</Text>
          </View>
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={[styles.taglineContainer, contentStyle]}>
          <View style={styles.taglineBadge}>
            <View style={[styles.dot, { backgroundColor: '#3AD173' }]} />
            <Text style={styles.taglineText}>RIDE SMART. RIDE SAFE.</Text>
            <View style={[styles.dot, { backgroundColor: '#3A8CD1' }]} />
          </View>
          <Text style={styles.subtitle}>Nigeria's Smartest Ride Platform</Text>
        </Animated.View>

        {/* Features Row */}
        <Animated.View style={[styles.featuresRow, contentStyle]}>
          <View style={styles.featureItem}>
            <View style={[styles.featureDot, { backgroundColor: '#3AD173' }]} />
            <Text style={styles.featureText}>Zero Commission</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <View style={[styles.featureDot, { backgroundColor: '#3A8CD1' }]} />
            <Text style={styles.featureText}>100% Earnings</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <View style={[styles.featureDot, { backgroundColor: '#80EE50' }]} />
            <Text style={styles.featureText}>Premium Safety</Text>
          </View>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.buttonContainer, buttonStyle]}>
          <TouchableOpacity onPress={handleBeginJourney} activeOpacity={0.9}>
            <LinearGradient
              colors={['#80EE50', '#3AD173', '#3A8CD1']}
              style={styles.ctaButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaText}>Begin Your Journey</Text>
              <View style={styles.arrowCircle}>
                <Ionicons name="arrow-forward" size={18} color="#19253F" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Bottom Text */}
      <View style={styles.bottomContainer}>
        <Text style={styles.bottomText}>RIDE SMART • RIDE SAFE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1420',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    position: 'relative',
    marginBottom: 16,
  },
  logoLeft: {
    position: 'absolute',
    left: 5,
    top: 0,
    width: 32,
    height: 80,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    transform: [{ skewX: '-8deg' }],
  },
  logoRight: {
    position: 'absolute',
    right: 5,
    top: 0,
    width: 32,
    height: 80,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    transform: [{ skewX: '8deg' }],
  },
  roadLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: 12,
    bottom: 12,
    width: 4,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  roadDash: {
    width: 4,
    height: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNex: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  brandRyde: {
    fontSize: 40,
    fontWeight: '800',
    color: '#3AD173',
    letterSpacing: 2,
  },
  taglineContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taglineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginHorizontal: 16,
  },
  subtitle: {
    color: '#A8B8D0',
    fontSize: 15,
    fontWeight: '400',
  },
  featuresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 48,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  featureText: {
    color: '#A8B8D0',
    fontSize: 13,
    fontWeight: '500',
  },
  featureDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#6B7A94',
    marginHorizontal: 16,
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: 16,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 30,
  },
  ctaText: {
    color: '#19253F',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 16,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(25, 37, 63, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 58,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomText: {
    color: '#6B7A94',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '500',
  },
});
