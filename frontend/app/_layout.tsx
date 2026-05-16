// Fix for react-native-google-places-autocomplete web compatibility
import 'react-native-get-random-values';

import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, Platform, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DARK_COLORS, LIGHT_COLORS } from '@/src/constants/theme';
import { bootstrapThemeFromStorage } from '@/src/theme/appearanceTheme';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { LanguageProvider } from '@/src/i18n/LanguageContext';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { useNotifications } from '@/src/hooks/useNotifications';
import { useAppStore } from '@/src/store/appStore';
import React, { useEffect, useRef } from 'react';
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

/**
 * Request App Tracking Transparency permission on iOS 14+.
 * Called once after the app is fully interactive to avoid blocking launch.
 * We don't collect cross-app tracking data, so we request as a best-practice
 * signal to the OS and declare NSPrivacyTracking=false in PrivacyInfo.xcprivacy.
 */
async function requestATTIfNeeded() {
  if (Platform.OS !== 'ios') return;
  try {
    // Dynamic import so Metro doesn't bundle this module on Android
    const TrackingTransparency = await import('expo-tracking-transparency').catch(() => null);
    if (!TrackingTransparency) return;
    const { status } = await TrackingTransparency.getTrackingPermissionsAsync();
    if (status === 'undetermined') {
      await TrackingTransparency.requestTrackingPermissionsAsync();
    }
  } catch {
    // expo-tracking-transparency not installed — safe to ignore
  }
}

export default function RootLayout() {
  const router = useRouter();
  const { user } = useAppStore();
  const attRequested = useRef(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const stackBackground = isDark ? DARK_COLORS.background : LIGHT_COLORS.background;

  // Restore last Light / Dark / Auto choice so hooks + StatusBar match immediately after splash
  useEffect(() => {
    void bootstrapThemeFromStorage();
  }, []);

  // Request ATT on iOS after first render
  useEffect(() => {
    if (attRequested.current) return;
    attRequested.current = true;
    // Small delay so the app is interactive before the system dialog appears
    const t = setTimeout(() => void requestATTIfNeeded(), 2000);
    return () => clearTimeout(t);
  }, []);

  // ── Deep link listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleUrl = (url: string) => {
      // Action deep links (widget / shortcuts) take priority
      const actionKey = extractActionKey(url);
      if (actionKey) {
        const route = ACTION_ROUTES[actionKey];
        if (route) {
          // Driver quick actions — only when a driver session is active
          if (user?.role === 'driver') {
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
  }, [router, user?.id, user?.role]);

  try {
    useNotifications();
    return (
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryProvider>
              <LanguageProvider>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                <OfflineBanner />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: stackBackground },
                    // iOS: use native slide animation; Android: slide up from bottom
                    animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
                    // iOS: gesture-back enabled everywhere
                    gestureEnabled: Platform.OS === 'ios',
                    // iOS: full-height modal sheets with dark handle
                    presentation: 'card',
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade' }} />
                  <Stack.Screen name="(rider-tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="(driver-tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="driver" options={{ headerShown: false }} />
                  <Stack.Screen name="rider" options={{ headerShown: false }} />
                  <Stack.Screen name="assistant" options={{ headerShown: false }} />
                  {/* Modal-style screens — iOS bottom sheet */}
                  <Stack.Screen
                    name="support"
                    options={{
                      headerShown: false,
                      presentation: Platform.OS === 'ios' ? 'modal' : 'card',
                      animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'fade_from_bottom',
                    }}
                  />
                  <Stack.Screen
                    name="driver/bank"
                    options={{
                      headerShown: false,
                      presentation: Platform.OS === 'ios' ? 'modal' : 'card',
                    }}
                  />
                  <Stack.Screen
                    name="driver/withdrawal"
                    options={{
                      headerShown: false,
                      presentation: Platform.OS === 'ios' ? 'modal' : 'card',
                      animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'fade_from_bottom',
                    }}
                  />
                </Stack>
              </LanguageProvider>
            </QueryProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
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
