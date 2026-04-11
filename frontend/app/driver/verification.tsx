import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS } from '@/src/constants/theme';

export default function DriverVerificationRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/driver/documents');
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.lightBackground }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    </SafeAreaView>
  );
}
