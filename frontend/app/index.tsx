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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { RisingParticles, StaticOrbs } from '@/src/components/FallingRoses';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  
  // Animation values
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const contentOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const glowPulse = useSharedValue(0);

  useEffect(() => {
    // Animate in sequence
    logoOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
    logoScale.value = withDelay(300, withTiming(1, { duration: 1000, easing: Easing.out(Easing.back(1.2)) }));
    contentOpacity.value = withDelay(1000, withTiming(1, { duration: 600 }));
    buttonOpacity.value = withDelay(1600, withTiming(1, { duration: 600 }));
    
    // Continuous glow
    glowPulse.value = withDelay(1800, withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    ));
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

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.2, 0.4]),
  }));

  const handleBeginJourney = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#0D1420', '#19253F', '#0F1729']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      
      {/* Background Effects */}
      <StaticOrbs count={8} />
      <RisingParticles intensity="medium" showStreaks={false} />

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Logo Section */}
        <Animated.View style={[styles.logoSection, logoStyle]}>
          {/* Stylized N Logo with Road */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[COLORS.accentGreenLight, COLORS.accentGreen]}
              style={styles.logoLeftPart}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <LinearGradient
              colors={[COLORS.accentBlue, COLORS.accentBlueDark]}
              style={styles.logoRightPart}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            {/* Road Line */}
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
            <View style={[styles.dot, { backgroundColor: COLORS.accentGreen }]} />
            <Text style={styles.taglineText}>RIDE SMART. RIDE SAFE.</Text>
            <View style={[styles.dot, { backgroundColor: COLORS.accentBlue }]} />
          </View>
          <Text style={styles.subtitle}>Nigeria's Smartest Ride Platform</Text>
        </Animated.View>

        {/* Features Row */}
        <Animated.View style={[styles.featuresRow, contentStyle]}>
          <FeatureItem color={COLORS.accentGreen} text="Zero Commission" />
          <View style={styles.featureDivider} />
          <FeatureItem color={COLORS.accentBlue} text="100% Earnings" />
          <View style={styles.featureDivider} />
          <FeatureItem color={COLORS.accentGreenLight} text="Premium Safety" />
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.buttonContainer, buttonStyle]}>
          <TouchableOpacity onPress={handleBeginJourney} activeOpacity={0.9}>
            <LinearGradient
              colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.ctaButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaText}>Begin Your Journey</Text>
              <View style={styles.arrowCircle}>
                <Ionicons name="arrow-forward" size={18} color={COLORS.primary} />
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

const FeatureItem = ({ color, text }: { color: string; text: string }) => (
  <View style={styles.featureItem}>
    <View style={[styles.featureDot, { backgroundColor: color }]} />
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    position: 'relative',
    marginBottom: SPACING.md,
  },
  logoLeftPart: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 35,
    height: 80,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    transform: [{ skewX: '-10deg' }],
  },
  logoRightPart: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 35,
    height: 80,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    transform: [{ skewX: '10deg' }],
  },
  roadLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: 10,
    bottom: 10,
    width: 4,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  roadDash: {
    width: 4,
    height: 12,
    backgroundColor: COLORS.white,
    borderRadius: 2,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNex: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 2,
  },
  brandRyde: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.accentGreen,
    letterSpacing: 2,
  },
  taglineContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: SPACING.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taglineText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    letterSpacing: 2,
    marginHorizontal: SPACING.md,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.md,
    fontWeight: '400',
  },
  featuresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: SPACING.xs,
  },
  featureText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  featureDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.textMuted,
    marginHorizontal: SPACING.md,
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: SPACING.md,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderRadius: 30,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  ctaText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    marginRight: SPACING.md,
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
    bottom: SPACING.xxl + 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.xs,
    letterSpacing: 2,
    fontWeight: '500',
  },
});
