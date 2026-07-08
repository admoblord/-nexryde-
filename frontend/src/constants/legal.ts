/** Must match backend legal_constants.CURRENT_TERMS_VERSION */
export const NEXRYDE_TERMS_VERSION = '2026-07-01';

/** Must match backend legal_constants.CURRENT_PRIVACY_VERSION */
export const NEXRYDE_PRIVACY_VERSION = '2026-07-01';

export type LegalAwareUser = {
  terms_accepted?: boolean | null;
  terms_version?: string | null;
  privacy_accepted?: boolean | null;
  privacy_version?: string | null;
};

/** True when user must review and accept current Terms + Privacy before using the app. */
export function userNeedsLegalAcceptance(user: LegalAwareUser | null | undefined): boolean {
  if (!user?.terms_accepted) return true;
  if ((user.terms_version || '').trim() !== NEXRYDE_TERMS_VERSION) return true;
  if (user.privacy_accepted === false) return true;
  if (user.privacy_accepted && (user.privacy_version || '').trim() !== NEXRYDE_PRIVACY_VERSION) {
    return true;
  }
  // Legacy: terms current before separate privacy tracking — allow through.
  if (!user.privacy_accepted && (user.terms_version || '').trim() === NEXRYDE_TERMS_VERSION) {
    return false;
  }
  if (!user.privacy_accepted) return true;
  return false;
}

/** @deprecated Use userNeedsLegalAcceptance */
export const riderNeedsTermsAcceptance = userNeedsLegalAcceptance;

/** Driver stale terms / privacy — same rules as riders. */
export const driverNeedsLegalAcceptance = userNeedsLegalAcceptance;

export function legalTermsRouteForRole(role?: string, mode: 'update' | 'signup' = 'update') {
  const pathname = role === 'driver' ? '/(auth)/driver-terms' : '/(auth)/rider-terms';
  return { pathname, params: { mode } };
}
