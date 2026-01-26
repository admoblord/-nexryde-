import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, user } = useAppStore();

  const navigateNext = useCallback(() => {
    const destination = isAuthenticated && user ? '/(tabs)/home' : '/(auth)/login';
    
    // On web, use direct URL navigation as a reliable fallback
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = destination;
      return;
    }
    
    // On native, use router
    try {
      router.replace(destination);
    } catch (error) {
      console.log('Router error:', error);
    }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    // Auto-navigate after 2 seconds
    const timer = setTimeout(() => {
      navigateNext();
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigateNext]);

  return (
    <Pressable style={styles.container} onPress={navigateNext}>
      <View style={styles.logoContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>K</Text>
        </View>
        <Text style={styles.appName}>KODA</Text>
        <Text style={styles.tagline}>Drive Your Way</Text>
      </View>
      
      <View style={styles.footer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
        <Text style={styles.tapHint}>Tap anywhere to continue</Text>
      </View>
    </Pressable>
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
  tapHint: {
    color: COLORS.primary,
    marginTop: SPACING.lg,
    fontSize: FONT_SIZE.sm,
  },
});
