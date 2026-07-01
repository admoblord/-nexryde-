import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useThemeColors } from '@/src/constants/theme';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { warmTokenCache } from '@/src/lib/tokenStore';

export default function DriverLayout() {
  const { colors } = useThemeColors();
  const allowed = useRequireRole('driver');
  const hasHydrated = usePersistStoreReady();

  useEffect(() => {
    void warmTokenCache();
  }, []);

  if (!hasHydrated || !allowed) return null;

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
