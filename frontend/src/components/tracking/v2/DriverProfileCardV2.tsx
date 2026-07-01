/**
 * V2 driver profile card — fixed height; skeleton placeholders until data arrives.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { SkeletonBlock } from '@/src/components/tracking/v2/SkeletonBlock';
import { TV2, glassCard } from '@/src/components/tracking/v2/trackingV2Theme';
import { TV2_LAYOUT } from '@/src/components/tracking/v2/trackingV2Layout';

type Props = {
  name: string;
  photoUri: string | null;
  rating: number | null;
  vehicle: string;
  color: string | null;
  plate: string | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  hydrated?: boolean;
};

const COLOR_SWATCHES: Record<string, string> = {
  black: '#111827',
  white: '#F8FAFC',
  silver: '#C3CBD6',
  grey: '#6B7280',
  gray: '#6B7280',
  ash: '#9CA3AF',
  red: '#EF4444',
  wine: '#7E2A3A',
  maroon: '#7F1D1D',
  blue: '#3B82F6',
  navy: '#1E3A8A',
  green: '#22C55E',
  yellow: '#FACC15',
  gold: '#D4AF37',
  orange: '#F97316',
  brown: '#8B5E3C',
  cream: '#F2EAD3',
  purple: '#8B5CF6',
};

function colorSwatch(name: string | null): string {
  if (!name) return '#64748B';
  const key = name.trim().toLowerCase().split(/[\s/-]+/)[0];
  return COLOR_SWATCHES[key] || '#64748B';
}

const PLACEHOLDER = '—';

function DriverProfileCardV2Inner({
  name,
  photoUri,
  rating,
  vehicle,
  color,
  plate,
  isFavorite,
  onToggleFavorite,
  hydrated = true,
}: Props) {
  const displayName = hydrated && name.trim() ? name : PLACEHOLDER;
  const displayVehicle = hydrated && vehicle.trim() && vehicle !== 'Vehicle' ? vehicle : PLACEHOLDER;
  const displayPlate = hydrated && plate ? plate.toUpperCase() : PLACEHOLDER;
  const displayColor = hydrated && color ? color : PLACEHOLDER;
  const showRating = hydrated && rating != null && rating > 0;

  return (
    <View style={styles.card}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatarRing}>
          {hydrated && photoUri ? (
            <TripProfileAvatar
              size={62}
              uri={photoUri}
              borderColor="transparent"
              accessibilityLabel={`Photo of ${name}`}
            />
          ) : (
            <SkeletonBlock width={58} height={58} radius={29} />
          )}
        </View>
        <View style={styles.verifyDot}>
          <Ionicons name="shield-checkmark" size={11} color={TV2.greenInk} />
        </View>
      </View>

      <View style={styles.idCol}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {showRating ? (
            <View style={styles.ratingChip}>
              <Ionicons name="star" size={11} color={TV2.gold} />
              <Text style={styles.ratingTxt}>{rating!.toFixed(1)}</Text>
            </View>
          ) : (
            <SkeletonBlock width={36} height={14} radius={7} />
          )}
        </View>

        <View style={[styles.plateBadge, !hydrated && styles.plateMuted]}>
          <Ionicons name="car-sport" size={16} color={TV2.greenInk} />
          <Text style={styles.plateTxt} numberOfLines={1}>{displayPlate}</Text>
        </View>

        <Text style={styles.vehicle} numberOfLines={1}>{displayVehicle}</Text>
        <View style={styles.colorRow}>
          <View style={[styles.colorDot, { backgroundColor: colorSwatch(hydrated ? color : null) }]} />
          <Text style={styles.colorTxt} numberOfLines={1}>{displayColor}</Text>
        </View>

        <View style={styles.verifiedRow}>
          <Ionicons name="shield-checkmark" size={13} color={TV2.green} />
          <Text style={styles.verifiedTxt}>Verified Driver</Text>
        </View>
      </View>

      <View style={styles.rightCol}>
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS !== 'web') void Haptics.selectionAsync();
            onToggleFavorite();
          }}
          style={styles.favBtn}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Remove favourite driver' : 'Save favourite driver'}
          accessibilityState={{ selected: isFavorite }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={20}
            color={isFavorite ? '#FF6B9D' : TV2.faint}
          />
        </TouchableOpacity>
        <View style={styles.carArt}>
          <MaterialCommunityIcons name="car-side" size={44} color={TV2.greenBright} />
        </View>
      </View>
    </View>
  );
}

export const DriverProfileCardV2 = memo(DriverProfileCardV2Inner);

const styles = StyleSheet.create({
  card: {
    ...glassCard,
    flexDirection: 'row',
    height: TV2_LAYOUT.driverCard,
    padding: TV2.pad,
    gap: 12,
    overflow: 'hidden',
  },
  avatarWrap: { width: 68, alignItems: 'center' },
  avatarRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    borderColor: TV2.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyDot: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: TV2.green,
    borderWidth: 2,
    borderColor: TV2.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idCol: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
  name: { fontSize: 18, fontWeight: '900', color: TV2.text, letterSpacing: -0.3, flexShrink: 1 },
  ratingChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingTxt: { fontSize: 12.5, fontWeight: '800', color: TV2.gold },
  plateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: TV2.green,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 34,
    minWidth: 108,
  },
  plateMuted: { opacity: 0.72 },
  plateTxt: {
    fontSize: 17,
    fontWeight: '900',
    color: TV2.greenInk,
    letterSpacing: 1.4,
    fontVariant: ['tabular-nums'],
    minWidth: 72,
  },
  vehicle: { fontSize: 14.5, fontWeight: '800', color: TV2.text, minHeight: 18 },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 16 },
  colorDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  colorTxt: { fontSize: 12.5, fontWeight: '600', color: TV2.sub, minWidth: 48 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifiedTxt: { fontSize: 12.5, fontWeight: '800', color: TV2.green },
  rightCol: { alignItems: 'flex-end', justifyContent: 'space-between' },
  favBtn: { padding: 2 },
  carArt: {
    width: 78,
    height: 52,
    borderRadius: TV2.radiusSm,
    backgroundColor: TV2.greenSoft,
    borderWidth: 1,
    borderColor: TV2.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
