import type { TripLatLng } from '@/src/utils/tripCoords';

export type TrackingRoutePoint = { latitude: number; longitude: number };

export type TrackingMapModel = {
  pickup: TripLatLng | null;
  dropoff: TripLatLng | null;
  driver: TripLatLng | null;
  driverHeading?: number | null;
  routePolyline: TrackingRoutePoint[];
  tripStatus: string;
  tripId: string;
  destinationAddress?: string | null;
  userLocation?: TripLatLng | null;
  distanceKm?: number | null;
  etaMinutes?: number | null;
};

export type TrackingDriverModel = {
  info: Record<string, unknown> | null;
  fareDisplay: string | null;
  callAllowed: boolean;
  isFavorite: boolean;
};

export type TrackingLiveModel = {
  serverEtaSeconds: number | null;
  distanceRemainingKm: number | null;
  trackingStatus: string | null;
  locationStale: boolean;
  wsConnected: boolean;
  etaMinutes: number | null;
  statusLabel: string;
  statusSubline: string;
};
