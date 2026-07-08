import { acceptTerms, formatApiDetail } from '@/src/services/api';
import {
  forceRefresh,
  getCachedToken,
  getValidToken,
  isAccessTokenValid,
  warmTokenCache,
} from '@/src/lib/tokenStore';
import { isAuthTokenFailure } from '@/src/utils/sessionRefresh';
import { useAppStore, type User } from '@/src/store/appStore';
import { syncUserLegalStatus } from '@/src/services/legalStatusSync';

export type TermsAcceptResult =
  | { ok: true; user: User; token: string | null }
  | { ok: false; reason: 'redirect_login' }
  | { ok: false; reason: 'in_flight' }
  | { ok: false; reason: 'no_user' }
  | { ok: false; reason: 'api_error'; message: string };

let termsAcceptInFlight = false;

async function clearSessionForLogin(): Promise<void> {
  console.log('[REDIRECT_LOGIN]');
  try {
    await useAppStore.getState().logout();
  } catch {
    /* non-fatal */
  }
}

async function resolveAccessToken(): Promise<{ token: string } | { redirectLogin: true }> {
  await warmTokenCache();
  const cached = getCachedToken();
  if (isAccessTokenValid(cached)) {
    console.log('[TOKEN_VALID]');
    return { token: cached! };
  }

  console.log('[TOKEN_REFRESH_START]');
  const refreshed = await forceRefresh();
  if (refreshed) {
    console.log('[TOKEN_REFRESH_SUCCESS]');
    return { token: refreshed };
  }

  console.log('[TOKEN_REFRESH_FAILED]');
  return { redirectLogin: true };
}

function isAlreadyAcceptedLocally(
  user: User | null | undefined,
  termsVersion: string,
  privacyVersion: string,
): boolean {
  return (
    user?.terms_accepted === true &&
    user?.terms_version === termsVersion &&
    user?.privacy_accepted === true &&
    user?.privacy_version === privacyVersion
  );
}

function isAlreadyAcceptedApiDetail(detail: unknown): boolean {
  const text = String(formatApiDetail(detail) || detail || '').toLowerCase();
  return (
    text.includes('already accepted') ||
    text.includes('terms already') ||
    text.includes('already recorded')
  );
}

function buildAcceptedUser(
  user: User | null | undefined,
  dataUser: User | undefined,
  termsVersion: string,
  privacyVersion: string,
): User {
  return (
    dataUser || {
      ...(user as User),
      terms_accepted: true,
      terms_version: termsVersion,
      privacy_accepted: true,
      privacy_version: privacyVersion,
    }
  );
}

/**
 * Authenticated terms update (mode=update). Uses SecureStore tokens — never Zustand token.
 * Refreshes expired access tokens before submit; redirects to login when refresh fails.
 */
export async function submitTermsAcceptanceUpdate(params: {
  userId: string;
  user: User | null | undefined;
  termsVersion: string;
  privacyVersion: string;
}): Promise<TermsAcceptResult> {
  if (termsAcceptInFlight) {
    return { ok: false, reason: 'in_flight' };
  }

  termsAcceptInFlight = true;
  const { userId, user, termsVersion, privacyVersion } = params;
  console.log('[TERMS_ACCEPT_START]', { userId });

  try {
    if (!userId) {
      await clearSessionForLogin();
      return { ok: false, reason: 'redirect_login' };
    }

    if (isAlreadyAcceptedLocally(user, termsVersion, privacyVersion)) {
      const token = (await getValidToken()) ?? getCachedToken();
      if (!token) {
        await clearSessionForLogin();
        return { ok: false, reason: 'redirect_login' };
      }
      console.log('[TERMS_ACCEPT_SUCCESS]', { alreadyAccepted: true });
      return { ok: true, user: user as User, token };
    }

    const auth = await resolveAccessToken();
    if ('redirectLogin' in auth) {
      await clearSessionForLogin();
      return { ok: false, reason: 'redirect_login' };
    }

    try {
      const res = await acceptTerms(userId, termsVersion, privacyVersion);
      const updated = buildAcceptedUser(user, res.data?.user, termsVersion, privacyVersion);
      const token = getCachedToken() ?? auth.token;
      console.log('[TERMS_ACCEPT_SUCCESS]');
      await syncUserLegalStatus(userId, { force: true });
      return { ok: true, user: updated, token };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;

      if (isAlreadyAcceptedApiDetail(detail)) {
        const updated = buildAcceptedUser(user, undefined, termsVersion, privacyVersion);
        const token = getCachedToken() ?? auth.token;
        console.log('[TERMS_ACCEPT_SUCCESS]', { alreadyAccepted: true });
        return { ok: true, user: updated, token };
      }

      if (status === 401 || isAuthTokenFailure(detail)) {
        await clearSessionForLogin();
        return { ok: false, reason: 'redirect_login' };
      }

      const message = formatApiDetail(detail) || 'Please try again.';
      console.log('[TERMS_ACCEPT_FAILED]', { status, message });
      return { ok: false, reason: 'api_error', message };
    }
  } finally {
    termsAcceptInFlight = false;
  }
}
