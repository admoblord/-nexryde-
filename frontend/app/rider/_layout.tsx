import { Stack } from 'expo-router';
import { useThemeColors } from '@/src/constants/theme';
import useActiveTripCoordinator from '@/src/hooks/useActiveTripCoordinator';
import usePanicShakeGuard from '@/src/hooks/usePanicShakeGuard';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

export default function RiderLayout() {
  usePanicShakeGuard();
  useActiveTripCoordinator();
  const { colors } = useThemeColors();
  const roleOk = useRequireRole('rider');

  if (!roleOk) {
    return <AuthLoadingGate />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
