import React, { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
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
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/src/store/appStore';
import { deleteUserAccount, getUserTrustSummary, updateUser } from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';

const { width: W } = Dimensions.get('window');
const TILE_W = (W - 48 - 12) / 2;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─── Stat chip ─────────────────────────────────────────────── */
function StatChip({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={s.statChip}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

/* ─── Quick action tile (2-col grid) ────────────────────────── */
function ActionTile({
  icon,
  label,
  gradColors,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  gradColors: [string, string];
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
        <LinearGradient colors={gradColors} style={s.actionTileIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Ionicons name={icon} size={22} color="#FFF" />
        </LinearGradient>
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
      <LinearGradient colors={danger ? ['#7f1d1d', '#991b1b'] : gradColors} style={s.menuIconWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Ionicons name={icon} size={18} color="#FFF" />
      </LinearGradient>
      <View style={s.menuRowBody}>
        <Text style={[s.menuTitle, danger && { color: '#F87171' }]}>{title}</Text>
        {subtitle ? <Text style={s.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={s.menuBadge}><Text style={s.menuBadgeText}>{badge}</Text></View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#334155" />
      )}
    </TouchableOpacity>
  );
}

/* ─── Section wrapper ────────────────────────────────────────── */
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
   MAIN SCREEN
═══════════════════════════════════════════════════════════════ */
export default function RiderProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBottomPad(16);
  const { user, logout, setUser } = useAppStore();

  const [profileImage, setProfileImage] = useState<string | null>(user?.profile_image || null);
  const [showDriverModal, setShowDriverModal] = useState(false);
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

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user?.id) return;
      setLoadingTrust(true);
      try {
        const res = await getUserTrustSummary(user.id);
        if (mounted) setTrustSummary(res.data);
      } catch { /* non-critical */ }
      finally { if (mounted) setLoadingTrust(false); }
    };
    void load();
    return () => { mounted = false; };
  }, [user?.id]);

  const saveProfileImage = async (uri: string) => {
    setProfileImage(uri);
    if (user) {
      setUser({ ...user, profile_image: uri });
      try { await updateUser(user.id, { profile_image: uri }); } catch { /* silent */ }
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
          if (user?.id) await deleteUserAccount(user.id);
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
  const rating = (user?.rating ?? 5).toFixed(1);
  const trips = user?.total_trips ?? 0;
  const isVerified = Boolean(user?.is_verified);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#080E17" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: tabPad + 24 }]}
      >
        {/* ── HERO ── */}
        <LinearGradient colors={['#0A0F1A', '#111827', '#0A1628']} style={s.hero}>
          {/* Top right settings shortcut */}
          <TouchableOpacity style={s.heroSettings} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          <Animated.View style={[s.avatarWrap, { transform: [{ scale: avatarScale }] }]}>
            <LinearGradient colors={['#00D46A', '#0EA5E9', '#8B5CF6']} style={s.avatarRing} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <TouchableOpacity style={s.avatarInner} onPress={pickImage} activeOpacity={0.85}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={s.avatarImg} />
                ) : (
                  <LinearGradient colors={['#1E3A5F', '#0D2644']} style={s.avatarFallback}>
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
              {isVerified ? (
                <View style={s.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={13} color="#00D46A" />
                </View>
              ) : null}
            </View>
            <Text style={s.heroPhone}>{user?.phone || user?.email || 'NEXRYDE Rider'}</Text>

            {/* Role badge */}
            <View style={s.roleBadge}>
              <Ionicons name="bicycle" size={11} color="#60A5FA" />
              <Text style={s.roleBadgeText}>Rider Account</Text>
            </View>

            {/* Stats row */}
            <View style={s.statsRow}>
              <StatChip value={String(trips)} label="Trips" color="#00D46A" />
              <View style={s.statsDivider} />
              <StatChip value={`${rating}★`} label="Rating" color="#FBBF24" />
              <View style={s.statsDivider} />
              <StatChip value={String(memberYear)} label="Member" color="#60A5FA" />
            </View>
          </Animated.View>
        </LinearGradient>

        {/* ── QUICK ACTIONS GRID ── */}
        <View style={s.gridSection}>
          <Text style={s.gridTitle}>QUICK ACCESS</Text>
          <View style={s.grid}>
            <ActionTile icon="create" label="Edit Profile" gradColors={['#1D4ED8', '#2563EB']} onPress={() => router.push('/edit-profile')} />
            <ActionTile icon="time" label="Ride History" gradColors={['#5B21B6', '#7C3AED']} onPress={() => router.push('/(rider-tabs)/rider-trips' as any)} />
            <ActionTile icon="location" label="Saved Places" gradColors={['#065F46', '#059669']} onPress={() => router.push('/saved-places')} />
            <ActionTile icon="heart" label="Fav Drivers" gradColors={['#9D174D', '#EC4899']} onPress={() => router.push('/rider/favorite-drivers')} />
            <ActionTile icon="wallet" label="Wallet" gradColors={['#0369A1', '#0EA5E9']} onPress={() => router.push('/(rider-tabs)/rider-wallet' as any)} />
            <ActionTile icon="notifications" label="Alerts" gradColors={['#7C2D12', '#EA580C']} onPress={() => router.push('/(rider-tabs)/rider-notifications' as any)} />
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
            {/* Score hero */}
            <LinearGradient colors={['rgba(0,212,106,0.08)', 'rgba(14,165,233,0.04)']} style={s.scoreHero}>
              <View style={s.scoreHeroLeft}>
                <Text style={s.scoreMainValue}>{Math.round(trustSummary.nexryde_score)}</Text>
                <Text style={s.scoreMainLabel}>Nexryde Score</Text>
              </View>
              <View style={s.scoreHeroRight}>
                <View style={[s.scoreTierPill, { borderColor: '#00D46A44' }]}>
                  <Text style={s.scoreTierText}>{trustSummary.score_tier?.label ?? '—'}</Text>
                </View>
                {trustSummary.priority_matching_enabled ? (
                  <View style={s.scorePerksChip}>
                    <Ionicons name="flash" size={11} color="#FBBF24" />
                    <Text style={s.scorePerksChipText}>Priority Match</Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>

            {/* Score breakdown bars */}
            <View style={s.scoreBreak}>
              <ScoreBar label="Service" value={trustSummary.score_breakdown?.service_quality ?? 0} color="#00D46A" />
              <ScoreBar label="Punctuality" value={trustSummary.score_breakdown?.punctuality ?? 0} color="#0EA5E9" />
              <ScoreBar label="Verification" value={trustSummary.score_breakdown?.verification ?? 0} color="#8B5CF6" />
              <ScoreBar label="Payments" value={trustSummary.score_breakdown?.payment_behavior ?? 0} color="#F59E0B" />
            </View>

            {/* Verification badges */}
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

            {/* Perks */}
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
        <Section title="SAFETY">
          <TouchableOpacity style={s.sosButton} onPress={() => router.push('/(rider-tabs)/rider-safety' as any)} activeOpacity={0.85}>
            <LinearGradient colors={['#7f1d1d', '#991b1b', '#b91c1c']} style={s.sosInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="warning" size={20} color="#FFF" />
              <Text style={s.sosText}>Open SOS & Safety Center</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
            </LinearGradient>
          </TouchableOpacity>
          <MenuRow icon="shield-checkmark" gradColors={['#78350F', '#D97706']} title="Safety Center" subtitle="Emergency contacts & trip protection" onPress={() => router.push('/(rider-tabs)/rider-safety' as any)} />
          <MenuRow icon="ribbon" gradColors={['#134E4A', '#0D9488']} title="Nexryde Shield" subtitle="Disputes and ride protection" onPress={() => router.push('/shield-disputes')} />
        </Section>

        {/* ── ACCOUNT & PREFERENCES ── */}
        <Section title="PREFERENCES">
          <MenuRow icon="settings" gradColors={['#166534', '#00D46A']} title="Settings" subtitle="App preferences & defaults" onPress={() => router.push('/settings')} />
          <MenuRow icon="car-sport" gradColors={['#3730A3', '#4F46E5']} title="Switch to Driver Mode" subtitle="Drive and earn on NEXRYDE" onPress={() => setShowDriverModal(true)} />
        </Section>

        {/* ── SUPPORT & LEGAL ── */}
        <Section title="SUPPORT & LEGAL">
          <MenuRow icon="help-circle" gradColors={['#7C2D12', '#EA580C']} title="Help & Support" onPress={() => router.push('/support')} />
          <MenuRow icon="document-text" gradColors={['#4C1D95', '#7C3AED']} title="Privacy Policy" onPress={() => router.push('/privacy-policy')} />
          <MenuRow icon="reader" gradColors={['#0C4A6E', '#0EA5E9']} title="Terms of Service" onPress={() => router.push('/terms-of-service')} />
        </Section>

        {/* ── ACCOUNT ── */}
        <Section title="ACCOUNT">
          <MenuRow icon="trash" gradColors={['#7f1d1d', '#991b1b']} title="Delete Account" subtitle="Permanently deactivate this profile" onPress={handleDelete} danger />
        </Section>

        {/* ── VERSION ── */}
        <Text style={s.version}>NEXRYDE v{Constants.expoConfig?.version ?? '1.0.0'}</Text>

        {/* ── LOGOUT ── */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <LinearGradient colors={['rgba(239,68,68,0.12)', 'rgba(239,68,68,0.06)']} style={s.logoutInner}>
            <Ionicons name="log-out-outline" size={20} color="#F87171" />
            <Text style={s.logoutText}>Log Out</Text>
          </LinearGradient>
        </TouchableOpacity>
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
  root: { flex: 1, backgroundColor: '#080E17' },
  scroll: { paddingHorizontal: 0 },

  /* Hero */
  hero: {
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
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
  avatarWrap: { marginBottom: 16 },
  avatarRing: {
    width: 98,
    height: 98,
    borderRadius: 49,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  avatarInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImg: { width: 92, height: 92, borderRadius: 46 },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 34, fontWeight: '900', color: '#FFF', letterSpacing: -1 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#00D46A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#080E17',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  heroName: { fontSize: 24, fontWeight: '900', color: '#F1F5F9', letterSpacing: -0.5 },
  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,212,106,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,212,106,0.3)',
  },
  heroPhone: { fontSize: 13, color: '#64748B', marginBottom: 10 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(14,165,233,0.1)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.2)',
    marginBottom: 18,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700', color: '#60A5FA' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  statChip: { alignItems: 'center', paddingHorizontal: 20 },
  statValue: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  statLabel: { fontSize: 11, color: '#475569', fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statsDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.07)' },

  /* Grid */
  gridSection: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 4 },
  gridTitle: { fontSize: 11, fontWeight: '800', color: '#334155', letterSpacing: 1.5, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionTile: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 16,
    alignItems: 'flex-start',
    gap: 12,
  },
  actionTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileLabel: { fontSize: 12, fontWeight: '700', color: '#CBD5E1' },

  /* Section */
  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#334155', letterSpacing: 1.5, marginBottom: 10 },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  /* Loading */
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  loadingText: { fontSize: 13, color: '#475569' },

  /* Score */
  scoreHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  scoreHeroLeft: { flex: 1 },
  scoreMainValue: { fontSize: 40, fontWeight: '900', color: '#F1F5F9', letterSpacing: -1 },
  scoreMainLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 2 },
  scoreHeroRight: { alignItems: 'flex-end', gap: 8 },
  scoreTierPill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,212,106,0.06)',
  },
  scoreTierText: { fontSize: 11, fontWeight: '800', color: '#00D46A' },
  scorePerksChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scorePerksChipText: { fontSize: 11, fontWeight: '700', color: '#FBBF24' },
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

  /* Menu row */
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    gap: 12,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowBody: { flex: 1 },
  menuTitle: { fontSize: 13, fontWeight: '700', color: '#E2E8F0' },
  menuSubtitle: { fontSize: 11, color: '#475569', marginTop: 1 },
  menuBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  menuBadgeText: { fontSize: 11, fontWeight: '800', color: '#F59E0B' },

  /* Version & logout */
  version: { textAlign: 'center', fontSize: 11, color: '#1E293B', marginTop: 28, marginBottom: 12, fontWeight: '600', letterSpacing: 1 },
  logoutBtn: { marginHorizontal: 20, borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  logoutInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)', borderRadius: 16 },
  logoutText: { fontSize: 14, fontWeight: '800', color: '#F87171' },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#1E293B', marginBottom: 20 },
  modalCloseBtn: { position: 'absolute', top: 14, right: 16, padding: 6 },
  modalIconWrap: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#F1F5F9', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 10 },
  modalConfirmBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  modalConfirmGrad: { padding: 16, alignItems: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  modalCancelBtn: { padding: 12 },
  modalCancelText: { fontSize: 14, color: '#475569', fontWeight: '600' },
});
