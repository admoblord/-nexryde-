import { BACKEND_URL } from './api';

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

export interface SafetyHeadline {
  title: string;
  url?: string;
  published_at?: string;
  source?: string;
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
  /** Live news rows when backend uses NewsAPI / GNews. */
  live_headlines?: SafetyHeadline[];
  headline_signal?: string;
  disclaimer?: string;
  geocode_label?: string;
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
  live_headlines?: SafetyHeadline[];
  headline_signal?: string;
  data_source?: string;
  disclaimer?: string;
}

async function fetchJson<T>(pathWithQuery: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${pathWithQuery}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchRealCrimeData(lat: number, lng: number): Promise<RealCrimeDataResponse | null> {
  const q = `?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`;
  return fetchJson<RealCrimeDataResponse>(`/api/safety/real-crime-data${q}`);
}

export async function fetchRouteSafety(params: {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
}): Promise<RouteSafetyResponse | null> {
  const q = new URLSearchParams({
    pickup_lat: String(params.pickup_lat),
    pickup_lng: String(params.pickup_lng),
    dropoff_lat: String(params.dropoff_lat),
    dropoff_lng: String(params.dropoff_lng),
  });
  return fetchJson<RouteSafetyResponse>(`/api/safety/route-safety?${q.toString()}`);
}
