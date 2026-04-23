import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { profileTokens as t, typography } from '@/src/theme/tokens';

type Props = {
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  onSuccess?: () => void;
  onFailure?: (message: string) => void;
};

export const BiometricScanner: React.FC<Props> = ({
  title = 'Biometric check',
  subtitle = 'Use fingerprint or face unlock on this device.',
  confirmLabel = 'Scan now',
  onSuccess,
  onFailure,
}) => {
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const runScan = async () => {
    setBusy(true);
    try {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        const msg = 'No biometrics are enrolled on this device.';
        setStatusText(msg);
        onFailure?.(msg);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: title,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setStatusText('Biometric confirmed.');
        onSuccess?.();
      } else {
        const msg = result.warning || result.error || 'Biometric check failed.';
        setStatusText(msg);
        onFailure?.(msg);
      }
    } catch {
      const msg = 'Biometric authentication could not be started.';
      setStatusText(msg);
      onFailure?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="finger-print" size={28} color={t.accent.blue} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <TouchableOpacity style={styles.button} onPress={runScan} disabled={busy}>
        {busy ? <ActivityIndicator color={t.text.primary} /> : <Text style={styles.buttonText}>{confirmLabel}</Text>}
      </TouchableOpacity>
      {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.bg.card,
    borderRadius: t.radius.lg,
    padding: t.space.xxl,
    alignItems: 'center',
    gap: t.space.sm,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59,130,246,0.15)',
  },
  title: {
    marginTop: t.space.lg,
    ...typography.h2,
    color: t.text.primary,
  },
  subtitle: {
    textAlign: 'center',
    color: t.text.tertiary,
    ...typography.small,
    marginTop: t.space.sm,
    maxWidth: 280,
  },
  button: {
    marginTop: t.space.xl,
    width: '100%',
    height: 52,
    backgroundColor: t.accent.blue,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: t.text.primary,
    ...typography.h3,
  },
  status: {
    marginTop: 2,
    ...typography.small,
    color: t.text.tertiary,
    textAlign: 'center',
  },
});
