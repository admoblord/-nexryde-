import React, { useEffect, useRef, useState, useMemo } from 'react';
import Constants from 'expo-constants';
import { ProfileScreenSkeleton } from '@/src/components/shared/SkeletonLoader';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
  Image,
  Animated,
  UIManager,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, deleteUserAccount, getUser, getUserTrustSummary, getAuthHeaders, updateUser } from '@/src/services/api';
import { buildInviteUrl, buildShareMessage } from '@/src/services/referralService';
import { sentryTestCrash } from '@/src/utils/sentry';
import { shareTextViaWhatsApp } from '@/src/services/socialWhatsApp';
import {
  buildAchievementWhatsAppMessage,
  computeEarnedRiderBadgeIds,
  getNextRiderBadgeGoal,
  RIDER_BADGE_META,
  type RiderAchievementBadgeMeta,
  type RiderBadgeId,
} from '@/src/utils/riderAchievementBadges';
import * as ImagePicker from 'expo-image-picker';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useThemeColors } from '@/src/constants/theme';
import {
  REFERRAL_REWARD_INVITER_NGN,
  formatNgn,
} from '@/src/constants/commercialOffers';
import { useWalletEnabled } from '@/src/services/clientConfig';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PROFILE_GREEN = BRAND.primary;
const PROFILE_GREEN_SOFT = BRAND.primaryMuted;

/* ─── Earned achievement card ───────────────────────────────── */
function RiderBadgeCard({
  badge,
  onShare,
}: {
  badge: RiderAchievementBadgeMeta;
  onShare: () => void;
}) {
  const { colors, isDark } = useThemeColors();
  return (
    <LinearGradient
      colors={[`${badge.accent}22`, isDark ? 'rgba(15,23,42,0.55)' : colors.card]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.badgeCard}
    >
      <View style={[s.badgeIconRing, { borderColor: `${badge.accent}66`, backgroundColor: `${badge.accent}18` }]}>
        <Ionicons name={badge.icon} size={20} color={badge.accent} />
      </View>
      <View style={s.badgeTextCol}>
        <View style={s.badgeTitleRow}>
          <Text style={[s.badgeTitle, { color: colors.text }]}>{badge.title}</Text>
          <View style={[s.badgeEarnedPill, { backgroundColor: `${badge.accent}22`, borderColor: `${badge.accent}44` }]}>
            <Ionicons name="checkmark-circle" size={11} color={badge.accent} />
            <Text style={[s.badgeEarnedText, { color: badge.accent }]}>Earned</Text>
          </View>
        </View>
        <Text style={[s.badgeSub, { color: colors.textMuted }]} numberOfLines={2}>
          {badge.description}
        </Text>
      </View>
      <TouchableOpacity
        style={[s.badgeWaBtn, { backgroundColor: 'rgba(37,211,102,0.12)', borderColor: 'rgba(37,211,102,0.28)' }]}
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel={`Share ${badge.title} on WhatsApp`}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      >
        <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
      </TouchableOpacity>
    </LinearGradient>
  );
}

