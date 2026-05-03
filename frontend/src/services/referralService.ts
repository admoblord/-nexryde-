/**
 * Referral Service — handles pending referral storage, auto-apply, link building, and sharing.
 *
 * Identifiers stored in AsyncStorage can be:
 *   - A username slug  e.g. "funnybony"  (lowercase, from /invite/funnybony links)
 *   - A referral code  e.g. "NXABC12"   (uppercase, from ?code= links or manual entry)
 *
 * The backend's apply-referral-code endpoint accepts both formats.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { REFERRAL_CODE_STORAGE_KEY } from '@/app/_layout';
import { BACKEND_URL } from '@/src/services/api';

export const INVITE_BASE_URL = 'https://nexryde.app/invite';

/** Build the canonical invite URL.
 *  Username path preferred: https://nexryde.app/invite/funnybony
 *  Fallback query format:   https://nexryde.app/invite?code=NXABC12
 */
export function buildInviteUrl(username: string | null | undefined, code: string): string {
  if (username) return `${INVITE_BASE_URL}/${encodeURIComponent(username)}`;
  return `${INVITE_BASE_URL}?code=${encodeURIComponent(code)}`;
}

/** Build the full share message for a referral. */
export function buildShareMessage(
  username: string | null | undefined,
  code: string,
  senderName?: string,
): string {
  const url = buildInviteUrl(username, code);
  const handle = username || senderName?.split(' ')[0] || 'a friend';
  return (
    `🚗 Join Nexryde — Nigeria's smartest ride app!\n\n` +
    `Use ${handle}'s invite link and we BOTH earn ₦500 after your first ride:\n${url}`
  );
}

/** Open the native share sheet with the invite link. */
export async function shareInviteLink(
  username: string | null | undefined,
  code: string,
  senderName?: string,
): Promise<void> {
  const url = buildInviteUrl(username, code);
  const message = buildShareMessage(username, code, senderName);
  await Share.share({ message, url }, { dialogTitle: 'Invite to Nexryde' });
}

/** Read any pending referral identifier stored from a deep link. */
export async function getPendingReferralCode(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REFERRAL_CODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Clear the pending referral code after it has been applied. */
export async function clearPendingReferralCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REFERRAL_CODE_STORAGE_KEY);
  } catch { /* ignore */ }
}

export interface ReferrerInfo {
  referralCode: string;
  username: string;
  displayName: string;
}

/**
 * Resolve a pending referral identifier to human-readable info.
 * Used by the signup screen to display "You were invited by funnybony".
 * Does NOT require authentication.
 */
export async function resolvePendingReferrer(): Promise<ReferrerInfo | null> {
  try {
    const identifier = await getPendingReferralCode();
    if (!identifier) return null;

    const res = await fetch(
      `${BACKEND_URL}/api/incentives/resolve-identifier/${encodeURIComponent(identifier)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      referralCode: data.referral_code || '',
      username: data.username || '',
      displayName: data.display_name || data.username || '',
    };
  } catch {
    return null;
  }
}

/**
 * Auto-apply any pending referral identifier (username or code) for the
 * newly registered / logged-in user.
 * Silently ignores errors — referral must never block the auth flow.
 */
export async function autoApplyPendingReferral(
  userId: string,
  authToken: string,
): Promise<{ applied: boolean; referrerUsername?: string; referrerDisplay?: string }> {
  try {
    const identifier = await getPendingReferralCode();
    if (!identifier) return { applied: false };

    const res = await fetch(`${BACKEND_URL}/api/incentives/apply-referral-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ referral_code: identifier }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      await clearPendingReferralCode();
      return {
        applied: true,
        referrerUsername: data.referrer_username,
        referrerDisplay: data.referrer_display,
      };
    }
    // 400 "already applied" or "already has trips" — clear anyway, don't retry
    const body = await res.json().catch(() => ({}));
    const alreadyDone =
      res.status === 400 &&
      (String(body?.detail || '').includes('already') ||
        String(body?.detail || '').includes('first trip'));
    if (alreadyDone) await clearPendingReferralCode();
    return { applied: false };
  } catch {
    return { applied: false };
  }
}
