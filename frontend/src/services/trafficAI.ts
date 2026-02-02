/**
 * NEXRYDE AI Traffic Intelligence System
 * Real-time traffic updates, predictions, and route optimization
 */

export interface TrafficHotspot {
  id: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  severity: 'low' | 'moderate' | 'high' | 'severe';
  type: 'accident' | 'roadwork' | 'congestion' | 'event' | 'weather';
  delayMinutes: number;
  affectedRadius: number; // in meters
  startTime: Date;
  estimatedClearTime?: Date;
  description: string;
  verifiedReports: number;
  aiConfidence: number; // 0-100
}

export interface TrafficRoute {
  id: string;
  polyline: string;
  distance: number; // in meters
  durationWithoutTraffic: number; // in seconds
  durationWithTraffic: number; // in seconds
  trafficDelay: number; // in seconds
  trafficLevel: 'light' | 'moderate' | 'heavy' | 'severe';
  hotspots: TrafficHotspot[];
  toll: boolean;
  tollCost?: number;
  fuelConsumption: number; // liters
  aiScore: number; // 0-100 (best route)
  timeSavedVsAlternative?: number; // seconds
}

export interface TrafficPrediction {
  location: {
    latitude: number;
    longitude: number;
    name: string;
  };
  currentLevel: 'light' | 'moderate' | 'heavy' | 'severe';
  predictedLevel: 'light' | 'moderate' | 'heavy' | 'severe';
  predictionTime: Date;
  confidence: number; // 0-100
  factors: string[]; // ['rush hour', 'school zone', 'market day']
}

export interface TrafficAlert {
  id: string;
  type: 'avoid' | 'warning' | 'info' | 'update';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  location: string;
  distance: number; // meters from user
  timestamp: Date;
  actionRequired?: string;
  alternativeRoute?: TrafficRoute;
}

export class TrafficAI {
  // Traffic Severity Colors
  static readonly TRAFFIC_COLORS = {
    light: '#00D084',      // Green - Free flowing
    moderate: '#FFB800',   // Yellow - Moderate
    heavy: '#FF6B00',      // Orange - Heavy
    severe: '#FF0000',     // Red - Severe
  };

  // Traffic Severity Thresholds (delay in minutes)
  static readonly SEVERITY_THRESHOLDS = {
    light: 0,
    moderate: 5,
    heavy: 15,
    severe: 30,
  };

  /**
   * Get real-time traffic status for a location
   */
  static async getTrafficStatus(
    latitude: number,
    longitude: number,
    radius: number = 5000 // 5km default
  ): Promise<TrafficHotspot[]> {
    try {
      // In production, call backend API
      // const response = await fetch(`/api/traffic/hotspots?lat=${latitude}&lng=${longitude}&radius=${radius}`);
      // return response.json();

      // For now, return simulated data
      return this.simulateTrafficHotspots(latitude, longitude, radius);
    } catch (error) {
      console.error('Failed to get traffic status:', error);
      return [];
    }
  }

