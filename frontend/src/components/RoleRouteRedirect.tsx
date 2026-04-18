import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';

type RoleRouteRedirectProps = {
  riderHref: string;
  driverHref: string;
  fallbackHref?: string;
};

export default function RoleRouteRedirect({
  riderHref,
  driverHref,
  fallbackHref = '/(auth)/login',
}: RoleRouteRedirectProps) {
  const router = useRouter();
  const user = useAppStore((state) => state.user);

  useEffect(() => {
    if (!user?.role) {
      router.replace(fallbackHref);
      return;
    }
    router.replace(user.role === 'driver' ? driverHref : riderHref);
  }, [driverHref, fallbackHref, riderHref, router, user?.role]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#22E180" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
