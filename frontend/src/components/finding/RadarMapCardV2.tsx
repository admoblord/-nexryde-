/**
 * V2 radar scene — the "alive" heart of the matching screen.
 * Stylised dark city grid with: expanding scan pulses, a rotating radar
 * sweep, a glowing pickup pin, and nearby vehicle markers that drift in
 * place. All animations run on the native driver (transform/opacity only)
 * for a steady 60 FPS.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FV2 } from '@/src/components/finding/findingV2Theme';

const SCREEN_W = Dimensions.get('window').width;

type Props = { height: number };

/* Nearby vehicles — % positions inside the scene, each with its own drift. */
const CARS: Array<{ x: number; y: number; size: number; delay: number; dx: number; dy: number }> = [
  { x: 0.10, y: 0.22, size: 22, delay: 0, dx: 10, dy: 6 },
  { x: 0.26, y: 0.10, size: 19, delay: 600, dx: -8, dy: 8 },
  { x: 0.55, y: 0.07, size: 20, delay: 1200, dx: 9, dy: -5 },
  { x: 0.84, y: 0.16, size: 22, delay: 300, dx: -10, dy: 7 },
  { x: 0.90, y: 0.48, size: 19, delay: 900, dx: -7, dy: -8 },
  { x: 0.78, y: 0.78, size: 21, delay: 1500, dx: 8, dy: -6 },
  { x: 0.42, y: 0.86, size: 20, delay: 450, dx: -9, dy: -7 },
  { x: 0.12, y: 0.68, size: 21, delay: 1050, dx: 10, dy: -5 },
];

function DriftingCar({ x, y, size, delay, dx, dy, sceneW, sceneH }: (typeof CARS)[number] & { sceneW: number; sceneH: number }) {
  const drift = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const move = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(drift, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(blink, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    move.start();
    glow.start();
    return () => {
      move.stop();
      glow.stop();
    };
  }, [drift, blink, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.car,
        {
          left: x * sceneW - size / 2,
          top: y * sceneH - size / 2,
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.carHalo,
          {
            width: size + 14,
            height: size + 14,
            borderRadius: (size + 14) / 2,
            opacity: blink.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.3] }),
          },
        ]}
      />
      <MaterialCommunityIcons name="car-side" size={size} color="#D7E4F2" />
    </Animated.View>
  );
}

export function RadarMapCardV2({ height }: Props) {
  const sceneW = SCREEN_W;
  const sceneH = height;

  /* expanding scan pulses (3, staggered) */
  const pulses = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  /* rotating sweep beam */
  const sweep = useRef(new Animated.Value(0)).current;
  /* center pin heartbeat */
  const pinPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = pulses.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 1100),
          Animated.timing(v, { toValue: 1, duration: 3300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true }),
    );
    const pinLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pinPulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pinPulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loops.forEach((l) => l.start());
    sweepLoop.start();
    pinLoop.start();
    return () => {
      loops.forEach((l) => l.stop());
      sweepLoop.stop();
      pinLoop.stop();
    };
  }, [pulses, sweep, pinPulse]);

  /* city grid lines */
  const grid = useMemo(() => {
    const verticals = [0.14, 0.3, 0.46, 0.62, 0.78, 0.92];
    const horizontals = [0.18, 0.38, 0.58, 0.78];
    return { verticals, horizontals };
  }, []);

  const maxRing = Math.min(sceneW, sceneH) * 0.92;

  return (
    <View style={[styles.scene, { height: sceneH }]} pointerEvents="none">
      {/* grid */}
      {grid.verticals.map((p) => (
        <View key={`v${p}`} style={[styles.gridV, { left: p * sceneW }]} />
      ))}
      {grid.horizontals.map((p) => (
        <View key={`h${p}`} style={[styles.gridH, { top: p * sceneH }]} />
      ))}

      {/* soft central glow */}
      <View
        style={[
          styles.centerGlow,
          {
            width: maxRing,
            height: maxRing,
            borderRadius: maxRing / 2,
            left: sceneW / 2 - maxRing / 2,
            top: sceneH / 2 - maxRing / 2,
          },
        ]}
      />

      {/* static reference rings */}
      {[0.34, 0.58, 0.82].map((f) => {
        const d = maxRing * f;
        return (
          <View
            key={`ring${f}`}
            style={[
              styles.refRing,
              {
                width: d,
                height: d,
                borderRadius: d / 2,
                left: sceneW / 2 - d / 2,
                top: sceneH / 2 - d / 2,
              },
            ]}
          />
        );
      })}

      {/* expanding scan pulses */}
      {pulses.map((v, i) => (
        <Animated.View
          key={`pulse${i}`}
          style={[
            styles.pulse,
            {
              width: maxRing,
              height: maxRing,
              borderRadius: maxRing / 2,
              left: sceneW / 2 - maxRing / 2,
              top: sceneH / 2 - maxRing / 2,
              opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.12, 1] }) }],
            },
          ]}
        />
      ))}

      {/* rotating radar sweep */}
      <Animated.View
        style={[
          styles.sweepPivot,
          {
            width: maxRing,
            height: maxRing,
            left: sceneW / 2 - maxRing / 2,
            top: sceneH / 2 - maxRing / 2,
            transform: [
              {
                rotate: sweep.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
      >
        <View style={[styles.sweepBeam, { width: maxRing / 2 }]} />
      </Animated.View>

      {/* nearby vehicles */}
      {CARS.map((c, i) => (
        <DriftingCar key={i} {...c} sceneW={sceneW} sceneH={sceneH} />
      ))}

      {/* center pickup pin */}
      <View style={[styles.pinAnchor, { left: sceneW / 2, top: sceneH / 2 }]}>
        <Animated.View
          style={[
            styles.pinHalo,
            {
              opacity: pinPulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
              transform: [{ scale: pinPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
            },
          ]}
        />
        <View style={styles.pinBody}>
          <Ionicons name="location" size={20} color="#FFFFFF" />
        </View>
      </View>

      {/* top + bottom fade so the scene melts into the screen background */}
      <LinearGradient
        colors={[FV2.bg, 'rgba(3,11,26,0)']}
        style={[styles.fade, styles.fadeTop]}
      />
      <LinearGradient
        colors={['rgba(3,11,26,0)', FV2.bg]}
        style={[styles.fade, styles.fadeBottom]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#04101F',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(0,208,132,0.07)',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0,208,132,0.06)',
  },
  centerGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(0,208,132,0.05)',
  },
  refRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.14)',
  },
  pulse: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: FV2.green,
  },
  sweepPivot: {
    position: 'absolute',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sweepBeam: {
    height: 2,
    backgroundColor: 'rgba(0,208,132,0.35)',
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  car: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carHalo: {
    position: 'absolute',
    backgroundColor: FV2.green,
  },
  pinAnchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHalo: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: FV2.green,
  },
  pinBody: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: FV2.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 10,
  },
  fade: { position: 'absolute', left: 0, right: 0, height: 46 },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
});
