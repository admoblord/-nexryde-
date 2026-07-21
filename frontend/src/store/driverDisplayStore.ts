/**
 * Single source of truth for driver verification/subscription DISPLAY.
 * Home and Profile must read the same values so they never disagree.
 * Entitlement (go-online) stays server-authoritative at tap time.
 */
import { create } from 'zustand';

type DriverDisplayState = {
  driverId: string | null;
  /** null = unknown (show Checking only when not locally approved). */
  verificationStatus: string | null;
  subscriptionStatus: string | null;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  /** True after local fact/cache hydrate for this driverId. */
  displayHydrated: boolean;
  setDriverDisplay: (partial: {
    driverId: string;
    verificationStatus?: string | null;
    subscriptionStatus?: string | null;
    trialTripsCompleted?: number;
    trialTripsTarget?: number;
    trialExtended?: boolean;
    displayHydrated?: boolean;
  }) => void;
  clearDriverDisplay: () => void;
};

export const useDriverDisplayStore = create<DriverDisplayState>((set) => ({
  driverId: null,
  verificationStatus: null,
  subscriptionStatus: null,
  trialTripsCompleted: 0,
  trialTripsTarget: 15,
  trialExtended: false,
  displayHydrated: false,
  setDriverDisplay: (partial) =>
    set((prev) => {
      if (prev.driverId && partial.driverId && prev.driverId !== partial.driverId) {
        return {
          driverId: partial.driverId,
          verificationStatus: partial.verificationStatus ?? null,
          subscriptionStatus: partial.subscriptionStatus ?? null,
          trialTripsCompleted: partial.trialTripsCompleted ?? 0,
          trialTripsTarget: partial.trialTripsTarget ?? 15,
          trialExtended: partial.trialExtended ?? false,
          displayHydrated: partial.displayHydrated ?? false,
        };
      }
      return {
        driverId: partial.driverId,
        verificationStatus:
          partial.verificationStatus !== undefined
            ? partial.verificationStatus
            : prev.verificationStatus,
        subscriptionStatus:
          partial.subscriptionStatus !== undefined
            ? partial.subscriptionStatus
            : prev.subscriptionStatus,
        trialTripsCompleted: partial.trialTripsCompleted ?? prev.trialTripsCompleted,
        trialTripsTarget: partial.trialTripsTarget ?? prev.trialTripsTarget,
        trialExtended: partial.trialExtended ?? prev.trialExtended,
        displayHydrated: partial.displayHydrated ?? prev.displayHydrated,
      };
    }),
  clearDriverDisplay: () =>
    set({
      driverId: null,
      verificationStatus: null,
      subscriptionStatus: null,
      trialTripsCompleted: 0,
      trialTripsTarget: 15,
      trialExtended: false,
      displayHydrated: false,
    }),
}));
