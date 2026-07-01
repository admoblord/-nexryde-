/**
 * V2 trip progress card — pickup→destination track with a sliding car,
 * solid green behind the car, dashed ahead, and a 3-stat row
 * (progress % · km remaining · ETA).
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { TV2, glassCard } from '@/src/components/tracking/v2/trackingV2Theme';
import { TV2_LAYOUT } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  /** 0..1 — how far along the current leg the driver is. */
  progress: number;
  distanceKm: number | null;
  etaMinutes: number | null;
  /** 'pickup' leg (driver coming) or 'destination' leg (on trip). */
  leg: 'pickup' | 'destination';
};

const CAR_W = 30;

function TripProgressCardV2Inner({ progress, distanceKm, etaMinutes, leg }: Props) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const anim = useRef(new Animated.Value(clamped)).current;
  const [trackW, setTrackW] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: clamped,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animates width/left
    }).start();
  }, [clamped, anim]);

  const pct = Math.round(clamped * 100);
  const usable = Math.max(0, trackW - CAR_W);

  const startLabel = leg === 'pickup' ? 'Driver' : 'Pickup';
  const endLabel = leg === 'pickup' ? 'Pickup' : 'Destination';

  return (
    <View style={styles.card}>
      {/* labels */}
      <View style={styles.labelRow}>
        <View style={styles.labelSide}>
          <View style={styles.startDot} />
          <Text style={styles.labelTxt}>{startLabel}</Text>
        </View>
        <View style={styles.labelSide}>
          <Text style={styles.labelTxt}>{endLabel}</Text>
          <Ionicons name="location" size={13} color={TV2.sub} />
        </View>
      </View>

      {/* track */}
      <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <View style={styles.dashLine}>
          {Array.from({ length: 24 }).map((_, i) => (
            <View key={i} style={styles.dash} />
          ))}
        </View>
        <Animated.View
          style={[
            styles.fillLine,
            {
              width: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [CAR_W / 2, Math.max(CAR_W / 2, trackW - CAR_W / 2)],
              }),
            },
          ]}
        />
        <View style={styles.endDot} />
        <Animated.View
          style={[
            styles.carWrap,
            {
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, usable],
                  }),
                },
              ],
            },
          ]}
        >
          <MaterialCommunityIcons name="car-side" size={22} color={TV2.text} />
        </Animated.View>
      </View>

      {/* stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="speedometer-outline" size={16} color={TV2.green} />
          <Text style={styles.statValue}>{pct}%</Text>
          <Text style={styles.statLabel}>Trip progress</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <MaterialCommunityIcons name="road-variant" size={16} color={TV2.green} />
          <Text style={styles.statValue}>
            {distanceKm == null || !Number.isFinite(distanceKm)
              ? '—'
              : distanceKm < 0.05
                ? 'Here'
                : distanceKm < 1
                  ? `${Math.round(distanceKm * 1000)} m`
                  : `${distanceKm.toFixed(1)} km`}
          </Text>
          <Text style={styles.statLabel}>Remaining</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Ionicons name="time-outline" size={16} color={TV2.green} />
          <Text style={styles.statValue}>
            {etaMinutes == null ? '—' : etaMinutes <= 0 ? 'Now' : `${etaMinutes} min`}
          </Text>
          <Text style={styles.statLabel}>ETA</Text>
        </View>
      </View>
    </View>
  );
}

export const TripProgressCardV2 = memo(TripProgressCardV2Inner);

const styles = StyleSheet.create({
  card: { ...glassCard, padding: TV2.pad, gap: 10, height: TV2_LAYOUT.tripProgressCard, overflow: 'hidden' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  labelSide: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  labelTxt: { fontSize: 12.5, fontWeight: '800', color: TV2.sub },
  startDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: TV2.green,
    shadowColor: TV2.green,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  track: { height: 30, justifyContent: 'center' },
  dashLine: {
    position: 'absolute',
    left: CAR_W / 2,
    right: CAR_W / 2,
    height: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dash: { width: 7, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  fillLine: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: TV2.green,
    shadowColor: TV2.green,
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  endDot: {
    position: 'absolute',
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: TV2.sub,
    backgroundColor: TV2.bg,
  },
  carWrap: {
    position: 'absolute',
    left: 0,
    width: CAR_W,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', alignItems: 'stretch', marginTop: 2 },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivider: { width: 1, backgroundColor: TV2.hairline, marginVertical: 2 },
  statValue: { fontSize: 15.5, fontWeight: '900', color: TV2.text, fontVariant: ['tabular-nums'], minHeight: 20, minWidth: 52, textAlign: 'center' },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: TV2.faint },
});
