import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pcm', name: 'Pidgin', flag: '🇳🇬' },
  { code: 'yo', name: 'Yorùbá', flag: '🇳🇬' },
  { code: 'ig', name: 'Igbo', flag: '🇳🇬' },
  { code: 'ha', name: 'Hausa', flag: '🇳🇬' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
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
    // In production, save to backend
  };

  const MenuItem = ({ icon, label, value, onPress, showArrow = true, rightComponent }: any) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuIconContainer}>
        <Ionicons name={icon} size={22} color="#6366F1" />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuLabel}>{label}</Text>
        {value && <Text style={styles.menuValue}>{value}</Text>}
      </View>
      {rightComponent}
      {showArrow && !rightComponent && (
        <Ionicons name="chevron-forward" size={20} color="#64748B" />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Appearance */}
          <Text style={styles.sectionTitle}>APPEARANCE</Text>
          <View style={styles.section}>
            <Text style={styles.themeLabel}>Theme</Text>
            <View style={styles.themeOptions}>
              {['light', 'dark', 'auto'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.themeBtn,
                    theme === t && styles.themeBtnActive
                  ]}
                  onPress={() => updateTheme(t)}
                >
                  <Ionicons 
                    name={t === 'light' ? 'sunny' : t === 'dark' ? 'moon' : 'phone-portrait'} 
                    size={20} 
                    color={theme === t ? '#FFFFFF' : '#94A3B8'} 
                  />
                  <Text style={[
                    styles.themeBtnText,
                    theme === t && styles.themeBtnTextActive
                  ]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Language */}
          <Text style={styles.sectionTitle}>LANGUAGE</Text>
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.languageSelector}
              onPress={() => setShowLanguages(!showLanguages)}
            >
              <View style={styles.languageSelected}>
                <Text style={styles.languageFlag}>
                  {LANGUAGES.find(l => l.code === language)?.flag}
                </Text>
                <Text style={styles.languageName}>
                  {LANGUAGES.find(l => l.code === language)?.name}
                </Text>
              </View>
              <Ionicons 
                name={showLanguages ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color="#64748B" 
              />
            </TouchableOpacity>
            
            {showLanguages && (
              <View style={styles.languageList}>
                {LANGUAGES.map(lang => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.languageOption,
                      language === lang.code && styles.languageOptionActive
                    ]}
                    onPress={() => selectLanguage(lang.code)}
                  >
                    <Text style={styles.languageFlag}>{lang.flag}</Text>
                    <Text style={[
                      styles.languageOptionText,
                      language === lang.code && styles.languageOptionTextActive
                    ]}>{lang.name}</Text>
                    {language === lang.code && (
                      <Ionicons name="checkmark" size={20} color="#00E676" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Preferences */}
          <Text style={styles.sectionTitle}>PREFERENCES</Text>
          <View style={styles.section}>
            <MenuItem
              icon="notifications"
              label="Push Notifications"
              showArrow={false}
              rightComponent={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{ false: '#475569', true: '#6366F1' }}
                  thumbColor={notifications ? '#FFFFFF' : '#94A3B8'}
                />
              }
            />
            
            <MenuItem
              icon="woman"
              label="Prefer Female Drivers"
              showArrow={false}
              rightComponent={
                <Switch
                  value={femaleDriverPref}
                  onValueChange={setFemaleDriverPref}
                  trackColor={{ false: '#475569', true: '#EC4899' }}
                  thumbColor={femaleDriverPref ? '#FFFFFF' : '#94A3B8'}
                />
              }
            />
          </View>

          {/* Account */}
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.section}>
            <MenuItem
              icon="gift"
              label="Rewards"
              value="₦0"
              onPress={() => router.push('/wallet')}
            />
            <MenuItem
              icon="card"
              label="Payment Methods"
              onPress={() => {}}
            />
            <MenuItem
              icon="shield-checkmark"
              label="Privacy & Security"
              onPress={() => {}}
            />
          </View>

          {/* Support */}
          <Text style={styles.sectionTitle}>SUPPORT</Text>
          <View style={styles.section}>
            <MenuItem
              icon="help-circle"
              label="Help Center"
              onPress={() => {}}
            />
            <MenuItem
              icon="chatbubble-ellipses"
              label="Contact Us"
              onPress={() => router.push('/chat')}
            />
            <MenuItem
              icon="document-text"
              label="Terms & Conditions"
              onPress={() => {}}
            />
          </View>

          {/* Danger Zone */}
          <TouchableOpacity style={styles.logoutBtn}>
            <Ionicons name="log-out" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  content: { flex: 1, padding: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 8,
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  themeLabel: { fontSize: 14, color: '#94A3B8', padding: 16, paddingBottom: 8 },
  themeOptions: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 4,
    gap: 8,
  },
  themeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    gap: 6,
  },
  themeBtnActive: { backgroundColor: '#6366F1' },
  themeBtnText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  themeBtnTextActive: { color: '#FFFFFF' },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  languageSelected: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  languageFlag: { fontSize: 24 },
  languageName: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  languageList: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  languageOptionActive: { backgroundColor: 'rgba(99,102,241,0.1)' },
  languageOptionText: { flex: 1, fontSize: 15, color: '#FFFFFF' },
  languageOptionTextActive: { color: '#A5B4FC' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
  menuValue: { fontSize: 13, color: '#64748B', marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
});
