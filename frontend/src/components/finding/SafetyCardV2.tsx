/**
 * V2 safety card — "Safe. Verified. Reliable." trust strip with shield
 * badge on the left and car + verified-shield art on the right.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FV2, findingGlass } from '@/src/components/finding/findingV2Theme';

export function SafetyCardV2() {
  return (
    <View style={styles.card}>
      <View style={styles.shieldBadge}>
        <Ionicons name="shield-checkmark" size={20} color={FV2.greenInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>Safe. Verified. Reliable.</Text>
        <Text style={styles.sub} numberOfLines={2}>
          All Nexryde drivers are verified and background checked.
        </Text>
      </View>
      <View style={styles.art}>
        <MaterialCommunityIcons name="car-sports" size={34} color="#B9C8DA" />
        <View style={styles.artShield}>
          <Ionicons name="checkmark" size={11} color={FV2.greenInk} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...findingGlass,
    borderColor: FV2.greenBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: FV2.pad,
  },
  shieldBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: FV2.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: FV2.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 7,
  },
  title: { fontSize: 14.5, fontWeight: '900', color: FV2.text },
  sub: { fontSize: 11.5, fontWeight: '600', color: FV2.sub, marginTop: 2, lineHeight: 15 },
  art: { width: 48, alignItems: 'center', justifyContent: 'center' },
  artShield: {
    position: 'absolute',
    bottom: -3,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: FV2.green,
    borderWidth: 1.5,
    borderColor: FV2.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
