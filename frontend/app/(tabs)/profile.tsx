import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function LegacyProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Route all legacy profile paths to the unified role-based profile route.
    router.replace('/profile');
  }, [router]);

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
