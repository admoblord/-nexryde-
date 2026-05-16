import { Stack } from 'expo-router';
import { useThemeColors } from '@/src/constants/theme';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import { AuthLoadingGate } from '@/src/components/AuthLoadingGate';

/**
 * Stack for all `app/driver/*.tsx` routes. Screens are file-discovered; we only set
 * global options (same pattern as `app/rider/_layout.tsx`).
 */
export default function DriverLayout() {
  const { colors } = useThemeColors();
  const roleOk = useRequireRole('driver');

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
