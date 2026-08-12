/**
 * Shared Nexryde top-down vehicle marker — single asset source for
 * booking nearby, live arriving, driver self, and home strip.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Easing, Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { MAP_VEHICLE, type MapVehicleStatus } from '@/src/constants/designSystem';

export type { MapVehicleStatus };

const CAR_ASSETS: Record<MapVehicleStatus, ImageSourcePropType> = {
  available: require('../../../assets/images/map/car-nexryde-available.png'),
  on_trip: require('../../../assets/images/map/car-nexryde-on_trip.png'),
  offline: require('../../../assets/images/map/car-nexryde-offline.png'),
};

type Props = {
  size?: number;
  /** Degrees clockwise from north. */
  heading?: number | null;
  status?: MapVehicleStatus;
  /** Soft brand halo under moving vehicles. */
  showHalo?: boolean;
};

/** Shortest-path heading lerp (degrees). */
function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

export function MapVehicleMarker({
  size = 36,
  heading = null,
  status = 'available',
  showHalo = false,
}: Props) {
  const [displayHeading, setDisplayHeading] = useState(() =>
    typeof heading === 'number' && Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0,
  );
  const fromRef = useRef(displayHeading);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof heading !== 'number' || !Number.isFinite(heading)) return;
    const target = ((heading % 360) + 360) % 360;
    const from = fromRef.current;
    const delta = ((((target - from) % 360) + 540) % 360) - 180;
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
  const haloColor =
    status === 'on_trip'
      ? MAP_VEHICLE.accentOnTrip
      : status === 'offline'
        ? MAP_VEHICLE.accentOffline
        : MAP_VEHICLE.accentAvailable;

  return (
    <View
      style={{ width: w + 10, height: h + 10, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`Nexryde vehicle ${status}`}
    >
      {showHalo ? (
        <View style={[styles.halo, { backgroundColor: haloColor, opacity: 0.22 }]} />
      ) : null}
      <View style={{ transform: [{ rotate: `${displayHeading}deg` }] }}>
        <Image
          source={CAR_ASSETS[status]}
          style={{ width: w, height: h }}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

/** Asset map for native Marker rotation (DriverCarMarker uses Image + flat rotation). */
export function mapVehicleImageSource(status: MapVehicleStatus = 'available'): ImageSourcePropType {
  return CAR_ASSETS[status];
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});

export default MapVehicleMarker;
