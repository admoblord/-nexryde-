/**
 * V2 bid card — YOUR BID with big neon naira amount and an
 * outlined "Update bid" action.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FV2, findingGlass } from '@/src/components/finding/findingV2Theme';

type Props = {
  bidNgn: number;
  onUpdateBid: () => void;
};

export function BidCardV2({ bidNgn, onUpdateBid }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconBadge}>
        <Ionicons name="cash-outline" size={17} color={FV2.green} />
      </View>
      <Text style={styles.kicker}>YOUR BID</Text>
      <Text
        style={styles.amount}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLabel={
          bidNgn > 0 ? `Your bid: ${Math.round(bidNgn)} naira` : 'Bid not set'
        }
      >
        {bidNgn > 0 ? `₦${Math.round(bidNgn).toLocaleString('en-NG')}` : '—'}
      </Text>
      <Text style={styles.hint}>You can update your bid</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => {
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          onUpdateBid();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Update bid"
      >
        <Text style={styles.btnTxt}>Update bid</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...findingGlass,
    flex: 1,
    padding: FV2.pad,
    gap: 6,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: FV2.greenBorder,
    backgroundColor: FV2.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  kicker: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2, color: FV2.sub },
  amount: {
    fontSize: 26,
    fontWeight: '900',
    color: FV2.green,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
    textShadowColor: FV2.greenGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  hint: { fontSize: 11, fontWeight: '600', color: FV2.faint },
  btn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: FV2.pill,
    borderWidth: 1.5,
    borderColor: FV2.green,
    backgroundColor: 'rgba(0,208,132,0.06)',
  },
  btnTxt: { fontSize: 12.5, fontWeight: '900', color: FV2.green },
});
