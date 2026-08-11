// Fix for react-native-google-places-autocomplete web compatibility
import 'react-native-get-random-values';

import { enableFreeze, enableScreens } from 'react-native-screens';
// Freeze inactive tab screens so switches stay instant (pairs with freezeOnBlur).
enableScreens(true);
enableFreeze(true);

import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useThemeColors } from '@/src/constants/theme';
import { bootstrapThemeFromStorage, persistThemePreference } from '@/src/theme/appearanceTheme';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { RiderSessionEffects } from '@/src/components/rider/RiderSessionEffects';
import { LanguageProvider } from '@/src/i18n/LanguageContext';
import { ErrorToastProvider } from '@/src/components/shared/ErrorToast';
import { QueryProvider } from '@/src/providers/QueryProvider';
import { useNotifications } from '@/src/hooks/useNotifications';
import { useDriverOfferBackgroundAlert } from '@/src/hooks/useDriverOfferBackgroundAlert';
import { useOfflineQueueFlush } from '@/src/hooks/useOfflineQueueFlush';
import { useConnectivityRecovery } from '@/src/hooks/useConnectivityRecovery';
import { useAppStore } from '@/src/store/appStore';
import React, { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerLoginNavigator } from '@/src/utils/sessionRefresh';
import { safeReplace } from '@/src/utils/navigationSafe';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { warmBackendConnection } from '@/src/utils/warmBackend';
import { initSentry, wrapWithSentry, installGlobalErrorHandler } from '@/src/utils/sentry';
import { initializeOfflineMode } from '@/src/services/offlineMode';
import { getUserPreferences } from '@/src/services/api';

// Initialize crash reporting as early as possible — before the root component
// mounts — so startup crashes (rider + driver) are captured. No-op without a DSN.
initSentry();
try {
  installGlobalErrorHandler();
} catch (err) {
  console.warn('[startup] Global error handler install failed:', err);
}

SplashScreen.preventAutoHideAsync().catch(() => {});

// ── Referral deep-link key ────────────────────────────────────────────────────
export const REFERRAL_CODE_STORAGE_KEY = '@nexryde_pending_referral';

// ── Action deep-link routes ───────────────────────────────────────────────────
const ACTION_ROUTES: Record<string, string> = {
  go_online: '/(driver-tabs)/driver-home?action=go_online',
  go_offline: '/(driver-tabs)/driver-home?action=go_offline',
  open_app:  '/(driver-tabs)/driver-home',
  my_trips:  '/(driver-tabs)/driver-trips',
};

/**
 * Extract a referral identifier from any NEXRYDE invite URL.
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

function RootLayout() {
  const router = useRouter();
  const { user, isAuthenticated } = useAppStore();
  const hasHydrated = usePersistStoreReady();
  const wasAuthenticated = useRef<boolean | null>(null);
  const { colors, isDark } = useThemeColors();
  const stackBackground = colors.background;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      warmBackendConnection(true);
      // Register background GPS task after React mounts (still before driver goes online).
      void import('@/src/tasks/backgroundLocationTask').catch((err) => {
        console.warn('[startup] backgroundLocationTask registration failed:', err);
      });
      // Realtime Reliability Platform — heal + local event sync on foreground.
      void import('@/src/realtime/bootstrapRealtime').then((m) => {
        m.startRealtimeReliabilityClient();
      });
    }
    const unsubOffline = initializeOfflineMode();
    return () => {
      unsubOffline();
      void import('@/src/realtime/bootstrapRealtime').then((m) => {
        m.stopRealtimeReliabilityClient();
      });
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      void SplashScreen.hideAsync().catch(() => {});
      return;
    }
    if (hasHydrated) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [hasHydrated]);

  // Restore last Light / Dark / Auto choice (JS-only; never touches Appearance TurboModule)
  useEffect(() => {
    void bootstrapThemeFromStorage().catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !user?.id) return;
    let cancelled = false;
    void getUserPreferences(user.id)
      .then(async (res) => {
        if (cancelled) return;
        const pref = res.data?.theme;
        if (pref === 'light' || pref === 'dark' || pref === 'auto') {
          await persistThemePreference(pref);
        }
      })
      .catch(() => {
        /* keep local preference */
      });
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, isAuthenticated, user?.id]);

  // ── Register global login navigator (used by authedFetch outside React tree) ─
  useEffect(() => {
    registerLoginNavigator(() => {
      try { safeReplace(router, '/(auth)/login' as any); } catch { /* router not ready */ }
    });
  }, [router]);

  // ── Auth-expiry watcher — navigate to login when session is force-logged-out ─
  // Prevents the blank white screen that appears when authedFetch calls logout()
  // after a failed token refresh (expired token + no refresh token).
  useEffect(() => {
    // Skip the very first render (null → initial value)
    if (wasAuthenticated.current === null) {
      wasAuthenticated.current = isAuthenticated;
      return;
    }
    // Transition: was authenticated → now not authenticated = forced logout
    if (wasAuthenticated.current && !isAuthenticated) {
      wasAuthenticated.current = false;
      // Replace current stack with login so the user sees a proper screen
      try {
        safeReplace(router, '/(auth)/login' as any);
      } catch { /* router not ready yet */ }
      return;
    }
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated, router]);

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

  // Warm resume: restore JWT from SecureStore, then refresh if near expiry.
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      void import('@/src/lib/tokenStore')
        .then(({ warmTokenCache, getValidToken }) => warmTokenCache().then(() => getValidToken()))
        .catch(() => {});
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Hooks must be called unconditionally at the top level — not inside try/catch.
  useNotifications();
  useDriverOfferBackgroundAlert();
  useOfflineQueueFlush();
  useConnectivityRecovery();

  try {
    return (
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryProvider>
              <LanguageProvider>
                <ErrorToastProvider>
                <StatusBar style={isDark ? 'light' : 'dark'} />
                <OfflineBanner />
                <RiderSessionEffects />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: {
                      backgroundColor: hasHydrated ? stackBackground : '#0D1420',
                    },
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
                </Stack>
                </ErrorToastProvider>
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
    backgroundColor: '#0D1420',
  },
});

// Wrap the root layout with Sentry so its error boundary + navigation
// instrumentation are active across both rider and driver experiences.
export default wrapWithSentry(RootLayout);
