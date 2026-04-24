/**
 * Consistent route params for driver onboarding (terms → documents → profile).
 * Always pass email when available so document and profile steps stay prefilled.
 */
export type DriverOnboardingUser = {
  id: string;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
};

export function driverTermsRouteParams(u: Pick<DriverOnboardingUser, 'phone' | 'name' | 'email'>) {
  return {
    phone: String(u.phone ?? ''),
    name: String(u.name ?? ''),
    email: String(u.email ?? ''),
  };
}

export function driverDocumentsRouteParams(u: DriverOnboardingUser) {
  return {
    driver_id: u.id,
    phone: String(u.phone ?? ''),
    name: String(u.name ?? ''),
    email: String(u.email ?? ''),
  };
}

export function driverProfileRouteParams(u: DriverOnboardingUser) {
  return {
    driver_id: u.id,
    phone: String(u.phone ?? ''),
    name: String(u.name ?? ''),
    email: String(u.email ?? ''),
  };
}
