import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';

type Props = {
  rating: number;
  reviewCount?: number;
  score?: number;
  compact?: boolean;
};

export const RatingDisplay: React.FC<Props> = ({ rating, reviewCount, score, compact = false }) => {
  const safeRating = Math.max(0, Math.min(5, Number(rating || 0)));
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <View style={styles.ratingGroup}>
        <Ionicons name="star" size={compact ? 16 : 18} color={COLORS.warning} />
        <Text style={[styles.ratingText, compact && styles.ratingTextCompact]}>{safeRating.toFixed(1)}</Text>
        {typeof reviewCount === 'number' ? (
          <Text style={styles.countText}>({reviewCount})</Text>
        ) : null}
      </View>
      {typeof score === 'number' ? (
        <View style={styles.scorePill}>
          <Ionicons name="shield-checkmark" size={14} color={COLORS.accentGreenDark} />
          <Text style={styles.scoreText}>Score {Math.round(score)}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  rowCompact: {
    gap: SPACING.xs,
  },
  ratingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  ratingTextCompact: {
    fontSize: FONT_SIZE.sm,
  },
  countText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray500,
    fontWeight: '600',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  scoreText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.accentGreenDark,
  },
});
