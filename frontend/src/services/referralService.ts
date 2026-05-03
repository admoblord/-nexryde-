/**
 * Referral Service — handles pending referral code storage, auto-apply, and sharing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { REFERRAL_CODE_STORAGE_KEY } from '@/app/_layout';
import { BACKEND_URL } from '@/src/services/api';

export const INVITE_BASE_URL = 'https://nexryde.app/invite';

/** Build the canonical invite link for a code. */
export function buildInviteUrl(code: string): string {
  return `${INVITE_BASE_URL}?code=${encodeURIComponent(code)}`;
}

/** Build the full share message for a referral code. */
export function buildShareMessage(code: string, userName?: string): string {
  const url = buildInviteUrl(code);
  const greeting = userName ? `${userName.split(' ')[0]} is inviting you` : 'You\'re invited';
  return `🚗 ${greeting} to Nexryde — Nigeria's smartest ride app!\n\nUse my invite link and we BOTH earn ₦500 after your first ride:\n${url}`;
}

/** Open the native share sheet with the invite link. */
export async function shareInviteLink(code: string, userName?: string): Promise<void> {
  const url = buildInviteUrl(code);
  const message = buildShareMessage(code, userName);
  await Share.share({ message, url }, { dialogTitle: 'Invite to Nexryde' });
}

/** Read any pending referral code stored from a deep link. */
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

/**
 * Auto-apply any pending referral code for the newly registered / logged-in user.
 * Called once after successful registration or first login.
 * Silently ignores errors (referral is optional, must not block auth flow).
 */
export async function autoApplyPendingReferral(
  userId: string,
  authToken: string,
): Promise<{ applied: boolean; code?: string }> {
  try {
    const code = await getPendingReferralCode();
    if (!code) return { applied: false };

    const res = await fetch(`${BACKEND_URL}/api/incentives/apply-referral-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ referral_code: code }),
    });

    if (res.ok) {
      await clearPendingReferralCode();
      return { applied: true, code };
    }
    // 400 "already applied" or "already has trips" — clear anyway, don't retry
    const body = await res.json().catch(() => ({}));
    const alreadyDone = res.status === 400 && (
      String(body?.detail || '').includes('already') ||
      String(body?.detail || '').includes('first trip')
    );
    if (alreadyDone) await clearPendingReferralCode();
    return { applied: false };
  } catch {
    return { applied: false };
  }
}
