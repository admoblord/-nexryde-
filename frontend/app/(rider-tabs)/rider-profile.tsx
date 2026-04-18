import React, { useEffect, useState } from 'react';
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
        console.log('Failed to save profile image to server');
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
          { paddingBottom: Math.max(insets.bottom, 24) + 100 },
        ]}
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

        {loadingTrust ? (
          <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
            <LoadingSpinner label="Refreshing trust summary..." />
          </View>
        ) : trustSummary ? (
          <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
            <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Tier 1 Trust</Text>
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
            <BiometricScanner
              title="Protect this rider account"
              subtitle="Use device biometrics before sensitive actions like wallet access or emergency updates."
            />
            <View style={[styles.scorePanel, { backgroundColor: colors.background }]}>
              <View style={styles.scorePanelHeader}>
                <View>
                  <Text style={[styles.scorePanelTitle, { color: colors.text }]}>Nexryde Score</Text>
                  <Text style={[styles.scorePanelSubtitle, { color: colors.textMuted }]}>
                    {trustSummary.score_tier.label} tier unlocks transport trust perks.
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
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Safety & Trust</Text>
          <EmergencyButton
            label="Open SOS Center"
            style={styles.emergencyBtn}
            onPress={() => router.push('/(rider-tabs)/rider-safety' as any)}
          />
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(rider-tabs)/rider-safety' as any)}>
            <View style={[styles.menuIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Safety Center</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>SOS, emergency contacts and trip protection</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/shield-disputes')}>
            <View style={[styles.menuIcon, { backgroundColor: '#0D9488' }]}>
              <Ionicons name="ribbon" size={20} color={COLORS.white} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Nexryde Shield (Disputes)</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Mode & access</Text>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => setShowDriverModal(true)}>
            <View style={[styles.menuIcon, { backgroundColor: '#6366F1' }]}>
              <Ionicons name="car-sport" size={20} color={COLORS.white} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Switch to Driver Mode</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Drive and earn on Nexryde</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

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
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/settings')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentGreen }]}>
              <Ionicons name="settings" size={20} color={COLORS.white} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Settings</Text>
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

        <Text style={styles.versionText}>NEXRYDE v1.0.0</Text>

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
    padding: SPACING.lg,
  },
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
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
  menuSubtext: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
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
    gap: SPACING.sm,
  },
  scoreMetricCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
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
    marginTop: 4,
  },
  scorePerksTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
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
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.error,
  },
  versionText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
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
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    lineHeight: 22,
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
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
});
