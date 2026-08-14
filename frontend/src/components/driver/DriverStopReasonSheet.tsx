/**
 * Driver must share why the trip stopped after Auto Stop Safety Check.
 * Cannot be dismissed without a reason — the rider was already asked if they are safe.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  DRIVER_STOP_REASON_CHOICES,
  type GuardianAlert,
} from '@/src/utils/tripSafetyPrompts';

type Props = {
  visible: boolean;
  alert?: GuardianAlert;
  submitting?: boolean;
  errorMessage?: string | null;
  onSubmit: (reason: string) => void;
};

export default function DriverStopReasonSheet({
  visible,
  alert,
  submitting = false,
  errorMessage,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    if (!visible) {
      setOtherOpen(false);
      setOtherText('');
      return;
    }
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [visible]);

  const handleChoice = (choice: (typeof DRIVER_STOP_REASON_CHOICES)[number]) => {
    if (submitting) return;
    if (choice.needsDetail) {
      setOtherOpen(true);
      return;
    }
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    onSubmit(choice.reason);
  };

  const otherReady = otherText.trim().length >= 6;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.root}>
        <View style={styles.backdrop} />
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handleRail}>
            <View style={styles.handle} />
          </View>
          <View style={styles.iconWrap}>
            <Ionicons name="pause" size={20} color="#022C22" />
          </View>
          <Text style={styles.title}>Why did you stop?</Text>
          <Text style={styles.sub}>
            Your rider was asked if they are safe. Share a reason so they know what is going on.
          </Text>
          {alert?.stop_duration_seconds ? (
            <Text style={styles.meta}>
              Stopped about {Math.max(1, Math.round(Number(alert.stop_duration_seconds) / 60))} min
            </Text>
          ) : null}

          {otherOpen ? (
            <View style={styles.otherBlock}>
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                placeholder="Tell your rider why you stopped"
                placeholderTextColor="#64748B"
                style={styles.input}
                multiline
                maxLength={280}
                autoFocus
                editable={!submitting}
              />
              <TouchableOpacity
                style={[styles.submitBtn, (!otherReady || submitting) && styles.disabled]}
                onPress={() => otherReady && onSubmit(otherText.trim())}
                disabled={!otherReady || submitting}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Send stop reason"
              >
                {submitting ? (
                  <ActivityIndicator color="#022C22" />
                ) : (
                  <Text style={styles.submitTxt}>Send to rider</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setOtherOpen(false)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Back to reasons"
              >
                <Text style={styles.backTxt}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.list}>
              {DRIVER_STOP_REASON_CHOICES.map((choice) => (
                <TouchableOpacity
                  key={choice.id}
                  style={styles.row}
                  onPress={() => handleChoice(choice)}
                  disabled={submitting}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={choice.label}
                  accessibilityHint={choice.description}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={choice.icon} size={18} color={NEON} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{choice.label}</Text>
                    <Text style={styles.rowDesc}>{choice.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {submitting && !otherOpen ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.busyTxt}>Sharing with your rider…</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const NEON = '#22E5A0';

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.72)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    marginHorizontal: 12,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.3)',
    backgroundColor: '#0B1220',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handleRail: { alignItems: 'center', marginBottom: 10 },
  handle: { width: 44, height: 4, borderRadius: 100, backgroundColor: 'rgba(148,163,184,0.5)' },
  iconWrap: {
    alignSelf: 'center',
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 21,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    fontWeight: '700',
    color: NEON,
    textAlign: 'center',
    marginBottom: 12,
  },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,229,160,0.12)',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: '#F1F5F9' },
  rowDesc: { fontSize: 12, fontWeight: '600', color: '#94A3B8', lineHeight: 16 },
  otherBlock: { gap: 10 },
  input: {
    minHeight: 88,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    textAlignVertical: 'top',
  },
  submitBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitTxt: { fontSize: 16, fontWeight: '900', color: '#022C22' },
  backBtn: { alignItems: 'center', paddingVertical: 10 },
  backTxt: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  error: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#FCA5A5',
    textAlign: 'center',
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  busyTxt: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  disabled: { opacity: 0.55 },
});
