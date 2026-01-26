import { Stack } from 'expo-router';
import { COLORS } from '@/src/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
