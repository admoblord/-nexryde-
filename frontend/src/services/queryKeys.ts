/** Stable TanStack Query keys for rider + driver tabs. */
export const qk = {
  riderTrips: (uid: string) => ['rider', 'trips', uid] as const,
  riderSavedPlaces: (uid: string) => ['rider', 'saved-places', uid] as const,
  riderProfile: (uid: string) => ['rider', 'profile', uid] as const,
  riderNotifs: (uid: string) => ['rider', 'notifs', uid] as const,
  riderTrust: (uid: string) => ['rider', 'trust', uid] as const,
  driverEarnings: (uid: string, period: string) =>
    ['driver', 'earnings', uid, period] as const,
  driverTrips: (uid: string) => ['driver', 'trips', uid] as const,
  driverSubscription: (uid: string) => ['driver', 'subscription', uid] as const,
  driverWorkZone: (uid: string) => ['driver', 'work-zone', uid] as const,
  driverProfile: (uid: string) => ['driver', 'profile', uid] as const,
  driverNotifs: (uid: string) => ['driver', 'notifs', uid] as const,
};
