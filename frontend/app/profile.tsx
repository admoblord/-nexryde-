import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

export default function ProfileRedirectScreen() {
  const router = useRouter();
  const storeReady = usePersistStoreReady();
  const { colors } = useThemeColors();
  const user = useAppStore((s) => s.user);
  const token = useAppStore((s) => s.token);

  useEffect(() => {
    if (!storeReady) return;
    if (!user?.id || !token) {
      router.replace('/(auth)/login');
      return;
    }
    if (user.role === 'driver') {
      router.replace('/(driver-tabs)/driver-profile');
    } else {
      router.replace('/(rider-tabs)/rider-profile');
    }
  }, [storeReady, user?.id, user?.role, token, router]);

  if (!storeReady) {
    return <AuthLoadingGate />;
  }

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
