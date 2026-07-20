/**
 * Rider home — horizontal favourite drivers (book in one tap).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { getFavoriteDrivers } from '@/src/services/api';
import {
  RIDER_FAV_ACCENT,
  RIDER_FAV_GRADIENT,
  RIDER_FAV_PERK_SHORT,
  type RiderFavoriteDriverRow,
} from '@/src/constants/riderFavorites';
import { RiderFavoriteIcon } from '@/src/components/rider/RiderFavoriteIcon';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING, useThemeColors } from '@/src/constants/theme';

function mapRow(d: Record<string, unknown>): RiderFavoriteDriverRow {
  const id = String(d.driver_id || d.id || '');
  return {
    id,
    name: String(d.name || 'Driver'),
    rating: Number(d.rating || 0),
    totalTrips: Number(d.total_trips || 0),
    vehicle: String(d.vehicle_model || d.vehicle || 'Vehicle'),
    plate: String(d.vehicle_plate || d.plate || ''),
    isOnline: Boolean(d.is_online),
    profileImage: (d.profile_image as string) || null,
  };
}

export function RiderFavoritesHomeStrip() {
  const router = useRouter();
  const { userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<RiderFavoriteDriverRow[]>([]);
  const { colors, isDark } = useThemeColors();

  const load = useCallback(async () => {
    if (!riderId || !canCallAuthedApi) {
      setDrivers([]);
      setLoading(false);
      return;
    }
    try {
      const res = await getFavoriteDrivers(riderId);
      const raw = res.data?.favorite_drivers || res.data;
      const rows = Array.isArray(raw) ? raw.map((d) => mapRow(d as Record<string, unknown>)) : [];
      rows.sort((a, b) => Number(b.isOnline) - Number(a.isOnline));
      setDrivers(rows);
    } catch {
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [riderId, canCallAuthedApi]);

  useFocusEffect(
    useCallback(() => {
      if (!canCallAuthedApi) return;
      setLoading(true);
      void load();
    }, [load, canCallAuthedApi]),
  );

  const bookDriver = (d: RiderFavoriteDriverRow) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!d.isOnline) {
      Alert.alert(
        `${d.name} is offline`,
        'Book a regular ride, or open Favourites to see when they’re back online.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open favourites', onPress: () => router.push('/rider/favorite-drivers' as any) },
          { text: 'Book any ride', onPress: () => router.push('/rider/book' as any) },
        ],
      );
      return;
    }
    router.push({
      pathname: '/rider/book',
      params: { requestedDriverId: d.id, driverName: d.name },
    } as any);
  };

  const onlineCount = drivers.filter((d) => d.isOnline).length;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <RiderFavoriteIcon size={32} filled />
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Favourite drivers</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>
              {drivers.length === 0
                ? RIDER_FAV_PERK_SHORT
                : onlineCount > 0
                  ? `${onlineCount} online · tap to book`
                  : `${drivers.length} saved · ${RIDER_FAV_PERK_SHORT}`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/rider/favorite-drivers' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.seeAll}>{drivers.length > 0 ? 'See all' : 'Set up'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={RIDER_FAV_ACCENT} style={{ marginVertical: 20 }} />
      ) : drivers.length === 0 ? (
        <TouchableOpacity
          style={[styles.emptyLine, { borderColor: colors.border }]}
          onPress={() => router.push('/rider/favorite-drivers' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Set up favourite drivers"
        >
          <Ionicons name="heart-outline" size={16} color={RIDER_FAV_ACCENT} />
          <Text style={[styles.emptyLineTxt, { color: colors.textMuted }]} numberOfLines={1}>
            Set up favourites
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {drivers.slice(0, 8).map((d) => (
            <TouchableOpacity
              key={d.id}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
                d.isOnline && [
                  styles.chipOnline,
                  {
                    backgroundColor: isDark ? 'rgba(236,72,153,0.10)' : 'rgba(236,72,153,0.06)',
                  },
                ],
              ]}
              onPress={() => bookDriver(d)}
              activeOpacity={0.9}
              accessibilityLabel={`Book ${d.name}`}
            >
              <View style={styles.chipTop}>
                <View style={[styles.chipAvatar, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                  <Text style={[styles.chipLetter, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                    {d.name.charAt(0).toUpperCase()}
                  </Text>
                  {d.isOnline ? <View style={[styles.chipDot, { borderColor: colors.card }]} /> : null}
                </View>
                {d.rating > 0 ? (
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={10} color="#FBBF24" />
                    <Text style={styles.ratingTxt}>{d.rating.toFixed(1)}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.chipName, { color: colors.text }]} numberOfLines={1}>
                {d.name.split(' ')[0]}
              </Text>
              <Text style={[styles.chipVehicle, { color: colors.textMuted }]} numberOfLines={1}>
                {d.vehicle}
              </Text>
              <View style={[styles.bookPill, d.isOnline ? styles.bookPillOn : styles.bookPillOff]}>
                <Ionicons name={d.isOnline ? 'car' : 'moon-outline'} size={12} color={d.isOnline ? '#022C22' : '#94A3B8'} />
                <Text style={[styles.bookPillTxt, !d.isOnline && styles.bookPillTxtOff]}>
                  {d.isOnline ? 'Book' : 'Offline'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.addChip}
            onPress={() => router.push('/rider/favorite-drivers' as any)}
            activeOpacity={0.88}
          >
            <LinearGradient colors={[...RIDER_FAV_GRADIENT]} style={styles.addGrad}>
              <Ionicons name="add" size={28} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.addLabel, { color: RIDER_FAV_ACCENT }]}>Manage</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  title: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.lightTextPrimary },
  sub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.gray500, marginTop: 2 },
  seeAll: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: RIDER_FAV_ACCENT },
  row: { gap: 10, paddingVertical: 4 },
  chip: {
    width: 118,
    padding: 12,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  chipOnline: {
    borderColor: 'rgba(236,72,153,0.35)',
    backgroundColor: 'rgba(236,72,153,0.06)',
  },
  chipTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  chipAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLetter: { fontSize: 16, fontWeight: '900', color: '#F8FAFC' },
  chipDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(251,191,36,0.15)',
  },
  ratingTxt: { fontSize: 10, fontWeight: '800', color: '#FBBF24' },
  chipName: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: COLORS.lightTextPrimary },
  chipVehicle: { fontSize: 10, fontWeight: '600', color: COLORS.gray500, marginTop: 2, marginBottom: 8 },
  bookPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 999,
  },
  bookPillOn: { backgroundColor: COLORS.accentGreen },
  bookPillOff: { backgroundColor: 'rgba(148,163,184,0.15)' },
  bookPillTxt: { fontSize: 11, fontWeight: '900', color: '#022C22' },
  bookPillTxtOff: { color: '#94A3B8' },
  addChip: { width: 88, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addGrad: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: { fontSize: 11, fontWeight: '800', color: RIDER_FAV_ACCENT },
  emptyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyLineTxt: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '600' },
});
