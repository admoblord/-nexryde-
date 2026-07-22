import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ErrorBoundaryProps } from 'expo-router';
import { COLORS } from '@/src/constants/theme';
import CrashReporter from '@/src/services/crashReporting';
import { sentryError } from '@/src/utils/sentryBreadcrumbs';

/**
 * Per-tab error boundary (expo-router contract).
 *
 * expo-router renders a route's exported `ErrorBoundary` when that route's
 * component throws during render/lifecycle. This confines any single tab's
 * error to a "Couldn't load — retry" panel INSIDE the tab, so a screen-level
 * error can never take down the whole app to the OS home screen.
 *
 * Async/event-handler errors are NOT caught by React boundaries — those are
 * still guarded with null-safety in each screen. This is the structural net
 * for render-phase throws (the crash class reported on tab switch).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    try {
      CrashReporter.captureException(error, { boundary: 'RouteErrorBoundary' });
      sentryError(error, { boundary: 'RouteErrorBoundary' });
    } catch {
      /* reporting must never throw from the fallback */
    }
  }, [error]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-offline-outline" size={56} color={COLORS.textMuted} />
        </View>
        <Text style={styles.title}>Couldn&apos;t load this screen</Text>
        <Text style={styles.message}>
          Something went wrong here, but the rest of the app is fine. Tap retry — your account and
          trips are safe on our servers.
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => { void retry(); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Retry loading this screen"
        >
          <Ionicons name="refresh" size={20} color={COLORS.primaryDark} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        {__DEV__ && !!error?.message && (
          <Text style={styles.devErr}>{String(error.message)}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconWrap: { marginBottom: 18 },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 340,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentGreen,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 14,
    gap: 8,
  },
  retryText: { fontSize: 16, fontWeight: '800', color: COLORS.primaryDark },
  devErr: {
    marginTop: 20,
    fontSize: 12,
    color: COLORS.errorBright,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});
