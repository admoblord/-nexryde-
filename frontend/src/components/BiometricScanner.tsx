import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS } from '@/src/constants/theme';

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
        <Ionicons name="finger-print" size={34} color={COLORS.accentBlue} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <TouchableOpacity style={styles.button} onPress={runScan} disabled={busy}>
        {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.buttonText}>{confirmLabel}</Text>}
      </TouchableOpacity>
      {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentBlueSoft,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  subtitle: {
    textAlign: 'center',
    color: COLORS.gray600,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  button: {
    marginTop: SPACING.sm,
    width: '100%',
    backgroundColor: COLORS.accentBlue,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: '900',
    fontSize: FONT_SIZE.md,
  },
  status: {
    marginTop: 2,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    fontWeight: '700',
    textAlign: 'center',
  },
});
