import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: 'rider' | 'driver';
  is_verified: boolean;
  profile_image: string | null;
  rating: number;
  total_trips: number;
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
  status: 'pending' | 'accepted' | 'ongoing' | 'completed' | 'cancelled';
  payment_method: string;
  payment_status: string;
  rider_rating: number | null;
  driver_rating: number | null;
  created_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

interface AppState {
  // Auth
  user: User | null;
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
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
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
      
      logout: () => set({
        user: null,
        isAuthenticated: false,
        driverProfile: null,
        subscription: null,
        isOnline: false,
        currentTrip: null,
        pendingTrips: [],
        pickupLocation: null,
        dropoffLocation: null
      })
    }),
    {
      name: 'nexryde-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);
