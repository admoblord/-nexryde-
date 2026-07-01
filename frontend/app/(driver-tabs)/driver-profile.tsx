import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/src/store/appStore';
import {
  deleteUserAccount,
  getDriverProfile,
  getUserTrustSummary,
  updateUser,
  BACKEND_URL,
  getAuthHeaders,
} from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { DRIVER_TRIPS_TAB_HREF } from '@/src/constants/driverNavigation';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { sentryTestCrash } from '@/src/utils/sentry';

const { width: W } = Dimensions.get('window');
const TILE_W = (W - 48 - 12) / 2;

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
      <Text style={[s.statValue, { color }]}>{value}</Text>
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
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  gradColors: [string, string];
  badge?: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  };
  return (
    <Animated.View style={{ transform: [{ scale }], width: TILE_W }}>
      <TouchableOpacity style={s.actionTile} onPress={press} activeOpacity={1}>
        <View style={s.actionTileTop}>
          <LinearGradient colors={gradColors} style={s.actionTileIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Ionicons name={icon} size={20} color="#FFF" />
          </LinearGradient>
          {badge ? <View style={s.actionTileBadge}><Text style={s.actionTileBadgeText}>{badge}</Text></View> : null}
        </View>
        <Text style={s.actionTileLabel}>{label}</Text>
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
  return (
    <TouchableOpacity style={s.menuRow} onPress={onPress} activeOpacity={0.75}>
      <LinearGradient
        colors={danger ? ['#7f1d1d', '#991b1b'] : gradColors}
        style={s.menuIconWrap}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name={icon} size={17} color="#FFF" />
      </LinearGradient>
      <View style={s.menuRowBody}>
        <Text style={[s.menuTitle, danger && { color: '#F87171' }]}>{title}</Text>
        {subtitle ? <Text style={s.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={s.menuBadge}><Text style={s.menuBadgeText}>{badge}</Text></View>
      ) : (
        <Ionicons name="chevron-forward" size={15} color="#334155" />
      )}
    </TouchableOpacity>
  );
}

/* ─── Section ────────────────────────────────────────────────── */
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      <View style={s.sectionCard}>{children}</View>
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
export default function DriverProfileScreen() {
  const toast = useErrorToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBottomPad(16);
  const { user, logout, setUser, subscription } = useAppStore();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();

  const [profileImage, setProfileImage] = useState<string | null>(user?.profile_image || null);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [driverCity, setDriverCity] = useState('');
  const [driverFullName, setDriverFullName] = useState('');
  const [driverVehicles, setDriverVehicles] = useState<DriverVehicle[]>([]);
  const [isApproved, setIsApproved] = useState(false);
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
        setIsApproved(p?.verification_status === 'approved');
      }
      if (vehiclesRes.status === 'fulfilled') {
        setDriverVehicles(((vehiclesRes.value as any)?.vehicles || []) as DriverVehicle[]);
      }
    } catch { /* non-critical */ }
  }, [canCallAuthedApi, driverId]);

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

  // Subscription
  const subStatus = (subscription as any)?.status as string | undefined;
  const subTier = (subscription as any)?.tier as string | undefined;
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
      <SafeAreaView style={s.root} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#060C14" />
        <TabBrandStrip role="driver" />
        <ProfileScreenSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#060C14" />
      <TabBrandStrip role="driver" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: tabPad + 24 }]}>

        {/* ── HERO ── */}
        <LinearGradient colors={['#040C14', '#0A1628', '#061020']} style={s.hero}>
          <TouchableOpacity style={s.heroSettings} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          {/* Online indicator */}
          <View style={[s.onlinePill, { backgroundColor: user?.is_online ? 'rgba(0,212,106,0.12)' : 'rgba(71,85,105,0.2)' }]}>
            <View style={[s.onlineDot, { backgroundColor: user?.is_online ? '#00D46A' : '#475569' }]} />
            <Text style={[s.onlinePillText, { color: user?.is_online ? '#00D46A' : '#64748B' }]}>
              {user?.is_online ? 'Online' : 'Offline'}
            </Text>
          </View>

          <Animated.View style={[s.avatarWrap, { transform: [{ scale: avatarScale }] }]}>
            <LinearGradient colors={isApproved ? ['#00D46A', '#0EA5E9'] : ['#F59E0B', '#EF4444']} style={s.avatarRing} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <TouchableOpacity style={s.avatarInner} onPress={pickImage} activeOpacity={0.85}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={s.avatarImg} />
                ) : (
                  <LinearGradient colors={['#0C2340', '#0A1628']} style={s.avatarFallback}>
                    <Text style={s.avatarInitial}>{initial}</Text>
                  </LinearGradient>
                )}
                <View style={s.avatarEditBadge}>
                  <Ionicons name="camera" size={11} color="#FFF" />
                </View>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          <Animated.View style={{ alignItems: 'center', opacity: fadeIn }}>
            <View style={s.nameRow}>
              <Text style={s.heroName}>{displayName}</Text>
              {isApproved ? (
                <View style={s.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={13} color="#00D46A" />
                </View>
              ) : null}
            </View>
            <Text style={s.heroSub}>{driverCity ? `${driverCity} · ` : ''}{user?.phone || user?.email || 'NEXRYDE Driver'}</Text>

            {/* Role + status badges */}
            <View style={s.badgeRow}>
              <View style={s.roleBadge}>
                <Ionicons name="car-sport" size={11} color="#00D46A" />
                <Text style={s.roleBadgeText}>Driver</Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: isApproved ? 'rgba(0,212,106,0.08)' : 'rgba(245,158,11,0.08)', borderColor: isApproved ? 'rgba(0,212,106,0.2)' : 'rgba(245,158,11,0.2)' }]}>
                <Text style={[s.statusBadgeText, { color: isApproved ? '#00D46A' : '#F59E0B' }]}>
                  {isApproved ? 'Verified' : 'Pending'}
                </Text>
              </View>
              {isActiveSub ? (
                <View style={s.subBadge}>
                  <Ionicons name="star" size={10} color="#FBBF24" />
                  <Text style={s.subBadgeText}>{subLabel}</Text>
                </View>
              ) : null}
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              <StatChip value={String(trips)} label="Trips" color="#00D46A" />
              <View style={s.statsDivider} />
              <StatChip value={`${rating}★`} label="Rating" color="#FBBF24" />
              <View style={s.statsDivider} />
              <StatChip value={String(memberYear)} label="Since" color="#60A5FA" />
            </View>
          </Animated.View>
        </LinearGradient>

        {/* ── VEHICLE CARD ── */}
        <View style={s.vehicleSection}>
          <TouchableOpacity style={s.vehicleCard} onPress={() => router.push('/driver/vehicle')} activeOpacity={0.85}>
            <LinearGradient colors={['rgba(14,165,233,0.08)', 'rgba(14,165,233,0.03)']} style={s.vehicleGrad}>
              <View style={s.vehicleLeft}>
                <View style={s.vehicleIconWrap}>
                  <LinearGradient colors={['#0C4A6E', '#0EA5E9']} style={s.vehicleIcon}>
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
                <Ionicons name="chevron-forward" size={16} color="#334155" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── SUBSCRIPTION STATUS CARD ── */}
        {(() => {
          const isOnTrial   = subStatus === 'trial' || (subscription as any)?.trial_active;
          const trialDone   = Number((subscription as any)?.trial_trips_completed ?? (subscription as any)?.completed_trips ?? 0);
          const trialTarget = Number((subscription as any)?.trial_trips_target ?? (subscription as any)?.trips_target ?? 20);
          const trialLeft   = Math.max(0, trialTarget - trialDone);
          const trialPct    = trialTarget > 0 ? Math.min(1, trialDone / trialTarget) : 0;
          return (
            <View style={[s.vehicleSection, { marginTop: 0 }]}>
              <TouchableOpacity style={s.subCard} onPress={() => router.push('/driver/subscription')} activeOpacity={0.85}>
                <LinearGradient
                  colors={isActiveSub ? ['rgba(251,191,36,0.08)', 'rgba(251,191,36,0.03)'] : ['rgba(100,116,139,0.06)', 'rgba(100,116,139,0.02)']}
                  style={s.subGrad}
                >
                  <View style={[s.subIconWrap, { backgroundColor: isActiveSub ? 'rgba(251,191,36,0.12)' : 'rgba(71,85,105,0.12)' }]}>
                    <Ionicons name={isActiveSub ? 'star' : 'star-outline'} size={20} color={isActiveSub ? '#FBBF24' : '#475569'} />
                  </View>
                  <View style={s.subInfo}>
                    <Text style={s.subTitle}>{isActiveSub ? subLabel + ' · Active' : 'No Active Plan'}</Text>
                    {isOnTrial ? (
                      <View style={{ gap: 4 }}>
                        <Text style={[s.subSub, { color: '#FBBF24' }]}>
                          Trial: {trialDone}/{trialTarget} trips · {trialLeft > 0 ? `${trialLeft} left` : 'Complete!'}
                        </Text>
                        {/* Trial progress bar */}
                        <View style={{ height: 3, backgroundColor: 'rgba(251,191,36,0.2)', borderRadius: 2 }}>
                          <View style={{
                            height: 3,
                            width: `${Math.round(trialPct * 100)}%` as any,
                            backgroundColor: '#FBBF24',
                            borderRadius: 2,
                          }} />
                        </View>
                      </View>
                    ) : (
                      <Text style={s.subSub}>{isActiveSub ? 'Tap to manage or upgrade plan' : 'Activate your driver plan'}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#334155" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── QUICK ACTIONS GRID ── */}
        <View style={s.gridSection}>
          <Text style={s.gridTitle}>QUICK ACCESS</Text>
          <View style={s.grid}>
            <ActionTile icon="create" label="Edit Profile" gradColors={['#1D4ED8', '#2563EB']} onPress={() => router.push('/edit-profile')} />
            <ActionTile icon="list" label="Trip History" gradColors={['#5B21B6', '#7C3AED']} onPress={() => router.push(DRIVER_TRIPS_TAB_HREF as any)} />
            <ActionTile icon="car-sport" label="My Vehicle" gradColors={['#065F46', '#059669']} onPress={() => router.push('/driver/vehicle')} />
            <ActionTile icon="document-text" label="Documents" gradColors={['#7C2D12', '#EA580C']} onPress={() => router.push('/driver/documents')} />
            <ActionTile icon="arrow-up-circle" label="Withdraw" gradColors={['#14532D', '#16A34A']} onPress={() => router.push('/driver/withdrawal')} />
            <ActionTile icon="analytics" label="Performance" gradColors={['#0C4A6E', '#0EA5E9']} onPress={() => router.push('/driver/performance')} />
          </View>
        </View>

        {/* ── TRUST SCORE ── */}
        {loadingTrust ? (
          <Section title="NEXRYDE SCORE">
            <View style={s.loadingRow}>
              <Ionicons name="reload" size={16} color="#64748B" />
              <Text style={s.loadingText}>Loading your score…</Text>
            </View>
          </Section>
        ) : trustSummary ? (
          <Section title="NEXRYDE SCORE">
            <LinearGradient colors={['rgba(0,212,106,0.07)', 'rgba(14,165,233,0.03)']} style={s.scoreHero}>
              <View style={s.scoreHeroLeft}>
                <Text style={s.scoreMainValue}>{Math.round(trustSummary.nexryde_score)}</Text>
                <Text style={s.scoreMainLabel}>Nexryde Score</Text>
                {trustSummary.driver_safety_score != null ? (
                  <Text style={s.safetyScoreLabel}>Safety: {Math.round(trustSummary.driver_safety_score)}</Text>
                ) : null}
              </View>
              <View style={s.scoreHeroRight}>
                <View style={s.scoreTierPill}>
                  <Text style={s.scoreTierText}>{trustSummary.score_tier?.label ?? '—'}</Text>
                </View>
                {trustSummary.priority_matching_enabled ? (
                  <View style={s.scoreChip}>
                    <Ionicons name="flash" size={11} color="#FBBF24" />
                    <Text style={s.scoreChipText}>Priority</Text>
                  </View>
                ) : null}
                {trustSummary.lower_fee_eligible ? (
                  <View style={[s.scoreChip, { backgroundColor: 'rgba(0,212,106,0.1)' }]}>
                    <Ionicons name="trending-down" size={11} color="#00D46A" />
                    <Text style={[s.scoreChipText, { color: '#00D46A' }]}>Low Fee</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>

            <View style={s.scoreBreak}>
              <ScoreBar label="Service Quality" value={trustSummary.score_breakdown?.service_quality ?? 0} color="#00D46A" />
              <ScoreBar label="Punctuality" value={trustSummary.score_breakdown?.punctuality ?? 0} color="#0EA5E9" />
              <ScoreBar label="Verification" value={trustSummary.score_breakdown?.verification ?? 0} color="#8B5CF6" />
              <ScoreBar label="Payments" value={trustSummary.score_breakdown?.payment_behavior ?? 0} color="#F59E0B" />
            </View>

            <View style={s.verifRow}>
              {[
                { label: 'Account', ok: trustSummary.verification_status?.account_verified },
                { label: 'Face', ok: trustSummary.verification_status?.face_verified },
                { label: 'NIN', ok: trustSummary.verification_status?.nin_verified },
              ].map(({ label, ok }) => (
                <View key={label} style={[s.verifChip, { borderColor: ok ? '#00D46A44' : '#334155' }]}>
                  <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={13} color={ok ? '#00D46A' : '#475569'} />
                  <Text style={[s.verifChipText, { color: ok ? '#00D46A' : '#475569' }]}>{label}</Text>
                </View>
              ))}
            </View>

            {trustSummary.unlocked_perks?.length > 0 ? (
              <View style={s.perksWrap}>
                <Text style={s.perksHeader}>Unlocked perks</Text>
                {trustSummary.unlocked_perks.map((p: string) => (
                  <View key={p} style={s.perkRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#00D46A" />
                    <Text style={s.perkText}>{p}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* ── SAFETY ── */}
        <Section title="SAFETY & PROTECTION">
          <TouchableOpacity style={s.sosButton} onPress={() => router.push('/driver/safety-alerts')} activeOpacity={0.85}>
            <LinearGradient colors={['#7f1d1d', '#991b1b', '#b91c1c']} style={s.sosInner}>
              <Ionicons name="warning" size={20} color="#FFF" />
              <Text style={s.sosText}>Open Safety Center</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </TouchableOpacity>
          <MenuRow icon="shield-checkmark" gradColors={['#78350F', '#D97706']} title="Safety Alerts" subtitle="Danger zones & emergency protection" onPress={() => router.push('/driver/safety-alerts')} />
          <MenuRow icon="ribbon" gradColors={['#134E4A', '#0D9488']} title="Nexryde Shield" subtitle="Disputes and ride protection" onPress={() => router.push('/shield-disputes')} />
        </Section>

        {/* ── MODE ── */}
        <Section title="MODE & PREFERENCES">
          <MenuRow icon="settings" gradColors={['#166534', '#00D46A']} title="Settings" subtitle="App preferences & defaults" onPress={() => router.push('/settings')} />
          <MenuRow icon="swap-horizontal" gradColors={['#3730A3', '#4F46E5']} title="Switch to Rider Mode" subtitle="Book rides as a passenger" onPress={() => setShowSwitchModal(true)} />
          <MenuRow icon="business" gradColors={['#0F4C75', '#0C7BB3']} title="Nexryde Wallet as Bank" subtitle="Coming soon — interest, transfers & more" onPress={() => {}} badge="Soon" />
        </Section>

        {/* ── SUPPORT & LEGAL ── */}
        <Section title="SUPPORT & LEGAL">
          <MenuRow icon="help-circle" gradColors={['#7C2D12', '#EA580C']} title="Help & Support" onPress={() => router.push('/support')} />
          <MenuRow icon="document-text" gradColors={['#4C1D95', '#7C3AED']} title="Privacy Policy" onPress={() => router.push('/privacy-policy')} />
          <MenuRow icon="reader" gradColors={['#0C4A6E', '#0EA5E9']} title="Terms of Service" onPress={() => router.push('/terms-of-service')} />
        </Section>

        {/* ── ACCOUNT ── */}
        <Section title="ACCOUNT">
          <MenuRow icon="trash" gradColors={['#7f1d1d', '#991b1b']} title="Delete Account" subtitle="Permanently deactivate driver account" onPress={handleDelete} danger />
        </Section>

        {/* ── VERSION & LOGOUT ── (long-press fires a deliberate Sentry test event) */}
        <TouchableOpacity
          activeOpacity={1}
          delayLongPress={800}
          onLongPress={() => {
            const r = sentryTestCrash('driver');
            Alert.alert(r.sent ? 'Sentry test sent' : 'Sentry not active', r.message);
          }}
        >
          <Text style={s.version}>NEXRYDE Driver v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LinearGradient colors={['rgba(239,68,68,0.1)', 'rgba(239,68,68,0.05)']} style={s.logoutInner}>
            <Ionicons name="log-out-outline" size={20} color="#F87171" />
            <Text style={s.logoutText}>Log Out</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* ── SWITCH TO RIDER MODAL ── */}
      <Modal visible={showSwitchModal} animationType="slide" transparent onRequestClose={() => setShowSwitchModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowSwitchModal(false)}>
              <Ionicons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
            <LinearGradient colors={['rgba(14,165,233,0.15)', 'transparent']} style={s.modalIconWrap}>
              <Ionicons name="person" size={36} color="#38BDF8" />
            </LinearGradient>
            <Text style={s.modalTitle}>Switch to Rider?</Text>
            <Text style={s.modalSubtitle}>
              Book rides as a passenger. Your driver account, earnings, and subscription stay active — switch back anytime.
            </Text>
            <View style={s.modalNote}>
              <Ionicons name="information-circle-outline" size={18} color="#38BDF8" />
              <Text style={s.modalNoteText}>Subscription and earnings remain unchanged.</Text>
            </View>
            <TouchableOpacity style={s.modalConfirmBtn} onPress={confirmRiderSwitch}>
              <LinearGradient colors={['#0369A1', '#0EA5E9']} style={s.modalConfirmGrad}>
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
  root: { flex: 1, backgroundColor: '#060C14' },
  scroll: { paddingHorizontal: 0 },

  /* Hero */
  hero: {
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  heroSettings: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 16,
  },
  onlineDot: { width: 7, height: 7, borderRadius: 4 },
  onlinePillText: { fontSize: 11, fontWeight: '700' },
  avatarWrap: { marginBottom: 16 },
  avatarRing: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', padding: 3 },
  avatarInner: { width: 94, height: 94, borderRadius: 47, overflow: 'hidden', position: 'relative' },
  avatarImg: { width: 94, height: 94, borderRadius: 47 },
  avatarFallback: { width: 94, height: 94, borderRadius: 47, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 34, fontWeight: '900', color: '#FFF', letterSpacing: -1 },
  avatarEditBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#060C14',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heroName: { fontSize: 24, fontWeight: '900', color: '#F1F5F9', letterSpacing: -0.5 },
  verifiedBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,212,106,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(0,212,106,0.3)',
  },
  heroSub: { fontSize: 12, color: '#475569', marginBottom: 12 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 18, flexWrap: 'wrap', justifyContent: 'center' },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,212,106,0.08)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(0,212,106,0.2)',
  },
  roleBadgeText: { fontSize: 11, fontWeight: '800', color: '#00D46A' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  subBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
  },
  subBadgeText: { fontSize: 11, fontWeight: '800', color: '#FBBF24' },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statChip: { alignItems: 'center', paddingHorizontal: 20 },
  statValue: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  statLabel: { fontSize: 11, color: '#475569', fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statsDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.06)' },

  /* Vehicle card */
  vehicleSection: { paddingHorizontal: 20, paddingTop: 20 },
  vehicleCard: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(14,165,233,0.15)' },
  vehicleGrad: { flexDirection: 'row', alignItems: 'center', padding: 14, justifyContent: 'space-between' },
  vehicleLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  vehicleIconWrap: {},
  vehicleIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  vehicleInfo: { flex: 1 },
  vehicleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  vehicleOnlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00D46A' },
  vehicleName: { fontSize: 13, fontWeight: '800', color: '#E2E8F0' },
  vehicleDetail: { fontSize: 11, color: '#475569', marginBottom: 6 },
  platePill: {
    backgroundColor: 'rgba(14,165,233,0.1)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(14,165,233,0.25)', alignSelf: 'flex-start',
  },
  platePillText: { fontSize: 11, fontWeight: '800', color: '#38BDF8', letterSpacing: 0.8 },
  vehicleEmpty: { fontSize: 12, color: '#475569', fontStyle: 'italic' },
  vehicleRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vehicleCountBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' },
  vehicleCountText: { fontSize: 11, fontWeight: '900', color: '#FFF' },

  /* Subscription card */
  subCard: { borderRadius: 18, overflow: 'hidden', marginTop: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.12)' },
  subGrad: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  subIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  subInfo: { flex: 1 },
  subTitle: { fontSize: 13, fontWeight: '800', color: '#E2E8F0' },
  subSub: { fontSize: 11, color: '#475569', marginTop: 2 },

  /* Grid */
  gridSection: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 4 },
  gridTitle: { fontSize: 11, fontWeight: '800', color: '#334155', letterSpacing: 1.5, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionTile: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 15, gap: 10,
  },
  actionTileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  actionTileIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actionTileBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  actionTileBadgeText: { fontSize: 9, fontWeight: '800', color: '#F59E0B' },
  actionTileLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },

  /* Section */
  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#334155', letterSpacing: 1.5, marginBottom: 10 },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden',
  },

  /* Loading */
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  loadingText: { fontSize: 13, color: '#475569' },

  /* Score */
  scoreHero: {
    flexDirection: 'row', alignItems: 'center', padding: 18,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  scoreHeroLeft: { flex: 1 },
  scoreMainValue: { fontSize: 40, fontWeight: '900', color: '#F1F5F9', letterSpacing: -1 },
  scoreMainLabel: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 },
  safetyScoreLabel: { fontSize: 11, color: '#00D46A', fontWeight: '700', marginTop: 4 },
  scoreHeroRight: { alignItems: 'flex-end', gap: 7 },
  scoreTierPill: {
    borderRadius: 20, borderWidth: 1, borderColor: '#00D46A44',
    paddingHorizontal: 11, paddingVertical: 5, backgroundColor: 'rgba(0,212,106,0.06)',
  },
  scoreTierText: { fontSize: 11, fontWeight: '800', color: '#00D46A' },
  scoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  scoreChipText: { fontSize: 11, fontWeight: '700', color: '#FBBF24' },
  scoreBreak: { padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  scoreBarWrap: { gap: 5 },
  scoreBarRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreBarLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  scoreBarValue: { fontSize: 11, fontWeight: '800' },
  scoreBarTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  verifRow: { flexDirection: 'row', gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  verifChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  verifChipText: { fontSize: 11, fontWeight: '700' },
  perksWrap: { padding: 14, gap: 8 },
  perksHeader: { fontSize: 11, fontWeight: '800', color: '#475569', marginBottom: 2 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  perkText: { fontSize: 12, color: '#94A3B8', flex: 1 },

  /* SOS */
  sosButton: { margin: 14, marginBottom: 8, borderRadius: 14, overflow: 'hidden' },
  sosInner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  sosText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#FFF' },

  /* Menu rows */
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)', gap: 12,
  },
  menuIconWrap: { width: 35, height: 35, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuRowBody: { flex: 1 },
  menuTitle: { fontSize: 13, fontWeight: '700', color: '#E2E8F0' },
  menuSubtitle: { fontSize: 11, color: '#475569', marginTop: 1 },
  menuBadge: { backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  menuBadgeText: { fontSize: 11, fontWeight: '800', color: '#F59E0B' },

  /* Version & logout */
  version: { textAlign: 'center', fontSize: 11, color: '#1A2332', marginTop: 28, marginBottom: 12, fontWeight: '600', letterSpacing: 1 },
  logoutBtn: { marginHorizontal: 20, borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  logoutInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.12)', borderRadius: 16 },
  logoutText: { fontSize: 14, fontWeight: '800', color: '#F87171' },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0A1220', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 12, borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.07)', alignItems: 'center',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#1E293B', marginBottom: 20 },
  modalCloseBtn: { position: 'absolute', top: 14, right: 16, padding: 6 },
  modalIconWrap: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#F1F5F9', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 16, paddingHorizontal: 8 },
  modalNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(14,165,233,0.07)', borderRadius: 12, padding: 12,
    marginBottom: 20, width: '100%', borderWidth: 1, borderColor: 'rgba(14,165,233,0.15)',
  },
  modalNoteText: { flex: 1, fontSize: 12, color: '#38BDF8', lineHeight: 18 },
  modalConfirmBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  modalConfirmGrad: { padding: 16, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  modalCancelBtn: { padding: 12 },
  modalCancelText: { fontSize: 14, color: '#475569', fontWeight: '600' },
});
