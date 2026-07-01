import { useAppStore } from '@/src/store/appStore';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';

/** Identity-based — token attaches lazily via authedFetch. */
export function useAuthedUserId() {
  const user = useAppStore((s) => s.user);
  const { canCallAuthedApi, storeReady, userId } = useAuthedApiReady();

  return { user, userId, canCallAuthedApi, storeReady };
}
