import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const GREEN = '#22C55E';
const RED = '#EF4444';

export type DriverPickupRouteTimelineProps = {
  pickupAddress: string;
  pickupMeta: string;
  pickupSub?: string;
  dropoffAddress: string;
  dropoffMeta?: string;
  compact?: boolean;
};

export function DriverPickupRouteTimeline({
  pickupAddress,
  pickupMeta,
  pickupSub,
  dropoffAddress,
  dropoffMeta,
  compact = false,
}: DriverPickupRouteTimelineProps) {
  return (
    <View style={[s.card, compact && s.cardCompact]}>
      <LinearGradient
        colors={['rgba(34,197,94,0.06)', 'transparent']}
        style={s.sheen}
        pointerEvents="none"
      />
      <View style={s.row}>
        <View style={s.rail}>
          <View style={[s.dot, { backgroundColor: GREEN }]} />
          <View style={s.line} />
          <View style={[s.dot, { backgroundColor: RED }]} />
        </View>
        <View style={s.body}>
          <View style={s.stop}>
            <Text style={[s.label, { color: GREEN }]}>PICK UP</Text>
            <Text style={s.addr} numberOfLines={2}>
              {pickupAddress || '—'}
            </Text>
            <Text style={s.meta}>{pickupMeta}</Text>
            {pickupSub?.trim() ? (
              <Text style={s.sub} numberOfLines={1}>
                {pickupSub.trim()}
              </Text>
            ) : null}
          </View>
          <View style={[s.stop, s.stopGap]}>
            <Text style={[s.label, { color: RED }]}>DROP OFF</Text>
            <Text style={s.addr} numberOfLines={2}>
              {dropoffAddress || '—'}
            </Text>
            {dropoffMeta?.trim() ? <Text style={s.meta}>{dropoffMeta}</Text> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cardCompact: {
    padding: 12,
    marginBottom: 12,
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
    gap: 12,
  },
  rail: {
    alignItems: 'center',
    paddingTop: 4,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 36,
    marginVertical: 4,
    borderRadius: 1,
    backgroundColor: '#CBD5E1',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  stop: {},
  stopGap: {
    marginTop: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  addr: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
    letterSpacing: -0.25,
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  sub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
  },
});
