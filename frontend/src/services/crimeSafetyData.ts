import api from './api';

export type TimeRiskLevel = 'low' | 'moderate' | 'high';
export type RouteRiskLevel = 'low' | 'moderate' | 'high';

export interface CrimeZoneBrief {
  area: string;
  lat: number;
  lng: number;
  risk: string;
  distance_km?: number;
  types?: string[];
  advice?: string;
  note?: string;
}

export interface RealCrimeDataResponse {
  city: string;
  location: { lat: number; lng: number };
  time_risk_level: TimeRiskLevel;
  current_hour_wat: number;
  nearby_high_risk_zones: CrimeZoneBrief[];
  nearby_safe_zones: CrimeZoneBrief[];
  general_advice: string;
  total_high_risk_zones: number;
  total_safe_zones: number;
  data_source?: string;
  last_updated?: string;
}

export interface RouteSafetyResponse {
  route_risk_level: RouteRiskLevel;
  risk_zones_on_route: Array<{
    area: string;
    lat: number;
    lng: number;
    risk: string;
    types?: string[];
    advice?: string;
  }>;
  risk_count: number;
  safety_tips: string[];
  city: string;
}

export async function fetchRealCrimeData(lat: number, lng: number): Promise<RealCrimeDataResponse | null> {
  try {
    const { data } = await api.get<RealCrimeDataResponse>('/safety/real-crime-data', {
      params: { lat, lng },
    });
    return data;
  } catch {
    return null;
  }
}

export async function fetchRouteSafety(params: {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
}): Promise<RouteSafetyResponse | null> {
  try {
    const { data } = await api.get<RouteSafetyResponse>('/safety/route-safety', { params });
    return data;
  } catch {
    return null;
  }
}
