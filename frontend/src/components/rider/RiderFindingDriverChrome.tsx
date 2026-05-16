/**
 * Shared “finding driver” visuals — book overlay + tracking (pending / pending_driver_offers).
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  RIDER_FINDING_GLOW,
  RIDER_FINDING_HANDLE_GRADIENT,
  RIDER_FINDING_SHEET_BORDER,
  RIDER_MAP_PRIMARY_CTA_GRADIENT,
} from '@/src/constants/riderRideChrome';
import { COLORS } from '@/src/constants/theme';

/** Animated radar rings + vehicle icon (2030 “scanning” hero). */
export function RiderFindingRadar({ size = 112 }: { size?: number }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.timing(ring1, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(ring2, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ring2, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop1.start();
    loop2.start();
    pulseLoop.start();
    return () => {
      loop1.stop();
      loop2.stop();
      pulseLoop.stop();
    };
  }, [ring1, ring2, pulse]);

  const mkRingStyle = (anim: Animated.Value, maxScale: number) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.55, 0.35, 0] }),
    transform: [
      {
        scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, maxScale] }),
      },
    ],
  });

  const hub = Math.round(size * 0.46);

  return (
    <View style={[radarStyles.wrap, { width: size, height: size }]}>
      <Animated.View style={[radarStyles.ring, mkRingStyle(ring1, 1.05)]} />
      <Animated.View style={[radarStyles.ring, mkRingStyle(ring2, 1.05)]} />
      <Animated.View
        style={[
          radarStyles.hubOuter,
          {
            width: hub + 12,
            height: hub + 12,
            borderRadius: (hub + 12) / 2,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
            transform: [
              {
                scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }),
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(37,99,235,0.65)', 'rgba(15,23,42,0.98)']}
          style={[radarStyles.hubGrad, { width: hub, height: hub, borderRadius: hub / 2 }]}
        >
          <Ionicons name="car-sport" size={Math.round(hub * 0.38)} color={COLORS.accentMuted} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export function RiderFindingStatusRow({
  countdown,
  variant = 'sheet',
}: {
  countdown?: number;
  variant?: 'sheet' | 'compact';
}) {
  const urgent = typeof countdown === 'number' && countdown > 0 && countdown <= 15;
  return (
    <View style={[statusStyles.row, variant === 'compact' && statusStyles.rowCompact]}>
      <View style={statusStyles.scanPill}>
        <View style={statusStyles.scanDot} />
        <Text style={statusStyles.scanTxt}>SCANNING</Text>
      </View>
      <View style={statusStyles.livePill}>
        <View style={statusStyles.liveDot} />
        <Text style={statusStyles.liveTxt}>LIVE</Text>
      </View>
      {typeof countdown === 'number' && countdown > 0 ? (
        <Text style={[statusStyles.countdown, urgent && statusStyles.countdownUrgent]}>
          {countdown}s
        </Text>
      ) : null}
    </View>
  );
}

export function RiderFindingMetricsCard({
  bidNgn,
  routeKmLabel,
  routeMinLabel,
  style,
}: {
  bidNgn: number;
  routeKmLabel: string | null;
  routeMinLabel: string | null;
  style?: ViewStyle;
}) {
  const eta = routeMinLabel?.replace(/\s*trip\s*$/i, '').trim() || null;
  return (
    <View style={[metricStyles.card, style]}>
      <LinearGradient
        colors={['rgba(52,245,184,0.1)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <View style={metricStyles.cell}>
        <Text style={metricStyles.label}>Your bid</Text>
        <Text style={metricStyles.bid}>₦{Math.max(0, Math.round(bidNgn)).toLocaleString()}</Text>
      </View>
      <View style={metricStyles.sep} />
      <View style={metricStyles.cell}>
        <Text style={metricStyles.label}>Route</Text>
        <Text style={metricStyles.value} numberOfLines={1}>
          {routeKmLabel || '—'}
        </Text>
        {eta ? (
          <Text style={metricStyles.hint} numberOfLines={1}>
            ETA {eta.startsWith('~') ? eta : `~${eta}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Top strip on tracking (classic layout, non map-first). */
export function RiderFindingStrip({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <View style={stripStyles.outer}>
      <LinearGradient
        colors={['rgba(15,23,42,0.92)', 'rgba(8,12,22,0.98)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={stripStyles.grad}
      >
        <View style={stripStyles.left}>
          <RiderFindingRadar size={52} />
        </View>
        <View style={stripStyles.mid}>
          <Text style={stripStyles.title}>{title ?? 'Finding your driver'}</Text>
          <Text style={stripStyles.sub} numberOfLines={2}>
            {subtitle ?? 'Matching you with nearby drivers…'}
          </Text>
        </View>
        <View style={stripStyles.livePill}>
          <View style={stripStyles.liveDot} />
          <Text style={stripStyles.liveTxt}>LIVE</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

/** Status card hero for tracking finding phase. */
export function RiderFindingStatusHero() {
  return (
    <View style={heroStyles.wrap}>
      <RiderFindingRadar size={100} />
      <RiderFindingStatusRow />
    </View>
  );
}

export function RiderFindingSheetHandle() {
  return (
    <View style={handleStyles.wrap} pointerEvents="none">
      <LinearGradient
        colors={[...RIDER_FINDING_HANDLE_GRADIENT]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={handleStyles.bar}
      />
    </View>
  );
}

const radarStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(52,245,184,0.35)',
    backgroundColor: 'rgba(52,245,184,0.04)',
  },
  hubOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(147,197,253,0.45)',
    shadowColor: RIDER_FINDING_GLOW,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  hubGrad: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});

const statusStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowCompact: { marginTop: 4 },
  scanPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(37,99,235,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.35)',
  },
  scanDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#93C5FD',
  },
  scanTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.accentMuted,
    letterSpacing: 1.1,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.35)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    shadowColor: '#4ADE80',
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  liveTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: '#86EFAC',
    letterSpacing: 1.1,
  },
  countdown: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    fontVariant: ['tabular-nums'],
  },
  countdownUrgent: { color: '#F87171' },
});

const metricStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: RIDER_FINDING_SHEET_BORDER,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  cell: { flex: 1, justifyContent: 'center' },
  sep: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    backgroundColor: 'rgba(148,163,184,0.22)',
    alignSelf: 'stretch',
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bid: {
    fontSize: 22,
    fontWeight: '900',
    color: RIDER_MAP_PRIMARY_CTA_GRADIENT[1],
    letterSpacing: -0.5,
  },
  value: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F1F5F9',
    letterSpacing: -0.3,
  },
  hint: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
});

const stripStyles = StyleSheet.create({
  outer: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: RIDER_FINDING_SHEET_BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  grad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  left: { width: 56, alignItems: 'center' },
  mid: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.2,
  },
  sub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 17,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(52,245,184,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.32)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  liveTxt: {
    fontSize: 9,
    fontWeight: '900',
    color: '#86EFAC',
    letterSpacing: 1,
  },
});

const heroStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
});

const handleStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  bar: { width: 44, height: 4, borderRadius: 2 },
});
