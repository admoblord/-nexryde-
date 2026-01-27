import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Image, TouchableOpacity } from 'react-native';
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
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { RisingParticles, StaticOrbs } from '@/src/components/FallingRoses';

const { width, height } = Dimensions.get('window');

// Logo URL from user's asset
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_affd49f8-f851-4509-aa94-b5f7631db9ce/artifacts/k4t25xoz_%20NEXRYDE.jpeg';

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
    logoOpacity.value = withDelay(500, withTiming(1, { duration: 800 }));
    logoScale.value = withDelay(500, withTiming(1, { duration: 1000, easing: Easing.out(Easing.back(1.2)) }));
    contentOpacity.value = withDelay(1200, withTiming(1, { duration: 600 }));
    buttonOpacity.value = withDelay(1800, withTiming(1, { duration: 600 }));
    
    // Continuous glow
    glowPulse.value = withDelay(2000, withRepeat(
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
    opacity: interpolate(glowPulse.value, [0, 1], [0.2, 0.5]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.2]) }],
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
      
      {/* Glow behind logo */}
      <Animated.View style={[styles.glowContainer, glowStyle]}>
        <LinearGradient
          colors={['transparent', COLORS.accentGreen + '20', COLORS.accentBlue + '20', 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Logo */}
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <Image
            source={{ uri: LOGO_URL }}
            style={styles.logo}
            resizeMode="contain"
          />
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
                <Text style={styles.arrow}>→</Text>
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
  glowContainer: {
    position: 'absolute',
    top: height * 0.1,
    left: 0,
    right: 0,
    height: 300,
  },
  glowGradient: {
    flex: 1,
    borderRadius: 150,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  logoContainer: {
    width: width * 0.75,
    height: 100,
    marginBottom: SPACING.xl,
  },
  logo: {
    width: '100%',
    height: '100%',
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
  arrow: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
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
