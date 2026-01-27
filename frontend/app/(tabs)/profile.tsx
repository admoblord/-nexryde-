import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, setIsAuthenticated } = useAppStore();
  const isDriver = user?.role === 'driver';

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Call backend logout endpoint
              await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
            } catch (error) {
              console.log('Logout API error:', error);
            }
            
            // Clear local state
            logout();
            setIsAuthenticated(false);
            router.replace('/login');
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
              </LinearGradient>
              <View style={styles.onlineDot} />
            </View>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userPhone}>{user?.phone || user?.email || 'No contact info'}</Text>
            <View style={styles.roleBadge}>
              <View style={[styles.roleDot, { backgroundColor: COLORS.accentGreen }]} />
              <Text style={styles.roleText}>{isDriver ? 'Driver' : 'Rider'}</Text>
            </View>
          </View>

          {/* Menu Items */}
          <View style={styles.menuSection}>
            <MenuItem 
              icon="person" 
              label="Edit Profile" 
              subtitle="Update your personal information"
              onPress={() => {}}
              color={COLORS.accentGreen}
            />
            <MenuItem 
              icon="time" 
              label="Ride History" 
              subtitle="View your past trips"
              onPress={() => router.push('/ride-history')}
              color={COLORS.accentBlue}
            />
            <MenuItem 
              icon="chatbubbles" 
              label="Messages" 
              subtitle="Chat with your driver"
              onPress={() => router.push('/chat')}
              color={COLORS.info}
            />
            <MenuItem 
              icon="shield-checkmark" 
              label="Safety Center" 
              subtitle="Emergency contacts & safety features"
              onPress={() => router.push('/safety')}
              color={COLORS.accentGreen}
            />
            <MenuItem 
              icon="wallet" 
              label="Wallet" 
              subtitle="Payment methods & balance"
              onPress={() => {}}
              color={COLORS.gold}
            />
            <MenuItem 
              icon="help-circle" 
              label="Help & Support" 
              subtitle="Get help with NEXRYDE"
              onPress={() => {}}
              color={COLORS.accentGreen}
            />
            <MenuItem 
              icon="document-text" 
              label="Terms & Privacy" 
              subtitle="Read our policies"
              onPress={() => {}}
              color={COLORS.lightTextSecondary}
            />
            <MenuItem 
              icon="settings" 
              label="Settings" 
              subtitle="App preferences & notifications"
              onPress={() => {}}
              color={COLORS.lightTextSecondary}
            />
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <View style={styles.logoutContent}>
              <View style={styles.logoutIcon}>
                <Ionicons name="log-out" size={22} color={COLORS.error} />
              </View>
              <Text style={styles.logoutText}>Log Out</Text>
            </View>
          </TouchableOpacity>

          {/* App Version */}
          <Text style={styles.versionText}>NEXRYDE v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const MenuItem = ({ 
  icon, 
  label, 
  subtitle, 
  onPress,
  color 
}: { 
  icon: string; 
  label: string; 
  subtitle?: string;
  onPress: () => void;
  color: string;
}) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.menuIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon as any} size={22} color={color} />
    </View>
    <View style={styles.menuContent}>
      <Text style={styles.menuLabel}>{label}</Text>
      {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={22} color={COLORS.lightTextMuted} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.white,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accentGreen,
    borderWidth: 3,
    borderColor: COLORS.lightBackground,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  userPhone: {
    fontSize: FONT_SIZE.md,
    fontWeight: '500',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roleText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  menuSection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  menuSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    color: COLORS.lightTextSecondary,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.errorSoft,
    marginBottom: SPACING.lg,
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  logoutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.error,
  },
  versionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    color: COLORS.lightTextMuted,
    textAlign: 'center',
  },
});
