import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Image, Platform } from 'react-native';
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
import { RisingParticles, StaticOrbs, RoadLines } from '@/src/components/FallingRoses';
import { TouchableOpacity } from 'react-native';

const { width, height } = Dimensions.get('window');

// Logo URL from user's asset
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_affd49f8-f851-4509-aa94-b5f7631db9ce/artifacts/k4t25xoz_%20NEXRYDE.jpeg';

export default function SplashScreen() {
  const router = useRouter();
  
  // Animation values
  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const sloganOpacity = useSharedValue(0);
  const featuresOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0.9);
  const pulseGlow = useSharedValue(0);

  useEffect(() => {
    // Logo animation
    logoOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
    logoScale.value = withDelay(300, withTiming(1, { duration: 1000, easing: Easing.out(Easing.back(1.5)) }));
    
    // Text animations
    textOpacity.value = withDelay(800, withTiming(1, { duration: 600 }));
    sloganOpacity.value = withDelay(1200, withTiming(1, { duration: 600 }));
    featuresOpacity.value = withDelay(1600, withTiming(1, { duration: 600 }));
    
    // Button animation
    buttonOpacity.value = withDelay(2000, withTiming(1, { duration: 600 }));
    buttonScale.value = withDelay(2000, withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.2)) }));
    
    // Continuous pulse glow
    pulseGlow.value = withDelay(2500, withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    ));
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: interpolate(textOpacity.value, [0, 1], [20, 0]) }],
  }));

  const sloganAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sloganOpacity.value,
    transform: [{ translateY: interpolate(sloganOpacity.value, [0, 1], [15, 0]) }],
  }));

  const featuresAnimatedStyle = useAnimatedStyle(() => ({
    opacity: featuresOpacity.value,
    transform: [{ translateY: interpolate(featuresOpacity.value, [0, 1], [20, 0]) }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: buttonScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseGlow.value, [0, 1], [0.3, 0.7]),
    transform: [{ scale: interpolate(pulseGlow.value, [0, 1], [1, 1.1]) }],
  }));

  const handleBeginJourney = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={['#0D1420', '#19253F', '#0D1420']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      {/* Background Orbs */}
      <StaticOrbs count={10} />
      
      {/* Rising Particles */}
      <RisingParticles intensity="medium" showStreaks={true} />
      
      {/* Glow effect behind logo */}
      <Animated.View style={[styles.logoGlow, glowAnimatedStyle]}>
        <LinearGradient
          colors={['transparent', COLORS.accentGreen + '30', COLORS.accentBlue + '30', 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Logo Section */}
        <Animated.View style={[styles.logoSection, logoAnimatedStyle]}>
          <View style={styles.logoContainer}>
            <Image
              source={{ uri: LOGO_URL }}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={[styles.taglineSection, sloganAnimatedStyle]}>
          <View style={styles.taglineBadge}>
            <View style={[styles.taglineDot, { backgroundColor: COLORS.accentGreen }]} />
            <Text style={styles.taglineText}>RIDE SMART. RIDE SAFE.</Text>
            <View style={[styles.taglineDot, { backgroundColor: COLORS.accentBlue }]} />
          </View>
          <Text style={styles.subtitleText}>Nigeria's Smartest Ride Platform</Text>
        </Animated.View>

        {/* Features */}
        <Animated.View style={[styles.featuresSection, featuresAnimatedStyle]}>
          <View style={styles.featureRow}>
            <FeatureBadge 
              icon="●" 
              text="Zero Commission" 
              color={COLORS.accentGreen}
            />
            <View style={styles.featureDivider} />
            <FeatureBadge 
              icon="●" 
              text="100% Earnings" 
              color={COLORS.accentBlue}
            />
            <View style={styles.featureDivider} />
            <FeatureBadge 
              icon="●" 
              text="Premium Safety" 
              color={COLORS.accentGreenLight}
            />
          </View>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View style={[styles.buttonSection, buttonAnimatedStyle]}>
          <TouchableOpacity 
            style={styles.ctaButton}
            onPress={handleBeginJourney}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaButtonText}>Begin Your Journey</Text>
              <View style={styles.arrowContainer}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Bottom Text */}
        <View style={styles.bottomSection}>
          <Text style={styles.bottomText}>RIDE SMART • RIDE SAFE</Text>
        </View>
      </View>
    </View>
  );
}

// Feature badge component
const FeatureBadge = ({ 
  icon, 
  text, 
  color 
}: { 
  icon: string; 
  text: string; 
  color: string;
}) => (
  <View style={styles.featureBadge}>
    <Text style={[styles.featureIcon, { color }]}>{icon}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  logoGlow: {
    position: 'absolute',
    top: height * 0.15,
    left: width * 0.1,
    right: width * 0.1,
    height: 300,
    borderRadius: 150,
    overflow: 'hidden',
  },
  glowGradient: {
    flex: 1,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: width * 0.7,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  taglineSection: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: SPACING.md,
  },
  taglineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taglineText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    letterSpacing: 3,
    marginHorizontal: SPACING.md,
  },
  subtitleText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.md,
    fontWeight: '400',
  },
  featuresSection: {
    marginBottom: SPACING.xxl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
  },
  featureIcon: {
    fontSize: 8,
    marginRight: SPACING.xs,
  },
  featureText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  featureDivider: {
    width: 1,
    height: 16,
    backgroundColor: COLORS.textMuted,
    marginHorizontal: SPACING.sm,
  },
  buttonSection: {
    width: '100%',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  ctaButton: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  ctaButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    marginRight: SPACING.md,
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(25, 37, 63, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  bottomSection: {
    position: 'absolute',
    bottom: SPACING.xxl,
    alignItems: 'center',
  },
  bottomText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.xs,
    letterSpacing: 2,
    fontWeight: '500',
  },
});
