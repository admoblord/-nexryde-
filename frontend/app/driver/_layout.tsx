import { Stack } from 'expo-router';
import { COLORS } from '@/src/constants/theme';

export default function DriverLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="subscription" />
      <Stack.Screen name="trips" />
      <Stack.Screen name="vehicle" />
      <Stack.Screen name="bank" />
      <Stack.Screen name="community" options={{ title: 'Community' }} />
    </Stack>
  );
}
