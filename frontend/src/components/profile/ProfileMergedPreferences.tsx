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
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/src/i18n/translations';
import {
  getUser,
  getUserPreferences,
  updateUserPreferences,
  updateUserTheme,
  toggleWomenOnlyMode,
} from '@/src/services/api';
import { DriverOfferSoundPreferences } from '@/src/components/profile/DriverOfferSoundPreferences';
import {
  applyThemePreference,
  persistThemePreference,
  loadStoredThemePreference,
  type ThemePreference,
} from '@/src/theme/appearanceTheme';

type Variant = 'rider' | 'driver';

type ThemePref = ThemePreference;

export function ProfileMergedPreferences({ variant }: { variant: Variant }) {
  const { user } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const { colors } = useThemeColors();
  const { language, setLanguage } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [themePref, setThemePref] = useState<ThemePref>('auto');
  const [showLanguages, setShowLanguages] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [womenOnly, setWomenOnly] = useState(false);
  const [womenOnlyLoading, setWomenOnlyLoading] = useState(false);
  const [pickupCodeEnabled, setPickupCodeEnabled] = useState(true);
  const [pickupCodeSaving, setPickupCodeSaving] = useState(false);

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
    if (!userId || !canCallAuthedApi) return;
    const push = next.push ?? pushEnabled;
    const email = next.email ?? emailEnabled;
    try {
      const res = await getUserPreferences(userId);
      const prev = (res.data?.notification_channels || {}) as Record<string, boolean>;
      await updateUserPreferences(userId, {
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
    const prev = themePref;
    setThemePref(next);
    applyThemePreference(next);
    try {
      await persistThemePreference(next);
    } catch {
      /* non-fatal — appearance already updated */
    }
    if (!userId || !canCallAuthedApi) return;
    try {
      await updateUserTheme(userId, next);
    } catch {
      setThemePref(prev);
      applyThemePreference(prev);
      try {
        await persistThemePreference(prev);
      } catch {
        /* ignore */
      }
      Alert.alert('Error', 'Could not save theme preference.');
    }
  };

  const selectLanguage = async (code: string) => {
    setShowLanguages(false);
    const lang = code as SupportedLanguage;
    try {
      await setLanguage(lang);
      if (userId && canCallAuthedApi) {
        await updateUserPreferences(userId, { language: code });
      }
    } catch {
      Alert.alert('Error', 'Could not save language.');
    }
  };

  const onWomenOnlyChange = async (value: boolean) => {
    if (!userId || !canCallAuthedApi) return;
    setWomenOnlyLoading(true);
    try {
      const res = await toggleWomenOnlyMode(userId, value);
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
    if (!userId || !canCallAuthedApi) {
      let alive = true;
      void (async () => {
        const stored = await loadStoredThemePreference();
        if (!alive) return;
        if (stored) {
          setThemePref(stored);
          applyThemePreference(stored);
        }
        setLoading(false);
      })();
      return () => {
        alive = false;
      };
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [prefRes, userRes] = await Promise.all([
          getUserPreferences(userId),
          showFemaleDriverRow ? getUser(userId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const pref = prefRes.data || {};
        if (pref.theme === 'light' || pref.theme === 'dark' || pref.theme === 'auto') {
          setThemePref(pref.theme);
          applyThemePreference(pref.theme);
          try {
            await persistThemePreference(pref.theme);
          } catch {
            /* ignore */
          }
        }
        if (typeof pref.notifications_enabled === 'boolean') {
          setPushEnabled(pref.notifications_enabled);
        }
        const channels = pref.notification_channels || {};
        if (typeof channels.email === 'boolean') {
          setEmailEnabled(channels.email);
        }
        const serverLang = pref.language as SupportedLanguage | undefined;
        const codes: SupportedLanguage[] = ['en', 'yo', 'ig', 'ha', 'pcm'];
        if (serverLang && codes.includes(serverLang)) {
          await setLanguage(serverLang);
        }
        if (userRes?.data && typeof userRes.data.women_only_mode === 'boolean') {
          setWomenOnly(userRes.data.women_only_mode);
        }
        if (typeof pref.pickup_code_enabled === 'boolean') {
          setPickupCodeEnabled(pref.pickup_code_enabled);
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
  }, [userId, canCallAuthedApi, showFemaleDriverRow, setLanguage]);

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

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

      {variant === 'driver' && <DriverOfferSoundPreferences />}

      {variant === 'rider' && (
        <View style={[styles.menuItem, { borderBottomColor: COLORS.gray100 }]}>
          <View style={[styles.menuIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
            <Ionicons name="keypad-outline" size={20} color={COLORS.accentGreen} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: colors.text }]}>Pickup code</Text>
            <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
              {pickupCodeEnabled
                ? 'Show a 4-digit code at pickup for your driver'
                : 'Off — driver can start without a code'}
            </Text>
          </View>
          <Switch
            value={pickupCodeEnabled}
            disabled={pickupCodeSaving}
            onValueChange={async (v) => {
              if (!userId || !canCallAuthedApi) return;
              setPickupCodeSaving(true);
              const prev = pickupCodeEnabled;
              setPickupCodeEnabled(v);
              try {
                await updateUserPreferences(userId, { pickup_code_enabled: v });
              } catch {
                setPickupCodeEnabled(prev);
                Alert.alert('Error', 'Could not save pickup code preference.');
              } finally {
                setPickupCodeSaving(false);
              }
            }}
            trackColor={{ false: COLORS.gray200, true: COLORS.accentGreen + '50' }}
            thumbColor={pickupCodeEnabled ? COLORS.accentGreen : COLORS.gray100}
          />
        </View>
      )}

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
              {currentLang.code === 'en' ? ' · UK' : ''}
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
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = lang.code === language;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.languageItem, active && styles.languageItemActive]}
                  onPress={() => selectLanguage(lang.code)}
                  accessibilityLabel={`${lang.nativeName}`}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <View style={styles.languageTextCol}>
                    <Text
                      style={[
                        styles.languageName,
                        { color: active ? COLORS.accentGreen : colors.text },
                      ]}
                    >
                      {lang.nativeName}
                    </Text>
                    {lang.code === 'en' ? (
                      <Text style={[styles.languageSub, { color: colors.textMuted }]}>United Kingdom</Text>
                    ) : lang.name !== lang.nativeName ? (
                      <Text style={[styles.languageSub, { color: colors.textMuted }]}>{lang.name}</Text>
                    ) : (
                      <Text style={[styles.languageSub, { color: colors.textMuted }]}>Nigeria</Text>
                    )}
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={22} color={COLORS.accentGreen} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.themeBlock, { borderBottomColor: colors.border }]}>
        <View style={styles.themeHeaderRow}>
          <View style={[styles.menuIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
            <Ionicons name="color-palette-outline" size={20} color={COLORS.accentBlue} />
          </View>
          <View style={styles.themeHeaderText}>
            <Text style={[styles.themeLabel, { color: colors.text }]}>Appearance</Text>
            <Text style={[styles.themeSubtitle, { color: colors.textMuted }]}>
              Light or dark look, or match your device setting.
            </Text>
          </View>
        </View>
        <View style={styles.themeRow}>
          {(
            [
              {
                key: 'light' as const,
                icon: 'sunny-outline' as const,
                label: 'Light',
                hint: 'Always bright',
              },
              {
                key: 'dark' as const,
                icon: 'moon-outline' as const,
                label: 'Dark',
                hint: 'Easier at night',
              },
              {
                key: 'auto' as const,
                icon: 'contrast-outline' as const,
                label: 'Auto',
                hint: 'Follow system',
              },
            ] as const
          ).map(({ key, icon, label, hint }) => {
            const active = themePref === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.themeChip,
                  {
                    borderColor: active ? COLORS.accentGreen : colors.border,
                    backgroundColor: active ? COLORS.accentGreenSoft : colors.surface,
                  },
                  active && styles.themeChipActive,
                ]}
                onPress={() => void applyTheme(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label}. ${hint}`}
              >
                <Ionicons
                  name={icon}
                  size={20}
                  color={active ? COLORS.accentGreen : colors.textMuted}
                />
                <Text
                  style={[
                    styles.themeChipText,
                    { color: active ? COLORS.accentGreen : colors.text },
                  ]}
                >
                  {label}
                </Text>
                <Text style={[styles.themeChipHint, { color: colors.textMuted }]} numberOfLines={1}>
                  {hint}
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
    backgroundColor: COLORS.accentGreenSoft,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
  },
  languageFlag: {
    fontSize: 22,
    marginRight: SPACING.md,
  },
  languageTextCol: {
    flex: 1,
  },
  languageName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  languageSub: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  themeBlock: {
    padding: SPACING.md,
    borderBottomWidth: 1,
  },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  themeHeaderText: {
    flex: 1,
    paddingTop: 2,
  },
  themeLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  themeSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 20,
  },
  themeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  themeChip: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
  },
  themeChipActive: {
    borderWidth: 2,
  },
  themeChipText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    marginTop: 4,
  },
  themeChipHint: {
    fontSize: FONT_SIZE.xxs,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});
