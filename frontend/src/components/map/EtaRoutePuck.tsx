/**
 * Floating map badge over a trip point.
 *
 * Label sits above the value: `Pickup` / `12 min`, `Dropoff` / `12:48 AM`.
 * The dropoff badge shows the clock time the rider arrives, because "12 min"
 * next to a destination reads as travel time from wherever you happen to be
 * looking — an arrival time answers the question the rider is actually asking.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

import { alpha, colors as T, radius, shadow, space, type as TYPE } from '@/src/theme/tokens';
import { arrivalClockTime } from '@/src/components/trip/MapBadge';

type Props = {
  lat: number;
  lng: number;
  etaMin: number | null;
  label?: string;
  /** `amber` is the act-now state (driver is here). */
  tone?: 'navy' | 'amber' | 'green' | 'red' | 'blue';
  /** Dropoff badges show an arrival clock time; everything else shows a duration. */
  valueMode?: 'duration' | 'arrivalClock';
};

const TONES = {
  navy: { bg: T.navy, text: alpha.white },
  amber: { bg: T.amber, text: T.navy },
  // Legacy tones map onto the brand palette so no screen paints its own colour.
  green: { bg: T.navy, text: alpha.white },
  red: { bg: T.navy, text: alpha.white },
  blue: { bg: T.blue, text: alpha.white },
} as const;

export function EtaRoutePuck({ lat, lng, etaMin, label, tone = 'navy', valueMode = 'duration' }: Props) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const palette = TONES[tone] ?? TONES.navy;

  const hasEta = etaMin != null && Number.isFinite(etaMin) && etaMin >= 0;
  const valueTxt = hasEta
    ? valueMode === 'arrivalClock'
      ? arrivalClockTime(etaMin as number)
      : `${Math.max(1, Math.round(etaMin as number))} min`
    : null;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      zIndex={40}
    >
      <View style={styles.wrap} collapsable={false}>
        <View style={[styles.badge, { backgroundColor: palette.bg }]}>
          {label ? (
            <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
          {valueTxt ? (
            <Text style={[styles.value, { color: palette.text }]} numberOfLines={1}>
              {valueTxt}
            </Text>
          ) : null}
        </View>
        <View style={[styles.stem, { backgroundColor: palette.bg }]} />
        <View style={[styles.dot, { borderColor: palette.bg }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  badge: {
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    minWidth: 78,
    alignItems: 'center',
    ...shadow,
  },
  label: { ...TYPE.label, opacity: 0.8 },
  value: { ...TYPE.bodyBold, marginTop: 1 },
  stem: { width: 2, height: 10 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 3,
    backgroundColor: alpha.white,
  },
});
