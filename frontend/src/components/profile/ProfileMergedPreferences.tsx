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
  toggleWomenOnlyMode,
} from '@/src/services/api';
import { DriverOfferSoundPreferences } from '@/src/components/profile/DriverOfferSoundPreferences';
import { tabCacheGet, tabCacheSet } from '@/src/services/tabDataCache';

type PrefCache = {
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  engagementEnabled?: boolean;
  promotionsEnabled?: boolean;
  pickupCodeEnabled?: boolean;
  womenOnly?: boolean;
};

type Variant = 'rider' | 'driver';

export function ProfileMergedPreferences({ variant }: { variant: Variant }) {
  const { user } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const { colors } = useThemeColors();
  const { language, setLanguage } = useLanguage();

  const prefCacheKey = userId ? `user-prefs:${variant}:${userId}` : '';
  const prefCached = userId ? tabCacheGet<PrefCache>(`user-prefs:${variant}:${userId}`) : null;
  const [showLanguages, setShowLanguages] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => prefCached?.pushEnabled ?? true);
  const [emailEnabled, setEmailEnabled] = useState(() => prefCached?.emailEnabled ?? true);
  const [engagementEnabled, setEngagementEnabled] = useState(() => prefCached?.engagementEnabled ?? true);
  const [promotionsEnabled, setPromotionsEnabled] = useState(() => prefCached?.promotionsEnabled ?? true);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [womenOnly, setWomenOnly] = useState(() => prefCached?.womenOnly ?? false);
  const [womenOnlyLoading, setWomenOnlyLoading] = useState(false);
  const [pickupCodeEnabled, setPickupCodeEnabled] = useState(() => prefCached?.pickupCodeEnabled ?? false);
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

  const persistNotificationTypes = async (next: { engagement?: boolean; promotions?: boolean }) => {
    if (!userId || !canCallAuthedApi) return;
    const engagement = next.engagement ?? engagementEnabled;
    const promotions = next.promotions ?? promotionsEnabled;
    try {
      const res = await getUserPreferences(userId);
      const prevTypes = (res.data?.notification_types || {}) as Record<string, boolean>;
      await updateUserPreferences(userId, {
        notification_types: {
          ...prevTypes,
          engagement,
          promotions,
          driver_engagement: variant === 'driver' ? engagement : prevTypes.driver_engagement ?? true,
          rider_engagement: variant === 'rider' ? engagement : prevTypes.rider_engagement ?? true,
        },
      });
    } catch {
      Alert.alert('Error', 'Could not save notification preferences.');
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
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [prefRes, userRes] = await Promise.all([
          getUserPreferences(userId),
          showFemaleDriverRow ? getUser(userId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const pref = prefRes.data || {};
        if (typeof pref.notifications_enabled === 'boolean') {
          setPushEnabled(pref.notifications_enabled);
        }
        const channels = pref.notification_channels || {};
        if (typeof channels.email === 'boolean') {
          setEmailEnabled(channels.email);
        }
        const types = pref.notification_types || {};
        if (typeof types.engagement === 'boolean') {
          setEngagementEnabled(types.engagement);
        } else if (variant === 'driver' && typeof types.driver_engagement === 'boolean') {
          setEngagementEnabled(types.driver_engagement);
        } else if (variant === 'rider' && typeof types.rider_engagement === 'boolean') {
          setEngagementEnabled(types.rider_engagement);
        }
        if (typeof types.promotions === 'boolean') {
          setPromotionsEnabled(types.promotions);
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
        if (prefCacheKey) {
          tabCacheSet(prefCacheKey, {
            pushEnabled: typeof pref.notifications_enabled === 'boolean' ? pref.notifications_enabled : true,
            emailEnabled: typeof (pref.notification_channels || {}).email === 'boolean'
              ? (pref.notification_channels || {}).email
              : true,
            engagementEnabled: typeof (pref.notification_types || {}).engagement === 'boolean'
              ? (pref.notification_types || {}).engagement
              : true,
            promotionsEnabled: typeof (pref.notification_types || {}).promotions === 'boolean'
              ? (pref.notification_types || {}).promotions
              : true,
            pickupCodeEnabled: typeof pref.pickup_code_enabled === 'boolean' ? pref.pickup_code_enabled : false,
            womenOnly: userRes?.data && typeof userRes.data.women_only_mode === 'boolean'
              ? userRes.data.women_only_mode
              : false,
          } satisfies PrefCache);
        }
      } catch {
        // keep defaults
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, canCallAuthedApi, showFemaleDriverRow, setLanguage, variant]);

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

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

      <View style={[styles.menuItem, { borderBottomColor: COLORS.gray100 }]}>
        <View style={[styles.menuIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
          <Ionicons name="sparkles-outline" size={20} color={COLORS.accentGreen} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.menuText, { color: colors.text }]}>Smart Reminders</Text>
          <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
            {variant === 'driver'
              ? 'Rush-hour and nearby demand nudges'
              : 'Commute and travel reminders'}
          </Text>
        </View>
        <Switch
          value={engagementEnabled}
          onValueChange={(v) => {
            setEngagementEnabled(v);
            persistNotificationTypes({ engagement: v });
          }}
          trackColor={{ false: COLORS.gray200, true: COLORS.accentGreen + '50' }}
          thumbColor={engagementEnabled ? COLORS.accentGreen : COLORS.gray100}
        />
      </View>

      {variant === 'rider' && (
        <View style={[styles.menuItem, { borderBottomColor: COLORS.gray100 }]}>
          <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
            <Ionicons name="pricetag-outline" size={20} color={COLORS.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.menuText, { color: colors.text }]}>Promotions</Text>
            <Text style={[styles.menuSubtext, { color: colors.textMuted }]}>
              Offers and future weather-based ride tips
            </Text>
          </View>
          <Switch
            value={promotionsEnabled}
            onValueChange={(v) => {
              setPromotionsEnabled(v);
              persistNotificationTypes({ promotions: v });
            }}
            trackColor={{ false: COLORS.gray200, true: COLORS.warning + '50' }}
            thumbColor={promotionsEnabled ? COLORS.warning : COLORS.gray100}
          />
        </View>
      )}

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
                ? 'On — show a 4-digit code at pickup for extra security'
                : 'Off — no code needed (recommended)'}
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
});
