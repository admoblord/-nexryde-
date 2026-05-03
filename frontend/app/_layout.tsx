// Fix for react-native-google-places-autocomplete web compatibility
import 'react-native-get-random-values';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '@/src/constants/theme';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { LanguageProvider } from '@/src/i18n/LanguageContext';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { useNotifications } from '@/src/hooks/useNotifications';
import React, { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Referral deep-link key ────────────────────────────────────────────────────
export const REFERRAL_CODE_STORAGE_KEY = '@nexryde_pending_referral';

/**
 * Extract referral code from any Nexryde invite URL:
 *   nexryde://invite?code=NEXJOS157
 *   https://nexryde.app/invite?code=NEXJOS157
 *   https://nexryde.app/invite/NEXJOS157
 */
function extractReferralCode(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    // Query param ?code=...
    const code = (parsed.queryParams?.code as string | undefined) || '';
    if (code.trim()) return code.trim().toUpperCase();
    // Path segment  /invite/NEXJOS157
    const pathParts = (parsed.path || '').split('/').filter(Boolean);
    const idx = pathParts.indexOf('invite');
    if (idx !== -1 && pathParts[idx + 1]) return pathParts[idx + 1].toUpperCase();
    return null;
  } catch {
    return null;
  }
}

async function handleInviteUrl(url: string) {
  const code = extractReferralCode(url);
  if (!code) return;
  try {
    // Only store if no code already pending (first wins)
    const existing = await AsyncStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
    if (!existing) {
      await AsyncStorage.setItem(REFERRAL_CODE_STORAGE_KEY, code);
    }
  } catch { /* storage unavailable */ }
}

export default function RootLayout() {
  // ── Deep link listener ──────────────────────────────────────────────────────
  useEffect(() => {
    // Handle the URL that launched the app (cold start / killed state)
    Linking.getInitialURL().then((url) => {
      if (url) void handleInviteUrl(url);
    }).catch(() => {});

    // Handle URLs while app is in foreground / background
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleInviteUrl(url);
    });
    return () => sub.remove();
  }, []);

  try {
    useNotifications();
    return (
      <ErrorBoundary>
        <QueryProvider>
          <LanguageProvider>
            <GestureHandlerRootView style={styles.container}>
              <SafeAreaProvider>
                <StatusBar style="light" />
                <OfflineBanner />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: COLORS.background },
                    animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(rider-tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="(driver-tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="driver" options={{ headerShown: false }} />
                  <Stack.Screen name="rider" options={{ headerShown: false }} />
                  <Stack.Screen name="assistant" options={{ headerShown: false }} />
                </Stack>
              </SafeAreaProvider>
            </GestureHandlerRootView>
          </LanguageProvider>
        </QueryProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    console.error('🚨 CRITICAL ERROR IN ROOT LAYOUT:', error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          App Failed to Load
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
          Please restart the app. If this persists, reinstall the app.
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
