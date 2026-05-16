/**
 * Unified top chrome during active trips — one bar per phase (no overlap with earnings pill).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  DOCK_PHASE_COLORS,
  PHASE_CHROME_BLUR,
  PHASE_CHROME_RADIUS,
} from '@/src/components/driver/driverDockTheme';

export type DriverTripPhase =
  | 'heading_pickup'
  | 'arrived'
  | 'rider_in_car'
  | 'ongoing';

export type DriverTripPhaseChromeProps = {
  phase: DriverTripPhase;
  top: number;
  /** e.g. "~1 min" or "109 m" */
  metricPrimary?: string | null;
  metricSecondary?: string | null;
  dockExpanded: boolean;
  onToggleDock: () => void;
  onMenuPress?: () => void;
};

const PHASE_COPY: Record<
  DriverTripPhase,
  { kicker: string; title: string; icon: keyof typeof Ionicons.glyphMap; iconBg: string }
> = {
  heading_pickup: {
    kicker: 'Live trip',
    title: 'Heading to pickup',
    icon: 'navigate',
    iconBg: '#34F5B8',
  },
  arrived: {
    kicker: 'At pickup',
    title: "You've arrived",
    icon: 'checkmark',
    iconBg: '#34F5B8',
  },
  rider_in_car: {
    kicker: 'Pickup done',
    title: 'Rider in car',
    icon: 'car-sport',
    iconBg: '#34F5B8',
  },
  ongoing: {
    kicker: 'En route',
    title: 'Trip in progress',
    icon: 'flag',
    iconBg: '#60A5FA',
  },
};

export function DriverTripPhaseChrome({
  phase,
  top,
  metricPrimary,
  metricSecondary,
  dockExpanded,
  onToggleDock,
  onMenuPress,
}: DriverTripPhaseChromeProps) {
  const copy = PHASE_COPY[phase];
  const accent = DOCK_PHASE_COLORS[phase];

  return (
    <View style={[s.wrap, { top }]} pointerEvents="box-none">
      <View style={[s.card, { borderColor: accent.border }]}>
        {Platform.OS === 'ios' || Platform.OS === 'android' ? (
          <BlurView intensity={PHASE_CHROME_BLUR} tint="dark" style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(4,9,20,0.92)' }]} />
        )}
        <LinearGradient
          colors={[accent.sheen, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={s.sheen}
          pointerEvents="none"
        />

        <View style={s.row}>
          {onMenuPress ? (
            <TouchableOpacity
              style={s.iconBtn}
              onPress={onMenuPress}
              activeOpacity={0.82}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Menu"
            >
              <Ionicons name="menu" size={20} color="#E2E8F0" />
            </TouchableOpacity>
          ) : (
            <View style={[s.leadIcon, { backgroundColor: copy.iconBg }]}>
              <Ionicons name={copy.icon} size={18} color="#022C22" />
            </View>
          )}

          <View style={s.center} pointerEvents="none">
            <View style={s.kickerRow}>
              <View style={[s.liveDot, { backgroundColor: accent.dot }]} />
              <Text style={[s.kicker, { color: accent.kicker }]}>{copy.kicker}</Text>
            </View>
            <Text style={s.title} numberOfLines={1}>
              {copy.title}
            </Text>
            {(metricPrimary || metricSecondary) ? (
              <Text style={s.metrics} numberOfLines={1}>
                {[metricPrimary, metricSecondary].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={s.iconBtn}
            onPress={onToggleDock}
            activeOpacity={0.82}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={dockExpanded ? 'Collapse trip card' : 'Expand trip card'}
          >
            <Ionicons
              name={dockExpanded ? 'chevron-down' : 'chevron-up'}
              size={22}
              color="#94A3B8"
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 28,
  },
  card: {
    borderRadius: PHASE_CHROME_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 14,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,41,59,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
  },
  leadIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, minWidth: 0 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  metrics: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.95)',
  },
});
