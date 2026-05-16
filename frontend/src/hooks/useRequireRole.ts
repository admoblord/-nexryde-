import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';

type AppRole = 'rider' | 'driver';

/** Where to send a user who opened the wrong role’s shell. */
const OTHER_ROLE_HOME: Record<AppRole, string> = {
  rider: '/(driver-tabs)/driver-home',
  driver: '/(rider-tabs)/rider-home',
};

/**
 * After persist hydration: require `user.id` and `user.role === expected`.
 * Sends guests to login; wrong role to the other role’s tab home.
 */
export function useRequireRole(expected: AppRole): boolean {
  const router = useRouter();
  const storeReady = usePersistStoreReady();
  const user = useAppStore((s) => s.user);
  const userId = user?.id;
  const role = user?.role;
  const token = useAppStore((s) => s.token);

  useEffect(() => {
    if (!storeReady) return;
    if (!userId || !token) {
      router.replace('/(auth)/login');
      return;
    }
    if (role !== expected) {
      router.replace(OTHER_ROLE_HOME[expected] as any);
    }
  }, [storeReady, userId, token, role, expected, router]);

  return storeReady && !!userId && !!token && role === expected;
}
