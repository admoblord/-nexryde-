/**
 * Destination / target ETA puck — Uber-style floating minute badge on the map.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { BRAND } from '@/src/constants/designSystem';

type Props = {
  lat: number;
  lng: number;
  etaMin: number | null;
  label?: string;
  tone?: 'green' | 'red' | 'blue' | 'amber';
};

const TONES = {
  green: { bg: '#22E5A0', text: '#041016' },
  red: { bg: '#EF4444', text: '#fff' },
  blue: { bg: '#3B82F6', text: '#fff' },
  amber: { bg: '#F59E0B', text: '#0F172A' },
} as const;

export function EtaRoutePuck({ lat, lng, etaMin, label, tone = 'green' }: Props) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const colors = TONES[tone];
  const etaTxt =
    etaMin != null && Number.isFinite(etaMin) && etaMin >= 0
      ? `${Math.max(1, Math.round(etaMin))} min`
      : null;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      zIndex={40}
    >
      <View style={styles.wrap} collapsable={false}>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          {etaTxt ? <Text style={[styles.eta, { color: colors.text }]}>{etaTxt}</Text> : null}
          {label ? (
            <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </View>
        <View style={[styles.stem, { backgroundColor: colors.bg }]} />
        <View style={[styles.dot, { borderColor: colors.bg }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  badge: {
    minWidth: 52,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  eta: { fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
  label: { fontSize: 9, fontWeight: '800', marginTop: 1, opacity: 0.9 },
  stem: { width: 3, height: 10, marginTop: -1 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND.bgDeep,
    borderWidth: 2.5,
    marginTop: -2,
  },
});
