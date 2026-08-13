/**
 * Blocking in-trip prompt: "Are you safe?" after Auto Stop Safety Check.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';
import { brand } from '@/src/theme/tokens';
import type { GuardianAlert } from '@/src/utils/tripSafetyPrompts';

type Props = {
  visible: boolean;
  alert?: GuardianAlert;
  submitting?: boolean;
  onSafe: () => void;
  onNeedHelp: () => void;
};

export default function RiderSafetyCheckModal({
  visible,
  alert,
  submitting = false,
  onSafe,
  onNeedHelp,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(0.84)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShown(true);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 72, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.timing(opacityAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setShown(false);
    });
  }, [visible, scaleAnim, opacityAnim]);

  if (!shown) return null;

  const driverReason = String(alert?.driver_reason || alert?.reason || '').trim();
  const escalated = Boolean(alert?.escalated);

  return (
    <Animated.View
      style={[styles.backdrop, { opacity: opacityAnim }]}
      pointerEvents="auto"
      accessibilityViewIsModal
    >
      <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={28} color={brand.navy} />
        </View>
        <Text style={styles.title}>{escalated ? 'Help is on the way' : 'Are you safe?'}</Text>
        <Text style={styles.body}>
          {escalated
            ? 'We could not confirm your safety, so NEXRYDE alerted your emergency contacts. If you are okay, check in now.'
            : alert?.message || 'We noticed your trip has been stopped for a while. Check in so we know you are okay.'}
        </Text>
        {driverReason ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonKicker}>Driver said</Text>
            <Text style={styles.reasonTxt}>{driverReason}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.safeBtn, submitting && styles.disabled]}
            onPress={onSafe}
            disabled={submitting}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Yes, I am safe"
          >
            {submitting ? (
              <ActivityIndicator color={brand.navy} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color={brand.navy} />
                <Text style={styles.safeTxt}>Yes, I&apos;m safe</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.helpBtn, submitting && styles.disabled]}
            onPress={onNeedHelp}
            disabled={submitting}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={escalated ? 'Send another SOS' : 'No, I need help'}
          >
            <Ionicons name="warning" size={18} color="#FFF" />
            <Text style={styles.helpTxt}>{escalated ? 'Send SOS again' : "No, I need help"}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,17,27,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 240,
    padding: 22,
  },
  card: {
    width: '100%',
    backgroundColor: LIVE.bg,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LIVE.hairline,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: brand.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: LIVE.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    fontWeight: '600',
    color: LIVE.sub,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  reasonBox: {
    width: '100%',
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: LIVE.glassSoft,
    borderWidth: 1,
    borderColor: LIVE.hairline,
  },
  reasonKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: LIVE.faint,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  reasonTxt: { fontSize: 14, fontWeight: '700', color: LIVE.text, lineHeight: 19 },
  actions: { width: '100%', gap: 10, marginTop: 18 },
  safeBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: brand.green,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  safeTxt: { fontSize: 16, fontWeight: '900', color: brand.navy },
  helpBtn: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: LIVE.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  helpTxt: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  disabled: { opacity: 0.6 },
});
