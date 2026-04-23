import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  Modal,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS, useThemeColors } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { deleteUserAccount, getUserTrustSummary, updateUser } from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';
import { ProfileHeroCard } from '@/src/components/profile/ProfileHeroCard';
import { ProfileQuickActions } from '@/src/components/profile/ProfileQuickActions';
import { BiometricScanner, EmergencyButton, LoadingSpinner, UserCard } from '@/src/components/tier1';
import { profileTokens as t, typography } from '@/src/theme/tokens';
import { BlurView } from 'expo-blur';

type ThemePalette = ReturnType<typeof useThemeColors>['colors'];

function MenuRow({
  icon,
  iconBg,
  title,
  subtitle,
  onPress,
  isLast,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  isLast?: boolean;
  colors: ThemePalette;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuRow,
        !isLast && styles.rowDivider,
        { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={t.text.primary} />
      </View>
      <View style={styles.menuRowText}>
        <Text style={styles.menuTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.menuSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.text.tertiary} />
    </Pressable>
  );
}

export default function RiderProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, setUser } = useAppStore();
  const { colors } = useThemeColors();
  const [profileImage, setProfileImage] = useState(user?.profile_image || null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [trustSummary, setTrustSummary] = useState<null | {
    nexryde_score: number;
    rider_risk_score: number;
    driver_safety_score: number | null;
    score_tier: { key: string; label: string };
    score_breakdown: {
      service_quality: number;
      punctuality: number;
      verification: number;
      payment_behavior: number;
    };
    unlocked_perks: string[];
    priority_matching_enabled: boolean;
    lower_fee_eligible: boolean;
    premium_access_enabled: boolean;
    verification_status: { account_verified: boolean; face_verified: boolean; nin_verified: boolean };
  }>(null);
  const [loadingTrust, setLoadingTrust] = useState(false);
  const [showStickyTitle, setShowStickyTitle] = useState(false);

  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  useEffect(() => {
    let mounted = true;
    const loadTrust = async () => {
      if (!user?.id) return;
      setLoadingTrust(true);
      try {
        const res = await getUserTrustSummary(user.id);
        if (mounted) {
          LayoutAnimation.easeInEaseOut();
          setTrustSummary(res.data);
        }
      } catch {
        if (mounted) setTrustSummary(null);
      } finally {
        if (mounted) setLoadingTrust(false);
      }
    };
    void loadTrust();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          logout();
          router.dismissAll();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will deactivate your account and remove access to NEXRYDE. This action cannot be undone easily.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (user?.id) await deleteUserAccount(user.id);
              await logout();
              router.replace('/(auth)/login');
            } catch {
              Alert.alert('Error', 'Could not delete account right now.');
            }
          },
        },
      ]
    );
  };

  const saveProfileImage = async (uri: string) => {
    setProfileImage(uri);
    if (user) {
      setUser({ ...user, profile_image: uri });
      try {
        await updateUser(user.id, { profile_image: uri });
      } catch {
      }
    }
  };

  const handleProfilePictureUpload = async () => {
    Alert.alert('Update Profile Picture', 'Choose an option', [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please allow camera access to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            await saveProfileImage(result.assets[0].uri);
            Alert.alert('Success', 'Profile picture updated!');
          }
        },
      },
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please allow access to your photos.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            await saveProfileImage(result.assets[0].uri);
            Alert.alert('Success', 'Profile picture updated!');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmSwitchToDriver = () => {
    if (user) setUser({ ...user, role: 'driver' });
    setShowDriverModal(false);
    Alert.alert('Switched to Driver', 'Complete driver setup from the driver home when you are ready.', [
      { text: 'OK', onPress: () => router.replace('/(driver-tabs)/driver-home') },
    ]);
  };

  const initial = (user?.name && user.name.length > 0 ? user.name.charAt(0) : 'R').toUpperCase();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 120, paddingTop: 12 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={(e) => setShowStickyTitle(e.nativeEvent.contentOffset.y > 120)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeroCard
          user={user}
          profileImage={profileImage}
          fallbackInitial={initial}
          roleLabel="Rider"
          roleIcon="bicycle"
          roleTint="#2563EB"
          roleBg={COLORS.infoSoft}
          colors={colors}
          onAvatarPress={handleProfilePictureUpload}
        />

        <ProfileQuickActions
          title="Shortcuts"
          colors={colors}
          tileBorderColor={colors.border}
          actions={[
            {
              key: 'edit',
              label: 'Edit Profile',
              icon: 'create',
              iconColor: COLORS.white,
              iconBg: '#2563EB',
              onPress: () => router.push('/edit-profile'),
            },
            {
              key: 'history',
              label: 'Ride History',
              icon: 'time',
              iconColor: COLORS.white,
              iconBg: '#7C3AED',
              onPress: () => router.push('/(rider-tabs)/rider-trips' as any),
            },
            {
              key: 'saved',
              label: 'Saved Places',
              icon: 'location',
              iconColor: COLORS.white,
              iconBg: '#059669',
              onPress: () => router.push('/saved-places'),
            },
            {
              key: 'fav',
              label: 'Favorite Drivers',
              icon: 'heart',
              iconColor: COLORS.white,
              iconBg: '#EC4899',
              onPress: () => router.push('/rider/favorite-drivers'),
            },
          ]}
        />

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Preferences</Text>
          <MenuRow
            icon="settings-outline"
            iconBg={COLORS.accentGreen}
            title="Settings"
            subtitle="App preferences & defaults"
            onPress={() => router.push('/settings')}
            colors={colors}
          />
          <MenuRow
            icon="notifications-outline"
            iconBg="#6366F1"
            title="Notifications"
            subtitle="Trip updates and alerts"
            onPress={() => router.push('/(rider-tabs)/rider-notifications' as any)}
            isLast
            colors={colors}
          />
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Wallet</Text>
          <MenuRow
            icon="wallet-outline"
            iconBg="#0EA5E9"
            title="Wallet & payments"
            subtitle="Balance, top up and transactions"
            onPress={() => router.push('/(rider-tabs)/rider-wallet' as any)}
            isLast
            colors={colors}
          />
        </View>

        {loadingTrust ? (
          <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
            <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Trust & rewards</Text>
            <LoadingSpinner label="Loading trust summary…" />
          </View>
        ) : trustSummary ? (
          <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
            <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Trust & rewards</Text>
            <UserCard
              name={user?.name || 'Rider'}
              role="rider"
              image={profileImage}
              rating={user?.rating || 5}
              reviewCount={user?.total_trips || 0}
              nexrydeScore={trustSummary.nexryde_score}
              riderRiskScore={trustSummary.rider_risk_score}
              verificationLabel={
                trustSummary.verification_status.face_verified
                  ? 'Face verified'
                  : trustSummary.verification_status.account_verified
                    ? 'Account verified'
                    : 'Verification incomplete'
              }
            />
            <View
              style={[
                styles.scorePanel,
                {
                  backgroundColor: colors.background,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.scorePanelHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.scorePanelTitle, { color: colors.text }]}>Nexryde score</Text>
                  <Text style={[styles.scorePanelSubtitle, { color: colors.textMuted }]}>
                    {trustSummary.score_tier.label} tier unlocks transport perks.
                  </Text>
                </View>
                <View style={styles.scoreTierBadge}>
                  <Text style={styles.scoreTierBadgeText}>{trustSummary.score_tier.label}</Text>
                </View>
              </View>
              <View style={styles.scoreBreakdownGrid}>
                <View
                  style={[
                    styles.scoreMetricCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.scoreMetricLabel, { color: colors.textMuted }]}>Service</Text>
                  <Text style={[styles.scoreMetricValue, { color: colors.text }]}>
                    {Math.round(trustSummary.score_breakdown.service_quality)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.scoreMetricCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.scoreMetricLabel, { color: colors.textMuted }]}>Punctuality</Text>
                  <Text style={[styles.scoreMetricValue, { color: colors.text }]}>
                    {Math.round(trustSummary.score_breakdown.punctuality)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.scoreMetricCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.scoreMetricLabel, { color: colors.textMuted }]}>Verification</Text>
                  <Text style={[styles.scoreMetricValue, { color: colors.text }]}>
                    {Math.round(trustSummary.score_breakdown.verification)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.scoreMetricCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.scoreMetricLabel, { color: colors.textMuted }]}>Payments</Text>
                  <Text style={[styles.scoreMetricValue, { color: colors.text }]}>
                    {Math.round(trustSummary.score_breakdown.payment_behavior)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.scorePerksTitle, { color: colors.text }]}>Unlocked perks</Text>
              {trustSummary.unlocked_perks.map((perk) => (
                <View key={perk} style={styles.scorePerkRow}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.accentGreen} />
                  <Text style={[styles.scorePerkText, { color: colors.textMuted }]}>{perk}</Text>
                </View>
              ))}
            </View>
            <BiometricScanner
              title="Protect this account"
              subtitle="Use device biometrics before wallet access and sensitive actions."
            />
          </View>
        ) : null}

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Safety</Text>
          <EmergencyButton
            label="Open SOS Center"
            style={styles.emergencyBtn}
            onPress={() => router.push('/(rider-tabs)/rider-safety' as any)}
          />
          <MenuRow
            icon="shield-checkmark"
            iconBg="#F59E0B"
            title="Safety Center"
            subtitle="SOS, emergency contacts and trip protection"
            onPress={() => router.push('/(rider-tabs)/rider-safety' as any)}
            colors={colors}
          />
          <MenuRow
            icon="ribbon"
            iconBg="#0D9488"
            title="Nexryde Shield"
            subtitle="Disputes and ride protection"
            onPress={() => router.push('/shield-disputes')}
            isLast
            colors={colors}
          />
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Driving</Text>
          <MenuRow
            icon="car-sport"
            iconBg="#6366F1"
            title="Switch to driver mode"
            subtitle="Drive and earn on Nexryde"
            onPress={() => setShowDriverModal(true)}
            isLast
            colors={colors}
          />
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Support & legal</Text>
          <MenuRow
            icon="help-circle"
            iconBg="#F97316"
            title="Help & support"
            onPress={() => router.push('/support')}
            colors={colors}
          />
          <MenuRow
            icon="document-text"
            iconBg="#8B5CF6"
            title="Privacy policy"
            onPress={() => router.push('/privacy-policy')}
            colors={colors}
          />
          <MenuRow
            icon="reader"
            iconBg="#0EA5E9"
            title="Terms of service"
            onPress={() => router.push('/terms-of-service')}
            isLast
            colors={colors}
          />
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Account</Text>
          <TouchableOpacity
            style={[styles.menuRow, styles.deleteRow, { borderBottomWidth: 0 }]}
            onPress={handleDeleteAccount}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <View style={[styles.menuIcon, { backgroundColor: COLORS.error }]}>
              <Ionicons name="trash" size={20} color={COLORS.white} />
            </View>
            <View style={styles.menuRowText}>
              <Text style={[styles.menuTitle, { color: COLORS.error }]}>Delete account</Text>
              <Text style={[styles.menuSubtitle, { color: colors.textMuted }]}>
                Permanently deactivate this profile
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.versionText, { color: colors.textMuted }]}>NEXRYDE v1.0.0</Text>

        <TouchableOpacity
          style={[styles.logoutButtonScroll, { marginBottom: Math.max(insets.bottom, 16) + 8 }]}
          onPress={handleLogout}
          accessibilityLabel="Logout"
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
      {showStickyTitle ? (
        <View style={[styles.stickyTitleWrap, { top: insets.top }]}>
          <BlurView intensity={40} tint="dark" style={styles.stickyBlur}>
            <Text style={styles.stickyTitle}>Profile</Text>
          </BlurView>
        </View>
      ) : null}

      <Modal visible={showDriverModal} animationType="slide" transparent onRequestClose={() => setShowDriverModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowDriverModal(false)}>
              <Ionicons name="close" size={24} color={COLORS.gray500} />
            </TouchableOpacity>
            <View style={styles.modalIconWrap}>
              <Ionicons name="car-sport" size={40} color={COLORS.info} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Switch to driver?</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              You will use the driver app experience. You can switch back to rider anytime from your profile.
            </Text>
            <TouchableOpacity style={styles.modalConfirm} onPress={confirmSwitchToDriver}>
              <Text style={styles.modalConfirmText}>Switch to Driver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: t.space.xl,
  },
  menuSection: {
    borderRadius: t.radius.lg,
    overflow: 'hidden',
    marginBottom: t.space.xxl,
    backgroundColor: t.bg.card,
  },
  menuSectionTitle: {
    ...typography.label,
    color: t.text.label,
    paddingLeft: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  emergencyBtn: {
    marginHorizontal: t.space.lg,
    marginBottom: t.space.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.space.lg,
    paddingVertical: 14,
    minHeight: 72,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.bg.divider,
    marginLeft: 78,
  },
  menuRowText: {
    flex: 1,
    marginLeft: 14,
    minWidth: 0,
    justifyContent: 'center',
  },
  menuTitle: {
    ...typography.h3,
    color: t.text.primary,
  },
  menuSubtitle: {
    ...typography.small,
    marginTop: 2,
    color: t.text.tertiary,
  },
  deleteRow: { backgroundColor: COLORS.errorSoft },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePanel: {
    marginTop: t.space.md,
    borderRadius: t.radius.lg,
    padding: t.space.xl,
    gap: t.space.md,
  },
  scorePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: t.space.md,
  },
  scorePanelTitle: {
    ...typography.h2,
    color: t.text.primary,
  },
  scorePanelSubtitle: {
    ...typography.small,
    color: t.text.tertiary,
    marginTop: 4,
  },
  scoreTierBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: t.radius.pill,
    backgroundColor: '#1F2A44',
  },
  scoreTierBadgeText: {
    ...typography.small,
    color: t.accent.amber,
  },
  scoreBreakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: t.space.md,
  },
  scoreMetricCard: {
    width: '48.5%',
    borderRadius: t.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 108,
    borderWidth: 0,
    justifyContent: 'space-between',
  },
  scoreMetricLabel: {
    ...typography.small,
    color: t.text.tertiary,
  },
  scoreMetricValue: {
    ...typography.h1,
    marginTop: 8,
    color: t.text.primary,
  },
  scorePerksTitle: {
    ...typography.h3,
    color: t.text.primary,
    marginTop: t.space.md,
  },
  scorePerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 32,
  },
  scorePerkText: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
  },
  logoutButtonScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  logoutText: {
    ...typography.h3,
    color: COLORS.error,
  },
  versionText: {
    ...typography.label,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    padding: SPACING.xl,
    paddingTop: SPACING.xl + 8,
  },
  modalClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    padding: SPACING.sm,
  },
  modalIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  modalSubtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  modalConfirm: {
    backgroundColor: COLORS.info,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: COLORS.white,
    ...typography.h3,
  },
  stickyTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  stickyBlur: {
    backgroundColor: 'rgba(11,18,32,0.8)',
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.xl,
  },
  stickyTitle: {
    color: t.text.primary,
    ...typography.h3,
  },
});
