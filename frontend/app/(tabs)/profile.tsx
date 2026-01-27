import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser, setIsAuthenticated } = useAppStore();
  const isDriver = user?.role === 'driver';

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => { setUser(null); setIsAuthenticated(false); router.replace('/(auth)/login'); } }
    ]);
  };

  const menuItems = [
    { icon: 'person-circle', label: 'Edit Profile', route: '/profile/edit', color: COLORS.accentGreen },
    { icon: 'shield-checkmark', label: 'Safety Center', route: '/(tabs)/safety', color: COLORS.accentBlue },
    { icon: 'wallet', label: isDriver ? 'Earnings' : 'Wallet', route: '/(tabs)/earnings', color: COLORS.gold },
    { icon: 'help-circle', label: 'Help & Support', subtitle: 'Get help with NEXRYDE', route: '/support', color: COLORS.info },
    { icon: 'document-text', label: 'Terms & Privacy', route: '/terms', color: COLORS.textSecondary },
    { icon: 'settings', label: 'Settings', route: '/settings', color: COLORS.textMuted },
  ];

  if (isDriver) {
    menuItems.splice(2, 0, { icon: 'ribbon', label: 'Driver Tier', route: '/driver/tiers', color: COLORS.gold });
    menuItems.splice(3, 0, { icon: 'card', label: 'Subscription', route: '/driver/subscription', color: COLORS.accentGreen });
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.primary, COLORS.background]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.glow, { top: 80, right: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { bottom: 200, left: 20, backgroundColor: COLORS.accentBlue, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <LinearGradient colors={[COLORS.accentGreen, COLORS.accentBlue]} style={styles.avatarGradient}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
              </LinearGradient>
              <View style={styles.onlineIndicator} />
            </View>
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userPhone}>{user?.phone || '+234 XXX XXX XXXX'}</Text>
            <View style={styles.roleBadge}>
              <View style={[styles.roleDot, { backgroundColor: isDriver ? COLORS.accentGreen : COLORS.accentBlue }]} />
              <Text style={[styles.roleText, { color: isDriver ? COLORS.accentGreen : COLORS.accentBlue }]}>{isDriver ? 'Driver' : 'Rider'}</Text>
            </View>
          </View>

          {/* Stats (For Drivers) */}
          {isDriver && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>4.9</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>2,847</Text>
                <Text style={styles.statLabel}>Trips</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>98%</Text>
                <Text style={styles.statLabel}>Completion</Text>
              </View>
            </View>
          )}

          {/* Menu Items */}
          <View style={styles.menuSection}>
            {menuItems.map((item, index) => (
              <TouchableOpacity key={index} style={styles.menuItem} onPress={() => item.route && router.push(item.route as any)} activeOpacity={0.8}>
                <View style={[styles.menuIcon, { backgroundColor: item.color + '20' }]}>
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                </View>
                <View style={styles.menuInfo}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  {item.subtitle && <Text style={styles.menuSubtitle}>{item.subtitle}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          {/* Version */}
          <Text style={styles.version}>NEXRYDE v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  glow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  profileHeader: { alignItems: 'center', paddingVertical: SPACING.xl },
  avatarContainer: { position: 'relative', marginBottom: SPACING.md },
  avatarGradient: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 40, fontWeight: '700', color: COLORS.white },
  onlineIndicator: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.accentGreen, borderWidth: 3, borderColor: COLORS.background },
  userName: { fontSize: FONT_SIZE.xxl, fontWeight: '800', color: COLORS.white, marginBottom: SPACING.xs },
  userPhone: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, marginBottom: SPACING.md },
  roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full, gap: SPACING.xs },
  roleDot: { width: 8, height: 8, borderRadius: 4 },
  roleText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  statsRow: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xxl, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.white },
  statLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: COLORS.surfaceLight },
  menuSection: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.surfaceLight, marginBottom: SPACING.lg },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceLight },
  menuIcon: { width: 44, height: 44, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  menuInfo: { flex: 1 },
  menuLabel: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  menuSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.errorSoft, borderRadius: BORDER_RADIUS.xl, paddingVertical: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.lg },
  logoutText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.error },
  version: { textAlign: 'center', fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
});