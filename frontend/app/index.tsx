import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { COLORS, SPACING, FONT_SIZE } from '../src/constants/theme';

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, user } = useAppStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isReady) {
      if (isAuthenticated && user) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [isReady, isAuthenticated, user]);

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
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
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
});
