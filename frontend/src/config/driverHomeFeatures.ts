import { HOME_PALETTE } from '@/src/constants/designSystem';
import { COLORS } from '@/src/constants/theme';
import { DRIVER_TRIPS_TAB_HREF } from '@/src/constants/driverNavigation';

export type DriverHomeFeature = {
  id: string;
  label: string;
  icon: string;
  route: string;
  color: string;
};

/**
 * High-frequency actions (2×2).
 * My Trips, Bank & Vault, Smart Mode, Prayer Times are the daily-use core actions.
 * Payment / Support have been moved to the hub (☰) to keep the grid focused.
 */
export function buildDriverPriorityFeatures(_t: {
  home: { myTrips: string; support: string };
  wallet: { payment: string };
}): DriverHomeFeature[] {
  return [
    { id: 'trips', label: 'My Trips', icon: 'list-outline', route: DRIVER_TRIPS_TAB_HREF, color: HOME_PALETTE.accentIndigo },
    { id: 'bank', label: 'Bank & Vault', icon: 'finger-print', route: '/driver/bank', color: COLORS.accentGreen },
    { id: 'smart-mode', label: 'Smart Mode', icon: 'flash', route: '/driver/smart-mode', color: COLORS.warning },
    { id: 'prayer-times', label: 'Prayer Times', icon: 'moon', route: '/driver/prayer-times', color: HOME_PALETTE.accentIndigo },
  ];
}

/**
 * Compliance and awareness tools (2×2).
 * Vehicle / Documents stay for onboarding compliance.
 * Performance stays for rating visibility.
 * Driver Awareness shows live danger zones (real data).
 */
export function buildDriverToolFeatures(t: {
  verification: { vehicleVerified: string; uploadDocuments: string };
  safety: { safetyTips: string };
  driver: { rating: string };
}): DriverHomeFeature[] {
  const vehicleLabel = t.verification.vehicleVerified.split(' ')[0] || 'Vehicle';
  const docLabel = t.verification.uploadDocuments.split(' ')[0] || 'Documents';
  return [
    { id: 'work-zone', label: 'Work Zone', icon: 'map', route: '/driver/work-zone', color: '#22E5A0' },
    { id: 'vehicle', label: vehicleLabel, icon: 'car-sport', route: '/driver/vehicle', color: COLORS.accentGreen },
    { id: 'documents', label: docLabel, icon: 'document-text', route: '/driver/documents', color: COLORS.warning },
    { id: 'performance', label: t.driver.rating, icon: 'analytics', route: '/driver/performance', color: HOME_PALETTE.accentIndigo },
    { id: 'awareness', label: 'Driver Awareness', icon: 'eye', route: '/driver/safety-alerts', color: COLORS.error },
  ];
}
