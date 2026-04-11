import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  SHADOWS,
} from '@/src/constants/theme';
import type { User } from '@/src/store/appStore';

type ThemeColors = {
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
};

type Props = {
  user: User | null;
  profileImage: string | null;
  fallbackInitial: string;
  roleLabel: string;
  roleIcon: keyof typeof Ionicons.glyphMap;
  roleTint: string;
  roleBg: string;
  colors: ThemeColors;
  onAvatarPress: () => void;
  /** When false, avatar shows camera hint only (no green check) */
  showVerifiedOnAvatar?: boolean;
};

export function ProfileHeroCard({
  user,
  profileImage,
  fallbackInitial,
  roleLabel,
  roleIcon,
  roleTint,
  roleBg,
  colors,
  onAvatarPress,
  showVerifiedOnAvatar = true,
}: Props) {
  const verified = Boolean(user?.is_verified);
  const displayVerified = showVerifiedOnAvatar && verified;
  const trips = user?.total_trips ?? 0;
  const ratingText =
    (user?.trips_completed ?? 0) > 0 && typeof user?.rating === 'number'
      ? user.rating.toFixed(1)
      : '—';

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.avatarWrap} onPress={onAvatarPress} activeOpacity={0.85}>
          <View style={styles.avatar}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarLetter}>{fallbackInitial}</Text>
            )}
          </View>
          {displayVerified ? (
            <View style={styles.verifiedDot}>
              <Ionicons name="checkmark" size={11} color={COLORS.white} />
            </View>
          ) : null}
          <View style={styles.cameraDot}>
            <Ionicons name="camera" size={14} color={COLORS.white} />
          </View>
        </TouchableOpacity>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {user?.name || roleLabel}
            </Text>
            {verified ? (
              <View style={styles.verifiedPill}>
                <Ionicons name="shield-checkmark" size={12} color={COLORS.success} />
                <Text style={styles.verifiedPillText}>Verified</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.phone, { color: colors.textSecondary }]} numberOfLines={1}>
            {user?.phone || '—'}
          </Text>

          <View style={[styles.roleChip, { backgroundColor: roleBg }]}>
            <Ionicons name={roleIcon} size={14} color={roleTint} />
            <Text style={[styles.roleChipText, { color: roleTint }]}>{roleLabel}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <View style={styles.statIconLabel}>
                <Ionicons name="star" size={16} color={COLORS.warning} />
                <Text style={[styles.statValue, { color: colors.text }]}>{ratingText}</Text>
              </View>
              <Text style={[styles.statCaption, { color: colors.textMuted }]}>Rating</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.text }]}>{trips}</Text>
              <Text style={[styles.statCaption, { color: colors.textMuted }]}>Total trips</Text>
            </View>
          </View>

          {user?.created_at ? (
            <Text style={[styles.memberSince, { color: colors.textMuted }]}>
              Member since{' '}
              {new Date(user.created_at).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarLetter: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.accent,
  },
  verifiedDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  cameraDot: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    flexShrink: 1,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  verifiedPillText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.success,
  },
  phone: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    marginTop: 4,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  roleChipText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.gray200,
  },
  stat: {
    flex: 1,
    alignItems: 'flex-start',
  },
  statIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
  },
  statCaption: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
    marginHorizontal: SPACING.sm,
  },
  memberSince: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
});