/* ─── Locked badge preview ──────────────────────────────────── */
function LockedBadgeChip({ badge }: { badge: RiderAchievementBadgeMeta }) {
  const { colors } = useThemeColors();
  return (
    <View style={[s.lockedBadgeChip, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
      <View style={[s.lockedBadgeIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={badge.icon} size={14} color="#475569" />
        <View style={[s.lockedBadgeLock, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="lock-closed" size={9} color="#64748B" />
        </View>
      </View>
      <Text style={[s.lockedBadgeTitle, { color: colors.textMuted }]} numberOfLines={1}>
        {badge.title}
      </Text>
    </View>
  );
}

/* ─── Quick action tile (2-col grid) ────────────────────────── */
function ActionTile({
  icon,
  label,
  gradColors,
  onPress,
  tileWidth,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  gradColors: [string, string];
  onPress: () => void;
  tileWidth: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const { colors } = useThemeColors();
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Animated.View style={{ transform: [{ scale }], width: tileWidth }}>
      <TouchableOpacity
        style={[s.actionTile, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={press}
        activeOpacity={1}
      >
        <LinearGradient colors={gradColors} style={s.actionTileIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Ionicons name={icon} size={22} color="#FFF" />
        </LinearGradient>
        <Text style={[s.actionTileLabel, { color: colors.text }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ─── Menu row ───────────────────────────────────────────────── */
function MenuRow({
  icon,
  gradColors,
  title,
  subtitle,
  onPress,
  danger,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  gradColors: [string, string];
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  badge?: string;
}) {
  const { colors } = useThemeColors();
  return (
    <TouchableOpacity style={[s.menuRow, { borderTopColor: colors.border }]} onPress={onPress} activeOpacity={0.75}>
      <LinearGradient colors={danger ? ['#7f1d1d', '#991b1b'] : gradColors} style={s.menuIconWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Ionicons name={icon} size={18} color="#FFF" />
      </LinearGradient>
      <View style={s.menuRowBody}>
        <Text style={[s.menuTitle, { color: colors.text }, danger && { color: '#F87171' }]}>{title}</Text>
        {subtitle ? <Text style={[s.menuSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={s.menuBadge}><Text style={s.menuBadgeText}>{badge}</Text></View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

/* ─── Section wrapper ────────────────────────────────────────── */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors, isDark } = useThemeColors();
  return (
    <View style={s.section}>
      {title ? <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{title}</Text> : null}
      <View
        style={[
          s.sectionCard,
          {
            backgroundColor: isDark ? SURFACE.cardDark : colors.card,
            borderColor: isDark ? SURFACE.hairline : colors.border,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/* ─── Score bar ──────────────────────────────────────────────── */
function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useThemeColors();
  return (
    <View style={s.scoreBarWrap}>
      <View style={s.scoreBarRow}>
        <Text style={[s.scoreBarLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[s.scoreBarValue, { color }]}>{Math.round(value)}</Text>
      </View>
      <View style={[s.scoreBarTrack, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[s.scoreBarFill, { width: `${Math.min(value, 100)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════════════════════════════ */
export default function RiderProfileScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const walletEnabled = useWalletEnabled();
  const tabPad = useTabBottomPad(16);
  const flow = useFlowLayout();
  const actionTileW = useMemo(
    () => Math.max(120, Math.floor((flow.width - flow.padH * 2 - 12) / 2)),
    [flow.padH, flow.width],
  );
  const { user, logout, setUser } = useAppStore();
  const { canCallAuthedApi } = useAuthedApiReady();
  const { userId } = useAuthedUserId();

  const [profileImage, setProfileImage] = useState<string | null>(user?.profile_image || null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [trustSummary, setTrustSummary] = useState<any>(null);
  const [loadingTrust, setLoadingTrust] = useState(false);
  const [achievementStats, setAchievementStats] = useState<{
    totalTrips: number;
    rating: number;
    riderReputationTripCount?: number;
  } | null>(null);
  const [referralInviteUrl, setReferralInviteUrl] = useState('');
  const [referralUsername, setReferralUsername] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const avatarScale = useRef(new Animated.Value(0.85)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(avatarScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!userId || !canCallAuthedApi) return;
      setLoadingTrust(true);

      try {
        const trustRes = await getUserTrustSummary(userId);
        if (mounted) setTrustSummary(trustRes.data);
      } catch { /* non-critical */ }

      try {
        const userRes = await getUser(userId);
        if (mounted && userRes?.data) {
          const d = userRes.data as Record<string, unknown>;
          setAchievementStats({
            totalTrips: Number(d.total_trips ?? user?.total_trips ?? 0),
            rating: Number(d.rating ?? user?.rating ?? 5),
            riderReputationTripCount:
              d.rider_reputation_trip_count != null
                ? Number(d.rider_reputation_trip_count)
                : undefined,
          });
        }
      } catch { /* non-critical — fall back to store for badges */ }

      if (mounted) setLoadingTrust(false);
    };
    void load();
    return () => { mounted = false; };
  }, [canCallAuthedApi, userId, user?.rating, user?.total_trips]);

  useEffect(() => {
    let mounted = true;
    if (!userId || !canCallAuthedApi) return undefined;
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/incentives/referral-code`, { headers: getAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!mounted || !res.ok) return;
        setReferralInviteUrl(typeof data.invite_url === 'string' ? data.invite_url : '');
        setReferralUsername(typeof data.username === 'string' ? data.username : '');
        setReferralCode(typeof data.referral_code === 'string' ? data.referral_code : '');
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [canCallAuthedApi, userId]);

  const saveProfileImage = async (uri: string) => {
    setProfileImage(uri);
    if (user && userId && canCallAuthedApi) {
      setUser({ ...user, profile_image: uri });
      try { await updateUser(userId, { profile_image: uri }); } catch { /* silent */ }
    }
  };

  const pickImage = () => {
    Alert.alert('Profile Photo', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!r.canceled && r.assets[0]) await saveProfileImage(r.assets[0].uri);
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return;
          const r = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!r.canceled && r.assets[0]) await saveProfileImage(r.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => { logout(); router.replace('/(auth)/login'); } },
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Account', 'This permanently deactivates your NEXRYDE account. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          if (userId && canCallAuthedApi) await deleteUserAccount(userId);
          await logout();
          router.replace('/(auth)/login');
        } catch { Alert.alert('Error', 'Could not delete account right now.'); }
      }},
    ]);
  };

  const confirmDriverSwitch = () => {
    if (user) setUser({ ...user, role: 'driver' });
    setShowDriverModal(false);
    Alert.alert('Switched to Driver', '', [{ text: 'OK', onPress: () => router.replace('/(driver-tabs)/driver-home') }]);
  };

  const initial = (user?.name?.[0] ?? 'R').toUpperCase();
  const displayName = user?.name || 'Rider';
  const memberYear = user?.created_at ? new Date(user.created_at).getFullYear() : '—';
  const tripsFallback = user?.total_trips ?? 0;
  const isVerified = Boolean(user?.is_verified);

  const badgeStats = useMemo(() => {
    const trips = Math.max(
      Number(achievementStats?.totalTrips ?? tripsFallback ?? 0),
      Number(tripsFallback ?? 0),
    );
    return {
      totalTrips: trips,
      rating: Number(achievementStats?.rating ?? user?.rating ?? 5),
      riderReputationTripCount:
        achievementStats?.riderReputationTripCount ?? user?.rider_reputation_trip_count,
    };
  }, [
    achievementStats,
    tripsFallback,
    user?.rating,
    user?.rider_reputation_trip_count,
  ]);
  const earnedBadgeIds = computeEarnedRiderBadgeIds(badgeStats);
  const earnedBadges = RIDER_BADGE_META.filter((b) => earnedBadgeIds.has(b.id));
  const lockedBadges = RIDER_BADGE_META.filter((b) => !earnedBadgeIds.has(b.id));
  const nextBadgeGoal = getNextRiderBadgeGoal(badgeStats);
  const allBadgesEarned = earnedBadges.length === RIDER_BADGE_META.length;

  const resolvedInviteUrl =
    referralInviteUrl.trim() ||
    (referralCode ? buildInviteUrl(referralUsername || undefined, referralCode) : '');

  const shareAchievementWhatsApp = (badgeId: RiderBadgeId) => {
    if (!referralCode) {
      Alert.alert(
        'Invite link',
        'Your referral link is still loading. Try again in a moment.',
      );
      return;
    }
    const msg = buildAchievementWhatsAppMessage(badgeId, {
      displayName: displayName,
      tripCount: badgeStats.totalTrips,
      inviteUrl: resolvedInviteUrl,
    });
    void shareTextViaWhatsApp(msg);
  };

  const shareReferralWhatsApp = () => {
    if (!referralCode) {
      Alert.alert('Invite link', 'Your invite link is still loading. Try again in a moment.');
      return;
    }
    void shareTextViaWhatsApp(buildShareMessage(referralUsername || undefined, referralCode, displayName || undefined));
  };

  if (!user) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <TabBrandStrip role="rider" />
        <ProfileScreenSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <TabBrandStrip role="rider" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          {
            paddingBottom: tabPad + 28,
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
      >
        {/* ── HERO (full-bleed brand plane) ── */}
        <LinearGradient
          colors={[BRAND.bgDeep, BRAND.bgCard, BRAND.bgDeep]}
          style={s.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <View style={s.heroGlow} />

          <View style={[s.heroActions, { right: flow.padH }]}>
            <TouchableOpacity
              style={s.heroActionBtn}
              onPress={() => router.push('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="create-outline" size={18} color={BRAND.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.heroActionBtn}
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" size={18} color={BRAND.textSecondary} />
            </TouchableOpacity>
          </View>

          <Animated.View style={[s.avatarWrap, { transform: [{ scale: avatarScale }] }]}>
            <LinearGradient
              colors={[PROFILE_GREEN, BRAND.info, BRAND.accentPurple]}
              style={s.avatarRing}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <TouchableOpacity style={s.avatarInner} onPress={pickImage} activeOpacity={0.85}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={s.avatarImg} />
                ) : (
                  <LinearGradient colors={[BRAND.bgElevated, BRAND.bgDeep]} style={s.avatarFallback}>
                    <Text style={s.avatarInitial}>{initial}</Text>
                  </LinearGradient>
                )}
                <View style={s.avatarEditBadge}>
                  <Ionicons name="camera" size={11} color={BRAND.textInverse} />
                </View>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          <Animated.View
            style={{
              alignItems: 'center',
              opacity: fadeIn,
              width: '100%',
              paddingHorizontal: flow.padH,
            }}
          >
            <View style={s.nameRow}>
              <Text style={s.heroName}>{displayName}</Text>
              {isVerified ? (
                <View style={s.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={14} color={PROFILE_GREEN} />
                </View>
              ) : null}
            </View>

            <Text style={s.heroPhone}>{user?.phone || user?.email || 'NEXRYDE Rider'}</Text>

            <View style={s.roleBadge}>
              <Ionicons name="bicycle-outline" size={12} color={BRAND.info} />
              <Text style={s.roleBadgeText}>NEXRYDE rider</Text>
            </View>

            <View style={s.statsGlass}>
              <View style={s.statChip}>
                <Text
                  style={[s.statValue, { color: PROFILE_GREEN }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {String(badgeStats.totalTrips)}
                </Text>
                <Text style={s.statLabel} numberOfLines={1}>
                  Trips
                </Text>
              </View>
              <View style={s.statsDivider} />
              <View style={s.statChip}>
                <Text
                  style={[s.statValue, { color: BRAND.warning }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {`${badgeStats.rating.toFixed(1)}★`}
                </Text>
                <Text style={s.statLabel} numberOfLines={1}>
                  Rating
                </Text>
              </View>
              <View style={s.statsDivider} />
              <View style={s.statChip}>
                <Text
                  style={[s.statValue, { color: BRAND.info }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {String(memberYear)}
                </Text>
                <Text style={s.statLabel} numberOfLines={1}>
                  Since
                </Text>
              </View>
            </View>
          </Animated.View>

          <View style={[s.achievementsPanel, { marginHorizontal: flow.padH }]}>
            <View style={s.achievementsHeader}>
              <View style={s.achievementsHeaderLeft}>
                <View style={s.achievementsIconWrap}>
                  <Ionicons name="ribbon" size={16} color={PROFILE_GREEN} />
                </View>
                <View>
                  <Text style={s.achievementsTitle}>Achievements</Text>
                  <Text style={s.achievementsSub}>Ride more · unlock more</Text>
                </View>
              </View>
              <View style={s.achievementsCountPill}>
                <Text style={s.achievementsCountText}>
                  {earnedBadges.length}/{RIDER_BADGE_META.length}
                </Text>
              </View>
            </View>

            {allBadgesEarned ? (
              <View style={s.achievementsCompleteBanner}>
                <Ionicons name="sparkles" size={16} color="#FBBF24" />
                <Text style={s.achievementsCompleteText}>You unlocked every rider badge — nice work!</Text>
              </View>
            ) : nextBadgeGoal ? (
              <View style={s.progressBlock}>
                <View style={s.progressHeader}>
                  <Text style={s.progressLabel}>Next: {nextBadgeGoal.title}</Text>
                  <Text style={[s.progressPct, { color: nextBadgeGoal.accent }]}>
                    {Math.round(nextBadgeGoal.progress * 100)}%
                  </Text>
                </View>
                <View style={s.progressTrack}>
                  <View
                    style={[
                      s.progressFill,
                      {
                        width: `${Math.max(4, Math.round(nextBadgeGoal.progress * 100))}%` as any,
                        backgroundColor: nextBadgeGoal.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={s.progressDetail}>{nextBadgeGoal.detail}</Text>
              </View>
            ) : null}

            {earnedBadges.length > 0 ? (
              <View style={s.badgesRow}>
                {earnedBadges.map((b) => (
                  <RiderBadgeCard
                    key={b.id}
                    badge={b}
                    onShare={() => shareAchievementWhatsApp(b.id)}
                  />
                ))}
              </View>
            ) : (
              <Text style={s.achievementsEmpty}>
                Take your first trip to unlock First Ride — then share the win.
              </Text>
            )}

            {lockedBadges.length > 0 ? (
              <>
                <Text style={s.lockedSectionLabel}>Coming up</Text>
                <View style={s.lockedRow}>
                  {lockedBadges.map((b) => (
                    <LockedBadgeChip key={b.id} badge={b} />
                  ))}
                </View>
              </>
            ) : null}

            {referralCode ? (
              <TouchableOpacity
                style={s.referralWaRow}
                onPress={shareReferralWhatsApp}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Share referral link on WhatsApp"
              >
                <LinearGradient
                  colors={['rgba(37,211,102,0.14)', 'rgba(37,211,102,0.06)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.referralWaGrad}
                >
                  <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                  <View style={s.referralWaCopy}>
                    <Text style={s.referralWaTitle}>Invite friends</Text>
                    <Text style={s.referralWaSub}>
                      Share your link · earn {formatNgn(REFERRAL_REWARD_INVITER_NGN)} each
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </LinearGradient>
              </TouchableOpacity>
            ) : null}
          </View>
        </LinearGradient>

        <View style={[s.body, { paddingHorizontal: flow.padH }]}>
        {/* ── QUICK ACTIONS GRID ── */}
        <View style={s.gridSection}>
          <Text style={[s.gridTitle, { color: colors.textMuted }]}>Shortcuts</Text>
          <View style={[s.grid, { gap: flow.isTablet ? 14 : 12 }]}>
            <ActionTile icon="create" label="Edit profile" gradColors={['#1D4ED8', '#2563EB']} tileWidth={actionTileW} onPress={() => router.push('/edit-profile')} />
            <ActionTile icon="time" label="My trips" gradColors={['#5B21B6', '#7C3AED']} tileWidth={actionTileW} onPress={() => router.push('/(rider-tabs)/rider-trips' as any)} />
            <ActionTile icon="location" label="Saved places" gradColors={['#065F46', '#059669']} tileWidth={actionTileW} onPress={() => router.push('/rider/saved-places' as any)} />
            <ActionTile icon="heart-circle" label="Favourites" gradColors={['#9D174D', '#EC4899']} tileWidth={actionTileW} onPress={() => router.push('/rider/favorite-drivers')} />
            {walletEnabled ? (
              <ActionTile icon="wallet" label="Wallet" gradColors={['#0369A1', '#0EA5E9']} tileWidth={actionTileW} onPress={() => router.push('/(rider-tabs)/rider-wallet' as any)} />
            ) : null}
            <ActionTile icon="notifications" label="Updates" gradColors={['#7C2D12', '#EA580C']} tileWidth={actionTileW} onPress={() => router.push('/(rider-tabs)/rider-notifications' as any)} />
          </View>
        </View>

        {/* ── TRUST SCORE ── */}
        {loadingTrust ? (
          <Section title="NEXRYDE score">
            <View style={s.loadingRow}>
              <Ionicons name="reload" size={16} color={colors.textMuted} />
              <Text style={[s.loadingText, { color: colors.textMuted }]}>Loading your score…</Text>
            </View>
          </Section>
        ) : trustSummary ? (
          <Section title="NEXRYDE score">
            <LinearGradient colors={[PROFILE_GREEN_SOFT, 'rgba(56,189,248,0.06)']} style={s.scoreHero}>
              <View style={s.scoreHeroLeft}>
                <Text style={[s.scoreMainValue, { color: colors.text }]}>
                  {Math.round(trustSummary.nexryde_score)}
                </Text>
                <Text style={[s.scoreMainLabel, { color: colors.textMuted }]}>Your score</Text>
              </View>
              <View style={s.scoreHeroRight}>
                <View style={[s.scoreTierPill, { borderColor: `${PROFILE_GREEN}44` }]}>
                  <Text style={s.scoreTierText}>{trustSummary.score_tier?.label ?? '—'}</Text>
                </View>
                {trustSummary.priority_matching_enabled ? (
                  <View style={s.scorePerksChip}>
                    <Ionicons name="flash" size={11} color={BRAND.warning} />
                    <Text style={s.scorePerksChipText}>Priority Match</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>

            <View style={s.scoreBreak}>
              <ScoreBar label="Service" value={trustSummary.score_breakdown?.service_quality ?? 0} color={PROFILE_GREEN} />
              <ScoreBar label="Punctuality" value={trustSummary.score_breakdown?.punctuality ?? 0} color={BRAND.info} />
              <ScoreBar label="Verification" value={trustSummary.score_breakdown?.verification ?? 0} color={BRAND.accentPurple} />
              <ScoreBar label="Payments" value={trustSummary.score_breakdown?.payment_behavior ?? 0} color={BRAND.warning} />
            </View>

            <View style={s.verifRow}>
              {[
                { label: 'Account', ok: trustSummary.verification_status?.account_verified },
                { label: 'Face', ok: trustSummary.verification_status?.face_verified },
                { label: 'NIN', ok: trustSummary.verification_status?.nin_verified },
              ].map(({ label, ok }) => (
                <View
                  key={label}
                  style={[
                    s.verifChip,
                    {
                      borderColor: ok ? `${PROFILE_GREEN}55` : colors.border,
                      backgroundColor: ok ? PROFILE_GREEN_SOFT : 'transparent',
                    },
                  ]}
                >
                  <Ionicons
                    name={ok ? 'checkmark-circle' : 'close-circle'}
                    size={13}
                    color={ok ? PROFILE_GREEN : colors.textMuted}
                  />
                  <Text style={[s.verifChipText, { color: ok ? PROFILE_GREEN : colors.textMuted }]}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Perks */}
            {trustSummary.unlocked_perks?.length > 0 ? (
              <View style={s.perksWrap}>
                <Text style={s.perksHeader}>Unlocked perks</Text>
                {trustSummary.unlocked_perks.map((p: string) => (
                  <View key={p} style={s.perkRow}>
                    <Ionicons name="checkmark-circle" size={14} color={PROFILE_GREEN} />
                    <Text style={s.perkText}>{p}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* ── SAFETY ── */}
        <Section title="Safety">
          <TouchableOpacity style={s.sosButton} onPress={() => router.push('/(rider-tabs)/rider-safety' as any)} activeOpacity={0.85}>
            <LinearGradient colors={['#7f1d1d', '#991b1b', '#b91c1c']} style={s.sosInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="warning" size={20} color="#FFF" />
              <Text style={s.sosText}>Open SOS & Safety Center</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </TouchableOpacity>
          <MenuRow icon="shield-checkmark" gradColors={['#78350F', '#D97706']} title="Safety Center" subtitle="Emergency contacts & trip protection" onPress={() => router.push('/(rider-tabs)/rider-safety' as any)} />
          <MenuRow icon="ribbon" gradColors={['#134E4A', '#0D9488']} title="NEXRYDE Shield" subtitle="Disputes and ride protection" onPress={() => router.push('/shield-disputes')} />
        </Section>

        {/* ── ACCOUNT & PREFERENCES ── */}
        <Section title="Preferences">
          <MenuRow icon="settings" gradColors={['#166534', PROFILE_GREEN]} title="Settings" subtitle="App preferences & defaults" onPress={() => router.push('/settings')} />
          <MenuRow icon="car-sport" gradColors={['#3730A3', '#4F46E5']} title="Switch to Driver Mode" subtitle="Drive and earn on NEXRYDE" onPress={() => setShowDriverModal(true)} />
        </Section>

        {/* ── SUPPORT & LEGAL ── */}
        <Section title="Support & legal">
          <MenuRow icon="help-circle" gradColors={['#7C2D12', '#EA580C']} title="Help & Support" onPress={() => router.push('/support')} />
          <MenuRow icon="document-text" gradColors={['#4C1D95', '#7C3AED']} title="Privacy Policy" onPress={() => router.push('/privacy-policy')} />
          <MenuRow icon="reader" gradColors={['#0C4A6E', '#0EA5E9']} title="Terms of Service" onPress={() => router.push('/terms-of-service')} />
        </Section>

        {/* ── ACCOUNT ── */}
        <Section title="Account">
          <MenuRow icon="trash" gradColors={['#7f1d1d', '#991b1b']} title="Delete Account" subtitle="Permanently deactivate this profile" onPress={handleDelete} danger />
        </Section>

        <TouchableOpacity
          activeOpacity={1}
          delayLongPress={800}
          onLongPress={() => {
            const r = sentryTestCrash('rider');
            Alert.alert(r.sent ? 'Sentry test sent' : 'Sentry not active', r.message);
          }}
        >
          <Text style={[s.version, { color: colors.textMuted }]}>
            NEXRYDE v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LinearGradient colors={['rgba(239,68,68,0.12)', 'rgba(239,68,68,0.06)']} style={s.logoutInner}>
            <Ionicons name="log-out-outline" size={20} color={BRAND.danger} />
            <Text style={s.logoutText}>Log Out</Text>
          </LinearGradient>
        </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── SWITCH TO DRIVER MODAL ── */}
      <Modal visible={showDriverModal} animationType="slide" transparent onRequestClose={() => setShowDriverModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowDriverModal(false)}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
            <LinearGradient colors={['rgba(99,102,241,0.15)', 'transparent']} style={s.modalIconWrap}>
              <Ionicons name="car-sport" size={36} color="#818CF8" />
            </LinearGradient>
            <Text style={s.modalTitle}>Switch to Driver?</Text>
            <Text style={s.modalSubtitle}>
              You'll use the driver experience to go online and earn. Switch back to rider anytime from your profile.
            </Text>
            <TouchableOpacity style={s.modalConfirmBtn} onPress={confirmDriverSwitch}>
              <LinearGradient colors={['#4F46E5', '#6366F1']} style={s.modalConfirmGrad}>
                <Text style={s.modalConfirmText}>Switch to Driver</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowDriverModal(false)}>
              <Text style={s.modalCancelText}>Stay as Rider</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ─── Styles ─────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.bgDeep },
  scroll: { paddingHorizontal: 0 },
  body: { width: '100%', paddingTop: SPACING.sm },

  /* Hero */
  hero: {
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.glassBorder,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: -60,
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: PROFILE_GREEN_SOFT,
  },
  heroActions: {
    position: 'absolute',
    top: SPACING.md,
    flexDirection: 'row',
    gap: SPACING.sm,
    zIndex: 2,
  },
  heroActionBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: { marginBottom: SPACING.md },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  avatarInner: {
    width: 98,
    height: 98,
    borderRadius: 49,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImg: { width: 98, height: 98, borderRadius: 49 },
  avatarFallback: {
    width: 98,
    height: 98,
    borderRadius: 49,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 36, fontWeight: '900', color: BRAND.textPrimary, letterSpacing: -1 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PROFILE_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BRAND.bgDeep,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  heroName: {
    fontSize: 26,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -0.55,
  },
  verifiedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PROFILE_GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${PROFILE_GREEN}55`,
  },
  heroPhone: {
    fontSize: 13,
    color: BRAND.textSecondary,
    marginBottom: SPACING.md,
    fontWeight: '500',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56,189,248,0.10)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56,189,248,0.28)',
    marginBottom: SPACING.lg,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.info,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  /* Stats */
  statsGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: RADIUS.xl,
    backgroundColor: 'rgba(18,28,46,0.72)',
    borderWidth: 1,
    borderColor: SURFACE.glassBorder,
    shadowColor: BRAND.primary,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    minWidth: 0,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.35,
    width: '100%',
    textAlign: 'center',
  },
  statLabel: {
    ...TYPOGRAPHY.label,
    color: BRAND.textMuted,
    marginTop: 4,
    width: '100%',
    textAlign: 'center',
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: SURFACE.hairline,
    marginHorizontal: 2,
  },

  achievementsPanel: {
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: 'rgba(34,225,128,0.10)',
    borderWidth: 1,
    borderColor: SURFACE.glassBorder,
  },
  achievementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  achievementsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  achievementsIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(34,225,128,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.glassBorder,
  },
  achievementsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.textPrimary,
    letterSpacing: -0.25,
  },
  achievementsSub: {
    fontSize: 11,
    fontWeight: '600',
    color: BRAND.textSecondary,
    marginTop: 2,
  },
  achievementsCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
  },
  achievementsCountText: { fontSize: 11, fontWeight: '800', color: BRAND.textSecondary },
  achievementsCompleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    marginBottom: 12,
  },
  achievementsCompleteText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#CBD5E1', lineHeight: 17 },
  progressBlock: { marginBottom: 12, gap: 6 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  progressPct: { fontSize: 12, fontWeight: '900' },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressDetail: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  achievementsEmpty: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  badgesRow: { flexDirection: 'column', gap: 10, width: '100%', marginBottom: 4 },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.stack,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.stack,
    paddingHorizontal: SPACING.stack,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
    width: '100%',
  },
  badgeIconRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeTextCol: { flexShrink: 1, flexGrow: 1, minWidth: 0, gap: 3 },
  badgeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badgeTitle: { fontSize: 13, fontWeight: '900', color: BRAND.textPrimary },
  badgeEarnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeEarnedText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  badgeSub: { fontSize: 11, fontWeight: '600', color: BRAND.textSecondary, lineHeight: 15 },
  badgeWaBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  lockedSectionLabel: {
    ...TYPOGRAPHY.label,
    color: BRAND.textMuted,
    marginTop: 6,
    marginBottom: 8,
  },
  lockedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  lockedBadgeChip: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    minWidth: 96,
    flex: 1,
    maxWidth: 120,
  },
  lockedBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lockedBadgeLock: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  lockedBadgeTitle: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  referralWaRow: { marginTop: SPACING.stack, borderRadius: RADIUS.md, overflow: 'hidden' },
  referralWaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.stack,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(37,211,102,0.28)',
    borderRadius: RADIUS.md,
  },
  referralWaCopy: { flex: 1, gap: 2 },
  referralWaTitle: { fontSize: 13, fontWeight: '800', color: BRAND.textPrimary },
  referralWaSub: { fontSize: 11, fontWeight: '600', color: BRAND.textSecondary },

  /* Grid */
  gridSection: { paddingTop: SPACING.lg, paddingBottom: SPACING.xs },
  gridTitle: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.stack },
  actionTile: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    alignItems: 'flex-start',
    gap: SPACING.stack,
    minHeight: 96,
  },
  actionTileIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileLabel: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },

  /* Section */
  section: { paddingTop: SPACING.lg },
  sectionTitle: {
    ...TYPOGRAPHY.label,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  sectionCard: {
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },

  /* Loading */
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: SPACING.md },
  loadingText: { fontSize: 13, fontWeight: '600' },

  /* Score */
  scoreHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.hairline,
  },
  scoreHeroLeft: { flex: 1 },
  scoreMainValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1.2 },
  scoreMainLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  scoreHeroRight: { alignItems: 'flex-end', gap: 8 },
  scoreTierPill: {
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: PROFILE_GREEN_SOFT,
  },
  scoreTierText: { fontSize: 11, fontWeight: '800', color: PROFILE_GREEN },
  scorePerksChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scorePerksChipText: { fontSize: 11, fontWeight: '700', color: BRAND.warning },
  scoreBreak: {
    padding: SPACING.md,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.hairline,
  },
  scoreBarWrap: { gap: 5 },
  scoreBarRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreBarLabel: { fontSize: 11, color: BRAND.textSecondary, fontWeight: '600' },
  scoreBarValue: { fontSize: 11, fontWeight: '800' },
  scoreBarTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: SURFACE.tile,
    overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  verifRow: {
    flexDirection: 'row',
    gap: 8,
    padding: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.hairline,
  },
  verifChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  verifChipText: { fontSize: 11, fontWeight: '700' },
  perksWrap: { padding: SPACING.md, gap: 8 },
  perksHeader: { fontSize: 11, fontWeight: '800', color: BRAND.textMuted, marginBottom: 2 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkText: { fontSize: 12, color: BRAND.textSecondary, flex: 1 },

  /* SOS */
  sosButton: { margin: SPACING.md, marginBottom: SPACING.sm, borderRadius: RADIUS.md, overflow: 'hidden' },
  sosInner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md },
  sosText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#FFF' },

  /* Menu row */
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.stack,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowBody: { flex: 1 },
  menuTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.15 },
  menuSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  menuBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  menuBadgeText: { fontSize: 11, fontWeight: '800', color: BRAND.warning },

  /* Version & logout */
  version: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  logoutBtn: { borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: SPACING.sm },
  logoutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.22)',
    borderRadius: RADIUS.lg,
  },
  logoutText: { fontSize: 14, fontWeight: '800', color: BRAND.danger },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: BRAND.bgOverlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: BRAND.bgElevated,
    borderTopLeftRadius: RADIUS.xl + 4,
    borderTopRightRadius: RADIUS.xl + 4,
    padding: SPACING.lg,
    paddingTop: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: SURFACE.hairline,
    alignItems: 'center',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: SURFACE.hairline,
    marginBottom: SPACING.lg,
  },
  modalCloseBtn: { position: 'absolute', top: 14, right: 16, padding: 6 },
  modalIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 13,
    color: BRAND.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
    paddingHorizontal: 10,
  },
  modalConfirmBtn: { width: '100%', borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: 10 },
  modalConfirmGrad: { padding: SPACING.md, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  modalCancelBtn: { padding: 12 },
  modalCancelText: { fontSize: 14, color: BRAND.textMuted, fontWeight: '600' },
});

export { ErrorBoundary } from '@/src/components/rider/RiderScreenErrorBoundary';
