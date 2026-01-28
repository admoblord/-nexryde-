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
              await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
            } catch (error) {
              console.log('Logout API error:', error);
            }
            
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Profile Header Card */}
          <View style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              <LinearGradient
                colors={['#3AD173', '#2BA858']}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
              </LinearGradient>
              <View style={styles.onlineDot} />
            </View>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userPhone}>{user?.phone || user?.email || 'No contact info'}</Text>
            <View style={[styles.roleBadge, isDriver ? styles.driverBadge : styles.riderBadge]}>
              <Ionicons 
                name={isDriver ? "car" : "person"} 
                size={14} 
                color={isDriver ? "#3A8CD1" : "#3AD173"} 
              />
              <Text style={[styles.roleText, isDriver ? styles.driverText : styles.riderText]}>
                {isDriver ? 'Driver' : 'Rider'}
              </Text>
            </View>
          </View>

          {/* Account Section */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            <View style={styles.menuCard}>
              <MenuItem 
                icon="person" 
                label="Edit Profile" 
                subtitle="Update your personal information"
                onPress={() => {}}
                iconBg="#22C55E"
                iconColor="#FFFFFF"
              />
              <MenuItem 
                icon="time" 
                label="Ride History" 
                subtitle="View your past trips"
                onPress={() => router.push('/ride-history')}
                iconBg="#3B82F6"
                iconColor="#FFFFFF"
              />
              <MenuItem 
                icon="chatbubbles" 
                label="Messages" 
                subtitle="Chat with your driver"
                onPress={() => router.push('/chat')}
                iconBg="#8B5CF6"
                iconColor="#FFFFFF"
                isLast
              />
            </View>
          </View>

          {/* Safety & Payment Section */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>SAFETY & PAYMENT</Text>
            <View style={styles.menuCard}>
              <MenuItem 
                icon="shield-checkmark" 
                label="Safety Center" 
                subtitle="Emergency contacts & safety features"
                onPress={() => router.push('/safety')}
                iconBg="#EF4444"
                iconColor="#FFFFFF"
              />
              <MenuItem 
                icon="wallet" 
                label="Wallet" 
                subtitle="Payment methods & balance"
                onPress={() => {}}
                iconBg="#F59E0B"
                iconColor="#FFFFFF"
                isLast
              />
            </View>
          </View>

          {/* Support Section */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>SUPPORT</Text>
            <View style={styles.menuCard}>
              <MenuItem 
                icon="help-circle" 
                label="Help & Support" 
                subtitle="Get help with NEXRYDE"
                onPress={() => {}}
                iconBg="#06B6D4"
                iconColor="#FFFFFF"
              />
              <MenuItem 
                icon="document-text" 
                label="Terms & Privacy" 
                subtitle="Read our policies"
                onPress={() => {}}
                iconBg="#64748B"
                iconColor="#FFFFFF"
              />
              <MenuItem 
                icon="settings" 
                label="Settings" 
                subtitle="App preferences & notifications"
                onPress={() => {}}
                iconBg="#71717A"
                iconColor="#FFFFFF"
                isLast
              />
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <View style={styles.logoutIcon}>
              <Ionicons name="log-out-outline" size={22} color="#D32F2F" />
            </View>
            <Text style={styles.logoutText}>Log Out</Text>
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
  iconBg,
  iconColor,
  isLast = false
}: { 
  icon: string; 
  label: string; 
  subtitle?: string;
  onPress: () => void;
  iconBg: string;
  iconColor: string;
  isLast?: boolean;
}) => (
  <TouchableOpacity 
    style={[styles.menuItem, !isLast && styles.menuItemBorder]} 
    onPress={onPress} 
    activeOpacity={0.7}
  >
    <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
      <Ionicons name={icon as any} size={22} color={iconColor} />
    </View>
    <View style={styles.menuContent}>
      <Text style={styles.menuLabel}>{label}</Text>
      {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3AD173',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22C55E',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: SPACING.sm,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  riderBadge: {
    backgroundColor: '#DCFCE7',
  },
  driverBadge: {
    backgroundColor: '#DBEAFE',
  },
  roleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  riderText: {
    color: '#166534',
  },
  driverText: {
    color: '#1E40AF',
  },
  sectionContainer: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  menuSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  logoutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  versionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
