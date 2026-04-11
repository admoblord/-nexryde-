import React, { useMemo, useState } from 'react';
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
import { deleteUserAccount, updateUser } from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';
import { ProfileMergedPreferences } from '@/src/components/profile/ProfileMergedPreferences';
import { ProfileHeroCard } from '@/src/components/profile/ProfileHeroCard';
import { ProfileQuickActions } from '@/src/components/profile/ProfileQuickActions';
import { ProfileWalletRewardsCard } from '@/src/components/profile/ProfileWalletRewardsCard';

export default function DriverProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, setUser, subscription } = useAppStore();
  const { colors } = useThemeColors();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [profileImage, setProfileImage] = useState(user?.profile_image || null);
  const isDriverVerified = useMemo(() => Boolean(user?.is_verified), [user?.is_verified]);

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
        contentContainerStyle={[styles.content, { paddingBottom: SPACING.lg }]}
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
          title="Quick actions"
          colors={colors}
          actions={[
            {
              key: 'edit',
              label: 'Edit Profile',
              icon: 'create-outline',
              iconColor: COLORS.gray700,
              iconBg: COLORS.gray100,
              onPress: () => router.push('/edit-profile'),
            },
            {
              key: 'trips',
              label: 'Trip History',
              icon: 'list-outline',
              iconColor: COLORS.info,
              iconBg: COLORS.infoSoft,
              onPress: () => router.push('/(driver-tabs)/driver-trips' as any),
            },
            {
              key: 'vehicle',
              label: 'Vehicle',
              icon: 'car-outline',
              iconColor: COLORS.accent,
              iconBg: COLORS.accentSoft,
              onPress: () => router.push('/driver/vehicle'),
            },
            {
              key: 'bank',
              label: 'Bank & payouts',
              icon: 'wallet-outline',
              iconColor: COLORS.success,
              iconBg: COLORS.successSoft,
              onPress: () => router.push('/driver/bank'),
            },
            {
              key: 'docs',
              label: 'Documents',
              icon: 'document-text-outline',
              iconColor: COLORS.warning,
              iconBg: COLORS.warningSoft,
              onPress: () => router.push('/driver/documents'),
            },
          ]}
        />

        <ProfileWalletRewardsCard userId={user?.id} colors={colors} />

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Preferences</Text>
          <ProfileMergedPreferences variant="driver" />
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Safety & trust</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/tracking')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="navigate-outline" size={20} color={COLORS.info} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Live Tracking</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/share-trip')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="share-social-outline" size={20} color={COLORS.accent} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Share Trip</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/security-code')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Security Code</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/driver/safety-alerts')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.success} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Safety Center</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/shield-disputes')}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(13, 148, 136, 0.15)' }]}>
              <Ionicons name="ribbon-outline" size={20} color="#0D9488" />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Nexryde Shield</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Disputes</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Grow & stay active</Text>
          <TouchableOpacity
            style={[styles.subscriptionCard, { borderColor: colors.border }]}
            onPress={() => router.push('/driver/subscription')}
            activeOpacity={0.85}
          >
            <View style={styles.subscriptionHeader}>
              <View
                style={[
                  styles.subscriptionIcon,
                  { backgroundColor: subscription?.status === 'active' ? COLORS.successSoft : COLORS.warningSoft },
                ]}
              >
                <Ionicons
                  name={subscription?.status === 'active' ? 'checkmark-circle' : 'alert-circle'}
                  size={24}
                  color={subscription?.status === 'active' ? COLORS.success : COLORS.warning}
                />
              </View>
              <View style={styles.subscriptionInfo}>
                <Text style={[styles.subscriptionTitle, { color: colors.text }]}>
                  {subscription?.status === 'active' ? 'Driver subscription' : 'Subscription required'}
                </Text>
                <Text style={[styles.subscriptionSubtext, { color: colors.textSecondary }]}>
                  {subscription?.status === 'active'
                    ? `Active · renews ${new Date(subscription.end_date).toLocaleDateString()}`
                    : 'Subscribe to go online and accept rides'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/wallet')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="people-outline" size={20} color={COLORS.warning} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Invite & Earn</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Referrals & rewards</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => setShowSwitchModal(true)}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="swap-horizontal" size={20} color={COLORS.info} />
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
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Support & legal</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/support')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="help-circle-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/privacy-policy')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/terms-of-service')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="reader-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={[styles.menuText, { color: colors.text }]}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Account actions</Text>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast, styles.deleteRow]} onPress={handleDeleteAccount}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.errorSoft }]}>
              <Ionicons name="trash-outline" size={20} color={COLORS.error} />
            </View>
            <Text style={[styles.menuText, { color: COLORS.error }]}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>NEXRYDE Driver v1.0.0</Text>
      </ScrollView>

      <View
        style={[
          styles.logoutBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, SPACING.md),
          },
        ]}
      >
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

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
  logoutBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
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
