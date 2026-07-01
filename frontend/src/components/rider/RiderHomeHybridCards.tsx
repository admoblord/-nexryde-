/**
 * Hybrid homepage card grids — bright 2×2 layouts for rider home.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RIDER_HOME_HYBRID } from '@/src/constants/riderHomeHybridBrand';

export type HomeFeatureTile = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
};

type GridProps = {
  tiles: HomeFeatureTile[];
  tileWidth?: number | string;
  style?: ViewStyle;
};

export function RiderHomeFeatureGrid({ tiles, tileWidth = '48%', style }: GridProps) {
  return (
    <View style={[styles.grid, style]}>
      {tiles.map((tile) => (
        <TouchableOpacity
          key={tile.id}
          style={[styles.tile, { width: tileWidth as ViewStyle['width'], backgroundColor: tile.color }]}
          onPress={tile.onPress}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={tile.title}
        >
          <View style={styles.tileIconWrap}>
            <Ionicons name={tile.icon} size={30} color="#FFF" />
          </View>
          <Text style={styles.tileTitle}>{tile.title}</Text>
          <Text style={styles.tileSub}>{tile.subtitle}</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" style={styles.tileChevron} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function RiderHomeEmptyTrips({ onBook }: { onBook: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No trips yet</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onBook} activeOpacity={0.9}>
        <Text style={styles.emptyBtnTxt}>Book Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  tile: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  tileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tileTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  tileSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    paddingRight: 20,
  },
  tileChevron: {
    position: 'absolute',
    right: 12,
    bottom: 14,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginVertical: 8,
    backgroundColor: RIDER_HOME_HYBRID.bgSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: RIDER_HOME_HYBRID.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: RIDER_HOME_HYBRID.black,
    marginBottom: 12,
  },
  emptyBtn: {
    backgroundColor: RIDER_HOME_HYBRID.green,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 22,
  },
  emptyBtnTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});
