import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/src/constants/theme';
import { useLanguage } from '@/src/i18n/LanguageContext';
import useActiveTripCoordinator from '@/src/hooks/useActiveTripCoordinator';
import ActiveTripBar from '@/src/components/ActiveTripBar';
import { DriverTripLocationBridge } from '@/src/components/driver/DriverTripLocationBridge';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { warmTokenCache } from '@/src/lib/tokenStore';
import { setForegroundInterval } from '@/src/utils/foregroundInterval';
import {
  buildTabScreenOptions,
  tabBadgeStyles,
  tabIconPillStyle,
} from '@/src/theme/tabBarChrome';

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

export default function DriverTabLayout() {
  const { t } = useLanguage();
  const { colors, isDark } = useThemeColors();
  const allowed = useRequireRole('driver');
  const hasHydrated = usePersistStoreReady();
  // Scoped selector — the tab layout only cares about online state; a
  // whole-store subscription re-rendered all tab chrome on every store tick.
  const isDriverOnline = useAppStore((s) => s.isOnline);
  const { userId } = useAuthedUserId();
  const [unreadCount, setUnreadCount] = useState(0);
  const insets = useSafeAreaInsets();
  useActiveTripCoordinator();

  useEffect(() => {
    void warmTokenCache();
  }, []);

  // Warm durable verification fact into memory + display store before Home mounts.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { readDriverBootCache } = await import('@/src/services/driverBootCache');
        const { useDriverDisplayStore } = await import('@/src/store/driverDisplayStore');
        const snap = await readDriverBootCache(userId);
        if (cancelled || !snap?.verificationStatus) return;
        useDriverDisplayStore.getState().setDriverDisplay({
          driverId: userId,
          verificationStatus: snap.verificationStatus,
          subscriptionStatus: snap.subscriptionStatus,
          trialTripsCompleted: snap.trialTripsCompleted,
          trialTripsTarget: snap.trialTripsTarget,
          trialExtended: snap.trialExtended,
          displayHydrated: true,
        });
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const tabScreenOptions = useMemo(
    () =>
      buildTabScreenOptions({
        colors,
        isDark,
        bottomInset: insets.bottom,
        hidden: isDriverOnline,
      }),
    [colors, insets.bottom, isDark, isDriverOnline],
  );

  useEffect(() => {
    if (!allowed || !userId) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const res = await authedFetch(
          `${BACKEND_URL}/api/users/${userId}/notifications?unread_only=true&limit=1`,
        );
        if (res.ok) {
          const data = await res.json();
          const count =
            data?.unread_count ??
            (Array.isArray(data?.notifications) ? data.notifications.length : 0);
          if (!cancelled) setUnreadCount(Number(count));
        }
      } catch {
        /* non-fatal */
      }
    };
    // Don't steal radio on first paint — home/online toggle need the network first.
    const stop = setForegroundInterval(() => {
      void fetchUnread();
    }, 30000, { runImmediately: false, runOnForeground: false });
    const warm = setTimeout(() => {
      if (!cancelled) void fetchUnread();
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(warm);
      stop();
    };
  }, [allowed, userId]);

  // Keep chrome painted while hydrating — blank null frame felt like a freeze after login.
  if (!hasHydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }
  if (!allowed) return null;

  return (
    <>
      <Tabs screenOptions={tabScreenOptions}>
        <Tabs.Screen
          name="driver-home"
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
          name="driver-earnings"
          options={{
            title: t.tabs.earnings,
            tabBarIcon: ({ color, focused }) => (
              <View style={tabIconPillStyle(focused, isDark)}>
                <Ionicons name={focused ? 'cash' : 'cash-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="driver-trips"
          options={{
            title: t.tabs.trips,
            tabBarIcon: ({ color, focused }) => (
              <View style={tabIconPillStyle(focused, isDark)}>
                <Ionicons name={focused ? 'car' : 'car-outline'} size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="driver-safety"
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
          name="driver-notifications"
          options={{
            title: t.tabs.updates,
            tabBarIcon: ({ color, focused }) => (
              <DriverNotifIcon
                color={color}
                focused={focused}
                count={unreadCount}
                isDark={isDark}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="driver-profile"
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
      <DriverTripLocationBridge />
      <ActiveTripBar />
    </>
  );
}
