import AsyncStorage from '@react-native-async-storage/async-storage';

export type WalletCheckoutSession = {
  userId: string;
  transaction_ref: string;
  checkout_url: string;
  amount_ngn: number;
  savedAt: string;
};

const storageKey = (userId: string) => `@nexryde_wallet_checkout_v1_${userId}`;

export async function saveWalletCheckoutSession(session: WalletCheckoutSession): Promise<void> {
  await AsyncStorage.setItem(storageKey(session.userId), JSON.stringify(session));
}

export async function loadWalletCheckoutSession(userId: string): Promise<WalletCheckoutSession | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletCheckoutSession;
    if (
      !parsed ||
      typeof parsed.checkout_url !== 'string' ||
      typeof parsed.transaction_ref !== 'string' ||
      parsed.userId !== userId
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearWalletCheckoutSession(userId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(userId));
}

export type PendingCheckoutConflictDetail = {
  code?: string;
  message?: string;
  pending_amount_ngn?: number;
  transaction_ref?: string;
  checkout_url?: string;
};

export function parsePendingCheckoutConflict(detail: unknown): PendingCheckoutConflictDetail | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.checkout_url !== 'string') return null;
  return {
    code: typeof d.code === 'string' ? d.code : undefined,
    message: typeof d.message === 'string' ? d.message : undefined,
    pending_amount_ngn: typeof d.pending_amount_ngn === 'number' ? d.pending_amount_ngn : undefined,
    transaction_ref: typeof d.transaction_ref === 'string' ? d.transaction_ref : undefined,
    checkout_url: d.checkout_url,
  };
}
