/** Rider favourite drivers — shared colours, copy, perks. */
export const RIDER_FAV_ACCENT = '#EC4899';
export const RIDER_FAV_ACCENT_DIM = '#9D174D';
export const RIDER_FAV_GRADIENT = ['#F472B6', '#EC4899', '#BE185D'] as const;
export const RIDER_FAV_GLOW = 'rgba(236,72,153,0.35)';

export const RIDER_FAV_PERK_SHORT = '~5% off when they accept your ride';
export const RIDER_FAV_PERK_DETAIL =
  'Priority matching when online, and about 5% off the fare when your favourite driver accepts.';

export type RiderFavoriteDriverRow = {
  id: string;
  name: string;
  rating: number;
  totalTrips: number;
  vehicle: string;
  plate: string;
  isOnline: boolean;
  profileImage?: string | null;
  ridesTogether?: number;
  totalSpent?: number;
};
