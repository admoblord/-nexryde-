/**
 * Map-first finding driver dock — matches book overlay / RiderFindingDriverChrome.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  RiderFindingMetricsCard,
  RiderFindingSheetHandle,
  RiderFindingStatusHero,
} from '@/src/components/rider/RiderFindingDriverChrome';
import { RIDER_FINDING_SHEET_BORDER } from '@/src/constants/riderRideChrome';
import { DOCK_BLUR_INTENSITY, DOCK_TOP_RADIUS } from '@/src/components/driver/driverDockTheme';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export type RiderFindingTripDockProps = {
  loading?: boolean;
  pickupVicinityLabel?: string;
  bidNgn?: number;
  routeKmLabel?: string | null;
  routeMinLabel?: string | null;
  onCancel: () => void;
  bottomInset: number;
};

export function RiderFindingTripDock({
  loading,
  pickupVicinityLabel,
  bidNgn = 0,
  routeKmLabel,
  routeMinLabel,
  onCancel,
  bottomInset,
}: RiderFindingTripDockProps) {
  return (
    <View style={[styles.root, { paddingBottom: Math.max(bottomInset, 10) }]} pointerEvents="box-none">
      <View style={styles.shell}>
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient
          colors={['rgba(60,255,179,0.08)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.sheen}
          pointerEvents="none"
        />
        <RiderFindingSheetHandle />

        <View style={styles.body}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.accentGreen} />
              <Text style={styles.loadingTxt}>Updating your request…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Finding your driver</Text>
              <Text style={styles.sub}>
                {pickupVicinityLabel
                  ? `Pickup near ${pickupVicinityLabel} · usually under 2 min`
                  : 'Matching you with nearby drivers · usually under 2 min'}
              </Text>

              <RiderFindingStatusHero />

              {bidNgn > 0 || routeKmLabel ? (
                <RiderFindingMetricsCard
                  bidNgn={bidNgn}
                  routeKmLabel={routeKmLabel ?? null}
                  routeMinLabel={routeMinLabel ?? null}
                />
              ) : null}

              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.88}>
                <Text style={styles.cancelTxt}>Cancel request</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    paddingHorizontal: SPACING.md,
  },
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: RIDER_FINDING_SHEET_BORDER,
    backgroundColor: 'rgba(8,11,22,0.55)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  body: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: 14,
    alignItems: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  loadingTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#94A3B8' },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -6,
  },
  cancelBtn: {
    width: '100%',
    minHeight: 48,
    borderRadius: BORDER_RADIUS.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.error,
    marginTop: 4,
  },
  cancelTxt: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.error },
});
