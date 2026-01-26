import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

export default function RiderProfileScreen() {
  const router = useRouter();
  const { user, logout, setUser } = useAppStore();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState(0);
  const [otp, setOtp] = useState('');

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: () => {
            logout();
            router.replace('/');
          }
        }
      ]
    );
  };

  const handleBecomeDriver = () => {
    setShowSwitchModal(true);
    setVerificationStep(0);
  };

  const handleVerifyOTP = () => {
    if (otp.length === 6) {
      setVerificationStep(1);
    }
  };

  const handleCompleteSwitch = () => {
    // Update user role
    if (user) {
      setUser({ ...user, role: 'driver' });
    }
    setShowSwitchModal(false);
    setVerificationStep(0);
    setOtp('');
    
    Alert.alert(
      'Welcome, Driver!',
      'Your account has been upgraded to Driver. You can now earn with KODA!',
      [{ text: 'Start Earning', onPress: () => router.replace('/(driver-tabs)/driver-home') }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0)?.toUpperCase() || 'R'}
              </Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={12} color={COLORS.white} />
            </View>
          </View>
          <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
          <Text style={styles.userPhone}>{user?.phone || '+234'}</Text>
          <View style={styles.riderBadge}>
            <Ionicons name="person" size={14} color={COLORS.info} />
            <Text style={styles.riderBadgeText}>Rider Account</Text>
          </View>
          
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.total_trips || 0}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
          </View>
        </View>

        {/* Become a Driver Card */}
        <TouchableOpacity style={styles.becomeDriverCard} onPress={handleBecomeDriver} activeOpacity={0.9}>
          <View style={styles.becomeDriverIcon}>
            <Ionicons name="car-sport" size={28} color={COLORS.primary} />
          </View>
          <View style={styles.becomeDriverContent}>
            <Text style={styles.becomeDriverTitle}>Become a Driver</Text>
            <Text style={styles.becomeDriverText}>Earn money with KODA. Keep 100% of your fares!</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
        </TouchableOpacity>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Account</Text>
          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="person-outline" size={20} color={COLORS.info} />
            </View>
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="star-outline" size={20} color={COLORS.accent} />
            </View>
            <Text style={styles.menuText}>My Ratings & Reviews</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="location-outline" size={20} color={COLORS.success} />
            </View>
            <Text style={styles.menuText}>Saved Places</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Preferences</Text>
          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.warning} />
            </View>
            <Text style={styles.menuText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="settings-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Settings</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="help-circle-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>KODA v1.0.0</Text>
      </ScrollView>

      {/* Become Driver Modal */}
      <Modal
        visible={showSwitchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSwitchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity 
              style={styles.modalClose}
              onPress={() => setShowSwitchModal(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.gray500} />
            </TouchableOpacity>

            {verificationStep === 0 ? (
              // Step 1: OTP Verification
              <>
                <View style={styles.modalIconWrap}>
                  <Ionicons name="shield-checkmark" size={40} color={COLORS.accent} />
                </View>
                <Text style={styles.modalTitle}>Verify Your Identity</Text>
                <Text style={styles.modalSubtitle}>
                  We'll send an OTP to {user?.phone} to verify it's you
                </Text>

                <View style={styles.otpContainer}>
                  <TextInput
                    style={styles.otpInput}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor={COLORS.gray400}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>

                <View style={styles.otpHint}>
                  <Ionicons name="information-circle" size={16} color={COLORS.info} />
                  <Text style={styles.otpHintText}>Demo: Enter any 6 digits</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    otp.length !== 6 && styles.modalButtonDisabled
                  ]}
                  onPress={handleVerifyOTP}
                  disabled={otp.length !== 6}
                >
                  <Text style={styles.modalButtonText}>Verify & Continue</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Step 2: Confirmation
              <>
                <View style={[styles.modalIconWrap, { backgroundColor: COLORS.accentSoft }]}>
                  <Ionicons name="car-sport" size={40} color={COLORS.accent} />
                </View>
                <Text style={styles.modalTitle}>Ready to Earn?</Text>
                <Text style={styles.modalSubtitle}>
                  You're about to become a KODA driver. Here's what you'll get:
                </Text>

                <View style={styles.benefitsList}>
                  <View style={styles.benefitItem}>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={14} color={COLORS.white} />
                    </View>
                    <Text style={styles.benefitText}>Keep 100% of your earnings</Text>
                  </View>
                  <View style={styles.benefitItem}>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={14} color={COLORS.white} />
                    </View>
                    <Text style={styles.benefitText}>Flat ₦25,000/month - No commissions</Text>
                  </View>
                  <View style={styles.benefitItem}>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={14} color={COLORS.white} />
                    </View>
                    <Text style={styles.benefitText}>Work on your own schedule</Text>
                  </View>
                  <View style={styles.benefitItem}>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={14} color={COLORS.white} />
                    </View>
                    <Text style={styles.benefitText}>Access to driver benefits & rewards</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleCompleteSwitch}
                >
                  <Text style={styles.modalButtonText}>Become a Driver</Text>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => setShowSwitchModal(false)}
                >
                  <Text style={styles.modalSecondaryText}>Maybe Later</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  content: {
    padding: SPACING.lg,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.lg,
  },
  avatarText: {
    fontSize: FONT_SIZE.display,
    fontWeight: '800',
    color: COLORS.accent,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  userPhone: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  riderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  riderBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.info,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    width: '80%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.gray200,
  },
  becomeDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.gold,
  },
  becomeDriverIcon: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  becomeDriverContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  becomeDriverTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  becomeDriverText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    opacity: 0.8,
  },
  menuSection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  menuSectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
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
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  logoutText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.error,
  },
  versionText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
    textAlign: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    padding: SPACING.xl,
    paddingTop: SPACING.lg,
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    padding: SPACING.sm,
  },
  modalIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  otpContainer: {
    width: '100%',
    marginBottom: SPACING.md,
  },
  otpInput: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: COLORS.gray200,
  },
  otpHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  otpHintText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.info,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    gap: SPACING.sm,
    ...SHADOWS.gold,
  },
  modalButtonDisabled: {
    backgroundColor: COLORS.gray200,
    shadowOpacity: 0,
  },
  modalButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  modalSecondaryButton: {
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  modalSecondaryText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  benefitsList: {
    width: '100%',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  benefitCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    flex: 1,
  },
});
