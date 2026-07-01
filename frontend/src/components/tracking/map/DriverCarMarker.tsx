import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { MarkerAnimated, AnimatedRegion, Circle } from 'react-native-maps';
import { PERFECT_TRACKING } from '@/src/components/tracking/trackingMapTokens';
import { isValidMapCoord } from '@/src/components/tracking/map/mapUtils';

type Props = {
  lat: number;
  lng: number;
  heading?: number | null;
  moving?: boolean;
  tracksViewChanges?: boolean;
};

const HALO_RADIUS_M = 20;
const ROTATION_MS = 300;
const MOVE_MS = 750;
const ANDROID = Platform.OS === 'android';

/** Yellow taxi 🚕 + green direction arrow — native MapView marker. */
export function DriverCarMarker({
  lat,
  lng,
  heading = 0,
  moving = true,
  tracksViewChanges = !ANDROID,
}: Props) {
  const headingDeg = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  const rotateAnim = useRef(new Animated.Value(headingDeg)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const carBright = useRef(new Animated.Value(1)).current;
  const lastCoord = useRef({ lat, lng });

  // Smooth glide between GPS pings on BOTH platforms. Updating the plain
  // `coordinate` prop teleports the marker before any animate call runs, so
  // we render through an AnimatedRegion and tween it instead.
  const animatedCoord = useRef(
    new AnimatedRegion({
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  // Android snapshots custom marker views once — reopen capture whenever the
  // car moves so late-mounting markers (first driver ping) still paint.
  const [selfCapture, setSelfCapture] = useState(ANDROID);
  useEffect(() => {
    if (!ANDROID) return;
    setSelfCapture(true);
    const t = setTimeout(() => setSelfCapture(false), 3000);
    return () => clearTimeout(t);
  }, [lat, lng]);

  useEffect(() => {
    if (ANDROID) return;
    Animated.timing(rotateAnim, {
      toValue: headingDeg,
      duration: ROTATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [headingDeg, rotateAnim]);

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
    const moved =
      Math.abs(prev.lat - lat) > 1e-6 || Math.abs(prev.lng - lng) > 1e-6;
    lastCoord.current = { lat, lng };
    if (!moved) return;
    animatedCoord
      .timing({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration: MOVE_MS,
        easing: Easing.linear,
        useNativeDriver: false,
        toValue: 0, // ignored by AnimatedRegion — required by the TS config type
      })
      .start();
  }, [lat, lng, animatedCoord]);

  if (!isValidMapCoord(lat, lng)) return null;

  const rotatorInner = (
    <>
      <View style={styles.arrowSlot}>
        <Text style={styles.arrow}>▲</Text>
      </View>
      {ANDROID ? (
        <View style={styles.taxiBox}>
          <Text style={styles.taxiEmoji}>🚕</Text>
        </View>
      ) : (
        <Animated.View style={[styles.taxiBox, { transform: [{ scale: carBright }] }]}>
          <Text style={styles.taxiEmoji}>🚕</Text>
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
      {ANDROID ? (
        // Heading comes from the native `rotation` prop on Android — the
        // snapshotted view itself must stay unrotated or it doubles up.
        <View style={styles.rotator}>{rotatorInner}</View>
      ) : (
        <Animated.View
          style={[
            styles.rotator,
            {
              transform: [
                {
                  rotate: rotateAnim.interpolate({
                    inputRange: [0, 360],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        >
          {rotatorInner}
        </Animated.View>
      )}
    </View>
  );

  return (
    <>
      <Circle
        center={{ latitude: lat, longitude: lng }}
        radius={HALO_RADIUS_M}
        fillColor="rgba(255,215,0,0.14)"
        strokeColor="rgba(255,215,0,0.42)"
        zIndex={27}
      />
      <MarkerAnimated
        coordinate={animatedCoord}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={tracksViewChanges || selfCapture}
        zIndex={30}
        flat={moving}
        rotation={ANDROID ? headingDeg : undefined}
      >
        {markerBody}
      </MarkerAnimated>
    </>
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
  arrow: {
    fontSize: 18,
    fontWeight: '900',
    color: PERFECT_TRACKING.green,
    lineHeight: 20,
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
  taxiEmoji: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
});
