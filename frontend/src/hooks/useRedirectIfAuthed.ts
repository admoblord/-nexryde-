import { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';
import { usePersistStoreReady } from '@/src/hooks/usePersistStoreReady';
import { routeAuthedUser } from '@/src/utils/routeAuthedUser';
import { isAuthFlowScreen } from '@/src/constants/authFlowScreens';

/**
 * Auth screens: after persist hydration, send signed-in users to home.
 * Skips redirect on onboarding/legal screens so terms and verification stay stable.
 */
export function useRedirectIfAuthed(): boolean {
  const router = useRouter();
  const segments = useSegments();
  const storeReady = usePersistStoreReady();
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const redirectingRef = useRef(false);

  const onAuthFlowScreen = segments.some((segment) => isAuthFlowScreen(segment));

  useEffect(() => {
    if (!storeReady || !user?.id || !isAuthenticated) return;
    if (onAuthFlowScreen) return;
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    void routeAuthedUser(router, user, null).finally(() => {
      redirectingRef.current = false;
    });
  }, [storeReady, user?.id, user?.role, isAuthenticated, router, onAuthFlowScreen]);

  // Show login chrome immediately — don't block the first frame on persist.
  if (!storeReady) return true;
  if (onAuthFlowScreen) return true;
  if (user?.id && isAuthenticated) return false;
  return true;
}
