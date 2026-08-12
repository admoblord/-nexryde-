import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/src/constants/theme';
import { useLanguage } from '@/src/i18n/LanguageContext';
import ActiveTripBar from '@/src/components/ActiveTripBar';
import { BACKEND_URL } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { warmTokenCache } from '@/src/lib/tokenStore';
import { useRiderRidePhaseNavigation } from '@/src/hooks/useRiderRidePhaseNavigation';
import { useWalletEnabled } from '@/src/services/clientConfig';
import { inboxSocket } from '@/src/services/inboxSocket';
import {
  buildTabScreenOptions,
  tabBadgeStyles,
  tabIconPillStyle,
} from '@/src/theme/tabBarChrome';

function NotifIcon({
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
    <View style={tabIconPillStyle(focused, isDark)}>
      <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={22} color={color} />
      {count > 0 && (
        <View style={tabBadgeStyles.badge}>
          <Text style={tabBadgeStyles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
        </View>
      )}
    </View>
  );
}

export default function RiderTabLayout() {
  const { t } = useLanguage();
  const { colors, isDark } = useThemeColors();
  const allowed = useRequireRole('rider');
  const hasHydrated = usePersistStoreReady();
  const walletEnabled = useWalletEnabled();
  const { userId } = useAuthedUserId();
  const [unreadCount, setUnreadCount] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void warmTokenCache();
  }, []);

  // Prefetch every tab's data after auth so second visits paint from cache.
  useEffect(() => {
    if (!allowed || !userId) return;
    void import('@/src/services/prefetchTabData').then(({ prefetchRiderTabs }) => {
      void prefetchRiderTabs(userId);
    });
  }, [allowed, userId]);

  const tabScreenOptions = useMemo(
    () =>
      buildTabScreenOptions({
        colors,
        isDark,
        bottomInset: insets.bottom,
      }),
    [colors, insets.bottom, isDark],
  );

  useEffect(() => {
    if (!allowed || !userId) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await authedFetch(
          `${BACKEND_URL}/api/users/${userId}/notifications?unread_only=true&limit=1&exclude_engagement=true`,
        );
        if (res.ok) {
          const data = await res.json();
          const count =
            data?.unread_count ??
            (Array.isArray(data?.notifications) ? data.notifications.length : 0);
          if (!cancelled) setUnreadCount(Number(count));
        }
      } catch {
        /* silent */
      }
    };
    void fetchUnread();
    inboxSocket.acquire(userId);
    const unsub = inboxSocket.subscribeBadge((msg) => {
      const excl = (msg as { unread_count_excl_engagement?: number }).unread_count_excl_engagement;
      const count = excl != null ? Number(excl) : Number(msg.unread_count) || 0;
      if (!cancelled) setUnreadCount(count);
    });
    return () => {
      cancelled = true;
      unsub();
      inboxSocket.release();
    };
  }, [allowed, userId]);

  useRiderRidePhaseNavigation();

  if (!hasHydrated || !allowed) return null;

  return (
    <>
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen
          name="rider-home"
          options={{
            title: t.tabs.home,
            tabBarIcon: ({ color, focused }) => (
              <View style={tabIconPillStyle(focused, isDark)}>
                <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="rider-trips"
          options={{
            title: t.tabs.trips,
            tabBarIcon: ({ color, focused }) => (
              <View style={tabIconPillStyle(focused, isDark)}>
                <Ionicons name={focused ? 'time' : 'time-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="rider-safety"
          options={{
            title: t.tabs.safety,
            tabBarIcon: ({ color, focused }) => (
              <View style={tabIconPillStyle(focused, isDark)}>
                <Ionicons
                  name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
                  size={22}
                  color={color}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="rider-wallet"
          options={{
            // Launch mode: fare wallet disabled — riders pay drivers directly.
            // href: null removes the tab without deleting the screen (flag-reversible).
            href: walletEnabled ? undefined : null,
            title: t.tabs.wallet,
            tabBarIcon: ({ color, focused }) => (
              <View style={tabIconPillStyle(focused, isDark)}>
                <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="rider-notifications"
          options={{
            title: t.tabs.updates,
            tabBarIcon: ({ color, focused }) => (
              <NotifIcon color={color} focused={focused} count={unreadCount} isDark={isDark} />
            ),
          }}
        />
        <Tabs.Screen
          name="rider-profile"
          options={{
            title: t.tabs.profile,
            tabBarIcon: ({ color, focused }) => (
              <View style={tabIconPillStyle(focused, isDark)}>
                <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
      <ActiveTripBar />
    </>
  );
}
