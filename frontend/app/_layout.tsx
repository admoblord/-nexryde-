// Fix for react-native-google-places-autocomplete web compatibility
import 'react-native-get-random-values';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '@/src/constants/theme';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { LanguageProvider } from '@/src/i18n/LanguageContext';
import React from 'react';

export default function RootLayout() {
  try {
    return (
      <ErrorBoundary>
        <LanguageProvider>
          <GestureHandlerRootView style={styles.container}>
            <SafeAreaProvider>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: COLORS.background },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(rider-tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(driver-tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="driver" options={{ headerShown: false }} />
                <Stack.Screen name="rider" options={{ headerShown: false }} />
                <Stack.Screen name="assistant" options={{ headerShown: false }} />
              </Stack>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </LanguageProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    console.error('🚨 CRITICAL ERROR IN ROOT LAYOUT:', error);
    // Fallback UI
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020617' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          App Failed to Load
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 }}>
          Please restart the app. If this persists, reinstall the app.
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
