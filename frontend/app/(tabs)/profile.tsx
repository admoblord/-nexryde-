import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Card, Badge, Button } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { updateUser } from '@/src/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser, logout } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const isDriver = user?.role === 'driver';

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const response = await updateUser(user.id, {
        name: name.trim(),
        email: email.trim() || undefined,
      });
      setUser(response.data);
      setEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

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
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={COLORS.white} />
          </View>
          
          {editing ? (
            <View style={styles.editForm}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Full Name"
                placeholderTextColor={COLORS.gray400}
              />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email (Optional)"
                placeholderTextColor={COLORS.gray400}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <View style={styles.editButtons}>
                <Button
                  title="Cancel"
                  onPress={() => {
                    setName(user?.name || '');
                    setEmail(user?.email || '');
                    setEditing(false);
                  }}
                  variant="outline"
                  style={styles.editButton}
                />
                <Button
                  title="Save"
                  onPress={handleSave}
                  loading={saving}
                  style={styles.editButton}
                />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profilePhone}>{user?.phone}</Text>
              {user?.email && <Text style={styles.profileEmail}>{user.email}</Text>}
              <View style={styles.badges}>
                <Badge 
                  text={isDriver ? 'Driver' : 'Rider'} 
                  variant={isDriver ? 'success' : 'info'} 
                />
                {user?.is_verified && (
                  <Badge text="Verified" variant="success" />
                )}
              </View>
              <TouchableOpacity 
                style={styles.editProfileButton}
                onPress={() => setEditing(true)}
              >
                <Ionicons name="pencil" size={16} color={COLORS.primary} />
                <Text style={styles.editProfileText}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          )}
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Ionicons name="star" size={24} color={COLORS.accent} />
            <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="car" size={24} color={COLORS.primary} />
            <Text style={styles.statValue}>{user?.total_trips || 0}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </Card>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          {isDriver && (
            <>
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => router.push('/driver/subscription')}
              >
                <View style={[styles.menuIcon, { backgroundColor: COLORS.primary + '20' }]}>
                  <Ionicons name="card" size={20} color={COLORS.primary} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuTitle}>Subscription</Text>
                  <Text style={styles.menuSubtitle}>Manage your subscription</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => router.push('/driver/vehicle')}
              >
                <View style={[styles.menuIcon, { backgroundColor: COLORS.info + '20' }]}>
                  <Ionicons name="car-sport" size={20} color={COLORS.info} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuTitle}>Vehicle Details</Text>
                  <Text style={styles.menuSubtitle}>Manage vehicle info</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.menuItem}
                onPress={() => router.push('/driver/bank')}
              >
                <View style={[styles.menuIcon, { backgroundColor: COLORS.success + '20' }]}>
                  <Ionicons name="wallet" size={20} color={COLORS.success} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuTitle}>Bank Details</Text>
                  <Text style={styles.menuSubtitle}>Payment account info</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warning + '20' }]}>
              <Ionicons name="help-circle" size={20} color={COLORS.warning} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Help & Support</Text>
              <Text style={styles.menuSubtitle}>Get help with KODA</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray200 }]}>
              <Ionicons name="settings" size={20} color={COLORS.gray600} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Settings</Text>
              <Text style={styles.menuSubtitle}>App preferences</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>KODA v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  profileCard: {
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  profileName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  profilePhone: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  profileEmail: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  badges: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  editProfileText: {
    marginLeft: SPACING.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
  editForm: {
    width: '100%',
  },
  input: {
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  editButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  editButton: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.md,
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  menuSection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
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
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  menuTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  menuSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.error + '10',
    borderRadius: BORDER_RADIUS.lg,
  },
  logoutText: {
    marginLeft: SPACING.sm,
    color: COLORS.error,
    fontWeight: '600',
    fontSize: FONT_SIZE.md,
  },
  version: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.lg,
  },
});
