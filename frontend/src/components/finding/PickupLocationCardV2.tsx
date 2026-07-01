/**
 * V2 pickup pill — floating card with location icon, pickup address
 * and the "Usually under 2 min" wait promise.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FV2, findingGlass } from '@/src/components/finding/findingV2Theme';

type Props = { pickupAddress: string; timeElapsedSec?: number };

function waitCopy(elapsed?: number): string {
  if (!elapsed || elapsed < 30) return 'Usually under 5 min';
  if (elapsed < 60) return 'Widening search area…';
  if (elapsed < 90) return 'Still searching — hang tight';
  return 'Searching a wider radius…';
}

export function PickupLocationCardV2({ pickupAddress, timeElapsedSec }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.pinBadge}>
        <Ionicons name="location" size={16} color={FV2.green} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.address} numberOfLines={2}>
          Pickup near {pickupAddress}
        </Text>
        <Text style={styles.wait}>{waitCopy(timeElapsedSec)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...findingGlass,
    borderRadius: FV2.radiusXl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: FV2.pad,
    paddingVertical: 12,
  },
  pinBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: FV2.greenSoft,
    borderWidth: 1,
    borderColor: FV2.greenBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  address: { fontSize: 13.5, fontWeight: '800', color: FV2.text, lineHeight: 18 },
  wait: { fontSize: 12, fontWeight: '600', color: FV2.sub, marginTop: 2 },
});
