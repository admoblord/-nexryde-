import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

export default function ProfileRedirectScreen() {
  const router = useRouter();
  const hasHydrated = usePersistStoreReady();
  const { colors } = useThemeColors();
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user?.id || !isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    if (user.role === 'driver') {
      router.replace('/(driver-tabs)/driver-profile');
    } else {
      router.replace('/(rider-tabs)/rider-profile');
    }
  }, [hasHydrated, user?.id, user?.role, isAuthenticated, router]);

  if (!hasHydrated) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#00D46A" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
