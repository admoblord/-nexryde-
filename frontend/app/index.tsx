import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { FallingRoses, RosePetalsStatic } from '@/src/components/FallingRoses';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const { isAuthenticated, user } = useAppStore();
  
  let destination = '/(auth)/login';
  if (isAuthenticated && user) {
    destination = user.role === 'driver' ? '/(driver-tabs)/driver-home' : '/(rider-tabs)/rider-home';
  }

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={['#1A0A0F', '#0D0508', '#1A0A0F']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      {/* Static Rose Petals Background */}
      <RosePetalsStatic count={20} />
      
      {/* Falling Rose Petals Animation */}
      <FallingRoses intensity="medium" />
      
      {/* Decorative Lines */}
      <View style={styles.decorativeLines}>
        <View style={styles.line1} />
        <View style={styles.line2} />
        <View style={styles.line3} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          {/* Outer Glow Ring */}
          <View style={styles.logoGlow}>
            <View style={styles.logoOuter}>
              <View style={styles.logoInner}>
                <Text style={styles.logoLetter}>K</Text>
              </View>
            </View>
          </View>
          
          {/* Brand Name */}
          <Text style={styles.brandName}>KODA</Text>
          
          {/* Elegant Tagline */}
          <View style={styles.taglineContainer}>
            <View style={styles.taglineRose} />
            <Text style={styles.tagline}>ELEGANCE IN MOTION</Text>
            <View style={styles.taglineRose} />
          </View>
          
          {/* Subtitle */}
          <Text style={styles.subtitle}>Nigeria's Premium Ride Experience</Text>
        </View>

        {/* Features with Rose Accents */}
        <View style={styles.featuresSection}>
          <View style={styles.featureItem}>
            <View style={styles.featurePetal} />
            <Text style={styles.featureText}>Zero Commission</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <View style={styles.featurePetal} />
            <Text style={styles.featureText}>100% Earnings</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <View style={styles.featurePetal} />
            <Text style={styles.featureText}>Premium Safety</Text>
          </View>
        </View>
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        <Link href={destination} asChild>
          <TouchableOpacity style={styles.ctaButton} activeOpacity={0.85}>
            <LinearGradient
              colors={[COLORS.accent, COLORS.accentDark]}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.ctaText}>Begin Your Journey</Text>
              <View style={styles.ctaArrow}>
                <Text style={styles.ctaArrowText}>→</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Link>
        
        {/* Elegant Footer */}
        <View style={styles.footerContainer}>
          <View style={styles.footerLine} />
          <Text style={styles.footerText}>WHERE LUXURY MEETS THE ROAD</Text>
          <View style={styles.footerLine} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  decorativeLines: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  line1: {
    position: 'absolute',
    top: height * 0.15,
    left: -100,
    width: width * 2,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.06,
    transform: [{ rotate: '-20deg' }],
  },
  line2: {
    position: 'absolute',
    top: height * 0.4,
    left: -100,
    width: width * 2,
    height: 1,
    backgroundColor: COLORS.gold,
    opacity: 0.04,
    transform: [{ rotate: '-20deg' }],
  },
  line3: {
    position: 'absolute',
    bottom: height * 0.3,
    left: -100,
    width: width * 2,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.06,
    transform: [{ rotate: '15deg' }],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    zIndex: 10,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  logoGlow: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(201, 169, 166, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoOuter: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.rose,
  },
  logoInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.accentLight,
  },
  logoLetter: {
    fontSize: 80,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: -3,
  },
  brandName: {
    fontSize: FONT_SIZE.display,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 20,
    marginTop: SPACING.xl,
    textShadowColor: 'rgba(201, 169, 166, 0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  taglineRose: {
    width: 8,
    height: 10,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 8,
    transform: [{ rotate: '-45deg' }],
    opacity: 0.8,
  },
  tagline: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    letterSpacing: 2,
  },
  featuresSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featurePetal: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal2,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
  },
  featureText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  featureDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.accent,
    opacity: 0.3,
    marginHorizontal: SPACING.md,
  },
  bottomSection: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl + SPACING.md,
    alignItems: 'center',
    zIndex: 10,
  },
  ctaButton: {
    width: '100%',
    maxWidth: 320,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg + 2,
    paddingHorizontal: SPACING.xxl,
  },
  ctaText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: SPACING.md,
    letterSpacing: 1,
  },
  ctaArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrowText: {
    color: COLORS.accent,
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
  },
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },
  footerLine: {
    width: 30,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.3,
  },
  footerText: {
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 3,
  },
});
