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
 * High-frequency actions (2×2). Earnings already has a card above; more routes (heatmap, traffic, fleet) live in the hub.
 */
export function buildDriverPriorityFeatures(t: {
  home: { myTrips: string; support: string };
  wallet: { payment: string };
}): DriverHomeFeature[] {
  return [
    { id: 'trips', label: t.home.myTrips, icon: 'list-outline', route: DRIVER_TRIPS_TAB_HREF, color: HOME_PALETTE.accentIndigo },
    { id: 'bank', label: 'Bank & vault', icon: 'finger-print', route: '/driver/bank', color: COLORS.accentGreen },
    { id: 'subscription', label: t.wallet.payment, icon: 'card-outline', route: '/driver/subscription', color: COLORS.warning },
    { id: 'support', label: t.home.support, icon: 'help-circle-outline', route: '/support', color: COLORS.success },
  ];
}

/**
 * Compliance and vehicle—items not repeated in the hub. More tools: header hub (☰).
 */
export function buildDriverToolFeatures(t: {
  verification: { vehicleVerified: string; uploadDocuments: string };
  safety: { safetyTips: string };
  driver: { rating: string };
}): DriverHomeFeature[] {
  const vehicleLabel = t.verification.vehicleVerified.split(' ')[0] || 'Vehicle';
  const docLabel = t.verification.uploadDocuments.split(' ')[0] || 'Documents';
  const safetyLabel = t.safety.safetyTips.split(' ')[0] || 'Safety';
  return [
    { id: 'vehicle', label: vehicleLabel, icon: 'car-sport', route: '/driver/vehicle', color: COLORS.accentGreen },
    { id: 'documents', label: docLabel, icon: 'document-text', route: '/driver/documents', color: COLORS.warning },
    { id: 'performance', label: t.driver.rating, icon: 'analytics', route: '/driver/performance', color: HOME_PALETTE.accentIndigo },
    { id: 'safety-alerts', label: safetyLabel, icon: 'notifications', route: '/driver/safety-alerts', color: COLORS.error },
  ];
}
