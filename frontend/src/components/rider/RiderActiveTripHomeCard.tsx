import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { useRiderActiveTripPhase } from '@/src/hooks/useRiderHasActiveTrip';
import {
  RIDER_TRIP_STEPS,
  riderTripIsSearching,
  riderTripStatusHeadline,
  riderTripStatusIcon,
  riderTripStatusSubtitle,
  riderTripStepIndex,
} from '@/src/constants/riderActiveTripDisplay';
import type { RiderTripDisplayOpts } from '@/src/utils/tripPaymentMethod';
import { RIDER_MAP_PRIMARY_CTA_GRADIENT } from '@/src/constants/riderRideChrome';
import { COLORS, useThemeColors } from '@/src/constants/theme';

function LivePulse() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.5,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.liveWrap}>
      <Animated.View style={[styles.liveRing, { transform: [{ scale: pulse }] }]} />
      <View style={styles.liveDot} />
    </View>
  );
}

function TripProgress({ activeIndex }: { activeIndex: number }) {
  const pct = Math.min(100, ((activeIndex + 0.5) / RIDER_TRIP_STEPS.length) * 100);
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        {RIDER_TRIP_STEPS.map((step, i) => (
          <Text
            key={step.key}
            style={[styles.progressLbl, i === activeIndex && styles.progressLblActive]}
            numberOfLines={1}
          >
            {step.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function RouteBlock({
  pickup,
  dropoff,
  fare,
}: {
  pickup?: string;
  dropoff?: string;
  fare?: number;
}) {
  const { colors, isDark } = useThemeColors();
  return (
    <View style={[styles.routeCard, { backgroundColor: colors.card }]}>
      <View style={styles.routeRow}>
        <View style={styles.routeRail}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
          <View style={[styles.routeLine, { backgroundColor: colors.borderStrong }]} />
          <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
        </View>
        <View style={styles.routeBody}>
          <View style={styles.routeStop}>
            <Text style={[styles.routeLabel, { color: COLORS.success }]}>PICK UP</Text>
            <Text style={[styles.routeAddr, { color: colors.text }]} numberOfLines={2}>
              {pickup || 'Pickup location'}
            </Text>
          </View>
          <View style={[styles.routeStop, { marginTop: 12 }]}>
            <Text style={[styles.routeLabel, { color: COLORS.error }]}>DROP OFF</Text>
            <Text style={[styles.routeAddr, { color: colors.text }]} numberOfLines={2}>
              {dropoff || 'Destination'}
            </Text>
          </View>
        </View>
      </View>
      {fare != null && fare > 0 ? (
        <View
          style={[
            styles.fareChip,
            {
              backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4',
              borderColor: isDark ? 'rgba(34,197,94,0.28)' : '#BBF7D0',
            },
          ]}
        >
          <Text style={styles.fareLbl}>Estimated fare</Text>
          <Text style={styles.fareVal}>₦{Math.round(fare).toLocaleString()}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function RiderActiveTripHomeCard() {
  const router = useRouter();
  const phase = useRiderActiveTripPhase();
  const currentTrip = useAppStore((s) => s.currentTrip);
  const { colors, isDark } = useThemeColors();

  if (!currentTrip?.id || !phase) return null;

  const displayOpts: RiderTripDisplayOpts = {
    paymentMethod: currentTrip.payment_method,
    paymentStatus: currentTrip.payment_status,
    tripStatus: currentTrip.status,
  };
  const headline = riderTripStatusHeadline(phase, displayOpts);
  const subtitle = riderTripStatusSubtitle(phase, displayOpts);
  const icon = riderTripStatusIcon(phase, displayOpts);
  const stepIndex = riderTripStepIndex(phase);
  const searching = riderTripIsSearching(phase);
  const pickup = currentTrip.pickup_location?.address?.trim();
  const dropoff = currentTrip.dropoff_location?.address?.trim();
  const tripRef = currentTrip.id.slice(-6).toUpperCase();

  const openTracking = () => {
    router.push({ pathname: '/rider/tracking', params: { tripId: currentTrip.id } } as any);
  };

  return (
    <TouchableOpacity
      style={[
        styles.wrap,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
      activeOpacity={0.92}
      onPress={openTracking}
      accessibilityRole="button"
      accessibilityLabel={`${headline}. Open live trip`}
    >
      <LinearGradient
        colors={[...RIDER_MAP_PRIMARY_CTA_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          {searching ? <LivePulse /> : <View style={styles.statusIconWrap}>
              <Ionicons name={icon} size={22} color="#022C22" />
            </View>}
          <View style={{ flex: 1 }}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>Live trip</Text>
              <View style={styles.refChip}>
                <Text style={styles.refTxt}>#{tripRef}</Text>
              </View>
            </View>
            <Text style={styles.title}>{headline}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
        </View>

        <TripProgress activeIndex={stepIndex} />
      </LinearGradient>

      <RouteBlock pickup={pickup} dropoff={dropoff} fare={currentTrip.fare} />

      <View
        style={[
          styles.mapCta,
          {
            backgroundColor: isDark ? colors.surfaceAlt : '#F8FAFC',
            borderTopColor: colors.border,
          },
        ]}
      >
        <Ionicons name="map" size={18} color={COLORS.accentGreenDark} />
        <Text style={styles.mapCtaTxt}>Open live map & tracking</Text>
        <Ionicons name="arrow-forward" size={16} color={COLORS.accentGreenDark} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  hero: {
    padding: 16,
    gap: 14,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  liveWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  liveDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFF',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  refChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  refTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 18,
    marginTop: 6,
  },
  progressWrap: {
    gap: 8,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#FFF',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flex: 1,
    textAlign: 'center',
  },
  progressLblActive: {
    color: '#FFF',
    fontWeight: '900',
  },
  routeCard: {
    padding: 16,
    paddingTop: 14,
    gap: 12,
  },
  routeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  routeRail: {
    alignItems: 'center',
    paddingTop: 4,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    flex: 1,
    width: 2,
    minHeight: 36,
    marginVertical: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 1,
  },
  routeBody: {
    flex: 1,
    minWidth: 0,
  },
  routeStop: {},
  routeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  routeAddr: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 19,
  },
  fareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  fareLbl: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  fareVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#15803D',
  },
  mapCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  mapCtaTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#057A48',
  },
});
