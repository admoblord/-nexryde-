import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pcm', name: 'Pidgin', flag: '🇳🇬' },
  { code: 'yo', name: 'Yorùbá', flag: '🇳🇬' },
  { code: 'ig', name: 'Igbo', flag: '🇳🇬' },
  { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
];

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  primary: '#0F172A',
  green: '#22C55E',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  orange: '#F59E0B',
  red: '#EF4444',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAppStore();
  
  const [theme, setTheme] = useState('auto');
  const [language, setLanguage] = useState('en');
  const [notifications, setNotifications] = useState(true);
  const [femaleDriverPref, setFemaleDriverPref] = useState(false);
  const [showLanguages, setShowLanguages] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/${user.id}/preferences`);
      const data = await res.json();
      setTheme(data.theme || 'auto');
      setLanguage(data.language || 'en');
      setNotifications(data.notifications_enabled !== false);
    } catch (e) {
      console.error('Load preferences error:', e);
    }
  };

  const updateTheme = async (newTheme: string) => {
    setTheme(newTheme);
    if (!user?.id) return;
    try {
      await fetch(`${BACKEND_URL}/api/users/${user.id}/theme?theme=${newTheme}`, {
        method: 'PUT'
      });
    } catch (e) {
      console.error('Update theme error:', e);
    }
  };

  const selectLanguage = async (code: string) => {
    setLanguage(code);
    setShowLanguages(false);
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
            router.replace('/');
          }
        }
      ]
    );
  };

  const getCurrentLanguage = () => {
    return LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Profile Card */}
          <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/profile')}>
            <LinearGradient
              colors={[COLORS.green, COLORS.blue]}
              style={styles.profileAvatar}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.profileInitial}>{user?.name?.charAt(0) || 'U'}</Text>
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || 'User'}</Text>
              <Text style={styles.profilePhone}>{user?.phone || '+234 xxx xxx xxxx'}</Text>
            </View>
            <View style={styles.profileArrow}>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>

          {/* Appearance Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>APPEARANCE</Text>
            
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Theme</Text>
              <View style={styles.themeOptions}>
                <ThemeOption 
                  icon="sunny" 
                  label="Light" 
                  active={theme === 'light'} 
                  onPress={() => updateTheme('light')}
                  color={COLORS.orange}
                />
                <ThemeOption 
                  icon="moon" 
                  label="Dark" 
                  active={theme === 'dark'} 
                  onPress={() => updateTheme('dark')}
                  color={COLORS.purple}
                />
                <ThemeOption 
                  icon="phone-portrait" 
                  label="Auto" 
                  active={theme === 'auto'} 
                  onPress={() => updateTheme('auto')}
                  color={COLORS.blue}
                />
              </View>
            </View>
          </View>

          {/* Language Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>LANGUAGE</Text>
            
            <TouchableOpacity 
              style={styles.languageSelector}
              onPress={() => setShowLanguages(!showLanguages)}
            >
              <View style={styles.languageSelected}>
                <Text style={styles.languageFlag}>{getCurrentLanguage().flag}</Text>
                <Text style={styles.languageName}>{getCurrentLanguage().name}</Text>
              </View>
              <Ionicons 
                name={showLanguages ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={COLORS.textMuted} 
              />
            </TouchableOpacity>
            
            {showLanguages && (
              <View style={styles.languageList}>
                {LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.languageItem,
                      language === lang.code && styles.languageItemActive
                    ]}
                    onPress={() => selectLanguage(lang.code)}
                  >
                    <Text style={styles.languageItemFlag}>{lang.flag}</Text>
                    <Text style={[
                      styles.languageItemName,
                      language === lang.code && styles.languageItemNameActive
                    ]}>{lang.name}</Text>
                    {language === lang.code && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Notifications Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
            
            <View style={styles.card}>
              <SettingRow 
                icon="notifications" 
                label="Push Notifications" 
                color={COLORS.blue}
                rightComponent={
                  <Switch
                    value={notifications}
                    onValueChange={setNotifications}
                    trackColor={{ false: '#E2E8F0', true: COLORS.green + '50' }}
                    thumbColor={notifications ? COLORS.green : '#F1F5F9'}
                  />
                }
              />
              <View style={styles.divider} />
              <SettingRow 
                icon="mail" 
                label="Email Updates" 
                color={COLORS.purple}
                rightComponent={
                  <Switch
                    value={true}
                    onValueChange={() => {}}
                    trackColor={{ false: '#E2E8F0', true: COLORS.green + '50' }}
                    thumbColor={COLORS.green}
                  />
                }
              />
            </View>
          </View>

          {/* Preferences Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PREFERENCES</Text>
            
            <View style={styles.card}>
              <SettingRow 
                icon="woman" 
                label="Female Driver Preference" 
                subtitle="Request female drivers when available"
                color="#EC4899"
                rightComponent={
                  <Switch
                    value={femaleDriverPref}
                    onValueChange={setFemaleDriverPref}
                    trackColor={{ false: '#E2E8F0', true: '#EC4899' + '50' }}
                    thumbColor={femaleDriverPref ? '#EC4899' : '#F1F5F9'}
                  />
                }
              />
            </View>
          </View>

          {/* Quick Links Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MORE</Text>
            
            <View style={styles.card}>
              <SettingRow 
                icon="wallet" 
                label="Rewards" 
                color={COLORS.orange}
                onPress={() => router.push('/wallet')}
                showArrow
              />
              <View style={styles.divider} />
              <SettingRow 
                icon="time" 
                label="Ride History" 
                color={COLORS.blue}
                onPress={() => router.push('/ride-history')}
                showArrow
              />
              <View style={styles.divider} />
              <SettingRow 
                icon="shield-checkmark" 
                label="Safety Center" 
                color={COLORS.green}
                onPress={() => router.push('/safety')}
                showArrow
              />
              <View style={styles.divider} />
              <SettingRow 
                icon="help-circle" 
                label="Help & Support" 
                color={COLORS.purple}
                onPress={() => router.push('/chat')}
                showArrow
              />
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.red} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          {/* App Version */}
          <Text style={styles.versionText}>NEXRYDE v2.0.0</Text>
          
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const ThemeOption = ({ icon, label, active, onPress, color }: any) => (
  <TouchableOpacity 
    style={[styles.themeOption, active && { backgroundColor: color + '15', borderColor: color }]}
    onPress={onPress}
  >
    <Ionicons name={icon} size={24} color={active ? color : COLORS.textMuted} />
    <Text style={[styles.themeLabel, active && { color: color, fontWeight: '700' }]}>{label}</Text>
  </TouchableOpacity>
);

const SettingRow = ({ icon, label, subtitle, color, rightComponent, onPress, showArrow }: any) => (
  <TouchableOpacity style={styles.settingRow} onPress={onPress} disabled={!onPress}>
    <View style={[styles.settingIcon, { backgroundColor: color + '15' }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <View style={styles.settingContent}>
      <Text style={styles.settingLabel}>{label}</Text>
      {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
    </View>
    {rightComponent}
    {showArrow && <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.3,
  },
  scrollContent: {
    padding: 16,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 2,
  },
  profilePhone: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  profileArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 12,
    marginLeft: 12,
    marginTop: 12,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    paddingTop: 0,
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  themeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  languageSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageFlag: {
    fontSize: 24,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  languageList: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  languageItemActive: {
    backgroundColor: COLORS.green + '10',
  },
  languageItemFlag: {
    fontSize: 22,
  },
  languageItemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.primary,
  },
  languageItemNameActive: {
    fontWeight: '700',
    color: COLORS.green,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  settingSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 68,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.red + '10',
    padding: 16,
    borderRadius: 16,
    gap: 10,
    marginTop: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.red,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 24,
  },
});
