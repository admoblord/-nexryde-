/**
 * V2 floating ETA card — fixed-size pill; values swap in place (no layout shift).
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TV2 } from '@/src/components/tracking/v2/trackingV2Theme';
import { TV2_LAYOUT } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  topInset: number;
  title: string;
  etaMinutes: number | null;
  distanceKm: number | null;
  arrived: boolean;
};

function fmtKm(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return km < 1 ? `${Math.max(50, Math.round(km * 1000))} m` : `${km.toFixed(1)} km`;
}

function fmtEta(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes <= 0) return 'Now';
  return `${minutes} min`;
}

function ArrivalStatusCardV2Inner({ topInset, title, etaMinutes, distanceKm, arrived }: Props) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const meta = arrived
    ? 'At your pickup point'
    : `ETA ${fmtEta(etaMinutes)}  ·  ${fmtKm(distanceKm)}`;

  return (
    <View style={[styles.anchor, { top: topInset + 64 }]} pointerEvents="none">
      <View style={styles.card}>
        <View style={styles.badgeWrap}>
          <Animated.View
            style={[
              styles.badgeGlow,
              {
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
              },
            ]}
          />
          <View style={styles.badge}>
            <Ionicons name="car-sport" size={18} color={TV2.greenInk} />
          </View>
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text
            style={styles.meta}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {meta}
          </Text>
        </View>
      </View>
    </View>
  );
}

export const ArrivalStatusCardV2 = memo(ArrivalStatusCardV2Inner);

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 55 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: TV2_LAYOUT.arrivalCard,
    borderRadius: 18,
    backgroundColor: TV2.glass,
    borderWidth: 1,
    borderColor: TV2.glassBorder,
    width: '78%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 12,
  },
  badgeWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  badgeGlow: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: TV2.green,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: TV2.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: { fontSize: 14.5, fontWeight: '900', color: TV2.green, letterSpacing: 0.2, height: 18 },
  meta: {
    fontSize: 15,
    fontWeight: '800',
    color: TV2.text,
    marginTop: 2,
    height: 20,
    width: TV2_LAYOUT.arrivalMetaWidth,
    maxWidth: '100%',
    fontVariant: ['tabular-nums'],
  },
});
