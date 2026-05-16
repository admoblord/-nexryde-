import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { routeAuthedUser } from '@/src/utils/routeAuthedUser';

/**
 * Auth screens (login, register): after persist hydration, send signed-in users
 * to the correct tab home or onboarding step instead of showing the form.
 *
 * @returns `true` when the screen should render (guest or still hydrating).
 */
export function useRedirectIfAuthed(): boolean {
  const router = useRouter();
  const storeReady = usePersistStoreReady();
  const user = useAppStore((s) => s.user);
  const token = useAppStore((s) => s.token);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (!storeReady || !user?.id || !token || !isAuthenticated) return;
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    void routeAuthedUser(router, user, token).finally(() => {
      redirectingRef.current = false;
    });
  }, [storeReady, user?.id, user?.role, isAuthenticated, token, router]);

  if (!storeReady) return false;
  if (user?.id && token && isAuthenticated) return false;
  return true;
}
