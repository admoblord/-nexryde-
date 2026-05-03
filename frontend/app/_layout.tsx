// Fix for react-native-google-places-autocomplete web compatibility
import 'react-native-get-random-values';

import { Stack, useRouter } from 'expo-router';
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
import { useAppStore } from '@/src/store/appStore';
import React, { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Referral deep-link key ────────────────────────────────────────────────────
export const REFERRAL_CODE_STORAGE_KEY = '@nexryde_pending_referral';

// ── Action deep-link routes ───────────────────────────────────────────────────
const ACTION_ROUTES: Record<string, string> = {
  go_online: '/(driver-tabs)/driver-home?action=go_online',
  resume:    '/(driver-tabs)/driver-home?action=resume',
  my_trips:  '/(driver-tabs)/driver-trips',
  wallet:    '/(driver-tabs)/driver-earnings',
};

/**
 * Extract a referral identifier from any Nexryde invite URL.
 *
 * Returns:
 *   - username  (lowercase slug, e.g. "funnybony")  for path-based links
 *   - code      (uppercase, e.g. "NXABC12")         for ?code= query links
 *
 * Supported formats:
 *   nexryde://invite/funnybony
 *   https://nexryde.app/invite/funnybony
 *   nexryde://invite?code=NXABC12
 *   https://nexryde.app/invite?code=NXABC12
 */
function extractReferralIdentifier(url: string): string | null {
  try {
    const parsed = Linking.parse(url);

    // ?code= param → treat as an internal referral code (keep uppercase)
    const codeParam = (parsed.queryParams?.code as string | undefined) || '';
    if (codeParam.trim()) return codeParam.trim().toUpperCase();

    // nexryde://invite/{slug} — expo-linking puts the host as `hostname`
    // and the rest as `path`, so pathParts won't contain 'invite'.
    // Handle this case explicitly before the generic path search.
    if (parsed.scheme === 'nexryde' && parsed.hostname === 'invite') {
      const slug = (parsed.path || '').split('/').filter(Boolean)[0];
      if (slug) return slug.toLowerCase();
    }

    // https://nexryde.app/invite/{slug} — full path includes 'invite' segment
    const pathParts = (parsed.path || '').split('/').filter(Boolean);
    const idx = pathParts.indexOf('invite');
    if (idx !== -1 && pathParts[idx + 1]) {
      return pathParts[idx + 1].toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}

async function handleInviteUrl(url: string) {
  const identifier = extractReferralIdentifier(url);
  if (!identifier) return;
  try {
    // First invite wins — don't overwrite once stored
    const existing = await AsyncStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
    if (!existing) {
      await AsyncStorage.setItem(REFERRAL_CODE_STORAGE_KEY, identifier);
    }
  } catch { /* storage unavailable */ }
}

/**
 * Extracts a quick-action key from nexryde://action/{key} URLs.
 * Returns null for any other URL shape.
 */
function extractActionKey(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    // scheme = nexryde, hostname = action (parsed as path on some platforms)
    if (parsed.scheme === 'nexryde') {
      const pathParts = (parsed.path || '').split('/').filter(Boolean);
      // nexryde://action/go_online → path = 'action/go_online'
      if (pathParts[0] === 'action' && pathParts[1]) return pathParts[1];
      // Some parsers put the host in hostname
      if (parsed.hostname === 'action' && pathParts[0]) return pathParts[0];
    }
    return null;
  } catch {
    return null;
  }
}

export default function RootLayout() {
  const router = useRouter();
  const { user } = useAppStore();

  // ── Deep link listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleUrl = (url: string) => {
      // Action deep links (widget / shortcuts) take priority
      const actionKey = extractActionKey(url);
      if (actionKey) {
        const route = ACTION_ROUTES[actionKey];
        if (route) {
          // Only navigate if a driver is logged in
          if (user?.role === 'driver' || !user) {
            router.push(route as any);
          }
          return;
        }
      }
      // Otherwise try as referral invite URL
      void handleInviteUrl(url);
    };

    // Handle the URL that launched the app (cold start / killed state)
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    }).catch(() => {});

    // Handle URLs while app is in foreground / background
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    return () => sub.remove();
  }, [user?.role]);

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
