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
 * Trip-critical shortcuts only (GO / map / earnings stay on home chrome).
 * Social, prayer, wellness, and smart-mode live in Settings or deep links — not the home grid.
 */
export function buildDriverPriorityFeatures(_t: {
  home: { myTrips: string; support: string };
  wallet: { payment: string };
}): DriverHomeFeature[] {
  return [
    { id: 'trips', label: 'My Trips', icon: 'list-outline', route: DRIVER_TRIPS_TAB_HREF, color: HOME_PALETTE.accentIndigo },
    { id: 'bank', label: 'Bank & Vault', icon: 'finger-print', route: '/driver/bank', color: COLORS.accentGreen },
    { id: 'heatmap', label: 'Heatmap', icon: 'flame', route: '/driver/heatmap', color: COLORS.warning },
    { id: 'work-zone', label: 'Work Zone', icon: 'map', route: '/driver/work-zone', color: '#22E5A0' },
  ];
}

/**
 * Compliance tools for onboarding / account health.
 */
export function buildDriverToolFeatures(t: {
  verification: { vehicleVerified: string; uploadDocuments: string };
  safety: { safetyTips: string };
  driver: { rating: string };
}): DriverHomeFeature[] {
  const vehicleLabel = t.verification.vehicleVerified.split(' ')[0] || 'Vehicle';
  const docLabel = t.verification.uploadDocuments.split(' ')[0] || 'Documents';
  return [
    { id: 'vehicle', label: vehicleLabel, icon: 'car-sport', route: '/driver/vehicle', color: COLORS.accentGreen },
    { id: 'documents', label: docLabel, icon: 'document-text', route: '/driver/documents', color: COLORS.warning },
    { id: 'performance', label: t.driver.rating, icon: 'analytics', route: '/driver/performance', color: HOME_PALETTE.accentIndigo },
    { id: 'awareness', label: 'Driver Awareness', icon: 'eye', route: '/driver/safety-alerts', color: COLORS.error },
  ];
}
