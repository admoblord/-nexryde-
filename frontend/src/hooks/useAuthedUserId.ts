import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';

/**
 * After persist hydration + JWT: exposes `userId` for authenticated API calls.
 * Undefined until safe to attach Authorization headers.
 */
export function useAuthedUserId() {
  const user = useAppStore((s) => s.user);
  const token = useAppStore((s) => s.token);
  const { canCallAuthedApi, storeReady } = useAuthedApiReady();
  const userId = canCallAuthedApi ? user?.id : undefined;

  return { user, userId, token, canCallAuthedApi, storeReady };
}
