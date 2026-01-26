import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Redirect } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function SplashScreen() {
  const { isAuthenticated, user } = useAppStore();

  // On web, redirect immediately
  if (Platform.OS === 'web') {
    if (isAuthenticated && user) {
      return <Redirect href="/(tabs)/home" />;
    }
    return <Redirect href="/(auth)/login" />;
  }

  // On native, show splash screen (native handles splash screen differently)
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
