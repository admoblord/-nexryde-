import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { PickupWaitTimerState } from '@/src/hooks/usePickupWaitTimer';

type Props = {
  wait: PickupWaitTimerState;
  variant?: 'rider' | 'driver';
  compact?: boolean;
  /** Only mention pickup codes when the rider enabled them for this trip. */
  pickupCodeRequired?: boolean;
};

export function PickupWaitTimerCard({
  wait,
  variant = 'rider',
  compact = false,
  pickupCodeRequired = false,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (wait.phase !== 'free' || !wait.isUrgent) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [wait.phase, wait.isUrgent, pulse]);

  if (wait.phase === 'idle') return null;

  const isFree = wait.phase === 'free';
  const accent = isFree ? (wait.isUrgent ? '#FBBF24' : '#34D399') : '#FB923C';
  const ringPct = isFree ? 1 - wait.freeProgress : 1;

  return (
    <View style={[styles.card, compact && styles.cardCompact, variant === 'driver' && styles.cardDriver]}>
      <LinearGradient
        colors={
          isFree
            ? wait.isUrgent
              ? ['rgba(251,191,36,0.18)', 'rgba(15,23,42,0.92)']
              : ['rgba(52,211,153,0.16)', 'rgba(15,23,42,0.94)']
            : ['rgba(251,146,60,0.14)', 'rgba(15,23,42,0.94)']
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={styles.row}>
        <View style={styles.ringWrap}>
          <View style={[styles.ringTrack, { borderColor: `${accent}33` }]} />
          <Animated.View
            style={[
              styles.ringFill,
              {
                borderColor: accent,
                opacity: isFree && wait.isUrgent ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) : 1,
                transform: [{ scale: 0.72 + ringPct * 0.28 }],
              },
            ]}
          />
          <Text style={[styles.mmSs, { color: accent }]}>{wait.mmSs}</Text>
        </View>
        <View style={styles.copy}>
          <View style={styles.badgeRow}>
            <Ionicons
              name={isFree ? 'timer-outline' : 'hourglass-outline'}
              size={14}
              color={accent}
            />
            <Text style={[styles.badge, { color: accent }]}>
              {isFree ? 'FREE WAIT' : 'WAIT TIME'}
            </Text>
          </View>
          <Text style={styles.headline}>{wait.headline}</Text>
          <Text style={styles.subline}>{wait.subline}</Text>
          {variant === 'rider' && isFree && pickupCodeRequired ? (
            <Text style={styles.hint}>
              Share your pickup code so your driver can start the trip
            </Text>
          ) : null}
          {variant === 'driver' && !isFree && pickupCodeRequired ? (
            <Text style={styles.hint}>
              Verify pickup code, then tap Start trip when the rider is in your car
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    marginBottom: 10,
  },
  cardCompact: { padding: 12, marginBottom: 8 },
  cardDriver: { marginHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTrack: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    borderWidth: 4,
  },
  ringFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    borderWidth: 4,
  },
  mmSs: {
    fontSize: 17,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  copy: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  badge: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  headline: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  subline: { color: '#94A3B8', fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 17 },
  hint: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 8, lineHeight: 15 },
});
