import { BACKEND_URL } from '@/src/services/api';
import { getValidToken } from '@/src/lib/tokenStore';
import { useAppStore, type User } from '@/src/store/appStore';
import {
  NEXRYDE_PRIVACY_VERSION,
  NEXRYDE_TERMS_VERSION,
  userNeedsLegalAcceptance,
  type LegalAwareUser,
} from '@/src/constants/legal';
import { saveUserSession, getUserSession } from '@/utils/authStorage';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';

export type UserLegalStatus = {
  user_id: string;
  role?: string;
  terms_accepted: boolean;
  terms_version: string | null;
  terms_accepted_at: string | null;
  privacy_accepted: boolean;
  privacy_version: string | null;
  privacy_accepted_at: string | null;
  current_terms_version: string;
  current_privacy_version: string;
  legal_current: boolean;
};

let lastSyncKey: string | null = null;
let lastSyncAt = 0;
const SYNC_TTL_MS = 30_000;

export function legalFieldsFromStatus(status: UserLegalStatus): LegalAwareUser {
  return {
    terms_accepted: status.terms_accepted,
    terms_version: status.terms_version,
    privacy_accepted: status.privacy_accepted,
    privacy_version: status.privacy_version,
  };
}

export function logLegalGateCheck(
  user: LegalAwareUser | null | undefined,
  source: string,
): boolean {
  const acceptedVersion = (user?.terms_version || '').trim();
  const privacyVersion = (user?.privacy_version || '').trim();
  const needs = userNeedsLegalAcceptance(user);
  console.log('[LEGAL_GATE]', {
    source,
    needs,
    terms_accepted: user?.terms_accepted ?? null,
    accepted_terms_version: acceptedVersion || null,
    current_terms_version: NEXRYDE_TERMS_VERSION,
    privacy_accepted: user?.privacy_accepted ?? null,
    accepted_privacy_version: privacyVersion || null,
    current_privacy_version: NEXRYDE_PRIVACY_VERSION,
  });
  return needs;
}

export async function fetchUserLegalStatus(userId: string): Promise<UserLegalStatus | null> {
  const token = await getValidToken();
  if (!token) return null;

  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/api/users/${userId}/legal-status`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeoutMs: 8000,
    });
    if (!res.ok) return null;
    return (await res.json()) as UserLegalStatus;
  } catch {
    return null;
  }
}

/** Merge server legal status into Zustand + SecureStore. Server is source of truth. */
export async function syncUserLegalStatus(
  userId: string,
  options?: { force?: boolean },
): Promise<LegalAwareUser | null> {
  const cacheKey = `${userId}`;
  const now = Date.now();
  if (
    !options?.force &&
    lastSyncKey === cacheKey &&
    now - lastSyncAt < SYNC_TTL_MS
  ) {
    const cached = useAppStore.getState().user;
    if (cached?.id === userId) {
      return cached;
    }
  }

  const status = await fetchUserLegalStatus(userId);
  if (!status) return null;

  lastSyncKey = cacheKey;
  lastSyncAt = now;

  const store = useAppStore.getState();
  const current = store.user;
  if (!current || current.id !== userId) {
    return legalFieldsFromStatus(status);
  }

  const merged: User = {
    ...current,
    terms_accepted: status.terms_accepted,
    terms_version: status.terms_version,
    terms_accepted_at: status.terms_accepted_at,
    privacy_accepted: status.privacy_accepted,
    privacy_version: status.privacy_version,
    privacy_accepted_at: status.privacy_accepted_at,
  };

  store.setUser(merged);

  const token = await getValidToken();
  const session = await getUserSession().catch(() => null);

  await saveUserSession({
    ...merged,
    token: token ?? undefined,
    ...(session?.refresh_token ? { refresh_token: session.refresh_token } : {}),
  });

  console.log('[LEGAL_SYNC]', {
    userId,
    legal_current: status.legal_current,
    terms_version: status.terms_version,
    current_terms_version: status.current_terms_version,
  });

  return merged;
}
