/**
 * V2 live matching card — spinning scan ring around a car badge,
 * indeterminate progress bar, rotating status lines and a pulsing
 * LIVE badge. The "drivers are actively searching for me" moment.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FV2, findingGlass } from '@/src/components/finding/findingV2Theme';

const STATUSES_NORMAL = [
  'Searching nearby…',
  'Expanding search area…',
  'Checking driver availability…',
  'Matching best driver…',
] as const;

const STATUSES_SLOW = [
  'Still searching — hang tight…',
  'Widening search radius…',
  'Reaching more drivers…',
  'Almost there…',
] as const;

const STATUSES_VERY_SLOW = [
  'Searching a wider area…',
  'Trying all nearby drivers…',
  'Almost there — stay put…',
  'Finalising your match…',
] as const;

const RING = 76;

type Props = { timeElapsedSec?: number };

export function LiveMatchingCardV2({ timeElapsedSec = 0 }: Props) {
  const STATUSES =
    timeElapsedSec >= 60
      ? STATUSES_VERY_SLOW
      : timeElapsedSec >= 30
        ? STATUSES_SLOW
        : STATUSES_NORMAL;
  const spin = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const livePulse = useRef(new Animated.Value(0)).current;
  const statusFade = useRef(new Animated.Value(1)).current;
  const [statusIdx, setStatusIdx] = useState(0);
  const [barW, setBarW] = useState(0);

  /* scan ring + progress bar + LIVE pulse */
  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
    );
    const barLoop = Animated.loop(
      Animated.timing(bar, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    const liveLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    spinLoop.start();
    barLoop.start();
    liveLoop.start();
    return () => {
      spinLoop.stop();
      barLoop.stop();
      liveLoop.stop();
    };
  }, [spin, bar, livePulse]);

  /* rotating status text (fade out → swap → fade in) */
  useEffect(() => {
    const iv = setInterval(() => {
      Animated.timing(statusFade, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
        setStatusIdx((i) => (i + 1) % STATUSES.length);
        Animated.timing(statusFade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 3400);
    return () => clearInterval(iv);
  }, [statusFade]);

  return (
    <View style={styles.card}>
      {/* scanning ring + car */}
      <View style={styles.ringWrap}>
        <View style={styles.ringTrack} />
        <Animated.View
          style={[
            styles.ringArc,
            {
              transform: [
                { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              ],
            },
          ]}
        />
        <View style={styles.carBadge}>
          <Ionicons name="car-sport" size={24} color={FV2.greenBright} />
        </View>
      </View>

      {/* copy + progress */}
      <View style={styles.midCol}>
        <Text style={styles.title}>
          {timeElapsedSec >= 60
            ? 'Checking all\nnearby drivers'
            : timeElapsedSec >= 30
              ? 'Expanding\nsearch area'
              : 'Searching for\navailable drivers'}
        </Text>
        <View
          style={styles.barTrack}
          onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        >
          {barW > 0 ? (
            <Animated.View
              style={[
                styles.barFill,
                {
                  width: barW * 0.42,
                  transform: [
                    {
                      translateX: bar.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-barW * 0.42, barW],
                      }),
                    },
                  ],
                },
              ]}
            />
          ) : null}
        </View>
        <Animated.Text
          style={[styles.status, { opacity: statusFade }]}
          numberOfLines={1}
          accessibilityLiveRegion="polite"
        >
          {STATUSES[statusIdx]}
        </Animated.Text>
      </View>

      {/* LIVE badge */}
      <View style={styles.liveWrap}>
        <Animated.View
          style={[
            styles.liveHalo,
            {
              opacity: livePulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] }),
              transform: [{ scale: livePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
            },
          ]}
        />
        <View style={styles.liveBadge}>
          <Text style={styles.liveTxt}>LIVE</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...findingGlass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: FV2.pad,
  },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringTrack: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 4,
    borderColor: 'rgba(0,208,132,0.15)',
  },
  ringArc: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 4,
    borderColor: 'transparent',
    borderTopColor: FV2.green,
    borderRightColor: 'rgba(0,208,132,0.45)',
  },
  carBadge: {
    width: RING - 22,
    height: RING - 22,
    borderRadius: (RING - 22) / 2,
    backgroundColor: 'rgba(0,208,132,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  midCol: { flex: 1, minWidth: 0, gap: 8 },
  title: { fontSize: 16.5, fontWeight: '900', color: FV2.text, lineHeight: 21 },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: FV2.green,
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  status: { fontSize: 12, fontWeight: '700', color: FV2.sub },
  liveWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  liveHalo: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: FV2.green,
  },
  liveBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: FV2.green,
    backgroundColor: 'rgba(0,208,132,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTxt: { fontSize: 11.5, fontWeight: '900', color: FV2.green, letterSpacing: 1 },
});
