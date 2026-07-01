import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  title?: string;
  message: string;
  detail?: string | null;
  retrying?: boolean;
  onRetry: () => void;
  onSignIn?: () => void;
  onContinueOffline?: () => void;
  continueOfflineLabel?: string;
};

/** Shown when driver-home init exceeds 8s or a critical fetch fails. */
export function DriverStartupErrorScreen({
  title = 'Could not load dashboard',
  message,
  detail,
  retrying = false,
  onRetry,
  onSignIn,
  onContinueOffline,
  continueOfflineLabel = 'Continue offline',
}: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={48} color="#F59E0B" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      <TouchableOpacity
        style={[styles.retryBtn, retrying && styles.retryBtnDisabled]}
        onPress={onRetry}
        disabled={retrying}
        activeOpacity={0.85}
      >
        {retrying ? (
          <ActivityIndicator color="#022C22" size="small" />
        ) : (
          <>
            <Ionicons name="refresh" size={20} color="#022C22" />
            <Text style={styles.retryText}>Try again</Text>
          </>
        )}
      </TouchableOpacity>
      {onContinueOffline ? (
        <TouchableOpacity style={styles.secondaryBtn} onPress={onContinueOffline} activeOpacity={0.7}>
          <Text style={styles.secondaryText}>{continueOfflineLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {onSignIn ? (
        <TouchableOpacity style={[styles.secondaryBtn, onContinueOffline && styles.tertiaryBtn]} onPress={onSignIn} activeOpacity={0.7}>
          <Text style={styles.secondaryText}>Sign in again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D1420',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  detail: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  retryBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00D084',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 160,
    justifyContent: 'center',
  },
  retryBtnDisabled: { opacity: 0.7 },
  retryText: { color: '#022C22', fontSize: 16, fontWeight: '800' },
  secondaryBtn: { paddingVertical: 10 },
  tertiaryBtn: { marginTop: -4 },
  secondaryText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
});
