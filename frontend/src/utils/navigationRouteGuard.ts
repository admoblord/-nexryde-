import type { Router } from 'expo-router';
import { legalTermsRouteForRole } from '@/src/constants/legal';
import { safeReplace } from '@/src/utils/navigationSafe';

export type LegalTermsRole = 'rider' | 'driver';

const LEGAL_TERMS_SEGMENT: Record<LegalTermsRole, string> = {
  rider: 'rider-terms',
  driver: 'driver-terms',
};

/** Imperative active auth segment — set by terms/onboarding screens on mount. */
let activeAuthFlowSegment: string | null = null;

export function setActiveAuthFlowSegment(segment: string | null): void {
  activeAuthFlowSegment = segment;
}

export function getActiveAuthFlowSegment(): string | null {
  return activeAuthFlowSegment;
}

export function legalTermsSegmentForRole(role?: string): LegalTermsRole | null {
  if (role === 'driver') return 'driver';
  if (role === 'rider' || !role) return 'rider';
  return null;
}

export function isAlreadyOnLegalTermsRoute(role?: string, segments?: readonly string[]): boolean {
  const termsRole = legalTermsSegmentForRole(role);
  if (!termsRole) return false;
  const expected = LEGAL_TERMS_SEGMENT[termsRole];
  if (activeAuthFlowSegment === expected) return true;
  if (segments?.some((segment) => segment === expected)) return true;
  return false;
}

/**
 * Navigate to legal terms update screen only when not already viewing it.
 * Returns true if navigation was skipped (already on route).
 */
export function replaceLegalTermsIfNeeded(
  router: Pick<Router, 'replace'>,
  role?: string,
  segments?: readonly string[],
): boolean {
  if (isAlreadyOnLegalTermsRoute(role, segments)) {
    return true;
  }
  const termsRole = legalTermsSegmentForRole(role);
  if (!termsRole) return false;
  safeReplace(router, legalTermsRouteForRole(termsRole, 'update'));
  return false;
}
