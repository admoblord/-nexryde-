/**
 * Trips API Service - Real Backend Integration
 * Connects all trip-related screens to backend API
 */

import { BACKEND_URL } from '@/src/services/api';

export interface Trip {
  id: string;
  rider_id: string;
  driver_id?: string;
  pickup_location: string;
  destination: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  fare: number;
  distance_km?: number;
  duration_minutes?: number;
  driver_name?: string;
  driver_rating?: number;
  vehicle_type?: string;
  vehicle_plate?: string;
  created_at: string;
  completed_at?: string;
}

export interface Driver {
  id: string;
  name: string;
  rating: number;
  total_trips: number;
  vehicle_type: string;
  vehicle_plate: string;
  phone_number?: string;
}

/**
 * Fetch user's trip history
 */
export async function fetchUserTrips(userId: string, status?: string): Promise<Trip[]> {
  try {
    const url = `${BACKEND_URL}/api/trips/user/${userId}${status ? `?status=${status}` : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch trips:', response.status);
      return [];
    }

    const data = await response.json();
    return data.trips || [];
  } catch (error) {
    console.error('Error fetching trips:', error);
    return [];
  }
}

/**
 * Fetch completed trips only
 */
export async function fetchCompletedTrips(userId: string): Promise<Trip[]> {
  return fetchUserTrips(userId, 'completed');
}

/**
 * Fetch past drivers from completed trips
 */
export async function fetchPastDrivers(userId: string): Promise<Driver[]> {
  try {
    const url = `${BACKEND_URL}/api/users/${userId}/past-drivers`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch past drivers:', response.status);
      return [];
    }

    const data = await response.json();
    return data.drivers || [];
  } catch (error) {
    console.error('Error fetching past drivers:', error);
    return [];
  }
}

/**
 * Fetch driver details by ID
 */
export async function fetchDriverDetails(driverId: string): Promise<Driver | null> {
  try {
    const url = `${BACKEND_URL}/api/drivers/${driverId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch driver details:', response.status);
      return null;
    }

    const data = await response.json();
    return data.driver || null;
  } catch (error) {
    console.error('Error fetching driver details:', error);
    return null;
  }
}

/**
 * Fetch trip receipt details
 */
export async function fetchTripReceipt(tripId: string): Promise<any> {
  try {
    const url = `${BACKEND_URL}/api/trips/${tripId}/receipt`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch receipt:', response.status);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching receipt:', error);
    return null;
  }
}

/**
 * Get trip statistics for user
 */
export async function fetchTripStats(userId: string): Promise<any> {
  try {
    const url = `${BACKEND_URL}/api/users/${userId}/trip-stats`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch trip stats:', response.status);
      return { total: 0, completed: 0, cancelled: 0, total_spent: 0 };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching trip stats:', error);
    return { total: 0, completed: 0, cancelled: 0, total_spent: 0 };
  }
}
