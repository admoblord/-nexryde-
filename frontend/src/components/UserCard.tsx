import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge } from '@/src/components/UI';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { RatingDisplay } from '@/src/components/RatingDisplay';

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
  return (
    <Card variant="elevated" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatarWrap}>
          {image ? <Image source={{ uri: image }} style={styles.avatar} /> : <Ionicons name="person" size={28} color={COLORS.gray500} />}
        </View>
        <View style={styles.meta}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{name}</Text>
            <Badge text={role === 'driver' ? 'Driver' : 'Rider'} variant={role === 'driver' ? 'info' : 'success'} size="sm" />
          </View>
          <RatingDisplay rating={rating} reviewCount={reviewCount} score={nexrydeScore} compact />
          {verificationLabel ? <Text style={styles.sub}>{verificationLabel}</Text> : null}
        </View>
      </View>

      <View style={styles.metrics}>
        {typeof riderRiskScore === 'number' ? (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Rider risk</Text>
            <Text style={styles.metricValue}>{Math.round(riderRiskScore)}</Text>
          </View>
        ) : null}
        {typeof driverSafetyScore === 'number' ? (
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Driver safety</Text>
            <Text style={styles.metricValue}>{Math.round(driverSafetyScore)}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray100,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  meta: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  sub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    fontWeight: '600',
  },
  metrics: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  metric: {
    flex: 1,
    backgroundColor: COLORS.lightSurface,
    borderRadius: 14,
    padding: SPACING.sm,
  },
  metricLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    fontWeight: '700',
  },
  metricValue: {
    marginTop: 2,
    fontSize: FONT_SIZE.lg,
    color: COLORS.lightTextPrimary,
    fontWeight: '900',
  },
});
