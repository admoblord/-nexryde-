import { normalizeTripStatus, type NormalizedTripStatus } from '@/src/utils/tripStatus';

/** Default rider payment at booking is cash. */
export function isCashPaymentMethod(paymentMethod?: string | null): boolean {
  const pm = String(paymentMethod ?? 'cash')
    .trim()
    .toLowerCase();
  if (!pm) return true;
  return pm === 'cash' || pm === 'cash_payment' || pm.startsWith('cash');
}

export function isWalletPaymentMethod(paymentMethod?: string | null): boolean {
  const pm = String(paymentMethod || '')
    .trim()
    .toLowerCase();
  return ['wallet', 'nexryde_wallet', 'in_app', 'in_app_wallet', 'balance', 'app_wallet'].includes(
    pm,
  );
}

/** True when trip ended but fare still needs in-app / wallet / transfer confirmation. */
export function riderFinancialPaymentPending(
  status?: string | null,
  paymentStatus?: string | null,
): boolean {
  const phase = normalizeTripStatus(status ?? undefined, paymentStatus ?? undefined);
  if (phase !== 'pending_payment') return false;
  const ps = String(paymentStatus || '').toLowerCase();
  return ps === 'pending' || ps === 'unpaid' || ps === '';
}

export type RiderTripDisplayOpts = {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  tripStatus?: string | null;
  financialPaymentPending?: boolean | null;
};

export function riderTripDisplayPhase(
  status?: string | null,
  paymentStatus?: string | null,
): NormalizedTripStatus {
  return normalizeTripStatus(status ?? undefined, paymentStatus ?? undefined);
}

/** Human label: cash, card, wallet, transfer */
export function formatPaymentMethodLabel(paymentMethod?: string | null): string {
  const pm = String(paymentMethod ?? 'cash')
    .trim()
    .toLowerCase();
  if (isCashPaymentMethod(pm)) return 'cash';
  if (isWalletPaymentMethod(pm)) return 'wallet';
  if (pm.includes('card') || pm === 'debit' || pm === 'credit' || pm === 'card') return 'card';
  if (pm === 'transfer' || pm === 'bank_transfer') return 'transfer';
  return pm || 'cash';
}

export type PaymentMetaDisplay = {
  line: string;
  color: string;
  methodLabel: string;
  statusLabel: string;
};

/** Fare card subtitle — method first; cash never shows misleading "pending" alone. */
export function formatPaymentMetaDisplay(
  paymentMethod?: string | null,
  paymentStatus?: string | null,
): PaymentMetaDisplay {
  const methodLabel = formatPaymentMethodLabel(paymentMethod);
  const ps = String(paymentStatus || '').trim().toLowerCase();
  const paid = ps === 'completed' || ps === 'paid';

  if (isCashPaymentMethod(methodLabel)) {
    return {
      methodLabel,
      statusLabel: paid ? 'paid' : 'cash',
      line: paid ? 'Payment · cash · paid' : 'Payment · cash',
      color: '#22C55E',
    };
  }
  if (isWalletPaymentMethod(methodLabel)) {
    return {
      methodLabel,
      statusLabel: paid ? 'paid' : ps || 'pending',
      line: paid ? 'Payment · wallet · paid' : `Payment · wallet${ps ? ` · ${ps}` : ''}`,
      color: paid ? '#22C55E' : '#FBBF24',
    };
  }
  if (methodLabel === 'card') {
    return {
      methodLabel,
      statusLabel: paid ? 'paid' : ps || 'pending',
      line: paid ? 'Payment · card · paid' : `Payment · card · ${ps || 'pending'}`,
      color: paid ? '#22C55E' : '#FBBF24',
    };
  }
  return {
    methodLabel,
    statusLabel: paid ? 'paid' : ps || 'pending',
    line: paid
      ? `Payment · ${methodLabel} · paid`
      : `Payment · ${methodLabel} · ${ps || 'pending'}`,
    color: paid ? '#22C55E' : '#94A3B8',
  };
}

export function paymentChecklistPayLabel(paymentMethod?: string | null): string {
  if (isCashPaymentMethod(paymentMethod)) return 'Confirm cash paid to driver';
  if (isWalletPaymentMethod(paymentMethod)) return 'Pay fare from wallet';
  if (formatPaymentMethodLabel(paymentMethod) === 'card') return 'Pay fare with card';
  return 'Pay fare or confirm payment';
}

export function paymentDockPayButtonLabel(paymentMethod?: string | null): string {
  if (isCashPaymentMethod(paymentMethod)) return 'Confirm cash & receipt';
  if (isWalletPaymentMethod(paymentMethod)) return 'Pay from wallet';
  return 'Pay & view receipt';
}
