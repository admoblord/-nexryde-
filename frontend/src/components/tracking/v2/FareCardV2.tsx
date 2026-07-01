/**
 * V2 fare card — fixed height; fare slot always reserved.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TV2, glassCard } from '@/src/components/tracking/v2/trackingV2Theme';
import { TV2_LAYOUT } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  fareDisplay: string | null;
  paymentMethod: string | null;
};

function FareCardV2Inner({ fareDisplay, paymentMethod }: Props) {
  const method = (paymentMethod || '').toLowerCase();
  const methodLabel = method.includes('wallet')
    ? 'Wallet'
    : method.includes('cash')
      ? 'Cash'
      : '—';
  const amount = fareDisplay && fareDisplay !== '₦0' ? fareDisplay : '—';

  return (
    <View style={styles.card}>
      <View style={styles.walletBadge}>
        <Ionicons name="wallet" size={19} color={TV2.greenInk} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.label}>Trip Fare</Text>
        <Text
          style={styles.amount}
          numberOfLines={1}
          accessibilityLabel={amount !== '—' ? `Trip fare ${amount}` : 'Trip fare pending'}
        >
          {amount}
        </Text>
      </View>
      <View style={styles.methodChip}>
        <Ionicons
          name={methodLabel === 'Wallet' ? 'wallet-outline' : 'cash-outline'}
          size={12}
          color={TV2.greenInk}
        />
        <Text style={styles.methodTxt}>{methodLabel}</Text>
      </View>
    </View>
  );
}

export const FareCardV2 = memo(FareCardV2Inner);

const styles = StyleSheet.create({
  card: {
    ...glassCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: TV2_LAYOUT.fareCard,
    paddingHorizontal: TV2.pad,
    overflow: 'hidden',
  },
  walletBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: TV2.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, minWidth: 0, justifyContent: 'center' },
  label: { fontSize: 11.5, fontWeight: '700', color: TV2.sub, height: 14 },
  amount: {
    fontSize: 22,
    fontWeight: '900',
    color: TV2.greenBright,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
    height: 28,
    minWidth: 88,
  },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TV2.green,
    borderRadius: TV2.radiusPill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 72,
    justifyContent: 'center',
  },
  methodTxt: { fontSize: 12.5, fontWeight: '900', color: TV2.greenInk },
});
