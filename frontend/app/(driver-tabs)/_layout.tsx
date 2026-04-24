import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZE, SHADOWS } from '@/src/constants/theme';
import { BRAND } from '@/src/constants/designSystem';
import { useLanguage } from '@/src/i18n/LanguageContext';
import useActiveTripCoordinator from '@/src/hooks/useActiveTripCoordinator';
import ActiveTripBar from '@/src/components/ActiveTripBar';

export default function DriverTabLayout() {
  const { t } = useLanguage();
  useActiveTripCoordinator();

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: BRAND.primaryNeon,
          tabBarInactiveTintColor: '#94A3B8',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E2E8F0',
            height: Platform.OS === 'ios' ? 88 : 68,
            paddingBottom: Platform.OS === 'ios' ? 28 : 12,
            paddingTop: 10,
            ...SHADOWS.lg,
          },
          tabBarLabelStyle: {
            fontSize: FONT_SIZE.xxs,
            fontWeight: '700',
            marginTop: 4,
          },
        }}
      >
        <Tabs.Screen
          name="driver-home"
          options={{
            title: t.tabs.home,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
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
              <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
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
              <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
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
              <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
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
              <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
                <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="driver-profile"
          options={{
            title: t.tabs.profile,
            tabBarIcon: ({ color, focused }) => (
              <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
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
  iconContainerActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
});
