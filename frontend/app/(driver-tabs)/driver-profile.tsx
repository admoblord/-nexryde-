import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, useThemeColors } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { deleteUserAccount, getUserTrustSummary, updateUser } from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';
import { ProfileHeroCard } from '@/src/components/profile/ProfileHeroCard';
import { ProfileQuickActions } from '@/src/components/profile/ProfileQuickActions';
import { BiometricScanner, EmergencyButton, LoadingSpinner, UserCard } from '@/src/components/tier1';

export default function DriverProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, setUser, subscription } = useAppStore();
  const { colors } = useThemeColors();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [profileImage, setProfileImage] = useState(user?.profile_image || null);
  const isDriverVerified = useMemo(() => Boolean(user?.is_verified), [user?.is_verified]);
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

  useEffect(() => {
    let mounted = true;
    const loadTrust = async () => {
      if (!user?.id) return;
      setLoadingTrust(true);
      try {
        const res = await getUserTrustSummary(user.id);
        if (mounted) setTrustSummary(res.data);
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
      'This will deactivate your driver account and remove access to NEXRYDE. This action cannot be undone easily.',
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

  const confirmSwitchToRider = () => {
    if (user) setUser({ ...user, role: 'rider' });
    setShowSwitchModal(false);
    Alert.alert('Switched to Rider', 'You can switch back to Driver mode anytime from your profile.', [
      { text: 'OK', onPress: () => router.replace('/(rider-tabs)/rider-home') },
    ]);
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

  const initial = (user?.name && user.name.length > 0 ? user.name.charAt(0) : 'D').toUpperCase();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeroCard
          user={user}
          profileImage={profileImage}
          fallbackInitial={initial}
          roleLabel={isDriverVerified ? 'Driver · Verified' : 'Driver'}
          roleIcon="car-sport"
          roleTint="#059669"
          roleBg={COLORS.successSoft}
          colors={colors}
          onAvatarPress={handleProfilePictureUpload}
        />

        <ProfileQuickActions
          title="Quick Actions"
          colors={colors}
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
              key: 'trips',
              label: 'Trip History',
              icon: 'list',
              iconColor: COLORS.white,
              iconBg: '#7C3AED',
              onPress: () => router.push('/driver/trips' as any),
            },
            {
              key: 'vehicle',
              label: 'Vehicle',
              icon: 'car-sport',
              iconColor: COLORS.white,
              iconBg: '#059669',
              onPress: () => router.push('/driver/vehicle'),
            },
            {
              key: 'bank',
              label: 'Bank & payouts',
              icon: 'wallet',
              iconColor: COLORS.white,
              iconBg: '#CA8A04',
              onPress: () => router.push('/driver/bank'),
            },
            {
              key: 'docs',
              label: 'Documents',
              icon: 'document-text',
              iconColor: COLORS.white,
              iconBg: '#EA580C',
              onPress: () => router.push('/driver/documents'),
            },
          ]}
        />

        <View style={[styles.subscriptionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.subscriptionHeader}>
            <View style={[styles.subscriptionIcon, { backgroundColor: '#CFFAFE' }]}>
              <Ionicons name="business-outline" size={22} color="#0F766E" />
            </View>
            <View style={styles.subscriptionInfo}>
              <Text style={[styles.subscriptionTitle, { color: colors.text }]}>Nexryde Wallet as a Bank</Text>
              <Text style={[styles.subscriptionSubtext, { color: colors.textMuted }]}>
                Driver mini-bank features like interest, transfers, bill pay, and airtime will land here.
              </Text>
            </View>
            <View style={styles.scoreTierBadge}>
              <Text style={styles.scoreTierBadgeText}>Coming Soon</Text>
            </View>
          </View>
        </View>

        {loadingTrust ? (
          <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
            <LoadingSpinner label="Refreshing trust summary..." />
          </View>
        ) : trustSummary ? (
          <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
            <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Tier 1 Trust</Text>
            <UserCard
              name={user?.name || 'Driver'}
              role="driver"
              image={profileImage}
              rating={user?.rating || 5}
              reviewCount={user?.total_trips || 0}
              nexrydeScore={trustSummary.nexryde_score}
              riderRiskScore={trustSummary.rider_risk_score}
              driverSafetyScore={trustSummary.driver_safety_score}
              verificationLabel={
                trustSummary.verification_status.face_verified
                  ? 'Face verified'
                  : trustSummary.verification_status.nin_verified
                    ? 'Identity verified'
                    : 'Verification incomplete'
              }
            />
            <BiometricScanner
              title="Protect driver withdrawals"
              subtitle="Use device biometrics before sensitive actions like payout access and safety confirmations."
            />
            <View style={[styles.scorePanel, { backgroundColor: colors.background }]}>
              <View style={styles.scorePanelHeader}>
                <View>
                  <Text style={[styles.scorePanelTitle, { color: colors.text }]}>Nexryde Score</Text>
                  <Text style={[styles.scorePanelSubtitle, { color: colors.textMuted }]}>
                    {trustSummary.score_tier.label} tier improves matching quality and driver privileges.
                  </Text>
                </View>
                <View style={styles.scoreTierBadge}>
                  <Text style={styles.scoreTierBadgeText}>{trustSummary.score_tier.label}</Text>
                </View>
              </View>
              <View style={styles.scoreBreakdownGrid}>
                <View style={styles.scoreMetricCard}>
                  <Text style={styles.scoreMetricLabel}>Service</Text>
                  <Text style={styles.scoreMetricValue}>{Math.round(trustSummary.score_breakdown.service_quality)}</Text>
                </View>
                <View style={styles.scoreMetricCard}>
                  <Text style={styles.scoreMetricLabel}>Punctuality</Text>
                  <Text style={styles.scoreMetricValue}>{Math.round(trustSummary.score_breakdown.punctuality)}</Text>
                </View>
                <View style={styles.scoreMetricCard}>
                  <Text style={styles.scoreMetricLabel}>Verification</Text>
                  <Text style={styles.scoreMetricValue}>{Math.round(trustSummary.score_breakdown.verification)}</Text>
                </View>
                <View style={styles.scoreMetricCard}>
                  <Text style={styles.scoreMetricLabel}>Payments</Text>
                  <Text style={styles.scoreMetricValue}>{Math.round(trustSummary.score_breakdown.payment_behavior)}</Text>
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
          </View>
        ) : null}

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/settings')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentGreen }]}>
              <Ionicons name="settings" size={20} color={COLORS.white} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Settings</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Safety & Trust</Text>
          <EmergencyButton
            label="Open Safety Center"
            style={styles.emergencyBtn}
            onPress={() => router.push('/driver/safety-alerts')}
          />
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/driver/safety-alerts')}>
            <View style={[styles.menuIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Safety Center</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Alerts, danger zones and emergency protection</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/shield-disputes')}>
            <View style={[styles.menuIcon, { backgroundColor: '#0D9488' }]}>
              <Ionicons name="ribbon" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Nexryde Shield</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Disputes</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Mode & access</Text>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => setShowSwitchModal(true)}>
            <View style={[styles.menuIcon, { backgroundColor: '#6366F1' }]}>
              <Ionicons name="swap-horizontal" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Switch to Rider Mode</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Book rides as a passenger</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.linkRow, { backgroundColor: colors.card }]}
          onPress={() => router.push('/driver/performance')}
        >
          <Ionicons name="analytics-outline" size={18} color={COLORS.accent} />
          <Text style={[styles.linkRowText, { color: colors.text }]}>Performance & ratings</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.gray400} />
        </TouchableOpacity>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Support & Legal</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/support')}>
            <View style={[styles.menuIcon, { backgroundColor: '#F97316' }]}>
              <Ionicons name="help-circle" size={20} color={COLORS.white} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/privacy-policy')}>
            <View style={[styles.menuIcon, { backgroundColor: '#8B5CF6' }]}>
              <Ionicons name="document-text" size={20} color={COLORS.white} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/terms-of-service')}>
            <View style={[styles.menuIcon, { backgroundColor: '#0EA5E9' }]}>
              <Ionicons name="reader" size={20} color={COLORS.white} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Account actions</Text>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast, styles.deleteRow]} onPress={handleDeleteAccount}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.error }]}>
              <Ionicons name="trash" size={20} color={COLORS.white} />
            </View>
            <Text style={[styles.menuText, { color: COLORS.error }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>NEXRYDE Driver v1.0.0</Text>

        <TouchableOpacity
          style={styles.logoutButtonScroll}
          onPress={handleLogout}
          accessibilityLabel="Logout"
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showSwitchModal} animationType="slide" transparent onRequestClose={() => setShowSwitchModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowSwitchModal(false)}>
              <Ionicons name="close" size={24} color={COLORS.gray500} />
            </TouchableOpacity>
            <View style={styles.modalIconWrap}>
              <Ionicons name="person" size={40} color={COLORS.info} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Switch to Rider?</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Book rides as a passenger. Your driver account stays active; switch back anytime from profile.
            </Text>
            <View style={styles.modalNote}>
              <Ionicons name="information-circle" size={20} color={COLORS.info} />
              <Text style={styles.modalNoteText}>Subscription and earnings are unchanged.</Text>
            </View>
            <TouchableOpacity style={styles.modalButton} onPress={confirmSwitchToRider}>
              <Text style={styles.modalButtonText}>Switch to Rider</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setShowSwitchModal(false)}>
              <Text style={[styles.modalSecondaryText, { color: colors.textSecondary }]}>Stay as Driver</Text>
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
  content: { padding: SPACING.lg },
  menuSection: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  menuSectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emergencyBtn: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  subscriptionCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  subscriptionHeader: { flexDirection: 'row', alignItems: 'center' },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionInfo: { flex: 1, marginLeft: SPACING.md },
  subscriptionTitle: { fontSize: FONT_SIZE.md, fontWeight: '800' },
  subscriptionSubtext: { fontSize: FONT_SIZE.sm, fontWeight: '600', marginTop: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  menuItemLast: { borderBottomWidth: 0 },
  deleteRow: { backgroundColor: COLORS.errorSoft },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    marginLeft: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  menuSubtext: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  scorePanel: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  scorePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },
  scorePanelTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
  },
  scorePanelSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    marginTop: 4,
  },
  scoreTierBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  scoreTierBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  scoreBreakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING.sm,
  },
  scoreMetricCard: {
    width: '48.5%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  scoreMetricLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.gray500,
  },
  scoreMetricValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.gray900,
    marginTop: 8,
  },
  scorePerksTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    marginTop: SPACING.xs,
  },
  scorePerkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  scorePerkText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    flex: 1,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  linkRowText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700' },
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
  logoutText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.error },
  versionText: { fontSize: FONT_SIZE.xs, color: COLORS.gray400, textAlign: 'center', marginBottom: SPACING.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    padding: SPACING.xl,
    paddingTop: SPACING.xl + 8,
    alignItems: 'center',
  },
  modalClose: { position: 'absolute', top: SPACING.md, right: SPACING.md, padding: SPACING.sm },
  modalIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '800', marginBottom: SPACING.sm },
  modalSubtitle: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    marginBottom: SPACING.md,
    lineHeight: 22,
  },
  modalNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.infoSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    width: '100%',
  },
  modalNoteText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.info, lineHeight: 20 },
  modalButton: {
    backgroundColor: COLORS.info,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    alignItems: 'center',
  },
  modalButtonText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.white },
  modalSecondaryButton: { marginTop: SPACING.md, padding: SPACING.md },
  modalSecondaryText: { fontSize: FONT_SIZE.md },
});
