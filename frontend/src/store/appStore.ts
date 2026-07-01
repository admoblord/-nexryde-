import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: 'rider' | 'driver' | 'admin';
  is_verified: boolean;
  profile_image: string | null;
  rating: number;
  /** How many trips include a driver→rider rating; used for trust / achievements. */
  rider_reputation_trip_count?: number;
  total_trips: number;
  trips_completed: number;
  completion_rate: number;
  cancellation_rate: number;
  online_hours: number;
  gender: string;
  vehicle_type: string | null;
  plate_number: string | null;
  is_online: boolean;
  created_at: string;
}

export interface DriverProfile {
  id: string;
  user_id: string;
  nin_verified: boolean;
  license_uploaded: boolean;
  vehicle_docs_uploaded: boolean;
  selfie_verified: boolean;
  vehicle_type: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color?: string | null;
  is_online: boolean;
  current_location: { lat: number; lng: number } | null;
  completion_rate: number;
  cancellation_count: number;
  rank: string;
}

export interface Subscription {
  id: string;
  driver_id: string;
  amount: number;
  status: 'active' | 'expired' | 'grace_period' | 'cancelled';
  start_date: string;
  end_date: string;
  payment_method: string | null;
  transaction_id: string | null;
}

export interface Trip {
  id: string;
  rider_id: string;
  driver_id: string | null;
  pickup_location: { lat: number; lng: number; address: string };
  dropoff_location: { lat: number; lng: number; address: string };
  distance_km: number;
  duration_mins: number;
  fare: number;
  surge_multiplier: number;
  status: 'pending' | 'pending_driver_offers' | 'accepted' | 'arrived' | 'ongoing' | 'pending_payment' | 'completed' | 'cancelled';
  payment_method: string;
  payment_status: string;
  rider_rating: number | null;
  driver_rating: number | null;
  created_at: string;
  accepted_at: string | null;
  /** Driver tapped "I've arrived" — waiting timer / rider notification */
  arrived_at?: string | null;
  started_at: string | null;
  completed_at: string | null;
  /** Rider estate gate auto-share (driver trip UI). */
  estate_gate_access?: {
    available?: boolean;
    gate_code?: string;
    estate_name?: string;
    /** ISO timestamp when code was shared with the driver */
    shared_at?: string | null;
    /** ISO timestamp when the code window expires */
    expires_at?: string | null;
    /** Whether the rider has saved a gate code in their preferences */
    has_saved_code?: boolean;
  };
  geo_fence_trip_lock?: Record<string, unknown> | null;
  speed_spike_alert?: Record<string, unknown> | null;
  gps_spoofing_alert?: Record<string, unknown> | null;
  invisible_shield_mode?: Record<string, unknown> | null;
  safe_arrival_check?: Record<string, unknown> | null;
  rider_face_verified_at_pickup?: boolean;
  face_verified_at_start?: boolean;
  pickup_code?: string;
  pickup_code_verified?: boolean;
  security_code_verified?: boolean;
  /** When false, driver can start without entering a code (rider preference at booking). */
  pickup_code_required?: boolean;
}

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Driver
  driverProfile: DriverProfile | null;
  subscription: Subscription | null;
  isOnline: boolean;
  
  // Trip
  currentTrip: Trip | null;
  pendingTrips: Trip[];
  
  // Location
  currentLocation: Location | null;
  pickupLocation: Location | null;
  dropoffLocation: Location | null;
  
  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (token: string | null) => void;
  setIsAuthenticated: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setDriverProfile: (profile: DriverProfile | null) => void;
  setSubscription: (subscription: Subscription | null) => void;
  setIsOnline: (value: boolean) => void;
  setCurrentTrip: (trip: Trip | null) => void;
  setPendingTrips: (trips: Trip[]) => void;
  setCurrentLocation: (location: Location | null) => void;
  setPickupLocation: (location: Location | null) => void;
  setDropoffLocation: (location: Location | null) => void;
  switchRole: () => void;
  logout: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      driverProfile: null,
      subscription: null,
      isOnline: false,
      currentTrip: null,
      pendingTrips: [],
      currentLocation: null,
      pickupLocation: null,
      dropoffLocation: null,
      
      // Actions
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      setIsAuthenticated: (value) => set({ isAuthenticated: value }),
      setIsLoading: (value) => set({ isLoading: value }),
      setDriverProfile: (profile) => set({ driverProfile: profile }),
      setSubscription: (subscription) => set({ subscription }),
      setIsOnline: (value) => set({ isOnline: value }),
      setCurrentTrip: (trip) => set({ currentTrip: trip }),
      setPendingTrips: (trips) => set({ pendingTrips: trips }),
      setCurrentLocation: (location) => set({ currentLocation: location }),
      setPickupLocation: (location) => set({ pickupLocation: location }),
      setDropoffLocation: (location) => set({ dropoffLocation: location }),
      
      switchRole: () => {
        const { user } = get();
        if (user) {
          set({
            user: {
              ...user,
              role: user.role === 'rider' ? 'driver' : 'rider'
            }
          });
        }
      },
      
      logout: async () => {
        try {
          const { getCachedToken } = await import('@/src/lib/tokenStore');
          const { clearTokens } = await import('@/src/lib/tokenStore');
          const refreshFromStore = await (async () => {
            try {
              const SecureStore = await import('expo-secure-store');
              return await SecureStore.getItemAsync('refresh_token');
            } catch {
              return null;
            }
          })();
          if (refreshFromStore) {
            try {
              const { BACKEND_URL } = await import('@/src/services/api');
              fetch(`${BACKEND_URL}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshFromStore }),
              }).catch(() => {});
            } catch {
              /* non-fatal */
            }
          }
          await clearTokens();
        } catch {
          /* non-fatal */
        }

        try {
          const { clearTripDriverCache } = await import('@/src/utils/tripDriverCache');
          clearTripDriverCache();
        } catch {
          /* non-fatal */
        }
        // Cancel scheduled offer notifications so they don't fire after logout
        try {
          const { cancelOfferNotifications } = await import('@/src/services/nexrydeScheduledNotifications');
          await cancelOfferNotifications();
        } catch {
          /* non-fatal */
        }

        // Clear SecureStore session
        try {
          const { clearUserSession } = await import('@/utils/authStorage');
          await clearUserSession();
        } catch {
          /* non-fatal */
        }
        
        // Clear store state
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          driverProfile: null,
          subscription: null,
          isOnline: false,
          currentTrip: null,
          pendingTrips: [],
          pickupLocation: null,
          dropoffLocation: null
        });
      }
    }),
    {
      name: 'nexryde-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        // token is intentionally excluded — kept in SecureStore only (see authStorage.ts).
        // Persisting JWT in AsyncStorage is insecure on rooted/jailbroken devices.
        isAuthenticated: state.isAuthenticated,
        currentTrip: state.currentTrip,
        isOnline: state.isOnline,
      }),
      onRehydrateStorage: () => () => {
        void import('@/src/lib/tokenStore').then(({ warmTokenCache }) => warmTokenCache());
      },
    }
  )
);
