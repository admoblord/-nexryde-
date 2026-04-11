import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  SPACING,
  FONT_SIZE,
  BORDER_RADIUS,
  useThemeColors,
} from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { useLanguage } from '@/src/i18n/LanguageContext';
import type { SupportedLanguage } from '@/src/i18n/translations';
import {
  getUser,
  getUserPreferences,
  updateUserPreferences,
  updateUserTheme,
  toggleWomenOnlyMode,
} from '@/src/services/api';

type Variant = 'rider' | 'driver';

type ThemePref = 'light' | 'dark' | 'auto';

export function ProfileMergedPreferences({ variant }: { variant: Variant }) {
  const { user } = useAppStore();
  const { colors } = useThemeColors();
  const { language, setLanguage, availableLanguages } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [themePref, setThemePref] = useState<ThemePref>('auto');
  const [showLanguages, setShowLanguages] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [womenOnly, setWomenOnly] = useState(false);
  const [womenOnlyLoading, setWomenOnlyLoading] = useState(false);

  const showFemaleDriverRow =
    variant === 'rider' && (user?.gender || '').toLowerCase() === 'female';

  const checkBiometricSupport = useCallback(async () => {
    try {
      const { isBiometricSupported, isBiometricEnabled } = await import('@/utils/authStorage');
      const supported = await isBiometricSupported();
      const enabled = await isBiometricEnabled();
      setBiometricSupported(supported);
      setBiometricEnabled(enabled);
    } catch {
      setBiometricSupported(false);
    }
  }, []);

  const toggleBiometric = async (value: boolean) => {
    try {
      const { enableBiometricLogin, disableBiometricLogin, getBiometricTypes } =
        await import('@/utils/authStorage');

      if (value) {
        const types = await getBiometricTypes();
        const typeText = types.join(', ') || 'Biometric';

        Alert.alert(
          `Enable ${typeText}?`,
          `Use your ${typeText.toLowerCase()} to log in quickly and securely.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enable',
              onPress: async () => {
                const success = await enableBiometricLogin();
                if (success) {
                  setBiometricEnabled(true);
                  Alert.alert('Enabled', `${typeText} login is now active.`);
                } else {
                  Alert.alert('Failed', 'Could not enable biometric login.');
                }
              },
            },
          ]
        );
      } else {
        const success = await disableBiometricLogin();
        if (success) {
          setBiometricEnabled(false);
          Alert.alert('Disabled', 'Biometric login has been disabled.');
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to toggle biometric login.');
    }
  };

  const persistChannels = async (next: { push?: boolean; email?: boolean }) => {
    if (!user?.id) return;
    const push = next.push ?? pushEnabled;
    const email = next.email ?? emailEnabled;
    try {
      const res = await getUserPreferences(user.id);
      const prev = (res.data?.notification_channels || {}) as Record<string, boolean>;
      await updateUserPreferences(user.id, {
        notifications_enabled: push,
        notification_channels: {
          ...prev,
          push,
          email,
        },
      });
    } catch {
      Alert.alert('Error', 'Could not save notification preferences.');
    }
  };

  const applyTheme = async (next: ThemePref) => {
    setThemePref(next);
    if (!user?.id) return;
    try {
      await updateUserTheme(user.id, next);
    } catch {
      Alert.alert('Error', 'Could not save theme preference.');
    }
  };

  const selectLanguage = async (code: string) => {
    setShowLanguages(false);
    const lang = code as SupportedLanguage;
    try {
      await setLanguage(lang);
      if (user?.id) {
        await updateUserPreferences(user.id, { language: code });
      }
    } catch {
      Alert.alert('Error', 'Could not save language.');
    }
  };

  const onWomenOnlyChange = async (value: boolean) => {
    if (!user?.id) return;
    setWomenOnlyLoading(true);
    try {
      const res = await toggleWomenOnlyMode(user.id, value);
      setWomenOnly(Boolean(res.data?.women_only_mode));
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      Alert.alert('Could not update', typeof detail === 'string' ? detail : 'Try again later.');
    } finally {
      setWomenOnlyLoading(false);
    }
  };

  useEffect(() => {
    checkBiometricSupport();
  }, [checkBiometricSupport]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [prefRes, userRes] = await Promise.all([
          getUserPreferences(user.id),
          showFemaleDriverRow ? getUser(user.id) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const pref = prefRes.data || {};
        if (pref.theme === 'light' || pref.theme === 'dark' || pref.theme === 'auto') {
          setThemePref(pref.theme);
        }
        if (typeof pref.notifications_enabled === 'boolean') {
          setPushEnabled(pref.notifications_enabled);
        }
        const channels = pref.notification_channels || {};
        if (typeof channels.email === 'boolean') {
          setEmailEnabled(channels.email);
        }
        const serverLang = pref.language as SupportedLanguage | undefined;
        const codes: SupportedLanguage[] = ['en', 'pcm', 'yo', 'ig', 'ha'];
        if (serverLang && codes.includes(serverLang)) {
          await setLanguage(serverLang);
        }
        if (userRes?.data && typeof userRes.data.women_only_mode === 'boolean') {
          setWomenOnly(userRes.data.women_only_mode);
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, showFemaleDriverRow, setLanguage]);

  const currentLang =
    availableLanguages.find((l) => l.code === language) || availableLanguages[0];

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={COLORS.accentGreen} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading preferences…</Text>
      </View>
    );
  }

  return (
    <>
      {biometricSupported && (
        <View style={[styles.menuItem, { borderBottomColor: COLORS.gray100 }]}>
          <View style={[styles.menuIcon, { backgroundColor: COLORS.successSoft }]}>
            <Ionicons name="finger-print" size={20} color={COLORS.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: colors.text }]}>Biometric Login</Text>
            <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
              Use fingerprint or face to log in
            </Text>
          </View>
          <Switch
            value={biometricEnabled}
            onValueChange={toggleBiometric}
            trackColor={{ false: COLORS.gray200, true: COLORS.success + '50' }}
            thumbColor={biometricEnabled ? COLORS.success : COLORS.gray100}
          />
        </View>
      )}

      <View style={[styles.menuItem, { borderBottomColor: COLORS.gray100 }]}>
        <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
          <Ionicons name="notifications-outline" size={20} color={COLORS.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuText, { color: colors.text }]}>Push Notifications</Text>
          <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
            Alerts on this device
          </Text>
        </View>
        <Switch
          value={pushEnabled}
          onValueChange={(v) => {
            setPushEnabled(v);
            persistChannels({ push: v });
          }}
          trackColor={{ false: COLORS.gray200, true: COLORS.accent + '50' }}
          thumbColor={pushEnabled ? COLORS.accent : COLORS.gray100}
        />
      </View>

      <View style={[styles.menuItem, { borderBottomColor: COLORS.gray100 }]}>
        <View style={[styles.menuIcon, { backgroundColor: '#EDE9FE' }]}>
          <Ionicons name="mail-outline" size={20} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuText, { color: colors.text }]}>Email Updates</Text>
          <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
            Trip and account updates by email
          </Text>
        </View>
        <Switch
          value={emailEnabled}
          onValueChange={(v) => {
            setEmailEnabled(v);
            persistChannels({ email: v });
          }}
          trackColor={{ false: COLORS.gray200, true: COLORS.accent + '50' }}
          thumbColor={emailEnabled ? COLORS.accent : COLORS.gray100}
        />
      </View>

      <View style={[styles.block, { borderBottomColor: COLORS.gray100 }]}>
        <TouchableOpacity
          style={styles.languageHeader}
          onPress={() => setShowLanguages(!showLanguages)}
          accessibilityRole="button"
        >
          <View style={[styles.menuIcon, { backgroundColor: '#EDE9FE' }]}>
            <Ionicons name="globe-outline" size={20} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: colors.text, marginLeft: SPACING.md }]}>Language</Text>
            <Text style={[styles.menuSubtext, { marginLeft: SPACING.md, color: colors.textMuted }]}>
              {currentLang.flag} {currentLang.nativeName}
            </Text>
          </View>
          <Ionicons
            name={showLanguages ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={COLORS.gray400}
          />
        </TouchableOpacity>
        {showLanguages && (
          <View style={styles.languageList}>
            {availableLanguages.map((lang) => {
              const active = lang.code === language;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.languageItem, active && styles.languageItemActive]}
                  onPress={() => selectLanguage(lang.code)}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text
                    style={[
                      styles.languageName,
                      { color: active ? COLORS.accent : colors.text },
                    ]}
                  >
                    {lang.nativeName}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.themeBlock, { borderBottomColor: COLORS.gray100 }]}>
        <Text style={[styles.themeLabel, { color: colors.text }]}>Theme</Text>
        <View style={styles.themeRow}>
          {(
            [
              { key: 'light' as const, icon: 'sunny-outline' as const, label: 'Light' },
              { key: 'dark' as const, icon: 'moon-outline' as const, label: 'Dark' },
              { key: 'auto' as const, icon: 'phone-portrait-outline' as const, label: 'Auto' },
            ] as const
          ).map(({ key, icon, label }) => {
            const active = themePref === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.themeChip,
                  { borderColor: active ? COLORS.accent : colors.border, backgroundColor: colors.surface },
                  active && { backgroundColor: COLORS.accentSoft },
                ]}
                onPress={() => applyTheme(key)}
              >
                <Ionicons
                  name={icon}
                  size={18}
                  color={active ? COLORS.accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.themeChipText,
                    { color: active ? COLORS.accent : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {showFemaleDriverRow && (
        <View style={[styles.menuItem, { borderBottomWidth: 0 }]}>
          <View style={[styles.menuIcon, { backgroundColor: '#FCE7F3' }]}>
            <Ionicons name="woman-outline" size={20} color="#EC4899" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: colors.text }]}>Women-only drivers</Text>
            <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
              Prefer female drivers when available
            </Text>
          </View>
          {womenOnlyLoading ? (
            <ActivityIndicator color="#EC4899" />
          ) : (
            <Switch
              value={womenOnly}
              onValueChange={onWomenOnlyChange}
              trackColor={{ false: COLORS.gray200, true: '#EC489950' }}
              thumbColor={womenOnly ? '#EC4899' : COLORS.gray100}
            />
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  menuSubtext: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  block: {
    borderBottomWidth: 1,
  },
  languageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  languageList: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.xs,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.gray50,
  },
  languageItemActive: {
    backgroundColor: COLORS.accentSoft,
  },
  languageFlag: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  languageName: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  themeBlock: {
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  themeLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  themeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  themeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  themeChipText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
});
