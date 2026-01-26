import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Redirect } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function SplashScreen() {
  const { isAuthenticated, user } = useAppStore();

  // Immediately redirect based on auth state
  if (isAuthenticated && user) {
    return <Redirect href="/(tabs)/home" />;
  }
  
  return <Redirect href="/(auth)/login" />;
}
