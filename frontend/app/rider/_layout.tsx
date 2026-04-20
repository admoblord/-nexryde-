import { Stack } from 'expo-router';
import { COLORS } from '@/src/constants/theme';
import usePanicShakeGuard from '@/src/hooks/usePanicShakeGuard';

export default function RiderLayout() {
  usePanicShakeGuard();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
