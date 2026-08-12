/**
 * Navy pill with a pointer tail that sits on the map above a point.
 *
 * Two lines: label above, value below — Pickup / 12 min, Dropoff / 12:48 AM.
 * `arrivalClockTime()` is here because the dropoff badge shows the clock time
 * the rider arrives, not a duration.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, colors, radius, shadow, space, type } from '@/src/theme/tokens';

export type MapBadgeTone = 'navy' | 'amber';

/** Device-local clock time `now + durationMinutes`, e.g. "12:48 AM". */
export function arrivalClockTime(durationMinutes: number | null | undefined, now: Date = new Date()): string {
  const mins = Number(durationMinutes);
  if (!Number.isFinite(mins) || mins < 0) return '--:--';
  const at = new Date(now.getTime() + Math.round(mins) * 60_000);
  return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MapBadge({
  label,
  value,
  tone = 'navy',
  style,
}: {
  label: string;
  value?: string | null;
  tone?: MapBadgeTone;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'amber' ? colors.amber : colors.navy;
  const fg = tone === 'amber' ? colors.navy : alpha.white;
  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <View style={[styles.body, { backgroundColor: bg }]}>
        <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text style={[styles.value, { color: fg }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      <View style={[styles.tail, { borderTopColor: bg }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  body: {
    borderRadius: radius.button,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minWidth: 84,
    alignItems: 'center',
    ...shadow,
  },
  label: { ...type.label, opacity: 0.8 },
  value: { ...type.bodyBold, marginTop: 1 },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
});
