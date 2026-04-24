import { Stack } from 'expo-router';
import { COLORS } from '@/src/constants/theme';

/**
 * Stack for all `app/driver/*.tsx` routes. Screens are file-discovered; we only set
 * global options (same pattern as `app/rider/_layout.tsx`).
 */
export default function DriverLayout() {
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
