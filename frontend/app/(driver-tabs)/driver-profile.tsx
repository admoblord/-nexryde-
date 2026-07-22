import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import { ProfileScreenSkeleton } from '@/src/components/shared/SkeletonLoader';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/src/store/appStore';
import { useDriverDisplayStore } from '@/src/store/driverDisplayStore';
import {
  deleteUserAccount,
  getDriverProfile,
  getUserTrustSummary,
  updateUser,
  BACKEND_URL,
  getAuthHeaders,
} from '@/src/services/api';
import { writeDriverVerificationFact } from '@/src/services/driverVerificationFact';
import { writeDriverBootCache, readDriverBootCache } from '@/src/services/driverBootCache';
import * as ImagePicker from 'expo-image-picker';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { DRIVER_TRIPS_TAB_HREF } from '@/src/constants/driverNavigation';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { sentryTestCrash } from '@/src/utils/sentry';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useThemeColors } from '@/src/constants/theme';
import { useWalletEnabled } from '@/src/services/clientConfig';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';

const PROFILE_GREEN = BRAND.primary;
const PROFILE_GREEN_SOFT = BRAND.primaryMuted;

interface DriverVehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  type: string;
  is_active?: boolean;
  is_default?: boolean;
}

/* ─── Stat chip ──────────────────────────────────────────────── */
function StatChip({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={s.statChip}>
      <Text style={[s.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

/* ─── Action tile ────────────────────────────────────────────── */
function ActionTile({
  icon,
  label,
  gradColors,
  badge,
  onPress,
  tileWidth,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  gradColors: [string, string];
  badge?: string;
  onPress: () => void;
  tileWidth: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const { colors, isDark } = useThemeColors();
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
        style={[
          s.actionTile,
          {
            backgroundColor: isDark ? SURFACE.tile : colors.card,
            borderColor: isDark ? SURFACE.hairline : colors.border,
          },
        ]}
        onPress={press}
        activeOpacity={1}
      >
        <View style={s.actionTileTop}>
          <LinearGradient colors={gradColors} style={s.actionTileIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Ionicons name={icon} size={20} color="#FFF" />
          </LinearGradient>
          {badge ? (
            <View style={s.actionTileBadge}>
              <Text style={s.actionTileBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
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
    <TouchableOpacity
      style={[s.menuRow, { borderTopColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <LinearGradient
        colors={danger ? ['#7f1d1d', '#991b1b'] : gradColors}
        style={s.menuIconWrap}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name={icon} size={17} color="#FFF" />
      </LinearGradient>
      <View style={s.menuRowBody}>
        <Text style={[s.menuTitle, { color: colors.text }, danger && { color: BRAND.danger }]}>
          {title}
        </Text>
        {subtitle ? <Text style={[s.menuSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={s.menuBadge}>
          <Text style={s.menuBadgeText}>{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

/* ─── Section ────────────────────────────────────────────────── */
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
  return (
    <View style={s.scoreBarWrap}>
      <View style={s.scoreBarRow}>
        <Text style={s.scoreBarLabel}>{label}</Text>
        <Text style={[s.scoreBarValue, { color }]}>{Math.round(value)}</Text>
      </View>
      <View style={s.scoreBarTrack}>
        <View style={[s.scoreBarFill, { width: `${Math.min(value, 100)}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DRIVER PROFILE SCREEN
═══════════════════════════════════════════════════════════════ */
// Per-tab crash safety net — confines any render error to this tab (never to OS home).
export { ErrorBoundary } from '@/src/components/driver/DriverTabErrorBoundary';

export default function DriverProfileScreen() {
  const toast = useErrorToast();
  const router = useRouter();
  const tabPad = useTabBottomPad(16);
  const flow = useFlowLayout();
  const { colors, isDark } = useThemeColors();
  const walletEnabled = useWalletEnabled();
  const actionTileW = useMemo(
    () => Math.max(120, Math.floor((flow.width - flow.padH * 2 - 12) / 2)),
    [flow.padH, flow.width],
  );
  const { user, logout, setUser, subscription } = useAppStore();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();
  const displayVerification = useDriverDisplayStore((s) =>
    s.driverId && driverId && s.driverId === driverId ? s.verificationStatus : null,
  );
  const displaySubStatus = useDriverDisplayStore((s) =>
    s.driverId && driverId && s.driverId === driverId ? s.subscriptionStatus : null,
  );
  const setDriverDisplay = useDriverDisplayStore((s) => s.setDriverDisplay);

  const [profileImage, setProfileImage] = useState<string | null>(user?.profile_image || null);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [driverCity, setDriverCity] = useState('');
  const [driverFullName, setDriverFullName] = useState('');
  const [driverVehicles, setDriverVehicles] = useState<DriverVehicle[]>([]);
  const [trustSummary, setTrustSummary] = useState<any>(null);
  const [loadingTrust, setLoadingTrust] = useState(false);

  const avatarScale = useRef(new Animated.Value(0.85)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(avatarScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadDriverProfile = useCallback(async () => {
    if (!driverId || !canCallAuthedApi) return;
    try {
      const [profileRes, vehiclesRes] = await Promise.allSettled([
        getDriverProfile(driverId),
        fetch(`${BACKEND_URL}/api/drivers/${driverId}/vehicles`, {
          headers: getAuthHeaders(),
        }).then(r => r.json()).catch(() => ({ vehicles: [] })),
      ]);
      if (profileRes.status === 'fulfilled') {
        const p = (profileRes.value as any).data as any;
        setDriverCity(p?.city || '');
        setDriverFullName(p?.full_name || '');
        const vStatus = typeof p?.verification_status === 'string' ? p.verification_status : '';
        if (vStatus) {
          setDriverDisplay({ driverId, verificationStatus: vStatus, displayHydrated: true });
          void writeDriverVerificationFact(driverId, vStatus);
          void (async () => {
            try {
              const prev = await readDriverBootCache(driverId);
              await writeDriverBootCache({
                driverId,
                verificationStatus: vStatus,
                subscriptionStatus: prev?.subscriptionStatus || displaySubStatus || 'trial',
                trialTripsCompleted: prev?.trialTripsCompleted ?? 0,
                trialTripsTarget: prev?.trialTripsTarget ?? 15,
                trialExtended: prev?.trialExtended ?? false,
                onboardingCompleted: true,
              });
            } catch {
              /* non-fatal */
            }
          })();
        }
      }
      if (vehiclesRes.status === 'fulfilled') {
        setDriverVehicles(((vehiclesRes.value as any)?.vehicles || []) as DriverVehicle[]);
      }
    } catch { /* non-critical */ }
  }, [canCallAuthedApi, displaySubStatus, driverId, setDriverDisplay]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    void loadDriverProfile();
  }, [loadDriverProfile, canCallAuthedApi]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!driverId || !canCallAuthedApi) return;
      setLoadingTrust(true);
      try {
        const res = await getUserTrustSummary(driverId);
        if (mounted) setTrustSummary(res.data);
      } catch { /* non-critical */ }
      finally { if (mounted) setLoadingTrust(false); }
    };
    void load();
    return () => { mounted = false; };
  }, [canCallAuthedApi, driverId]);

  const saveProfileImage = async (uri: string) => {
    setProfileImage(uri);
    if (user && driverId && canCallAuthedApi) {
      setUser({ ...user, profile_image: uri });
      try { await updateUser(driverId, { profile_image: uri }); } catch { /* silent */ }
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
    Alert.alert('Delete Account', 'This permanently deactivates your NEXRYDE driver account. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          if (driverId && canCallAuthedApi) await deleteUserAccount(driverId);
          await logout();
          router.replace('/(auth)/login');
        } catch { Alert.alert('Error', 'Could not delete account right now.'); }
      }},
    ]);
  };

  const confirmRiderSwitch = () => {
    if (user) setUser({ ...user, role: 'rider' });
    setShowSwitchModal(false);
    Alert.alert('Switched to Rider', 'You can switch back to Driver anytime from your profile.', [
      { text: 'OK', onPress: () => router.replace('/(rider-tabs)/rider-home') },
    ]);
  };

  const initial = (user?.name?.[0] ?? 'D').toUpperCase();
  const displayName = driverFullName || user?.name || 'Driver';
  const memberYear = user?.created_at ? new Date(user.created_at).getFullYear() : '—';
  const rating = (user?.rating ?? 5).toFixed(1);
  const trips = user?.total_trips ?? 0;

  // Same persisted source as Home — hydrate display store from durable fact/cache.
  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await readDriverBootCache(driverId);
        if (cancelled || !snap) return;
        setDriverDisplay({
          driverId,
          verificationStatus: snap.verificationStatus,
          subscriptionStatus: snap.subscriptionStatus,
          trialTripsCompleted: snap.trialTripsCompleted,
          trialTripsTarget: snap.trialTripsTarget,
          trialExtended: snap.trialExtended,
          displayHydrated: true,
        });
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driverId, setDriverDisplay]);

  const isApproved = displayVerification === 'approved';
  const verificationLabel =
    displayVerification === 'approved'
      ? 'Verified'
      : displayVerification == null
        ? 'Checking…'
        : 'Pending';

  const subStatus =
    ((subscription as any)?.status as string | undefined) || displaySubStatus || undefined;
  const subTier = (subscription as any)?.tier as string | undefined;
  const subChecking = subStatus == null;
  const isActiveSub = subStatus === 'trial' || subStatus === 'active' || subStatus === 'grace_period';
  const subLabel = subStatus === 'trial'
    ? 'Free Trial'
    : subStatus === 'active'
      ? (subTier === 'road_warrior' ? 'Road Warrior' : 'City Rider')
      : subStatus === 'grace_period'
        ? 'Grace Period'
        : 'No Plan';

  // Active vehicle
  const activeVehicle = driverVehicles.find(v => v.is_active || v.is_default) || driverVehicles[0] || null;

  if (!user) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
        <TabBrandStrip role="driver" />
        <ProfileScreenSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />
      <TabBrandStrip role="driver" />
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
        {/* ── HERO (full-bleed) ── */}
        <LinearGradient
          colors={[BRAND.bgDeep, BRAND.bgCard, BRAND.bgDeep]}
          style={s.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <View style={s.heroGlow} />
          <TouchableOpacity
            style={[s.heroSettings, { right: flow.padH }]}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Ionicons name="settings-outline" size={18} color={BRAND.textSecondary} />
          </TouchableOpacity>

          <View
            style={[
              s.onlinePill,
              {
                backgroundColor: user?.is_online ? PROFILE_GREEN_SOFT : SURFACE.tile,
              },
            ]}
          >
            <View
              style={[
                s.onlineDot,
                { backgroundColor: user?.is_online ? PROFILE_GREEN : BRAND.textMuted },
              ]}
            />
            <Text
              style={[
                s.onlinePillText,
                { color: user?.is_online ? PROFILE_GREEN : BRAND.textMuted },
              ]}
            >
              {user?.is_online ? 'Online' : 'Offline'}
            </Text>
          </View>

          <Animated.View style={[s.avatarWrap, { transform: [{ scale: avatarScale }] }]}>
            <LinearGradient
              colors={
                isApproved
                  ? [PROFILE_GREEN, BRAND.info]
                  : [BRAND.warning, BRAND.danger]
              }
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
              {isApproved ? (
                <View style={s.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={13} color={PROFILE_GREEN} />
                </View>
              ) : null}
            </View>
            <Text style={s.heroSub}>
              {driverCity ? `${driverCity} · ` : ''}
              {user?.phone || user?.email || 'NEXRYDE Driver'}
            </Text>

            <View style={s.badgeRow}>
              <View style={s.roleBadge}>
                <Ionicons name="car-sport" size={11} color={PROFILE_GREEN} />
                <Text style={s.roleBadgeText}>Driver</Text>
              </View>
              <View
                style={[
                  s.statusBadge,
                  {
                    backgroundColor: isApproved
                      ? PROFILE_GREEN_SOFT
                      : displayVerification == null
                        ? 'rgba(148,163,184,0.14)'
                        : 'rgba(245,158,11,0.12)',
                    borderColor: isApproved
                      ? `${PROFILE_GREEN}44`
                      : displayVerification == null
                        ? 'rgba(148,163,184,0.28)'
                        : 'rgba(245,158,11,0.28)',
                  },
                ]}
              >
                <Text
                  style={[
                    s.statusBadgeText,
                    {
                      color: isApproved
                        ? PROFILE_GREEN
                        : displayVerification == null
                          ? BRAND.textMuted
                          : BRAND.warning,
                    },
                  ]}
                >
                  {verificationLabel}
                </Text>
              </View>
              {isActiveSub ? (
                <View style={s.subBadge}>
                  <Ionicons name="star" size={10} color={BRAND.warning} />
                  <Text style={s.subBadgeText}>{subLabel}</Text>
                </View>
              ) : null}
            </View>

            <View style={s.statsGlass}>
              <StatChip value={String(trips)} label="Trips" color={PROFILE_GREEN} />
              <View style={s.statsDivider} />
              <StatChip value={`${rating}★`} label="Rating" color={BRAND.warning} />
              <View style={s.statsDivider} />
              <StatChip value={String(memberYear)} label="Since" color={BRAND.info} />
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={[s.body, { paddingHorizontal: flow.padH }]}>
        {/* ── VEHICLE CARD ── */}
        <View style={s.vehicleSection}>
          <TouchableOpacity style={s.vehicleCard} onPress={() => router.push('/driver/vehicle')} activeOpacity={0.85}>
            <LinearGradient colors={['rgba(56,189,248,0.10)', 'rgba(56,189,248,0.03)']} style={s.vehicleGrad}>
              <View style={s.vehicleLeft}>
                <View style={s.vehicleIconWrap}>
                  <LinearGradient colors={['#0C4A6E', BRAND.info]} style={s.vehicleIcon}>
                    <Ionicons name="car-sport" size={20} color="#FFF" />
                  </LinearGradient>
                </View>
                <View style={s.vehicleInfo}>
                  {activeVehicle ? (
                    <>
                      <View style={s.vehicleNameRow}>
                        <View style={s.vehicleOnlineDot} />
                        <Text style={s.vehicleName}>
                          {[activeVehicle.make, activeVehicle.model].filter(Boolean).join(' ') || 'My Vehicle'}
                        </Text>
                      </View>
                      <Text style={s.vehicleDetail}>
                        {[activeVehicle.color, activeVehicle.year].filter(Boolean).join(' · ')}
                      </Text>
                      {activeVehicle.plate ? (
                        <View style={s.platePill}>
                          <Text style={s.platePillText}>{activeVehicle.plate}</Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={s.vehicleEmpty}>No vehicle registered · tap to add</Text>
                  )}
                </View>
              </View>
              <View style={s.vehicleRight}>
                {driverVehicles.length > 1 ? (
                  <View style={s.vehicleCountBadge}>
                    <Text style={s.vehicleCountText}>{driverVehicles.length}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={BRAND.textMuted} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── SUBSCRIPTION STATUS CARD ── */}
        {(() => {
          const isOnTrial   = subStatus === 'trial' || (subscription as any)?.trial_active;
          const trialDone   = Number((subscription as any)?.trial_trips_completed ?? (subscription as any)?.completed_trips ?? 0);
          const trialTarget = Number((subscription as any)?.trial_trips_target ?? (subscription as any)?.trips_target ?? 15);
          const trialLeft   = Math.max(0, trialTarget - trialDone);
          const trialPct    = trialTarget > 0 ? Math.min(1, trialDone / trialTarget) : 0;
          return (
            <View style={[s.vehicleSection, { marginTop: 0 }]}>
              <TouchableOpacity style={s.subCard} onPress={() => router.push('/driver/subscription')} activeOpacity={0.85}>
                <LinearGradient
                  colors={
                    isActiveSub
                      ? ['rgba(245,158,11,0.12)', 'rgba(245,158,11,0.03)']
                      : [SURFACE.tile, 'transparent']
                  }
                  style={s.subGrad}
                >
                  <View
                    style={[
                      s.subIconWrap,
                      {
                        backgroundColor: isActiveSub
                          ? 'rgba(245,158,11,0.14)'
                          : SURFACE.tile,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isActiveSub ? 'star' : 'star-outline'}
                      size={20}
                      color={isActiveSub ? BRAND.warning : BRAND.textMuted}
                    />
                  </View>
                  <View style={s.subInfo}>
                    <Text style={s.subTitle}>
                      {subChecking
                        ? 'Checking plan…'
                        : isActiveSub
                          ? subStatus === 'trial'
                            ? 'Free Trial · Active'
                            : `${subLabel} · Active`
                          : 'No Active Plan'}
                    </Text>
                    {isOnTrial ? (
                      <View style={{ gap: 4 }}>
                        <Text style={[s.subSub, { color: BRAND.warning }]}>
                          Trial: {trialDone}/{trialTarget} trips ·{' '}
                          {trialLeft > 0 ? `${trialLeft} left` : 'Complete!'}
                        </Text>
                        <View
                          style={{
                            height: 3,
                            backgroundColor: 'rgba(245,158,11,0.2)',
                            borderRadius: 2,
                          }}
                        >
                          <View
                            style={{
                              height: 3,
                              width: `${Math.round(trialPct * 100)}%` as any,
                              backgroundColor: BRAND.warning,
                              borderRadius: 2,
                            }}
                          />
                        </View>
                      </View>
                    ) : (
                      <Text style={s.subSub}>
                        {isActiveSub
                          ? 'Tap to manage or upgrade plan'
                          : 'Activate your driver plan'}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={BRAND.textMuted} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── QUICK ACTIONS GRID ── */}
        <View style={s.gridSection}>
          <Text style={[s.gridTitle, { color: colors.textMuted }]}>Quick access</Text>
          <View style={s.grid}>
            <ActionTile icon="create" label="Edit Profile" gradColors={['#1D4ED8', '#2563EB']} tileWidth={actionTileW} onPress={() => router.push('/edit-profile')} />
            <ActionTile icon="list" label="Trip History" gradColors={['#5B21B6', '#7C3AED']} tileWidth={actionTileW} onPress={() => router.push(DRIVER_TRIPS_TAB_HREF as any)} />
            <ActionTile icon="car-sport" label="My Vehicle" gradColors={['#065F46', '#059669']} tileWidth={actionTileW} onPress={() => router.push('/driver/vehicle')} />
            <ActionTile icon="document-text" label="Documents" gradColors={['#7C2D12', '#EA580C']} tileWidth={actionTileW} onPress={() => router.push('/driver/documents')} />
            {walletEnabled ? (
              <ActionTile icon="arrow-up-circle" label="Withdraw" gradColors={['#14532D', '#16A34A']} tileWidth={actionTileW} onPress={() => router.push('/driver/withdrawal')} />
            ) : (
              <ActionTile icon="card" label="Bank details" gradColors={['#14532D', '#16A34A']} tileWidth={actionTileW} onPress={() => router.push('/driver/bank')} />
            )}
            <ActionTile icon="analytics" label="Performance" gradColors={['#0C4A6E', BRAND.info]} tileWidth={actionTileW} onPress={() => router.push('/driver/performance')} />
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
            <LinearGradient colors={[PROFILE_GREEN_SOFT, 'rgba(56,189,248,0.05)']} style={s.scoreHero}>
              <View style={s.scoreHeroLeft}>
                <Text style={[s.scoreMainValue, { color: colors.text }]}>
                  {Math.round(trustSummary.nexryde_score)}
                </Text>
                <Text style={[s.scoreMainLabel, { color: colors.textMuted }]}>Your score</Text>
                {trustSummary.driver_safety_score != null ? (
                  <Text style={s.safetyScoreLabel}>
                    Safety: {Math.round(trustSummary.driver_safety_score)}
                  </Text>
                ) : null}
              </View>
              <View style={s.scoreHeroRight}>
                <View style={s.scoreTierPill}>
                  <Text style={s.scoreTierText}>{trustSummary.score_tier?.label ?? '—'}</Text>
                </View>
                {trustSummary.priority_matching_enabled ? (
                  <View style={s.scoreChip}>
                    <Ionicons name="flash" size={11} color={BRAND.warning} />
                    <Text style={s.scoreChipText}>Priority</Text>
                  </View>
                ) : null}
                {trustSummary.lower_fee_eligible ? (
                  <View style={[s.scoreChip, { backgroundColor: PROFILE_GREEN_SOFT }]}>
                    <Ionicons name="trending-down" size={11} color={PROFILE_GREEN} />
                    <Text style={[s.scoreChipText, { color: PROFILE_GREEN }]}>Low Fee</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>

            <View style={s.scoreBreak}>
              <ScoreBar label="Service Quality" value={trustSummary.score_breakdown?.service_quality ?? 0} color={PROFILE_GREEN} />
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
        <Section title="Safety & protection">
          <TouchableOpacity style={s.sosButton} onPress={() => router.push('/driver/safety-alerts')} activeOpacity={0.85}>
            <LinearGradient colors={['#7f1d1d', '#991b1b', '#b91c1c']} style={s.sosInner}>
              <Ionicons name="warning" size={20} color="#FFF" />
              <Text style={s.sosText}>Open Safety Center</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </TouchableOpacity>
          <MenuRow icon="shield-checkmark" gradColors={['#78350F', '#D97706']} title="Safety Alerts" subtitle="Danger zones & emergency protection" onPress={() => router.push('/driver/safety-alerts')} />
          <MenuRow icon="ribbon" gradColors={['#134E4A', '#0D9488']} title="NEXRYDE Shield" subtitle="Disputes and ride protection" onPress={() => router.push('/shield-disputes')} />
        </Section>

        {/* ── MODE ── */}
        <Section title="Mode & preferences">
          <MenuRow icon="settings" gradColors={['#166534', PROFILE_GREEN]} title="Settings" subtitle="App preferences & defaults" onPress={() => router.push('/settings')} />
          <MenuRow icon="swap-horizontal" gradColors={['#3730A3', '#4F46E5']} title="Switch to Rider Mode" subtitle="Book rides as a passenger" onPress={() => setShowSwitchModal(true)} />
          <MenuRow icon="business" gradColors={['#0F4C75', '#0C7BB3']} title="NEXRYDE Wallet as Bank" subtitle="Coming soon — interest, transfers & more" onPress={() => {}} badge="Soon" />
        </Section>

        {/* ── SUPPORT & LEGAL ── */}
        <Section title="Support & legal">
          <MenuRow icon="help-circle" gradColors={['#7C2D12', '#EA580C']} title="Help & Support" onPress={() => router.push('/support')} />
          <MenuRow icon="document-text" gradColors={['#4C1D95', '#7C3AED']} title="Privacy Policy" onPress={() => router.push('/privacy-policy')} />
          <MenuRow icon="reader" gradColors={['#0C4A6E', BRAND.info]} title="Terms of Service" onPress={() => router.push('/terms-of-service')} />
        </Section>

        {/* ── ACCOUNT ── */}
        <Section title="Account">
          <MenuRow icon="trash" gradColors={['#7f1d1d', '#991b1b']} title="Delete Account" subtitle="Permanently deactivate driver account" onPress={handleDelete} danger />
        </Section>

        <TouchableOpacity
          activeOpacity={1}
          delayLongPress={800}
          onLongPress={() => {
            const r = sentryTestCrash('driver');
            Alert.alert(r.sent ? 'Sentry test sent' : 'Sentry not active', r.message);
          }}
        >
          <Text style={[s.version, { color: colors.textMuted }]}>
            NEXRYDE Driver v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LinearGradient colors={['rgba(239,68,68,0.12)', 'rgba(239,68,68,0.05)']} style={s.logoutInner}>
            <Ionicons name="log-out-outline" size={20} color={BRAND.danger} />
            <Text style={s.logoutText}>Log Out</Text>
          </LinearGradient>
        </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── SWITCH TO RIDER MODAL ── */}
      <Modal visible={showSwitchModal} animationType="slide" transparent onRequestClose={() => setShowSwitchModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowSwitchModal(false)}>
              <Ionicons name="close" size={22} color={BRAND.textMuted} />
            </TouchableOpacity>
            <LinearGradient colors={['rgba(56,189,248,0.15)', 'transparent']} style={s.modalIconWrap}>
              <Ionicons name="person" size={36} color={BRAND.info} />
            </LinearGradient>
            <Text style={s.modalTitle}>Switch to Rider?</Text>
            <Text style={s.modalSubtitle}>
              Book rides as a passenger. Your driver account, earnings, and subscription stay active — switch back anytime.
            </Text>
            <View style={s.modalNote}>
              <Ionicons name="information-circle-outline" size={18} color={BRAND.info} />
              <Text style={s.modalNoteText}>Subscription and earnings remain unchanged.</Text>
            </View>
            <TouchableOpacity style={s.modalConfirmBtn} onPress={confirmRiderSwitch}>
              <LinearGradient colors={['#0369A1', BRAND.info]} style={s.modalConfirmGrad}>
                <Text style={s.modalConfirmText}>Switch to Rider</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowSwitchModal(false)}>
              <Text style={s.modalCancelText}>Stay as Driver</Text>
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
  heroSettings: {
    position: 'absolute',
    top: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
  },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlinePillText: { fontSize: 11, fontWeight: '700' },
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
  avatarInitial: {
    fontSize: 36,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -1,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND.info,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BRAND.bgDeep,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heroName: {
    fontSize: 26,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -0.55,
  },
  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PROFILE_GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${PROFILE_GREEN}55`,
  },
  heroSub: {
    fontSize: 13,
    color: BRAND.textSecondary,
    marginBottom: SPACING.md,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: SPACING.lg,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PROFILE_GREEN_SOFT,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${PROFILE_GREEN}44`,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: PROFILE_GREEN,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  subBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,158,11,0.28)',
  },
  subBadgeText: { fontSize: 11, fontWeight: '800', color: BRAND.warning },
  statsGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.tile,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SURFACE.hairline,
  },
  statChip: { flex: 1, alignItems: 'center', paddingHorizontal: 4, minWidth: 0 },
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
  },

  /* Vehicle / sub cards */
  vehicleSection: { paddingTop: SPACING.md },
  vehicleCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56,189,248,0.22)',
  },
  vehicleGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  vehicleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.stack },
  vehicleIconWrap: {},
  vehicleIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: { flex: 1 },
  vehicleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  vehicleOnlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PROFILE_GREEN },
  vehicleName: { fontSize: 14, fontWeight: '800', color: BRAND.textPrimary },
  vehicleDetail: { fontSize: 12, color: BRAND.textMuted, marginBottom: 6 },
  platePill: {
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56,189,248,0.3)',
    alignSelf: 'flex-start',
  },
  platePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: BRAND.info,
    letterSpacing: 0.8,
  },
  vehicleEmpty: { fontSize: 12, color: BRAND.textMuted, fontStyle: 'italic' },
  vehicleRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vehicleCountBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BRAND.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCountText: { fontSize: 11, fontWeight: '900', color: '#FFF' },

  subCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    marginTop: SPACING.stack,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245,158,11,0.22)',
  },
  subGrad: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.stack },
  subIconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subInfo: { flex: 1 },
  subTitle: { fontSize: 14, fontWeight: '800', color: BRAND.textPrimary },
  subSub: { fontSize: 12, color: BRAND.textMuted, marginTop: 2, fontWeight: '500' },

  /* Grid */
  gridSection: { paddingTop: SPACING.lg, paddingBottom: SPACING.xs },
  gridTitle: { ...TYPOGRAPHY.label, marginBottom: SPACING.md, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.stack },
  actionTile: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    gap: 10,
    minHeight: 96,
  },
  actionTileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  actionTileIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  actionTileBadgeText: { fontSize: 9, fontWeight: '800', color: BRAND.warning },
  actionTileLabel: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },

  /* Section */
  section: { paddingTop: SPACING.lg },
  sectionTitle: { ...TYPOGRAPHY.label, marginBottom: SPACING.sm, textTransform: 'uppercase' },
  sectionCard: {
    borderRadius: RADIUS.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: SPACING.md },
  loadingText: { fontSize: 13, fontWeight: '600' },

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
  safetyScoreLabel: {
    fontSize: 11,
    color: PROFILE_GREEN,
    fontWeight: '700',
    marginTop: 4,
  },
  scoreHeroRight: { alignItems: 'flex-end', gap: 7 },
  scoreTierPill: {
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${PROFILE_GREEN}44`,
    paddingHorizontal: 11,
    paddingVertical: 5,
    backgroundColor: PROFILE_GREEN_SOFT,
  },
  scoreTierText: { fontSize: 11, fontWeight: '800', color: PROFILE_GREEN },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  scoreChipText: { fontSize: 11, fontWeight: '700', color: BRAND.warning },
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

  sosButton: {
    margin: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  sosInner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md },
  sosText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#FFF' },

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
    marginBottom: SPACING.md,
    paddingHorizontal: 8,
  },
  modalNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(56,189,248,0.08)',
    borderRadius: RADIUS.md,
    padding: SPACING.stack,
    marginBottom: SPACING.lg,
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(56,189,248,0.22)',
  },
  modalNoteText: { flex: 1, fontSize: 12, color: BRAND.info, lineHeight: 18 },
  modalConfirmBtn: { width: '100%', borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: 10 },
  modalConfirmGrad: { padding: SPACING.md, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  modalCancelBtn: { padding: 12 },
  modalCancelText: { fontSize: 14, color: BRAND.textMuted, fontWeight: '600' },
});
