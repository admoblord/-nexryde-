import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { profileTokens as t, typography } from '@/src/theme/tokens';
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
  const trips = user?.total_trips ?? 0;
  const ratingText =
    (user?.trips_completed ?? 0) > 0 && user?.rating != null
      ? Number(user.rating).toFixed(1)
      : '—';
  const initials = (user?.name || fallbackInitial || 'AD')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const phone = (user?.phone || '').trim();
  const formattedPhone =
    /^\+?\d+$/.test(phone.replace(/\s+/g, '')) && phone.replace(/\s+/g, '').length >= 13
      ? `+${phone.replace(/\D/g, '').slice(0, 3)} ${phone.replace(/\D/g, '').slice(3, 6)} ${phone.replace(/\D/g, '').slice(6, 9)} ${phone.replace(/\D/g, '').slice(9, 13)}`
      : user?.phone || '—';

  return (
    <View style={[styles.card, { backgroundColor: t.bg.card }]}>
      <View style={styles.row}>
        <Pressable style={styles.avatarWrap} onPress={onAvatarPress}>
          <View style={[styles.avatar, verified && showVerifiedOnAvatar && styles.avatarVerified]}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarLetter}>{initials}</Text>
            )}
          </View>
          <View style={styles.cameraDot}>
            <Ionicons name="camera" size={14} color={t.text.primary} />
          </View>
        </Pressable>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: t.text.primary }]} numberOfLines={1}>
              {user?.name || roleLabel}
            </Text>
          </View>
          <View style={styles.metaRow}>
            {verified ? (
              <View style={styles.verifiedPill}>
                <Text style={styles.verifiedPillText}>Verified</Text>
              </View>
            ) : null}
            <Text style={styles.metaDot}>·</Text>
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>{roleLabel}</Text>
            </View>
          </View>
          <Text style={styles.phone} numberOfLines={1}>{formattedPhone}</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <View style={styles.statIconLabel}>
                <Ionicons name="star" size={16} color={t.accent.amber} />
                <Text style={styles.statValue}>{ratingText}</Text>
              </View>
              <Text style={styles.statCaption}>RATING</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{trips}</Text>
              <Text style={styles.statCaption}>TOTAL TRIPS</Text>
            </View>
          </View>

          {user?.created_at ? (
            <Text style={styles.memberSince}>
              Member since{' '}
              {new Date(user.created_at).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
              })}
              {'  · Nigeria'}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: t.radius.lg,
    padding: t.space.xl,
    marginBottom: t.space.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: t.space.md,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#1E2A44',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarVerified: {
    borderWidth: 2,
    borderColor: t.accent.green,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarLetter: {
    ...typography.h2,
    color: t.text.primary,
  },
  cameraDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.accent.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.bg.card,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    marginTop: 2,
  },
  name: {
    ...typography.h1,
    flexShrink: 1,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: t.space.xs, gap: t.space.sm },
  verifiedPill: {
    backgroundColor: t.accent.greenSoft,
    paddingHorizontal: t.space.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedPillText: {
    ...typography.small,
    color: t.accent.green,
  },
  metaDot: { ...typography.small, color: t.text.tertiary },
  phone: {
    ...typography.body,
    color: t.text.tertiary,
    marginTop: t.space.sm,
  },
  roleChip: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    paddingHorizontal: t.space.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleChipText: {
    ...typography.small,
    color: t.accent.blue,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: t.space.lg,
    paddingTop: t.space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.bg.divider,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    ...typography.h1,
    color: t.text.primary,
  },
  statCaption: {
    marginTop: 4,
    ...typography.label,
    color: t.text.label,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: t.bg.divider,
    marginHorizontal: t.space.md,
  },
  memberSince: {
    ...typography.small,
    color: t.text.tertiary,
    marginTop: t.space.md,
  },
});
