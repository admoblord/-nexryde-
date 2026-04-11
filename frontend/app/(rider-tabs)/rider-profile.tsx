import React, { useState } from 'react';
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

export default function RiderProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, setUser } = useAppStore();
  const { colors } = useThemeColors();
  const [profileImage, setProfileImage] = useState(user?.profile_image || null);
  const [showDriverModal, setShowDriverModal] = useState(false);

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
        contentContainerStyle={[styles.content, { paddingBottom: SPACING.lg }]}
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
          title="Quick actions"
          colors={colors}
          actions={[
            {
              key: 'edit',
              label: 'Edit Profile',
              icon: 'create-outline',
              iconColor: COLORS.info,
              iconBg: COLORS.infoSoft,
              onPress: () => router.push('/edit-profile'),
            },
            {
              key: 'history',
              label: 'Ride History',
              icon: 'time-outline',
              iconColor: COLORS.gray700,
              iconBg: COLORS.gray100,
              onPress: () => router.push('/(rider-tabs)/rider-trips' as any),
            },
            {
              key: 'saved',
              label: 'Saved Places',
              icon: 'location-outline',
              iconColor: COLORS.success,
              iconBg: COLORS.successSoft,
              onPress: () => router.push('/saved-places'),
            },
            {
              key: 'fav',
              label: 'Favorite Drivers',
              icon: 'heart-outline',
              iconColor: COLORS.error,
              iconBg: '#FEF2F2',
              onPress: () => router.push('/rider/favorite-drivers'),
            },
          ]}
        />

        <ProfileWalletRewardsCard userId={user?.id} colors={colors} />

        <View style={[styles.menuSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Preferences</Text>
          <ProfileMergedPreferences variant="rider" />
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
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/safety')}>
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
          <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>Grow with Nexryde</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/wallet')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="people-outline" size={20} color={COLORS.warning} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Invite & Earn</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Share your code, earn rewards</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => setShowDriverModal(true)}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="car-sport-outline" size={20} color={COLORS.info} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={[styles.menuText, { color: colors.text }]}>Switch to Driver Mode</Text>
              <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>Drive and earn on Nexryde</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.linkRow, { backgroundColor: colors.card }]}
          onPress={() => router.push('/ratings')}
        >
          <Ionicons name="star-outline" size={18} color={COLORS.accent} />
          <Text style={[styles.linkRowText, { color: colors.text }]}>My ratings & reviews</Text>
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

        <Text style={styles.versionText}>NEXRYDE v1.0.0</Text>
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
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} accessibilityLabel="Logout" accessibilityRole="button">
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  linkRowText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
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
