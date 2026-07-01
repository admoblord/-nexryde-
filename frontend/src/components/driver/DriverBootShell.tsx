import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { Href } from 'expo-router';
import { DriverStartupErrorScreen } from '@/src/components/driver/DriverStartupErrorScreen';

type Props = {
  isGateOpen: boolean;
  error: string | null;
  retrying: boolean;
  fromCache?: boolean;
  onRetry: () => void;
  onSignIn: () => void;
  onContinueOffline?: () => void;
  children: React.ReactNode;
};

/**
 * Uber-style boot shell — never infinite spinner.
 * Shows loading max until parent opens gate or surfaces error + retry.
 */
export function DriverBootShell({
  isGateOpen,
  error,
  retrying,
  fromCache,
  onRetry,
  onSignIn,
  onContinueOffline,
  children,
}: Props) {
  if (error && !isGateOpen) {
    return (
      <DriverStartupErrorScreen
        message={error}
        retrying={retrying}
        onRetry={onRetry}
        onSignIn={onSignIn}
        onContinueOffline={onContinueOffline}
      />
    );
  }

  if (!isGateOpen) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00D084" />
        <Text style={styles.loadingText}>Loading your dashboard…</Text>
        {fromCache ? (
          <Text style={styles.loadingHint}>Syncing latest status</Text>
        ) : null}
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0D1420',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingHint: {
    color: '#64748B',
    fontSize: 12,
  },
});

export type DriverBootSignInHref = Href;
