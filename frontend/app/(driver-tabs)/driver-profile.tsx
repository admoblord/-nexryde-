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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

export default function DriverProfileScreen() {
  const router = useRouter();
  const { user, logout, setUser, subscription } = useAppStore();
  const [showSwitchModal, setShowSwitchModal] = useState(false);

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

  const handleSwitchToRider = () => {
    setShowSwitchModal(true);
  };

  const confirmSwitchToRider = () => {
    if (user) {
      setUser({ ...user, role: 'rider' });
    }
    setShowSwitchModal(false);
    
    Alert.alert(
      'Switched to Rider',
      'You can switch back to Driver mode anytime from your profile.',
      [{ text: 'OK', onPress: () => router.replace('/(rider-tabs)/rider-home') }]
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
                {user?.name?.charAt(0)?.toUpperCase() || 'D'}
              </Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={12} color={COLORS.white} />
            </View>
          </View>
          <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
          <Text style={styles.userPhone}>{user?.phone || '+234'}</Text>
          
          <View style={styles.driverBadge}>
            <Ionicons name="car" size={14} color={COLORS.success} />
            <Text style={styles.driverBadgeText}>Verified Driver</Text>
          </View>
          
          {/* Driver Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Ionicons name="star" size={18} color={COLORS.accent} />
              </View>
              <Text style={styles.statValue}>
                {user?.trips_completed > 0 ? (user?.rating?.toFixed(1) || 'N/A') : 'New Driver'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Ionicons name="car" size={18} color={COLORS.info} />
              </View>
              <Text style={styles.statValue}>{user?.total_trips || 0}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.statIconWrap}>
                <Ionicons name="trending-up" size={18} color={COLORS.success} />
              </View>
              <Text style={styles.statValue}>98%</Text>
              <Text style={styles.statLabel}>Completion</Text>
            </View>
          </View>
        </View>

        {/* Subscription Status */}
        <TouchableOpacity 
          style={styles.subscriptionCard}
          onPress={() => router.push('/driver/subscription')}
          activeOpacity={0.8}
        >
          <View style={styles.subscriptionHeader}>
            <View style={[
              styles.subscriptionIcon,
              { backgroundColor: subscription?.status === 'active' ? COLORS.successSoft : COLORS.warningSoft }
            ]}>
              <Ionicons 
                name={subscription?.status === 'active' ? 'checkmark-circle' : 'alert-circle'} 
                size={24} 
                color={subscription?.status === 'active' ? COLORS.success : COLORS.warning} 
              />
            </View>
            <View style={styles.subscriptionInfo}>
              <Text style={styles.subscriptionTitle}>
                {subscription?.status === 'active' ? 'Premium Driver' : 'No Subscription'}
              </Text>
              <Text style={styles.subscriptionSubtext}>
                {subscription?.status === 'active' 
                  ? `Expires ${new Date(subscription.end_date).toLocaleDateString()}`
                  : 'Subscribe to go online'
                }
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </View>
          <View style={styles.subscriptionBanner}>
            <Text style={styles.subscriptionBannerText}>
              {CURRENCY}25,000/month • Zero commission • 100% earnings
            </Text>
          </View>
        </TouchableOpacity>

        {/* Switch to Rider */}
        <TouchableOpacity style={styles.switchRiderCard} onPress={handleSwitchToRider} activeOpacity={0.8}>
          <View style={styles.switchRiderIcon}>
            <Ionicons name="swap-horizontal" size={24} color={COLORS.info} />
          </View>
          <View style={styles.switchRiderContent}>
            <Text style={styles.switchRiderTitle}>Switch to Rider Mode</Text>
            <Text style={styles.switchRiderText}>Book rides as a passenger</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
        </TouchableOpacity>

        {/* Menu Sections */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Driver Settings</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/driver/vehicle')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="car-outline" size={20} color={COLORS.accent} />
            </View>
            <Text style={styles.menuText}>Vehicle Information</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/driver/bank')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="wallet-outline" size={20} color={COLORS.success} />
            </View>
            <Text style={styles.menuText}>Bank Account</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.info} />
            </View>
            <Text style={styles.menuText}>Documents</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Account</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="person-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Notifications</Text>
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

        <Text style={styles.versionText}>NEXRYDE Driver v1.0.0</Text>
      </ScrollView>

      {/* Switch to Rider Modal */}
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

            <View style={styles.modalIconWrap}>
              <Ionicons name="person" size={40} color={COLORS.info} />
            </View>
            <Text style={styles.modalTitle}>Switch to Rider?</Text>
            <Text style={styles.modalSubtitle}>
              You'll be able to book rides as a passenger. Your driver account will remain active and you can switch back anytime.
            </Text>

            <View style={styles.modalNote}>
              <Ionicons name="information-circle" size={20} color={COLORS.info} />
              <Text style={styles.modalNoteText}>
                Your subscription and earnings are safe. Switch back to Driver mode from your Rider profile.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={confirmSwitchToRider}
            >
              <Text style={styles.modalButtonText}>Switch to Rider</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => setShowSwitchModal(false)}
            >
              <Text style={styles.modalSecondaryText}>Stay as Driver</Text>
            </TouchableOpacity>
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
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  userPhone: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: SPACING.xs,
  },
  driverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  driverBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#059669',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    width: '90%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 50,
    backgroundColor: COLORS.gray200,
  },
  subscriptionCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  subscriptionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: '#0F172A',
  },
  subscriptionSubtext: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#475569',
  },
  subscriptionBanner: {
    backgroundColor: COLORS.accentSoft,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  subscriptionBannerText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: '#059669',
  },
  switchRiderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.info,
    borderStyle: 'dashed',
  },
  switchRiderIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRiderContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  switchRiderTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: '#0F172A',
  },
  switchRiderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#475569',
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
    fontWeight: '800',
    color: '#64748B',
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
    fontWeight: '700',
    color: '#0F172A',
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
    backgroundColor: COLORS.infoSoft,
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
  modalNoteText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.info,
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: COLORS.info,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  modalButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  modalSecondaryButton: {
    marginTop: SPACING.md,
    padding: SPACING.md,
  },
  modalSecondaryText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
});
