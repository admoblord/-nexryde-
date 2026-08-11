/**
 * Top-down car marker — rotates smoothly to heading (no snap).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Easing, Image, StyleSheet, View } from 'react-native';

type Props = {
  size?: number;
  searchMode?: boolean;
  /** Degrees clockwise from north; when omitted, faces north. */
  heading?: number | null;
};

const CAR_SRC = require('../../../assets/images/map/car-top.png');

/** Shortest-path heading lerp (degrees). */
function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

export function MapAnimatedTaxiMarker({ size = 36, heading = null }: Props) {
  const [displayHeading, setDisplayHeading] = useState(() =>
    typeof heading === 'number' && Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0,
  );
  const fromRef = useRef(displayHeading);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof heading !== 'number' || !Number.isFinite(heading)) return;
    const target = ((heading % 360) + 360) % 360;
    const from = fromRef.current;
    let delta = ((((target - from) % 360) + 540) % 360) - 180;
    if (Math.abs(delta) < 0.5) {
      fromRef.current = target;
      setDisplayHeading(target);
      return;
    }
    const start = Date.now();
    const duration = Math.min(700, Math.max(280, Math.abs(delta) * 4));
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = Easing.out(Easing.cubic)(t);
      const next = lerpHeading(from, target, eased);
      fromRef.current = next;
      setDisplayHeading(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplayHeading(target);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [heading]);

  const w = size;
  const h = Math.round(size * 1.85);

  return (
    <View style={{ width: w + 8, height: h + 8, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ transform: [{ rotate: `${displayHeading}deg` }] }}>
        <Image
          source={CAR_SRC}
          style={{ width: w, height: h }}
          resizeMode="contain"
          accessibilityLabel="Driver vehicle"
        />
      </View>
      <View style={styles.shadow} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
});

export default MapAnimatedTaxiMarker;
