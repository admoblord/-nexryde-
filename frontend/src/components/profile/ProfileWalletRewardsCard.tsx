import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  SHADOWS,
  CURRENCY,
} from '@/src/constants/theme';
import { getWallet, BACKEND_URL } from '@/src/services/api';

type ThemeColors = {
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  surface: string;
};

type Props = {
  userId: string | undefined;
  colors: ThemeColors;
};

export function ProfileWalletRewardsCard({ userId, colors }: Props) {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [rewardsLine, setRewardsLine] = useState('Invite friends — earn bonus credit');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const w = await getWallet(userId);
        if (!cancelled) setBalance(Number(w.data?.balance ?? 0));
      } catch {
        if (!cancelled) setBalance(0);
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/referral/code/${userId}`);
        const data = await res.json();
        if (!cancelled && data?.referral_code) {
          setRewardsLine(`Referral code ${data.referral_code} • Earn per invite`);
        }
      } catch {
        /* keep default */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const formatted =
    balance === null ? '—' : `${CURRENCY}${balance.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Wallet & rewards</Text>
        <Ionicons name="wallet" size={20} color={COLORS.warning} />
      </View>

      <View style={[styles.balanceBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {loading ? (
          <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.md }} />
        ) : (
          <>
            <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Wallet balance</Text>
            <Text style={[styles.balanceAmount, { color: colors.text }]}>{formatted}</Text>
          </>
        )}
        <View style={styles.rewardsRow}>
          <Ionicons name="gift-outline" size={18} color={COLORS.accent} />
          <Text style={[styles.rewardsText, { color: colors.textSecondary }]} numberOfLines={2}>
            {rewardsLine}
          </Text>
        </View>
      </View>

      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={[styles.ctaPrimary, { backgroundColor: COLORS.accent }]}
          onPress={() => router.push('/wallet')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
          <Text style={styles.ctaPrimaryText}>Add money</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.ctaSecondary, { borderColor: colors.border }]}
          onPress={() => router.push('/wallet')}
          activeOpacity={0.85}
        >
          <Text style={[styles.ctaSecondaryText, { color: colors.text }]}>View wallet</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceBlock: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  balanceLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '900',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  rewardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  rewardsText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    lineHeight: 20,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  ctaPrimaryText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  ctaSecondaryText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
  },
});
