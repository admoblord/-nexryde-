/**
 * V2 route card — ESTIMATED ROUTE with distance + ETA and a
 * "View route" action that expands the pickup → destination summary.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FV2, findingGlass } from '@/src/components/finding/findingV2Theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  routeKmLabel: string | null;
  routeMinLabel: string | null;
  pickupAddress: string;
  destinationAddress: string | null;
};

export function RouteCardV2({ routeKmLabel, routeMinLabel, pickupAddress, destinationAddress }: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <View style={styles.card}>
      <View style={styles.iconBadge}>
        <Ionicons name="git-branch-outline" size={17} color={FV2.green} />
      </View>
      <Text style={styles.kicker}>ESTIMATED ROUTE</Text>
      <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
        {routeKmLabel || '—'}
      </Text>
      <Text style={styles.hint}>ETA {routeMinLabel || '—'}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={toggle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide route details' : 'View route details'}
        accessibilityState={{ expanded }}
      >
        <Text style={styles.btnTxt}>{expanded ? 'Hide route' : 'View route'}</Text>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.routeDetail}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: FV2.green }]} />
            <Text style={styles.routeTxt} numberOfLines={2}>{pickupAddress}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <Ionicons name="location" size={11} color="#FF8A65" style={{ marginLeft: -1.5 }} />
            <Text style={styles.routeTxt} numberOfLines={2}>
              {destinationAddress || 'Destination'}
            </Text>
          </View>
        </View>
      ) : null}
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
    color: FV2.text,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
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
  routeDetail: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: FV2.cardBorder,
    gap: 2,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: {
    width: 1.5,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginLeft: 3.5,
    marginVertical: 1,
  },
  routeTxt: { flex: 1, fontSize: 11, fontWeight: '600', color: FV2.sub, lineHeight: 14 },
});
