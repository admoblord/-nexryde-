import { Stack } from 'expo-router';
import { COLORS } from '../../src/constants/theme';

export default function RiderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="book" />
      <Stack.Screen name="tracking" />
    </Stack>
  );
}
