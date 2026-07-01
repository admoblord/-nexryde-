/**
 * Shared trip-cancellation sheet — one step: pick an optional reason + confirm.
 * Used by the driver (heading-to-pickup / arrived docks) and the rider
 * (finding / accepted / en-route screens). Reason selection is optional.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

export const DRIVER_CANCEL_REASONS = [
  'Emergency',
  'Vehicle issue',
  'Wrong address',
  'Other',
] as const;

export const RIDER_CANCEL_REASONS = [
  'Driver taking too long',
  'Changed mind',
  'Found another ride',
  'Other',
] as const;

type Props = {
  visible: boolean;
  role: 'driver' | 'rider';
  cancelling: boolean;
  /** Confirmed — reason is undefined when the user skipped selection. */
  onConfirm: (reason?: string) => void;
  onKeepTrip: () => void;
};

export default function CancellationReasonModal({
  visible,
  role,
  cancelling,
  onConfirm,
  onKeepTrip,
}: Props) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [selected, setSelected] = useState<string | null>(null);

  const reasons = role === 'driver' ? DRIVER_CANCEL_REASONS : RIDER_CANCEL_REASONS;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.94);
      opacity.setValue(0);
      setSelected(null);
      return;
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 78, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity, scale]);

  const handleConfirm = () => {
    if (cancelling) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onConfirm(selected ?? undefined);
  };

  const subText =
    role === 'driver'
      ? 'The rider will be notified immediately. Frequent cancellations affect your visibility score.'
      : 'Your driver may already be on the way. Tell us why so we can improve matching.';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={cancelling ? undefined : onKeepTrip}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={cancelling ? undefined : onKeepTrip} />
        <Animated.View
          style={[
            styles.cardShell,
            { marginBottom: Math.max(insets.bottom, 20), opacity, transform: [{ scale }] },
          ]}
        >
          {Platform.OS === 'ios' || Platform.OS === 'android' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(11,14,17,0.97)' }]} />
          )}
          <LinearGradient
            colors={['rgba(239,68,68,0.07)', 'rgba(15,23,42,0.96)', '#020617']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
          />
          <View style={styles.cardBody}>
            <View style={styles.handleRail}>
              <View style={styles.handle} />
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillTxt}>CANCEL TRIP</Text>
            </View>
            <Text style={styles.title}>Cancel this trip?</Text>
            <Text style={styles.sub}>{subText}</Text>

            <Text style={styles.reasonLabel}>Reason (optional)</Text>
            <View style={styles.reasonList}>
              {reasons.map((r) => {
                const isSel = selected === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonRow, isSel && styles.reasonRowSel]}
                    onPress={() => {
                      if (Platform.OS !== 'web') void Haptics.selectionAsync();
                      setSelected((prev) => (prev === r ? null : r));
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
            </View>

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
                style={styles.confirmOuter}
                onPress={handleConfirm}
                disabled={cancelling}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Confirm cancellation"
                accessibilityState={{ disabled: cancelling }}
              >
                <LinearGradient
                  colors={['#F87171', '#EF4444', '#B91C1C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.confirmGrad}
                >
                  {cancelling ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={20} color="#FFF" />
                      <Text style={styles.confirmTxt}>Cancel trip</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
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
    position: 'relative',
    marginHorizontal: 16,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 26,
    elevation: 22,
  },
  cardBody: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    zIndex: 1,
  },
  handleRail: { alignItems: 'center', marginBottom: 12 },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(148,163,184,0.5)',
  },
  pill: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    marginBottom: 12,
  },
  pillTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FCA5A5',
    letterSpacing: 1.1,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  sub: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reasonList: { gap: 8, marginBottom: 18 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  reasonRowSel: {
    borderColor: 'rgba(239,68,68,0.55)',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  reasonTxt: { flex: 1, fontSize: 14.5, fontWeight: '700', color: '#CBD5E1' },
  reasonTxtSel: { color: '#FECACA' },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  keepBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.8)',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  keepTxt: { fontSize: 15.5, fontWeight: '800', color: '#CBD5E1' },
  confirmOuter: { flex: 1.25, borderRadius: 16, overflow: 'hidden' },
  confirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    minHeight: 52,
  },
  confirmTxt: { fontSize: 15.5, fontWeight: '900', color: '#FFF', letterSpacing: 0.1 },
});
