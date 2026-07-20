import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { MarkerAnimated, AnimatedRegion } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
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

/** Yellow taxi + green direction arrow — glides and rotates like Bolt. */
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

  const [selfCapture, setSelfCapture] = useState(ANDROID);
  useEffect(() => {
    if (!ANDROID) return;
    setSelfCapture(true);
    const t = setTimeout(() => setSelfCapture(false), 3000);
    return () => clearTimeout(t);
  }, [lat, lng]);

  useEffect(() => {
    if (ANDROID) return;
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const brightLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(carBright, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(carBright, { toValue: 1, duration: 1000, useNativeDriver: true }),
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
    lastHeadingRef.current = nextHeading;
    lastCoord.current = { lat, lng };

    const dist =
      prev == null
        ? DRIVER_STATIONARY_THRESHOLD * 2
        : Math.abs(prev.lat - lat) + Math.abs(prev.lng - lng);
    if (dist > DRIVER_STATIONARY_THRESHOLD) {
      setDisplayHeading(nextHeading);
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

  if (!isValidMapCoord(lat, lng)) return null;

  const rotatorInner = (
    <>
      <View style={styles.arrowSlot}>
        <Ionicons name="navigate" size={18} color={PERFECT_TRACKING.green} />
      </View>
      {ANDROID ? (
        <View style={styles.taxiBox}>
          <Ionicons name="car-sport" size={21} color="#111827" />
        </View>
      ) : (
        <Animated.View style={[styles.taxiBox, { transform: [{ scale: carBright }] }]}>
          <Ionicons name="car-sport" size={21} color="#111827" />
        </Animated.View>
      )}
    </>
  );

  const markerBody = (
    <View style={styles.wrap} pointerEvents="none">
      {ANDROID ? (
        <View style={[styles.halo, styles.haloStatic]} />
      ) : (
        <Animated.View
          style={[
            styles.halo,
            {
              opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.55] }),
              transform: [
                { scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
              ],
            },
          ]}
        />
      )}
      <View style={styles.rotator}>{rotatorInner}</View>
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
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PERFECT_TRACKING.yellow,
  },
  haloStatic: { opacity: 0.5 },
  rotator: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowSlot: {
    marginBottom: 2,
    width: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxiBox: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: PERFECT_TRACKING.yellow,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 10,
  },
});
