import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Link } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  const { isAuthenticated, user } = useAppStore();
  
  // Determine destination based on auth state and user role
  let destination = '/(auth)/login';
  if (isAuthenticated && user) {
    destination = user.role === 'driver' ? '/(driver-tabs)/driver-home' : '/(rider-tabs)/rider-home';
  }

  return (
    <View style={styles.container}>
      {/* Premium Dark Background */}
      <View style={styles.backgroundPattern}>
        <View style={styles.accentLine1} />
        <View style={styles.accentLine2} />
        <View style={styles.accentLine3} />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text style={styles.logoLetter}>K</Text>
            </View>
          </View>
          
          <Text style={styles.brandName}>KODA</Text>
          <View style={styles.taglineContainer}>
            <View style={styles.taglineLine} />
            <Text style={styles.tagline}>DRIVE YOUR WAY</Text>
            <View style={styles.taglineLine} />
          </View>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <View style={styles.featureItem}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>Zero Commission</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>100% Earnings</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>Premium Safety</Text>
          </View>
        </View>
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        <Link href={destination} asChild>
          <TouchableOpacity style={styles.ctaButton} activeOpacity={0.9}>
            <Text style={styles.ctaText}>Get Started</Text>
            <View style={styles.ctaArrow}>
              <Text style={styles.ctaArrowText}>→</Text>
            </View>
          </TouchableOpacity>
        </Link>
        
        <Text style={styles.footerText}>Nigeria's Premium Ride Platform</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  backgroundPattern: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  accentLine1: {
    position: 'absolute',
    top: height * 0.1,
    left: -50,
    width: width * 1.5,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.08,
    transform: [{ rotate: '-15deg' }],
  },
  accentLine2: {
    position: 'absolute',
    top: height * 0.3,
    left: -50,
    width: width * 1.5,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.05,
    transform: [{ rotate: '-15deg' }],
  },
  accentLine3: {
    position: 'absolute',
    bottom: height * 0.25,
    left: -50,
    width: width * 1.5,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.08,
    transform: [{ rotate: '15deg' }],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING.huge,
  },
  logoOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.gold,
  },
  logoInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  logoLetter: {
    fontSize: 72,
    fontWeight: '900',
    color: COLORS.accent,
    letterSpacing: -2,
  },
  brandName: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 16,
    marginTop: SPACING.xl,
  },
  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  taglineLine: {
    width: 24,
    height: 1,
    backgroundColor: COLORS.accent,
    opacity: 0.6,
  },
  tagline: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.accent,
    letterSpacing: 4,
  },
  featuresSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    flexWrap: 'wrap',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  featureText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    fontWeight: '500',
  },
  bottomSection: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl + SPACING.md,
    alignItems: 'center',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.full,
    width: '100%',
    maxWidth: 320,
    ...SHADOWS.gold,
  },
  ctaText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: SPACING.sm,
  },
  ctaArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrowText: {
    color: COLORS.accent,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  footerText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    marginTop: SPACING.lg,
    letterSpacing: 1,
  },
});
