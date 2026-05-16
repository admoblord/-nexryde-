import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useThemeColors } from '@/src/constants/theme';

export default function AuthLayout() {
  const { colors, isDark } = useThemeColors();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          gestureEnabled: true,
          ...(Platform.OS === 'ios' ? { fullScreenGestureEnabled: true } : {}),
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="verify" />
        <Stack.Screen name="register" />
        <Stack.Screen name="rider-nin" />
        <Stack.Screen name="rider-verification" />
        <Stack.Screen name="driver-terms" />
        <Stack.Screen name="driver-profile" />
        <Stack.Screen name="driver-documents" />
        <Stack.Screen name="driver-verification-status" />
      </Stack>
    </>
  );
}
