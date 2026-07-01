import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, Easing } from 'react-native';
import { Marker, Circle } from 'react-native-maps';
import { PERFECT_TRACKING } from '@/src/components/tracking/trackingMapTokens';
import { isValidMapCoord } from '@/src/components/tracking/map/mapUtils';

const ANDROID_STATIC = Platform.OS === 'android';

function usePulseLoop(durationMs: number, enabled: boolean) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled || ANDROID_STATIC) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: durationMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: durationMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, durationMs, enabled]);
  return pulse;
}

export function PickupMarker({
  lat,
  lng,
  tracksViewChanges = false,
}: {
  lat: number;
  lng: number;
  tracksViewChanges?: boolean;
}) {
  if (!isValidMapCoord(lat, lng)) return null;
  return (
    <>
      <Circle
        center={{ latitude: lat, longitude: lng }}
        radius={80}
        strokeColor="rgba(0,208,132,0.5)"
        fillColor="rgba(0,208,132,0.12)"
        zIndex={8}
      />
      <Marker
        coordinate={{ latitude: lat, longitude: lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={tracksViewChanges}
        zIndex={12}
      >
        <View style={styles.pickupWrap}>
          <View style={styles.pickupDot} />
          <Text style={styles.pickupLbl}>PICKUP</Text>
        </View>
      </Marker>
    </>
  );
}

/** Red destination pin 📍 with 500ms glow pulse. */
export function DestinationMarker({
  lat,
  lng,
  address,
  tracksViewChanges = false,
}: {
  lat: number;
  lng: number;
  address?: string;
  tracksViewChanges?: boolean;
}) {
  const glow = usePulseLoop(500, true);

  if (!isValidMapCoord(lat, lng)) return null;

  const glowScale = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.45],
  });
  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.95],
  });

  return (
    <>
      <Circle
        center={{ latitude: lat, longitude: lng }}
        radius={35}
        fillColor="rgba(255,68,68,0.12)"
        strokeColor="rgba(255,68,68,0.35)"
        zIndex={13}
      />
      <Marker
        coordinate={{ latitude: lat, longitude: lng }}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={tracksViewChanges}
        zIndex={14}
      >
        <View style={styles.destWrap}>
          {ANDROID_STATIC ? (
            <View style={[styles.destGlow, styles.destGlowStatic]} />
          ) : (
            <Animated.View
              style={[
                styles.destGlow,
                { opacity: glowOpacity, transform: [{ scale: glowScale }] },
              ]}
            />
          )}
          <Text style={styles.destPin}>📍</Text>
          {address ? (
            <View style={styles.destLabel}>
              <Text style={styles.destTag}>DESTINATION</Text>
              <Text style={styles.destAddr} numberOfLines={2}>
                {address}
              </Text>
            </View>
          ) : null}
        </View>
      </Marker>
    </>
  );
}

/** Blue rider dot (#0066FF) with 1000ms pulse — live GPS or pickup fallback. */
export function UserLocationMarker({
  lat,
  lng,
  tracksViewChanges = false,
}: {
  lat: number;
  lng: number;
  tracksViewChanges?: boolean;
}) {
  const pulse = usePulseLoop(1000, true);

  if (!isValidMapCoord(lat, lng)) return null;

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });

  return (
    <>
      <Circle
        center={{ latitude: lat, longitude: lng }}
        radius={90}
        strokeColor="rgba(0,102,255,0.3)"
        fillColor="rgba(0,102,255,0.06)"
        zIndex={6}
      />
      <Marker
        coordinate={{ latitude: lat, longitude: lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={tracksViewChanges}
        zIndex={10}
      >
        <View style={styles.userWrap}>
          {ANDROID_STATIC ? (
            <View style={[styles.userPulse, styles.userPulseStatic]} />
          ) : (
            <Animated.View
              style={[
                styles.userPulse,
                { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
              ]}
            />
          )}
          <View style={styles.userDot}>
            <View style={styles.userCore} />
          </View>
          <Text style={styles.userLbl}>YOU</Text>
        </View>
      </Marker>
    </>
  );
}

export function DistanceKmMarker({ lat, lng, km }: { lat: number; lng: number; km: number }) {
  if (!isValidMapCoord(lat, lng)) return null;
  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      zIndex={5}
    >
      <View style={styles.kmChip}>
        <Text style={styles.kmTxt}>{km} km</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pickupWrap: { alignItems: 'center' },
  pickupDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: PERFECT_TRACKING.green,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  pickupLbl: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '800',
    color: PERFECT_TRACKING.green,
    letterSpacing: 0.6,
  },
  destWrap: { alignItems: 'center', maxWidth: 168 },
  destGlow: {
    position: 'absolute',
    top: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PERFECT_TRACKING.red,
  },
  destGlowStatic: { opacity: 0.6 },
  destPin: {
    fontSize: 40,
    lineHeight: 44,
    color: PERFECT_TRACKING.red,
    textShadowColor: 'rgba(255,68,68,0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  destLabel: {
    marginTop: 2,
    backgroundColor: 'rgba(15,23,42,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PERFECT_TRACKING.border,
  },
  destTag: { color: PERFECT_TRACKING.red, fontSize: 9, fontWeight: '900' },
  destAddr: { color: '#F8FAFC', fontSize: 10, fontWeight: '600', marginTop: 2 },
  userWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  userPulse: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: PERFECT_TRACKING.blue,
    borderWidth: 2,
    borderColor: 'rgba(0,102,255,0.5)',
  },
  userPulseStatic: { opacity: 0.35, transform: [{ scale: 1.35 }] },
  userDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: PERFECT_TRACKING.blue,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  userCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF' },
  userLbl: {
    position: 'absolute',
    bottom: -14,
    fontSize: 8,
    fontWeight: '800',
    color: PERFECT_TRACKING.blue,
  },
  kmChip: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: PERFECT_TRACKING.border,
  },
  kmTxt: { color: '#E2E8F0', fontSize: 9, fontWeight: '700' },
});
