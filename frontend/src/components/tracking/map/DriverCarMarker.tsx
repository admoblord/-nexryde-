/**
 * Live tracking / arriving driver marker — top-down car that glides + rotates.
 * Same asset as booking nearby drivers (MapAnimatedTaxiMarker).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Easing, Image } from 'react-native';
import { MarkerAnimated, AnimatedRegion } from 'react-native-maps';
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
  /** Visual size of the top-down car (width). */
  size?: number;
};

const DEFAULT_MOVE_MS = 4000;
const ANDROID = Platform.OS === 'android';
const CAR_SRC = require('../../../../assets/images/map/car-top.png');

/** Shortest-path heading lerp (degrees). */
function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

/** Top-down car — glides between GPS pings, rotates smoothly (no snap). */
export function DriverCarMarker({
  lat,
  lng,
  heading = null,
  moving = true,
  tracksViewChanges = !ANDROID,
  moveDurationMs = DEFAULT_MOVE_MS,
  size = 36,
}: Props) {
  const lastCoord = useRef<{ lat: number; lng: number } | null>(null);
  const lastHeadingRef = useRef(0);
  const [displayHeading, setDisplayHeading] = useState(0);
  const propSeqRef = useRef(0);
  const mountedRef = useRef(false);
  const headingRafRef = useRef<number | null>(null);

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

  // Android: brief bitmap capture on mount / when moving state changes.
  const [selfCapture, setSelfCapture] = useState(ANDROID);
  useEffect(() => {
    if (!ANDROID) return;
    setSelfCapture(true);
    const t = setTimeout(() => setSelfCapture(false), 3000);
    return () => clearTimeout(t);
  }, [moving, size]);

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
      if (headingRafRef.current != null) cancelAnimationFrame(headingRafRef.current);
      const start = Date.now();
      const turn = Math.abs(((((nextHeading - fromHeading) % 360) + 540) % 360) - 180);
      const dur = Math.min(700, Math.max(280, turn * 4));
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / dur);
        const eased = Easing.out(Easing.cubic)(t);
        setDisplayHeading(lerpHeading(fromHeading, nextHeading, eased));
        if (t < 1) {
          headingRafRef.current = requestAnimationFrame(step);
        } else {
          headingRafRef.current = null;
        }
      };
      headingRafRef.current = requestAnimationFrame(step);
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
      if (headingRafRef.current != null) cancelAnimationFrame(headingRafRef.current);
    },
    [],
  );

  if (!isValidMapCoord(lat, lng)) return null;

  const carW = size;
  const carH = Math.round(size * 1.85);

  return (
    <MarkerAnimated
      coordinate={animatedCoord}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges || selfCapture}
      zIndex={30}
      flat
      rotation={displayHeading}
    >
      <View style={[styles.wrap, { width: carW + 16, height: carH + 16 }]} pointerEvents="none">
        {moving ? <View style={styles.softHalo} /> : null}
        <Image
          source={CAR_SRC}
          style={{ width: carW, height: carH }}
          resizeMode="contain"
          accessibilityLabel="Driver vehicle"
        />
      </View>
    </MarkerAnimated>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  softHalo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(250, 204, 21, 0.22)',
  },
});

export default DriverCarMarker;
