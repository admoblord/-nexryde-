import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RIDER_FAV_GRADIENT, type RiderFavoriteDriverRow } from '@/src/constants/riderFavorites';
import { CURRENCY, FONT_SIZE, BORDER_RADIUS, SPACING } from '@/src/constants/theme';

const AVATAR_GRADIENTS = [
  ['#BE185D', '#EC4899'],
  ['#7C3AED', '#A78BFA'],
  ['#0D9488', '#2DD4BF'],
  ['#1D4ED8', '#60A5FA'],
] as const;

type Props = {
  driver: RiderFavoriteDriverRow;
  index: number;
  onBook: () => void;
  onProfile: () => void;
  onRemove: () => void;
};

export function RiderFavoriteDriverCard({ driver, index, onBook, onProfile, onRemove }: Props) {
  const grad = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <LinearGradient colors={[...grad]} style={styles.avatar}>
          <Text style={styles.avatarTxt}>{driver.name.charAt(0).toUpperCase()}</Text>
          {driver.isOnline ? <View style={styles.onlineDot} /> : null}
        </LinearGradient>
        <View style={styles.meta}>
          <Text style={styles.name}>{driver.name}</Text>
          <View style={styles.subRow}>
            {driver.rating > 0 ? (
              <>
                <Ionicons name="star" size={12} color="#FBBF24" />
                <Text style={styles.rating}>{driver.rating.toFixed(1)}</Text>
              </>
            ) : null}
            <Text style={styles.vehicle} numberOfLines={1}>
              {driver.vehicle}
              {driver.plate ? ` · ${driver.plate}` : ''}
            </Text>
          </View>
          <View style={[styles.status, driver.isOnline ? styles.statusOn : styles.statusOff]}>
            <View style={[styles.statusDot, { backgroundColor: driver.isOnline ? '#22C55E' : '#64748B' }]} />
            <Text style={[styles.statusTxt, driver.isOnline && styles.statusTxtOn]}>
              {driver.isOnline ? 'Online now' : 'Offline'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={12} accessibilityLabel={`Remove ${driver.name}`}>
          <Ionicons name="heart-dislike-outline" size={22} color="#64748B" />
        </TouchableOpacity>
      </View>

      {(driver.ridesTogether ?? 0) > 0 ? (
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="repeat" size={13} color="#F472B6" />
            <Text style={styles.statTxt}>{driver.ridesTogether} rides together</Text>
          </View>
          {(driver.totalSpent ?? 0) > 0 ? (
            <View style={styles.stat}>
              <Ionicons name="cash-outline" size={13} color="#34D399" />
              <Text style={styles.statTxt}>
                {CURRENCY}
                {Number(driver.totalSpent).toLocaleString()} spent
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.profileBtn} onPress={onProfile} activeOpacity={0.88}>
          <Ionicons name="person-circle-outline" size={18} color="#94A3B8" />
          <Text style={styles.profileTxt}>Profile</Text>
        </TouchableOpacity>
        {driver.isOnline ? (
          <TouchableOpacity style={styles.bookWrap} onPress={onBook} activeOpacity={0.9}>
            <LinearGradient colors={[...RIDER_FAV_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bookBtn}>
              <Ionicons name="car-sport" size={17} color="#FFF" />
              <Text style={styles.bookTxt}>Book now</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.offlineBtn} onPress={onBook} activeOpacity={0.88}>
            <Ionicons name="notifications-outline" size={17} color="#60A5FA" />
            <Text style={styles.offlineTxt}>Notify me</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0F172A',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.18)',
    gap: 12,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2.5,
    borderColor: '#0F172A',
  },
  meta: { flex: 1, gap: 4 },
  name: { fontSize: FONT_SIZE.md, fontWeight: '900', color: '#F8FAFC' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rating: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: '#FBBF24' },
  vehicle: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#94A3B8', flex: 1 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 2,
  },
  statusOn: { backgroundColor: 'rgba(34,197,94,0.12)' },
  statusOff: { backgroundColor: 'rgba(100,116,139,0.15)' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  statusTxtOn: { color: '#4ADE80' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statTxt: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: '#E2E8F0' },
  actions: { flexDirection: 'row', gap: 8 },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
  },
  profileTxt: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: '#94A3B8' },
  bookWrap: { flex: 1, borderRadius: BORDER_RADIUS.lg, overflow: 'hidden' },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  bookTxt: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: '#FFF' },
  offlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.28)',
  },
  offlineTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: '#60A5FA' },
});
