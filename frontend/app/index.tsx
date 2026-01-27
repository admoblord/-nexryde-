import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// Colors based on NEXRYDE logo
const COLORS = {
  background: '#0D1420',
  primary: '#19253F',
  green: '#3AD173',
  greenLight: '#80EE50',
  blue: '#3A8CD1',
  blueDark: '#1A5AA6',
  white: '#FFFFFF',
  textSecondary: '#A8B8D0',
  textMuted: '#6B7A94',
};

export default function SplashScreen() {
  const router = useRouter();

  const handleBeginJourney = () => {
    router.push('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* Background */}
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Decorative Glow */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          {/* N Logo with Road */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[COLORS.greenLight, COLORS.green]}
              style={styles.logoLeft}
            />
            <LinearGradient
              colors={[COLORS.blue, COLORS.blueDark]}
              style={styles.logoRight}
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
        </View>

        {/* Tagline */}
        <View style={styles.taglineContainer}>
          <View style={styles.taglineBadge}>
            <View style={[styles.dot, { backgroundColor: COLORS.green }]} />
            <Text style={styles.taglineText}>RIDE SMART. RIDE SAFE.</Text>
            <View style={[styles.dot, { backgroundColor: COLORS.blue }]} />
          </View>
          <Text style={styles.subtitle}>Nigeria's Smartest Ride Platform</Text>
        </View>

        {/* Features Row */}
        <View style={styles.featuresRow}>
          <View style={styles.featureItem}>
            <View style={[styles.featureDot, { backgroundColor: COLORS.green }]} />
            <Text style={styles.featureText}>Zero Commission</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <View style={[styles.featureDot, { backgroundColor: COLORS.blue }]} />
            <Text style={styles.featureText}>100% Earnings</Text>
          </View>
          <View style={styles.featureDivider} />
          <View style={styles.featureItem}>
            <View style={[styles.featureDot, { backgroundColor: COLORS.greenLight }]} />
            <Text style={styles.featureText}>Premium Safety</Text>
          </View>
        </View>

        {/* CTA Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleBeginJourney} activeOpacity={0.9}>
            <LinearGradient
              colors={[COLORS.greenLight, COLORS.green, COLORS.blue]}
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
        </View>
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
    backgroundColor: COLORS.background,
  },
  glowTop: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.green,
    opacity: 0.15,
  },
  glowBottom: {
    position: 'absolute',
    bottom: 150,
    right: 30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.blue,
    opacity: 0.1,
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
    backgroundColor: COLORS.white,
    borderRadius: 2,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNex: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 2,
  },
  brandRyde: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.green,
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
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginHorizontal: 16,
  },
  subtitle: {
    color: COLORS.textSecondary,
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
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  featureDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.textMuted,
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
    color: COLORS.primary,
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
    color: COLORS.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '500',
  },
});
