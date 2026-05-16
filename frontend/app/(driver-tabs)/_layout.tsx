import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_SIZE, SHADOWS, tabIconActivePillBg, useThemeColors } from '@/src/constants/theme';
import { BRAND } from '@/src/constants/designSystem';
import { useLanguage } from '@/src/i18n/LanguageContext';
import useActiveTripCoordinator from '@/src/hooks/useActiveTripCoordinator';
import ActiveTripBar from '@/src/components/ActiveTripBar';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { TAB_BAR_HEIGHT } from '@/src/hooks/useBottomPad';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

function DriverNotifIcon({
  color,
  focused,
  count,
  isDark,
}: {
  color: string;
  focused: boolean;
  count: number;
  isDark: boolean;
}) {
  return (
    <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
      <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={24} color={color} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      )}
    </View>
  );
}

export default function DriverTabLayout() {
  const { t } = useLanguage();
  const { colors, isDark } = useThemeColors();
  const roleOk = useRequireRole('driver');
  const { isOnline: isDriverOnline } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const [unreadCount, setUnreadCount] = useState(0);
  const insets = useSafeAreaInsets();
  useActiveTripCoordinator();

  const tabScreenOptions = useMemo(
    () => ({
      headerShown: false,
      tabBarActiveTintColor: BRAND.primaryNeon,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarHideOnKeyboard: true,
      tabBarStyle: isDriverOnline
        ? { display: 'none' as const }
        : {
            backgroundColor: colors.surface,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom + 4,
            paddingTop: 8,
            ...(isDark ? SHADOWS.lg : SHADOWS.md),
          },
      tabBarLabelStyle: {
        fontSize: FONT_SIZE.xxs,
        fontWeight: '700' as const,
        marginTop: 4,
      },
    }),
    [colors.border, colors.surface, colors.textMuted, insets.bottom, isDark, isDriverOnline],
  );

  useEffect(() => {
    if (!canCallAuthedApi || !userId) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/${userId}/notifications?unread_only=true&limit=1`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const count = data?.unread_count ?? (Array.isArray(data?.notifications) ? data.notifications.length : 0);
          if (!cancelled) setUnreadCount(Number(count));
        }
      } catch { /* silent */ }
    };
    fetchUnread();
    const iv = setInterval(fetchUnread, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [canCallAuthedApi, userId]);

  if (!roleOk) {
    return <AuthLoadingGate />;
  }

  return (
    <>
      <Tabs
        screenOptions={tabScreenOptions}
      >
        <Tabs.Screen
          name="driver-home"
          options={{
            title: t.tabs.home,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
                <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="driver-earnings"
          options={{
            title: t.tabs.earnings,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
                <Ionicons name={focused ? 'cash' : 'cash-outline'} size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="driver-trips"
          options={{
            title: t.tabs.trips,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
                <Ionicons name={focused ? 'car' : 'car-outline'} size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="driver-safety"
          options={{
            title: t.tabs.safety,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
                <Ionicons name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'} size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="driver-notifications"
          options={{
            title: t.tabs.updates,
            tabBarIcon: ({ color, focused }) => (
              <DriverNotifIcon color={color} focused={focused} count={unreadCount} isDark={isDark} />
            ),
          }}
        />
        <Tabs.Screen
          name="driver-profile"
          options={{
            title: t.tabs.profile,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
                <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
      <ActiveTripBar />
    </>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 30,
    borderRadius: 14,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
});
