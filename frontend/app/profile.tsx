import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

export default function ProfileRedirectScreen() {
  const router = useRouter();
  const { user } = useAppStore();

  useEffect(() => {
    if (!user) return;
    if (user.role === 'driver') {
      router.replace('/(driver-tabs)/driver-profile');
    } else {
      router.replace('/(rider-tabs)/rider-profile');
    }
  }, [router, user]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.accentGreen} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