  /**
   * Get AI-optimized routes with traffic analysis
   */
  static async getOptimizedRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    preferences?: {
      avoidTolls?: boolean;
      avoidHighways?: boolean;
      prioritizeFuel?: boolean;
      prioritizeTime?: boolean;
    }
  ): Promise<TrafficRoute[]> {
    try {
      // In production, call backend AI service
      // const response = await fetch('/api/traffic/optimize-routes', {
      //   method: 'POST',
      //   body: JSON.stringify({ origin, destination, preferences }),
      // });
      // return response.json();

      // For now, return simulated routes
      return this.simulateOptimizedRoutes(origin, destination, preferences);
    } catch (error) {
      console.error('Failed to get optimized routes:', error);
      return [];
    }
  }

  /**
   * Get traffic predictions for the next hour
   */
  static async getTrafficPredictions(
    locations: Array<{ latitude: number; longitude: number; name: string }>
  ): Promise<TrafficPrediction[]> {
    try {
      // In production, call AI prediction service
      return this.simulateTrafficPredictions(locations);
    } catch (error) {
      console.error('Failed to get traffic predictions:', error);
      return [];
    }
  }

  /**
   * Get real-time traffic alerts for driver
   */
  static async getTrafficAlerts(
    driverId: string,
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number }
  ): Promise<TrafficAlert[]> {
    try {
      const hotspots = await this.getTrafficStatus(
        currentLocation.latitude,
        currentLocation.longitude,
        10000 // 10km radius
      );

      return this.generateAlertsFromHotspots(hotspots, currentLocation, destination);
    } catch (error) {
      console.error('Failed to get traffic alerts:', error);
      return [];
    }
  }

  /**
   * Calculate time saved by using AI route vs standard route
   */
  static calculateTimeSaved(aiRoute: TrafficRoute, standardDuration: number): number {
    return Math.max(0, standardDuration - aiRoute.durationWithTraffic);
  }

  /**
   * Get traffic level from delay minutes
   */
  static getTrafficLevel(delayMinutes: number): 'light' | 'moderate' | 'heavy' | 'severe' {
    if (delayMinutes < 5) return 'light';
    if (delayMinutes < 15) return 'moderate';
    if (delayMinutes < 30) return 'heavy';
    return 'severe';
  }

  /**
   * Format delay time for display
   */
  static formatDelay(delaySeconds: number): string {
    const minutes = Math.round(delaySeconds / 60);
    if (minutes < 1) return 'No delay';
    if (minutes === 1) return '1 min delay';
    if (minutes < 60) return `${minutes} mins delay`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m delay`;
  }

  /**
   * Get traffic color for visualization
   */
  static getTrafficColor(level: 'light' | 'moderate' | 'heavy' | 'severe'): string {
    return this.TRAFFIC_COLORS[level];
  }

  // ============================================
  // SIMULATION METHODS (for development/demo)
  // ============================================

  private static simulateTrafficHotspots(
    lat: number,
    lng: number,
    radius: number
  ): TrafficHotspot[] {
    // Simulate Lagos hotspots (for demo)
    const lagosHotspots: TrafficHotspot[] = [
      {
        id: 'hs-1',
        location: {
          latitude: 6.5244,
          longitude: 3.3792,
          address: 'Ikorodu Road, Lagos',
        },
        severity: 'severe',
        type: 'congestion',
        delayMinutes: 45,
        affectedRadius: 2000,
        startTime: new Date(Date.now() - 30 * 60 * 1000),
        description: 'Heavy traffic due to rush hour',
        verifiedReports: 87,
        aiConfidence: 95,
      },
      {
        id: 'hs-2',
        location: {
          latitude: 6.4541,
          longitude: 3.3947,
          address: 'Third Mainland Bridge, Lagos',
        },
        severity: 'high',
        type: 'accident',
        delayMinutes: 25,
        affectedRadius: 1500,
        startTime: new Date(Date.now() - 15 * 60 * 1000),
        estimatedClearTime: new Date(Date.now() + 20 * 60 * 1000),
        description: 'Accident reported, 1 lane blocked',
        verifiedReports: 54,
        aiConfidence: 88,
      },
      {
        id: 'hs-3',
        location: {
          latitude: 6.4968,
          longitude: 3.3731,
          address: 'Eko Bridge, Lagos',
        },
        severity: 'moderate',
        type: 'roadwork',
        delayMinutes: 12,
        affectedRadius: 800,
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        estimatedClearTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
        description: 'Road maintenance in progress',
        verifiedReports: 31,
        aiConfidence: 92,
      },
      {
        id: 'hs-4',
        location: {
          latitude: 6.4281,
          longitude: 3.4219,
          address: 'Lekki-Epe Expressway, Lagos',
        },
        severity: 'high',
        type: 'event',
        delayMinutes: 30,
        affectedRadius: 3000,
        startTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
        estimatedClearTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        description: 'Event causing traffic buildup',
        verifiedReports: 62,
        aiConfidence: 85,
      },
    ];

    return lagosHotspots;
  }

  private static simulateOptimizedRoutes(
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    preferences?: any
  ): TrafficRoute[] {
    const baseDistance = this.calculateDistance(origin, destination);
    const baseDuration = baseDistance / 8.33; // ~30 km/h average

    return [
      {
        id: 'route-1',
        polyline: 'encoded_polyline_1',
        distance: baseDistance,
        durationWithoutTraffic: baseDuration,
        durationWithTraffic: baseDuration * 1.2, // 20% slower
        trafficDelay: baseDuration * 0.2,
        trafficLevel: 'moderate',
        hotspots: [this.simulateTrafficHotspots(origin.latitude, origin.longitude, 5000)[0]],
        toll: false,
        fuelConsumption: baseDistance / 12000, // ~12 km/L
        aiScore: 92,
        timeSavedVsAlternative: 300, // 5 mins saved
      },
      {
        id: 'route-2',
        polyline: 'encoded_polyline_2',
        distance: baseDistance * 1.15, // 15% longer
        durationWithoutTraffic: baseDuration * 1.15,
        durationWithTraffic: baseDuration * 1.5, // 50% slower
        trafficDelay: baseDuration * 0.35,
        trafficLevel: 'heavy',
        hotspots: [
          this.simulateTrafficHotspots(origin.latitude, origin.longitude, 5000)[0],
          this.simulateTrafficHotspots(origin.latitude, origin.longitude, 5000)[1],
        ],
        toll: true,
        tollCost: 500,
        fuelConsumption: (baseDistance * 1.15) / 12000,
        aiScore: 65,
      },
      {
        id: 'route-3',
        polyline: 'encoded_polyline_3',
        distance: baseDistance * 1.3, // 30% longer
        durationWithoutTraffic: baseDuration * 1.3,
        durationWithTraffic: baseDuration * 1.35, // Only 35% slower
        trafficDelay: baseDuration * 0.05,
        trafficLevel: 'light',
        hotspots: [],
        toll: false,
        fuelConsumption: (baseDistance * 1.3) / 12000,
        aiScore: 78,
      },
    ].sort((a, b) => b.aiScore - a.aiScore);
  }

  private static simulateTrafficPredictions(
    locations: Array<{ latitude: number; longitude: number; name: string }>
  ): TrafficPrediction[] {
    return locations.map((loc) => ({
      location: loc,
      currentLevel: 'moderate',
      predictedLevel: 'heavy',
      predictionTime: new Date(Date.now() + 30 * 60 * 1000), // 30 mins ahead
      confidence: 85,
      factors: ['rush hour approaching', 'historical pattern', 'event nearby'],
    }));
  }

  private static generateAlertsFromHotspots(
    hotspots: TrafficHotspot[],
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number }
  ): TrafficAlert[] {
    return hotspots.map((hotspot) => {
      const distance = this.calculateDistance(currentLocation, hotspot.location);
      
      let type: TrafficAlert['type'] = 'warning';
      let priority: TrafficAlert['priority'] = 'medium';
      
      if (hotspot.severity === 'severe') {
        type = 'avoid';
        priority = 'critical';
      } else if (hotspot.severity === 'high') {
        type = 'warning';
        priority = 'high';
      }

      return {
        id: `alert-${hotspot.id}`,
        type,
        priority,
        title: this.getAlertTitle(hotspot),
        message: hotspot.description,
        location: hotspot.location.address,
        distance: Math.round(distance),
        timestamp: new Date(),
        actionRequired: hotspot.severity === 'severe' ? 'Consider alternative route' : undefined,
      };
    });
  }

  private static getAlertTitle(hotspot: TrafficHotspot): string {
    const severityText = hotspot.severity.toUpperCase();
    const typeText = hotspot.type.charAt(0).toUpperCase() + hotspot.type.slice(1);
    return `${severityText} - ${typeText} Ahead`;
  }

  private static calculateDistance(
    point1: { latitude: number; longitude: number },
    point2: { latitude: number; longitude: number }
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(point2.latitude - point1.latitude);
    const dLon = this.toRad(point2.longitude - point1.longitude);
    const lat1 = this.toRad(point1.latitude);
    const lat2 = this.toRad(point2.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

/**
 * React Hook for Traffic Intelligence
 */
export const useTrafficAI = () => {
  const [hotspots, setHotspots] = React.useState<TrafficHotspot[]>([]);
  const [routes, setRoutes] = React.useState<TrafficRoute[]>([]);
  const [alerts, setAlerts] = React.useState<TrafficAlert[]>([]);
  const [loading, setLoading] = React.useState(false);

  const fetchTrafficStatus = async (
    latitude: number,
    longitude: number,
    radius?: number
  ) => {
    setLoading(true);
    try {
      const data = await TrafficAI.getTrafficStatus(latitude, longitude, radius);
      setHotspots(data);
    } catch (error) {
      console.error('Failed to fetch traffic status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptimizedRoutes = async (
    origin: { latitude: number; longitude: number },
    destination: { latitude: number; longitude: number },
    preferences?: any
  ) => {
    setLoading(true);
    try {
      const data = await TrafficAI.getOptimizedRoutes(origin, destination, preferences);
      setRoutes(data);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrafficAlerts = async (
    driverId: string,
    currentLocation: { latitude: number; longitude: number },
    destination?: { latitude: number; longitude: number }
  ) => {
    setLoading(true);
    try {
      const data = await TrafficAI.getTrafficAlerts(driverId, currentLocation, destination);
      setAlerts(data);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    hotspots,
    routes,
    alerts,
    loading,
    fetchTrafficStatus,
    fetchOptimizedRoutes,
    fetchTrafficAlerts,
  };
};

// Fix import (add at top)
import React from 'react';
