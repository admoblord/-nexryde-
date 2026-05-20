import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, BORDER_RADIUS } from '@/src/constants/theme';
import { normalizeTripStatus } from '@/src/utils/tripStatus';

type Props = {
  tripId: string;
  status?: string;
  paymentStatus?: string;
};

function statusLabel(status?: string, paymentStatus?: string): string {
  const s = normalizeTripStatus(status, paymentStatus);
  if (s === 'pending' || s === 'pending_driver_offers') return 'Finding your driver';
  if (s === 'accepted') return 'Driver on the way';
  if (s === 'arrived') return 'Driver arrived';
  if (s === 'ongoing') return 'Trip in progress';
  if (s === 'pending_payment') return 'Payment pending';
  return 'Active trip';
}

export function RiderSafetyActiveTripCard({ tripId, status, paymentStatus }: Props) {
  const router = useRouter();
  const label = statusLabel(status, paymentStatus);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.dot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Active trip</Text>
          <Text style={styles.status}>{label}</Text>
        </View>
        <Text style={styles.tripRef}>#{tripId.slice(-6).toUpperCase()}</Text>
      </View>
      <TouchableOpacity
        style={styles.btn}
        onPress={() =>
          router.push({ pathname: '/rider/tracking', params: { tripId } } as any)
        }
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="View live trip map"
      >
        <Ionicons name="navigate" size={18} color="#FFF" />
        <Text style={styles.btnText}>View live trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.successSoft,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  status: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.success,
    marginTop: 2,
  },
  tripRef: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.md,
  },
  btnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
