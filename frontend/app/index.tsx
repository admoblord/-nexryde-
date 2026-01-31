import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated, Platform, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getUserSession, isUserLoggedIn } from '@/utils/authStorage';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');

// Premium Color Palette
const COLORS = {
  background: '#020617',
  primary: '#0F172A',
  green: '#22C55E',
  greenLight: '#4ADE80',
  greenBright: '#00FF7F',
  blue: '#3B82F6',
  blueDark: '#1D4ED8',
  purple: '#8B5CF6',
  white: '#FFFFFF',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
};

export default function SplashScreen() {
  const router = useRouter();
  const { setUser, setIsAuthenticated } = useAppStore();
  const [checking, setChecking] = useState(true);
  
  // Start with visible values for web compatibility, animate on mobile
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 30)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 🔐 CHECK FOR SAVED LOGIN ON APP START
  useEffect(() => {
    checkSavedLogin();
  }, []);

  const checkSavedLogin = async () => {
    try {
      console.log('🔍 Checking for saved login session...');
      
      const isLoggedIn = await isUserLoggedIn();
      
      if (isLoggedIn) {
        const userData = await getUserSession();
        
        if (userData) {
          console.log('✅ Found saved login! Auto-logging in...');
          console.log('User:', userData.name, '| Role:', userData.role);
          
          // Restore user state
          setUser(userData);
          setIsAuthenticated(true);
          
          // Navigate to appropriate home screen
          setTimeout(() => {
            if (userData.role === 'driver') {
              router.replace('/(driver-tabs)/driver-home');
            } else {
              router.replace('/(rider-tabs)/rider-home');
            }
          }, 1000); // Small delay for smooth transition
          
          return;
        }
      }
      
      console.log('ℹ️ No saved login found. Showing splash screen.');
      setChecking(false);
    } catch (error) {
      console.error('❌ Error checking saved login:', error);
      setChecking(false);
    }
  };

  useEffect(() => {
    // Entry animation (only on mobile)
    if (Platform.OS !== 'web') {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // Pulse animation for glow effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Animated Glow Effects */}
      <Animated.View style={[styles.glowTop, { transform: [{ scale: pulseAnim }] }]} />
      <Animated.View style={[styles.glowBottom, { transform: [{ scale: pulseAnim }] }]} />
      <View style={styles.glowCenter} />

      {/* Main Content */}
      <Animated.View 
        style={[
          styles.mainContent,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
          }
        ]}
      >
        {/* Logo Section */}
        <View style={styles.logoSection}>
          {/* N Logo with Road - Premium Design */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[COLORS.greenBright, COLORS.green]}
              style={styles.logoLeft}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
            <LinearGradient
              colors={[COLORS.blue, COLORS.blueDark]}
              style={styles.logoRight}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />
            <View style={styles.roadLine}>
              <View style={styles.roadDash} />
              <View style={styles.roadDash} />
              <View style={styles.roadDash} />
            </View>
            {/* Glow effect on logo */}
            <View style={styles.logoGlow} />
          </View>
          
          {/* Brand Name - Bigger & Bolder */}
          <View style={styles.brandContainer}>
            <Text style={styles.brandNex}>NEX</Text>
            <Text style={styles.brandRyde}>RYDE</Text>
          </View>

          {/* Tagline Badge */}
          <View style={styles.taglineBadge}>
            <View style={[styles.taglineDot, { backgroundColor: COLORS.green }]} />
            <Text style={styles.taglineText}>RIDE SMART. RIDE SAFE.</Text>
            <View style={[styles.taglineDot, { backgroundColor: COLORS.blue }]} />
          </View>
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>Nigeria's #1 Ride-Hailing Platform</Text>

        {/* Features Row - More Visible */}
        <View style={styles.featuresContainer}>
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.green + '30' }]}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.green} />
            </View>
            <Text style={styles.featureText}>Verified{'\n'}Drivers</Text>
          </View>
          
          <View style={styles.featureDivider} />
          
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.blue + '30' }]}>
              <Ionicons name="cash" size={20} color={COLORS.blue} />
            </View>
            <Text style={styles.featureText}>Fair{'\n'}Pricing</Text>
          </View>
          
          <View style={styles.featureDivider} />
          
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.purple + '30' }]}>
              <Ionicons name="flash" size={20} color={COLORS.purple} />
            </View>
            <Text style={styles.featureText}>Fast{'\n'}Pickup</Text>
          </View>
        </View>

        {/* CTA Button - Premium Design */}
        <View style={styles.buttonContainer}>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity activeOpacity={0.9} style={styles.buttonWrapper}>
              <LinearGradient
                colors={[COLORS.greenLight, COLORS.green, COLORS.blue]}
                style={styles.ctaButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.ctaText}>Begin Your Journey</Text>
                <View style={styles.arrowCircle}>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Secondary Options */}
        <View style={styles.secondaryOptions}>
          <TouchableOpacity style={styles.secondaryButton}>
            <Ionicons name="car" size={18} color={COLORS.textSecondary} />
            <Text style={styles.secondaryText}>Become a Driver</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Bottom Branding */}
      <View style={styles.bottomContainer}>
        <Text style={styles.bottomText}>POWERED BY ADMOBLORDGROUP</Text>
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
    top: height * 0.1,
    left: width * 0.1,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: COLORS.green,
    opacity: 0.15,
  },
  glowBottom: {
    position: 'absolute',
    bottom: height * 0.2,
    right: width * 0.05,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.blue,
    opacity: 0.12,
  },
  glowCenter: {
    position: 'absolute',
    top: height * 0.35,
    left: width * 0.3,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.purple,
    opacity: 0.08,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: 100,
    height: 100,
    position: 'relative',
    marginBottom: 20,
  },
  logoLeft: {
    position: 'absolute',
    left: 8,
    top: 0,
    width: 38,
    height: 100,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    transform: [{ skewX: '-8deg' }],
  },
  logoRight: {
    position: 'absolute',
    right: 8,
    top: 0,
    width: 38,
    height: 100,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    transform: [{ skewX: '8deg' }],
  },
  roadLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2.5,
    top: 15,
    bottom: 15,
    width: 5,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  roadDash: {
    width: 5,
    height: 12,
    backgroundColor: COLORS.white,
    borderRadius: 2.5,
  },
  logoGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 20,
    backgroundColor: COLORS.green,
    opacity: 0.15,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNex: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 3,
  },
  brandRyde: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.green,
    letterSpacing: 3,
  },
  taglineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 16,
    gap: 12,
  },
  taglineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taglineText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 40,
    letterSpacing: 0.5,
  },
  featuresContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
    gap: 16,
  },
  featureItem: {
    alignItems: 'center',
    gap: 8,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  featureDivider: {
    width: 1,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: 8,
  },
  buttonWrapper: {
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 32,
  },
  ctaText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
    marginRight: 16,
    letterSpacing: 0.5,
  },
  arrowCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryOptions: {
    marginTop: 24,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  secondaryText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomText: {
    color: COLORS.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '600',
  },
});
