import React, { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, SHADOWS, tabIconActivePillBg, useThemeColors } from '@/src/constants/theme';
import { BRAND } from '@/src/constants/designSystem';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

export default function TabLayout() {
  const storeReady = usePersistStoreReady();
  const { colors, isDark } = useThemeColors();
  const { user } = useAppStore();
  const isDriver = user?.role === 'driver';

  const tabScreenOptions = useMemo(
    () => ({
      headerShown: false,
      tabBarActiveTintColor: BRAND.primaryNeon,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: {
        backgroundColor: colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        height: Platform.OS === 'ios' ? 88 : 68,
        paddingBottom: Platform.OS === 'ios' ? 28 : 12,
        paddingTop: 12,
        ...(isDark ? SHADOWS.lg : SHADOWS.md),
      },
      tabBarLabelStyle: {
        fontSize: FONT_SIZE.xxs,
        fontWeight: '600' as const,
        marginTop: 4,
      },
      tabBarIconStyle: {
        marginTop: 2,
      },
    }),
    [colors.border, colors.surface, colors.textMuted, isDark],
  );

  if (!storeReady) {
    return <AuthLoadingGate />;
  }

  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
              <Ionicons name={focused ? 'car' : 'car-outline'} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: 'Safety',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
              <Ionicons name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: isDriver ? 'Earnings' : 'Wallet',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
              <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && { backgroundColor: tabIconActivePillBg(isDark) }]}>
              <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 28,
    borderRadius: 14,
  },
});
