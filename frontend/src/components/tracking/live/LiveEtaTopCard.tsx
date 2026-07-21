/**
 * LiveEtaTopCard — floating ETA pill at the top of the tracking screen.
 *
 * Three visual states (Uber study):
 *   accepted  → green card, animated car icon, "X min away"
 *   arrived   → amber pulse card, "Your driver is here" alert
 *   ongoing   → blue card, destination ETA
 */
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';
import { LIVE_LAYOUT } from '@/src/components/tracking/live/liveTrackingLayout';

export type EtaPhase = 'accepted' | 'arrived' | 'ongoing';

type Props = {
  topInset: number;
  title: string;
  etaMinutes: number | null;
  distanceKm: number | null;
  arrived: boolean;
  phase?: EtaPhase;
  destEtaMinutes?: number | null;
  /** Live trip active but driver GPS not on map yet — honest holding state. */
  connecting?: boolean;
};

function fmtKm(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return '';
  return km < 1 ? `${Math.max(50, Math.round(km * 1000))} m away` : `${km.toFixed(1)} km away`;
}

function fmtEta(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes <= 0) return 'Arriving now';
  return `${minutes} min`;
}

// Gently pulsing dot — used for arrived/ongoing live indicator
function PulseDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,   duration: 700, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: `${color}30`, transform: [{ scale }] }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

function LiveEtaTopCardInner({ topInset, title, etaMinutes, distanceKm, arrived, phase, destEtaMinutes, connecting }: Props) {
  const effectivePhase: EtaPhase = phase ?? (arrived ? 'arrived' : 'accepted');

  // Badge glow animation
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  // Phase-specific design tokens
  const phaseTokens = {
    accepted: {
      cardBg: LIVE.glass,
      border:  LIVE.glassBorder,
      badgeBg: LIVE.green,
      glowColor: LIVE.green,
      icon:    'car-sport' as const,
      iconColor: LIVE.greenInk,
      labelColor: LIVE.green,
      etaColor: LIVE.text,
      subColor: LIVE.sub,
    },
    arrived: {
      cardBg: 'rgba(20,12,4,0.95)',
      border:  'rgba(255,180,50,0.5)',
      badgeBg: '#F59E0B',
      glowColor: '#F59E0B',
      icon:    'location' as const,
      iconColor: '#FFF',
      labelColor: '#FFC93C',
      etaColor: '#FFF',
      subColor: '#CBD5E1',
    },
    ongoing: {
      cardBg: 'rgba(4,14,28,0.95)',
      border:  'rgba(56,189,248,0.38)',
      badgeBg: '#0EA5E9',
      glowColor: '#38BDF8',
      icon:    'navigate' as const,
      iconColor: '#FFF',
      labelColor: LIVE.blue,
      etaColor: LIVE.text,
      subColor: LIVE.sub,
    },
  }[effectivePhase];

  const etaLine = (() => {
    if (connecting) return 'Connecting to your driver…';
    if (effectivePhase === 'arrived') return 'Driver is here';
    if (effectivePhase === 'ongoing') {
      if (destEtaMinutes != null && destEtaMinutes > 0) return `${destEtaMinutes} min`;
      return 'On the way';
    }
    return fmtEta(etaMinutes);
  })();

  const distLine = (() => {
    if (connecting) return 'Live location will appear on the map';
    if (effectivePhase === 'arrived') return 'Walk out to meet them';
    if (effectivePhase === 'ongoing') {
      const km = fmtKm(distanceKm);
      return km || 'Heading to your destination';
    }
    return fmtKm(distanceKm);
  })();

  const labelText = (() => {
    if (connecting) return 'Connecting';
    if (effectivePhase === 'arrived') return 'Driver is here';
    if (effectivePhase === 'ongoing') return 'To your destination';
    // Prefer calm title from parent (e.g. "Driver arriving") over ALL CAPS.
    return title || 'Driver arriving';
  })();

  return (
    <View style={[styles.anchor, { top: topInset + LIVE_LAYOUT.topEtaTop }]} pointerEvents="none">
      <View style={[styles.card, { backgroundColor: phaseTokens.cardBg, borderColor: phaseTokens.border }]}>
        {/* Badge with glow */}
        <View style={styles.badgeWrap}>
          <Animated.View
            style={[
              styles.badgeGlow,
              {
                backgroundColor: phaseTokens.glowColor,
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }),
                transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
              },
            ]}
          />
          <View style={[styles.badge, { backgroundColor: phaseTokens.badgeBg }]}>
            <Ionicons name={phaseTokens.icon} size={18} color={phaseTokens.iconColor} />
          </View>
        </View>

        {/* Text column */}
        <View style={styles.textCol}>
          <View style={styles.labelRow}>
            <PulseDot color={phaseTokens.labelColor} />
            <Text style={[styles.label, { color: phaseTokens.labelColor }]} numberOfLines={1}>
              {labelText}
            </Text>
          </View>
          <Text
            style={[styles.eta, { color: phaseTokens.etaColor }]}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {etaLine}
          </Text>
          {distLine ? (
            <Text style={[styles.dist, { color: phaseTokens.subColor }]} numberOfLines={1}>
              {distLine}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export const LiveEtaTopCard = memo(LiveEtaTopCardInner);

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 55,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    width: '86%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
    minHeight: LIVE_LAYOUT.topEtaCardH,
  },
  badgeWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  badgeGlow: { position: 'absolute', width: 42, height: 42, borderRadius: 21 },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  eta: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    lineHeight: 26,
  },
  dist: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
});
