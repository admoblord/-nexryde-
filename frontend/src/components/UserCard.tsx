import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileTokens as t, typography } from '@/src/theme/tokens';

type Props = {
  name: string;
  role?: 'rider' | 'driver';
  image?: string | null;
  verificationLabel?: string;
  rating?: number;
  reviewCount?: number;
  nexrydeScore?: number;
  riderRiskScore?: number;
  driverSafetyScore?: number | null;
};

export const UserCard: React.FC<Props> = ({
  name,
  role = 'rider',
  image,
  verificationLabel,
  rating = 5,
  reviewCount,
  nexrydeScore,
  riderRiskScore,
  driverSafetyScore,
}) => {
  const risk = Math.max(0, Math.min(100, Math.round(riderRiskScore ?? 0)));
  const riskFillColor = risk < 34 ? t.accent.green : risk <= 66 ? t.accent.amber : t.accent.red;
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {image ? <Image source={{ uri: image }} style={styles.avatar} /> : <Text style={styles.initials}>{initials || 'AD'}</Text>}
        </View>
        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name}</Text>
            <View style={styles.rolePill}><Text style={styles.rolePillText}>{role === 'driver' ? 'Driver' : 'Rider'}</Text></View>
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={t.accent.amber} />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>({reviewCount ?? 0})</Text>
            <Text style={styles.ratingDot}>·</Text>
            <View style={styles.scoreChip}>
              <Ionicons name="shield-checkmark" size={12} color={t.accent.green} />
              <Text style={styles.scoreChipText}>Score {Math.round(nexrydeScore ?? 100)}</Text>
            </View>
          </View>
          {verificationLabel ? <Text style={styles.sub}>✓ {verificationLabel}</Text> : null}
        </View>
      </View>

      <View style={styles.metricsHeader}>
        <Text style={styles.metricLabel}>Rider risk</Text>
        <Text style={styles.metricValue}>{risk} / 100</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${risk}%`, backgroundColor: riskFillColor }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: t.space.md,
    borderRadius: t.radius.lg,
    backgroundColor: t.bg.card,
    padding: t.space.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E2A44',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    ...typography.h2,
    color: t.text.primary,
  },
  initials: { ...typography.h3, color: t.text.primary },
  rolePill: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rolePillText: { ...typography.small, color: t.accent.blue },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { ...typography.h2, color: t.text.primary },
  ratingCount: { ...typography.small, color: t.text.tertiary },
  ratingDot: { ...typography.small, color: t.text.tertiary },
  scoreChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.accent.greenSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  scoreChipText: { ...typography.small, color: t.accent.green },
  sub: {
    ...typography.small,
    color: t.text.secondary,
  },
  metricsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: t.space.sm,
  },
  metricLabel: {
    ...typography.small,
    color: t.text.tertiary,
  },
  metricValue: {
    ...typography.small,
    color: t.text.primary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  progressFill: { height: '100%', borderRadius: 3 },
});
