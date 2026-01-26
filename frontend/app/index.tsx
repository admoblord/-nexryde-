import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, user } = useAppStore();
  const [showManualButton, setShowManualButton] = useState(false);

  useEffect(() => {
    // Auto navigate after 2 seconds
    const timer = setTimeout(() => {
      navigateToNextScreen();
    }, 2000);

    // Show manual button after 4 seconds as fallback
    const fallbackTimer = setTimeout(() => {
      setShowManualButton(true);
    }, 4000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const navigateToNextScreen = () => {
    try {
      if (isAuthenticated && user) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/login');
      }
    } catch (error) {
      console.log('Navigation error:', error);
      setShowManualButton(true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>K</Text>
        </View>
        <Text style={styles.appName}>KODA</Text>
        <Text style={styles.tagline}>Drive Your Way</Text>
      </View>
      
      <View style={styles.footer}>
        {!showManualButton ? (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </>
        ) : (
          <TouchableOpacity 
            style={styles.continueButton}
            onPress={navigateToNextScreen}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  logoText: {
    fontSize: 64,
    fontWeight: '700',
    color: COLORS.white,
  },
  appName: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 8,
  },
  tagline: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.gray400,
    marginTop: SPACING.sm,
  },
  footer: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.gray400,
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.md,
  },
  continueButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 25,
  },
  continueButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
  },
});
