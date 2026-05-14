import React, { useEffect, useRef } from 'react';
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
import { DOCK_BLUR_INTENSITY, HANDLE_GRADIENT_DEFAULT } from '@/src/components/driver/driverDockTheme';

type Props = {
  visible: boolean;
  riderName: string;
  fare: number | null;
  confirming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function formatFare(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function DriverCompleteTripConfirmModal({
  visible,
  riderName,
  fare,
  confirming,
  onCancel,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.94);
      opacity.setValue(0);
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

  const displayName = riderName.trim() || 'Your rider';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={confirming ? undefined : onCancel}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={confirming ? undefined : onCancel} />
        <Animated.View
          style={[
            styles.cardShell,
            {
              marginBottom: Math.max(insets.bottom, 20),
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          {Platform.OS === 'ios' || Platform.OS === 'android' ? (
            <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(11,14,17,0.97)' }]} />
          )}
          <LinearGradient
            colors={['rgba(57,255,20,0.06)', 'rgba(15,23,42,0.96)', '#020617']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
          />
          <View style={styles.cardBody}>
            <View style={styles.handleRail}>
              <View style={styles.handleTrack}>
                <LinearGradient
                  colors={[...HANDLE_GRADIENT_DEFAULT]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </View>
            </View>
            <View style={styles.pill}>
              <LinearGradient
                colors={['rgba(57,255,20,0.25)', 'rgba(13,159,110,0.35)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.pillTxt}>END TRIP</Text>
            </View>
            <Text style={styles.title}>Complete this trip?</Text>
            <Text style={styles.sub}>
              Only confirm after <Text style={styles.subEm}>{displayName}</Text> has left the vehicle and you are at
              the drop-off.
            </Text>

            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Trip fare</Text>
              <Text style={styles.fareVal}>{formatFare(fare)}</Text>
            </View>

            <View style={styles.checkList}>
              <View style={styles.checkRow}>
                <Ionicons name="checkmark-circle" size={18} color="#22E5A0" />
                <Text style={styles.checkTxt}>Rider has exited safely</Text>
              </View>
              <View style={styles.checkRow}>
                <Ionicons name="checkmark-circle" size={18} color="#22E5A0" />
                <Text style={styles.checkTxt}>Belongings / doors cleared</Text>
              </View>
              <View style={styles.checkRow}>
                <Ionicons name="information-circle-outline" size={18} color="#94A3B8" />
                <Text style={styles.checkTxtMuted}>Fare and payment finalize on complete</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onCancel}
                disabled={confirming}
                activeOpacity={0.88}
              >
                <Text style={styles.cancelTxt}>Not yet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmOuter}
                onPress={onConfirm}
                disabled={confirming}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={['#34F5B8', '#22E5A0', '#0D9F6E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.confirmGrad}
                >
                  {confirming ? (
                    <ActivityIndicator color="#022C22" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={22} color="#022C22" />
                      <Text style={styles.confirmTxt}>Complete trip</Text>
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
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  cardShell: {
    position: 'relative',
    marginHorizontal: 16,
    borderRadius: 28,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.28)',
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
  handleTrack: {
    width: 48,
    height: 4,
    borderRadius: 100,
    overflow: 'hidden',
  },
  pill: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.45)',
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 108,
  },
  pillTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#BBF7D0',
    letterSpacing: 1.1,
    zIndex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  sub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  subEm: { color: '#E2E8F0', fontWeight: '800' },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.55)',
    marginBottom: 16,
  },
  fareLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },
  fareVal: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.4 },
  checkList: { gap: 10, marginBottom: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  checkTxtMuted: { flex: 1, fontSize: 13, fontWeight: '600', color: '#94A3B8', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  cancelBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.8)',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  cancelTxt: { fontSize: 16, fontWeight: '800', color: '#CBD5E1' },
  confirmOuter: { flex: 1.35, borderRadius: 16, overflow: 'hidden' },
  confirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    minHeight: 54,
  },
  confirmTxt: { fontSize: 16, fontWeight: '900', color: '#022C22', letterSpacing: 0.1 },
});
