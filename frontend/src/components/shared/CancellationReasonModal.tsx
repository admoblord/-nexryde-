/**
 * Shared trip-cancellation sheet.
 * Rider: required reason + optional “Other” note (Uber/Bolt-style).
 * Driver: optional short reason list (unchanged behaviour).
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export const DRIVER_CANCEL_REASONS = [
  'Emergency',
  'Vehicle issue',
  'Wrong address',
  'Other',
] as const;

export const RIDER_CANCEL_REASONS = [
  'Driver taking too long',
  'Changed my mind',
  'Found another ride',
  'Driver asked me to cancel',
  'Wrong pickup location',
  'Other',
] as const;

type Props = {
  visible: boolean;
  role: 'driver' | 'rider';
  cancelling: boolean;
  /** Backend / network error — keep sheet open so the rider can retry. */
  errorMessage?: string | null;
  /** Uber-style fee preview shown above reasons (e.g. "₦300 may apply"). */
  feePreviewNote?: string | null;
  /** Confirmed — reason string always set for riders; optional for drivers. */
  onConfirm: (reason?: string) => void;
  onKeepTrip: () => void;
};

function resolveSubmitReason(
  role: 'driver' | 'rider',
  selected: string | null,
  otherText: string,
): string | undefined {
  if (!selected) return undefined;
  if (selected === 'Other') {
    const note = otherText.trim();
    if (role === 'rider') return note ? `Other: ${note}` : 'Other';
    return note || 'Other';
  }
  return selected;
}

export default function CancellationReasonModal({
  visible,
  role,
  cancelling,
  errorMessage,
  feePreviewNote,
  onConfirm,
  onKeepTrip,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');

  const reasons = role === 'driver' ? DRIVER_CANCEL_REASONS : RIDER_CANCEL_REASONS;
  const requireReason = role === 'rider';
  const canSubmit = !cancelling && (!requireReason || Boolean(selected));

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setOtherText('');
    } else if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [visible]);

  const handleConfirm = () => {
    if (!canSubmit) return;
    const reason = resolveSubmitReason(role, selected, otherText);
    if (requireReason && !reason) return;
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    onConfirm(reason);
  };

  const subText =
    role === 'driver'
      ? 'The rider will be notified immediately. Frequent cancellations affect your visibility score.'
      : 'Pick a reason to cancel. Your request is sent as soon as you confirm.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancelling ? undefined : onKeepTrip}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={cancelling ? undefined : onKeepTrip} />
        <View style={[styles.cardShell, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handleRail}>
            <View style={styles.handle} />
          </View>
          <Text style={styles.title}>Cancel this trip?</Text>
          <Text style={styles.sub}>{subText}</Text>
          {feePreviewNote ? (
            <View style={styles.feeBox}>
              <Ionicons name="cash-outline" size={16} color="#FBBF24" />
              <Text style={styles.feeTxt}>{feePreviewNote}</Text>
            </View>
          ) : null}

          <Text style={styles.reasonLabel}>
            {requireReason ? 'Why are you cancelling?' : 'Reason (optional)'}
          </Text>
          <ScrollView
            style={styles.reasonScroll}
            contentContainerStyle={styles.reasonList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {reasons.map((r) => {
              const isSel = selected === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonRow, isSel && styles.reasonRowSel]}
                  onPress={() => {
                    if (cancelling) return;
                    if (Platform.OS !== 'web') void Haptics.selectionAsync();
                    setSelected(r);
                    if (r !== 'Other') setOtherText('');
                  }}
                  disabled={cancelling}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityLabel={r}
                  accessibilityState={{ selected: isSel, disabled: cancelling }}
                >
                  <Ionicons
                    name={isSel ? 'radio-button-on' : 'radio-button-off'}
                    size={19}
                    color={isSel ? '#F87171' : '#64748B'}
                  />
                  <Text style={[styles.reasonTxt, isSel && styles.reasonTxtSel]}>{r}</Text>
                </TouchableOpacity>
              );
            })}

            {selected === 'Other' ? (
              <TextInput
                style={styles.otherInput}
                value={otherText}
                onChangeText={setOtherText}
                placeholder="Add a short note (optional)"
                placeholderTextColor="#64748B"
                editable={!cancelling}
                multiline
                maxLength={200}
                autoFocus
                accessibilityLabel="Custom cancellation reason"
              />
            ) : null}
          </ScrollView>

          {errorMessage ? (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={16} color="#FCA5A5" />
              <Text style={styles.errorTxt}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.keepBtn}
              onPress={onKeepTrip}
              disabled={cancelling}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Keep trip"
            >
              <Text style={styles.keepTxt}>Keep trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !canSubmit && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canSubmit}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Cancel Ride"
              accessibilityState={{ disabled: !canSubmit }}
            >
              {cancelling ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={20} color="#FFF" />
                  <Text style={styles.confirmTxt}>Cancel Ride</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  cardShell: {
    marginHorizontal: 12,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.32)',
    backgroundColor: '#0B1220',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handleRail: { alignItems: 'center', marginBottom: 10 },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(148,163,184,0.5)',
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
    marginBottom: 14,
  },
  feeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    marginBottom: 14,
  },
  feeTxt: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reasonScroll: { maxHeight: 320 },
  reasonList: { gap: 8, paddingBottom: 8 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  reasonRowSel: {
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  reasonTxt: { flex: 1, fontSize: 14.5, fontWeight: '700', color: '#CBD5E1' },
  reasonTxtSel: { color: '#FECACA' },
  otherInput: {
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(15,23,42,0.9)',
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(127,29,29,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
  },
  errorTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: '#FECACA', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'stretch', marginTop: 12 },
  keepBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.8)',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  keepTxt: { fontSize: 15, fontWeight: '800', color: '#CBD5E1' },
  confirmBtn: {
    flex: 1.3,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 50,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  confirmBtnDisabled: { opacity: 0.42 },
  confirmTxt: { fontSize: 15.5, fontWeight: '900', color: '#FFF' },
});
