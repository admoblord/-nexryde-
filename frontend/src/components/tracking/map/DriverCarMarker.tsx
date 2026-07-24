import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { MarkerAnimated, AnimatedRegion } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PERFECT_TRACKING } from '@/src/components/tracking/trackingMapTokens';
import { bearingDeg, isValidMapCoord } from '@/src/components/tracking/map/mapUtils';
import {
  DRIVER_STATIONARY_THRESHOLD,
  driverMovedEnough,
} from '@/src/components/tracking/map/driverMapAnimation';
import {
  trackVerifyGlide,
  trackVerifyMarkerMount,
  trackVerifyPropsChanged,
  trackVerifyRotation,
} from '@/src/components/tracking/map/trackVerifyLog';

type Props = {
  lat: number;
  lng: number;
  heading?: number | null;
  moving?: boolean;
  tracksViewChanges?: boolean;
  /** Glide duration between GPS pings — match stream throttle (~4s). */
  moveDurationMs?: number;
};

const DEFAULT_MOVE_MS = 4000;
const ANDROID = Platform.OS === 'android';

/** Shortest-path heading lerp (degrees) for smooth turns. */
function lerpHeading(from: number, to: number, t: number): number {
  let delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

/** Premium taxi marker — glides + rotates with Uber/Bolt-class motion. */
export function DriverCarMarker({
  lat,
  lng,
  heading = null,
  moving = true,
  tracksViewChanges = !ANDROID,
  moveDurationMs = DEFAULT_MOVE_MS,
}: Props) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const carBright = useRef(new Animated.Value(1)).current;
  const lastCoord = useRef<{ lat: number; lng: number } | null>(null);
  const lastHeadingRef = useRef(0);
  const [displayHeading, setDisplayHeading] = useState(0);
  const propSeqRef = useRef(0);
  const mountedRef = useRef(false);
  const headingAnimRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    trackVerifyMarkerMount('MarkerAnimated', true);
  }, []);

  const animatedCoord = useRef(
    new AnimatedRegion({
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  // Android needs a brief view-tracking window so the custom marker bitmap
  // actually rasterizes — but the position is driven natively by AnimatedRegion
  // and rotation is a native prop, so we must NOT re-capture on every GPS tick
  // (that was pinning tracksViewChanges on the whole drive = major map jank).
  // Only re-capture on mount and when the body content can actually change
  // (the moving/arrow state).
  const [selfCapture, setSelfCapture] = useState(ANDROID);
  useEffect(() => {
    if (!ANDROID) return;
    setSelfCapture(true);
    const t = setTimeout(() => setSelfCapture(false), 3000);
    return () => clearTimeout(t);
  }, [moving]);

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const brightLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(carBright, { toValue: 1.08, duration: 1100, useNativeDriver: true }),
        Animated.timing(carBright, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ]),
    );
    glowLoop.start();
    brightLoop.start();
    return () => {
      glowLoop.stop();
      brightLoop.stop();
    };
  }, [glowAnim, carBright]);

  useEffect(() => {
    if (!isValidMapCoord(lat, lng)) return;
    const prev = lastCoord.current;
    const moved = driverMovedEnough(prev, lat, lng);
    const movedM =
      prev == null
        ? 999
        : Math.sqrt((prev.lat - lat) ** 2 + (prev.lng - lng) ** 2) * 111_000;

    if (!moved) {
      trackVerifyRotation(lastHeadingRef.current, false, movedM);
      return;
    }

    propSeqRef.current += 1;
    trackVerifyPropsChanged(lat, lng, propSeqRef.current);

    let nextHeading = lastHeadingRef.current;
    if (heading != null && Number.isFinite(Number(heading))) {
      nextHeading = Number(heading);
    } else if (prev) {
      nextHeading = bearingDeg(prev.lat, prev.lng, lat, lng);
    }

    const fromHeading = lastHeadingRef.current;
    lastHeadingRef.current = nextHeading;
    lastCoord.current = { lat, lng };

    const dist =
      prev == null
        ? DRIVER_STATIONARY_THRESHOLD * 2
        : Math.abs(prev.lat - lat) + Math.abs(prev.lng - lng);

    if (dist > DRIVER_STATIONARY_THRESHOLD) {
      // Smooth heading over ~280ms instead of snapping.
      if (headingAnimRef.current) cancelAnimationFrame(headingAnimRef.current);
      const start = Date.now();
      const dur = 280;
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / dur);
        const eased = 1 - (1 - t) * (1 - t);
        setDisplayHeading(lerpHeading(fromHeading, nextHeading, eased));
        if (t < 1) {
          headingAnimRef.current = requestAnimationFrame(step);
        }
      };
      headingAnimRef.current = requestAnimationFrame(step);
      trackVerifyRotation(nextHeading, true, movedM);
    } else {
      trackVerifyRotation(nextHeading, false, movedM);
    }

    const duration = Math.min(Math.max(moveDurationMs, 900), 5500);
    trackVerifyGlide(lat, lng, duration, moveDurationMs);
    animatedCoord
      .timing({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration,
        easing: Easing.linear,
        useNativeDriver: false,
        toValue: 0,
      })
      .start();
  }, [lat, lng, heading, animatedCoord, moveDurationMs]);

  useEffect(
    () => () => {
      if (headingAnimRef.current) cancelAnimationFrame(headingAnimRef.current);
    },
    [],
  );

  if (!isValidMapCoord(lat, lng)) return null;

  const taxiBody = (
    <Animated.View style={[styles.taxiBox, { transform: [{ scale: carBright }] }]}>
      <LinearGradient
        colors={['#FDE047', '#EAB308', '#CA8A04']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.taxiGrad}
      >
        <Ionicons name="car-sport" size={20} color="#111827" />
      </LinearGradient>
    </Animated.View>
  );

  const markerBody = (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={[
          styles.halo,
          {
            opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.62] }),
            transform: [
              { scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) },
            ],
          },
        ]}
      />
      <View style={styles.rotator}>
        {moving ? (
          <View style={styles.arrowSlot}>
            <Ionicons name="navigate" size={16} color={PERFECT_TRACKING.green} />
          </View>
        ) : null}
        {taxiBody}
      </View>
    </View>
  );

  return (
    <MarkerAnimated
      coordinate={animatedCoord}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges || selfCapture}
      zIndex={30}
      flat
      rotation={displayHeading}
    >
      {markerBody}
    </MarkerAnimated>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: PERFECT_TRACKING.yellow,
  },
  rotator: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowSlot: {
    marginBottom: 1,
    width: 22,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxiBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  taxiGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
