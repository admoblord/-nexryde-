/**
 * NEXRYDE Accident Prediction AI
 * Proactive safety through predictive analytics
 * "Prevent before it happens" 🚨
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { Vibration, Alert } from 'react-native';

// Risk Level Types
export type RiskLevel = 'safe' | 'low' | 'moderate' | 'high' | 'critical';

// Driving Behavior Types
export interface DrivingBehavior {
  speed: number; // km/h
  averageSpeed: number;
  maxSpeed: number;
  suddenBrakes: number;
  rapidAccelerations: number;
  sharpTurns: number;
  phoneUsage: number; // times
  drivingDuration: number; // minutes
  nightDriving: boolean;
  weatherCondition: 'clear' | 'rain' | 'fog' | 'storm';
}

// Accident Hotspot
export interface AccidentHotspot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
  accidentCount: number;
  severity: 'minor' | 'major' | 'fatal';
  commonCauses: string[];
  timeOfDay: string[];
  safetyScore: number; // 0-100
}

// Safety Alert
export interface SafetyAlert {
  id: string;
  type: 'speed' | 'braking' | 'area' | 'fatigue' | 'weather' | 'behavior';
  severity: RiskLevel;
  message: string;
  recommendation: string;
  timestamp: number;
  location?: { latitude: number; longitude: number };
}

// Safety Score
export interface SafetyScore {
  overall: number; // 0-100
  speedScore: number;
  brakingScore: number;
  attentionScore: number;
  areaScore: number;
  experienceScore: number;
  riskLevel: RiskLevel;
}

/**
 * Lagos Accident Hotspots (Simulated Data)
 */
export const LAGOS_ACCIDENT_HOTSPOTS: AccidentHotspot[] = [
  { id: '1', name: 'Oshodi Under Bridge', latitude: 6.5333, longitude: 3.3500, radius: 500, accidentCount: 45, severity: 'major', commonCauses: ['Speeding', 'Lane changing', 'Traffic'], timeOfDay: ['Morning rush', 'Evening rush'], safetyScore: 35 },
  { id: '2', name: 'Third Mainland Bridge', latitude: 6.4833, longitude: 3.3833, radius: 800, accidentCount: 38, severity: 'major', commonCauses: ['Tire burst', 'Speeding', 'Rain'], timeOfDay: ['All day'], safetyScore: 45 },
  { id: '3', name: 'Ojota Interchange', latitude: 6.5833, longitude: 3.3667, radius: 400, accidentCount: 32, severity: 'major', commonCauses: ['Sudden braking', 'U-turn', 'Bus stops'], timeOfDay: ['Peak hours'], safetyScore: 40 },
  { id: '4', name: 'Lekki-Epe Expressway', latitude: 6.4667, longitude: 3.5333, radius: 1000, accidentCount: 28, severity: 'fatal', commonCauses: ['Speeding', 'Overtaking', 'Night driving'], timeOfDay: ['Night'], safetyScore: 50 },
  { id: '5', name: 'Berger Bus Stop', latitude: 6.6167, longitude: 3.3500, radius: 300, accidentCount: 25, severity: 'minor', commonCauses: ['Pedestrians', 'Hawkers', 'Sudden stops'], timeOfDay: ['All day'], safetyScore: 55 },
];

/**
 * Accident Prediction AI Engine
 */
export class AccidentPredictionAI {
  private static readonly SPEED_LIMIT_URBAN = 50; // km/h
  private static readonly SPEED_LIMIT_HIGHWAY = 100; // km/h
  private static readonly FATIGUE_THRESHOLD = 240; // 4 hours
  
  /**
   * Analyze driving behavior and predict risk
   */
  static analyzeDrivingBehavior(behavior: DrivingBehavior): { riskLevel: RiskLevel; score: number; alerts: SafetyAlert[] } {
    const alerts: SafetyAlert[] = [];
    let totalRiskScore = 0;
    
    // 1. Speed Analysis (30% weight)
    const speedRisk = this.analyzeSpeed(behavior);
    totalRiskScore += speedRisk.score * 0.3;
    if (speedRisk.alert) alerts.push(speedRisk.alert);
    
    // 2. Braking Pattern (25% weight)
    const brakingRisk = this.analyzeBraking(behavior);
    totalRiskScore += brakingRisk.score * 0.25;
    if (brakingRisk.alert) alerts.push(brakingRisk.alert);
    
    // 3. Acceleration Pattern (15% weight)
    const accelRisk = this.analyzeAcceleration(behavior);
    totalRiskScore += accelRisk.score * 0.15;
    if (accelRisk.alert) alerts.push(accelRisk.alert);
    
    // 4. Turning Behavior (10% weight)
    const turningRisk = this.analyzeTurning(behavior);
    totalRiskScore += turningRisk.score * 0.1;
    if (turningRisk.alert) alerts.push(turningRisk.alert);
    
    // 5. Fatigue Analysis (15% weight)
    const fatigueRisk = this.analyzeFatigue(behavior);
    totalRiskScore += fatigueRisk.score * 0.15;
    if (fatigueRisk.alert) alerts.push(fatigueRisk.alert);
    
    // 6. Environmental Factors (5% weight)
    const envRisk = this.analyzeEnvironment(behavior);
    totalRiskScore += envRisk.score * 0.05;
    if (envRisk.alert) alerts.push(envRisk.alert);
    
    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(totalRiskScore);
    
    return { riskLevel, score: Math.round(100 - totalRiskScore), alerts };
  }
  
  /**
   * Analyze speed behavior
   */
  private static analyzeSpeed(behavior: DrivingBehavior): { score: number; alert?: SafetyAlert } {
    const limit = behavior.nightDriving ? this.SPEED_LIMIT_URBAN : this.SPEED_LIMIT_HIGHWAY;
    const overspeed = behavior.speed - limit;
    
    if (overspeed > 30) {
      return {
        score: 80,
        alert: {
          id: Date.now().toString(),
          type: 'speed',
          severity: 'critical',
          message: '🚨 CRITICAL: Excessive speeding detected!',
          recommendation: `Slow down immediately! Current: ${behavior.speed} km/h, Limit: ${limit} km/h`,
          timestamp: Date.now(),
        },
      };
    } else if (overspeed > 20) {
      return {
        score: 60,
        alert: {
          id: Date.now().toString(),
          type: 'speed',
          severity: 'high',
          message: '⚠️ HIGH RISK: Speeding detected',
          recommendation: `Reduce speed to ${limit} km/h. Current: ${behavior.speed} km/h`,
          timestamp: Date.now(),
        },
      };
    } else if (overspeed > 10) {
      return { score: 30, alert: { id: Date.now().toString(), type: 'speed', severity: 'moderate', message: '⚠️ Slightly over speed limit', recommendation: 'Please slow down gradually', timestamp: Date.now() } };
    }
    
    return { score: 0 };
  }
  
  /**
   * Analyze braking patterns
   */
  private static analyzeBraking(behavior: DrivingBehavior): { score: number; alert?: SafetyAlert } {
    const brakingRate = behavior.suddenBrakes / (behavior.drivingDuration / 60);
    
    if (brakingRate > 5) {
      return {
        score: 70,
        alert: {
          id: Date.now().toString(),
          type: 'braking',
          severity: 'high',
          message: '🚨 DANGEROUS: Too many sudden brakes!',
          recommendation: 'Maintain safe distance. Look ahead. Anticipate stops.',
          timestamp: Date.now(),
        },
      };
    } else if (brakingRate > 3) {
      return { score: 40, alert: { id: Date.now().toString(), type: 'braking', severity: 'moderate', message: '⚠️ Frequent sudden braking', recommendation: 'Increase following distance', timestamp: Date.now() } };
    }
    
    return { score: 0 };
  }
  
  /**
   * Analyze acceleration
   */
  private static analyzeAcceleration(behavior: DrivingBehavior): { score: number; alert?: SafetyAlert } {
    const accelRate = behavior.rapidAccelerations / (behavior.drivingDuration / 60);
    
    if (accelRate > 4) {
      return { score: 50, alert: { id: Date.now().toString(), type: 'behavior', severity: 'moderate', message: '⚠️ Aggressive acceleration detected', recommendation: 'Accelerate smoothly for safety and fuel efficiency', timestamp: Date.now() } };
    }
    
    return { score: 0 };
  }
  
  /**
   * Analyze turning behavior
   */
  private static analyzeTurning(behavior: DrivingBehavior): { score: number; alert?: SafetyAlert } {
    const turnRate = behavior.sharpTurns / (behavior.drivingDuration / 60);
    
    if (turnRate > 3) {
      return { score: 40, alert: { id: Date.now().toString(), type: 'behavior', severity: 'moderate', message: '⚠️ Sharp turns detected', recommendation: 'Take turns slowly and carefully', timestamp: Date.now() } };
    }
    
    return { score: 0 };
  }
  
  /**
   * Analyze fatigue risk
   */
  private static analyzeFatigue(behavior: DrivingBehavior): { score: number; alert?: SafetyAlert } {
    if (behavior.drivingDuration > this.FATIGUE_THRESHOLD) {
      const overtime = behavior.drivingDuration - this.FATIGUE_THRESHOLD;
      if (overtime > 120) {
        return { score: 80, alert: { id: Date.now().toString(), type: 'fatigue', severity: 'critical', message: '🚨 CRITICAL: Driver fatigue!', recommendation: 'STOP and rest immediately! You\'ve been driving for over 6 hours!', timestamp: Date.now() } };
      }
      return { score: 50, alert: { id: Date.now().toString(), type: 'fatigue', severity: 'high', message: '⚠️ Fatigue warning', recommendation: 'Take a 15-minute break soon', timestamp: Date.now() } };
    }
    
    return { score: 0 };
  }
  
  /**
   * Analyze environmental factors
   */
  private static analyzeEnvironment(behavior: DrivingBehavior): { score: number; alert?: SafetyAlert } {
    if (behavior.weatherCondition === 'storm' || behavior.weatherCondition === 'fog') {
      return { score: 50, alert: { id: Date.now().toString(), type: 'weather', severity: 'high', message: `⚠️ ${behavior.weatherCondition.toUpperCase()} warning`, recommendation: 'Reduce speed, increase following distance, use hazard lights', timestamp: Date.now() } };
    } else if (behavior.weatherCondition === 'rain') {
      return { score: 25, alert: { id: Date.now().toString(), type: 'weather', severity: 'moderate', message: '🌧️ Rainy conditions', recommendation: 'Drive carefully, roads are slippery', timestamp: Date.now() } };
    }
    
    return { score: 0 };
  }
  
  /**
   * Check for accident hotspots
   */
  static checkAccidentHotspots(currentLat: number, currentLng: number): AccidentHotspot | null {
    for (const hotspot of LAGOS_ACCIDENT_HOTSPOTS) {
      const distance = this.calculateDistance(currentLat, currentLng, hotspot.latitude, hotspot.longitude);
      if (distance <= hotspot.radius) return hotspot;
    }
    return null;
  }
  
  /**
   * Calculate distance (Haversine)
   */
  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  
  /**
   * Calculate overall risk level
   */
  private static calculateRiskLevel(score: number): RiskLevel {
    if (score >= 70) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 30) return 'moderate';
    if (score >= 15) return 'low';
    return 'safe';
  }
}

/**
 * Accident Prediction Hook
 */
export const useAccidentPrediction = () => {
  const [currentBehavior, setCurrentBehavior] = useState<DrivingBehavior>({ speed: 0, averageSpeed: 0, maxSpeed: 0, suddenBrakes: 0, rapidAccelerations: 0, sharpTurns: 0, phoneUsage: 0, drivingDuration: 0, nightDriving: false, weatherCondition: 'clear' });
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('safe');
  const [safetyScore, setSafetyScore] = useState<number>(100);
  const [activeAlerts, setActiveAlerts] = useState<SafetyAlert[]>([]);
  const [nearbyHotspot, setNearbyHotspot] = useState<AccidentHotspot | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const startMonitoring = useCallback(() => { setIsMonitoring(true); }, []);
  const stopMonitoring = useCallback(() => { setIsMonitoring(false); }, []);
  
  useEffect(() => {
    if (!isMonitoring) return;
    const interval = setInterval(() => {
      const analysis = AccidentPredictionAI.analyzeDrivingBehavior(currentBehavior);
      setRiskLevel(analysis.riskLevel);
      setSafetyScore(analysis.score);
      if (analysis.alerts.length > 0) {
        setActiveAlerts(prev => [...prev, ...analysis.alerts].slice(-5));
        if (analysis.riskLevel === 'critical' || analysis.riskLevel === 'high') Vibration.vibrate([0, 500, 200, 500]);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isMonitoring, currentBehavior]);
  
  return { currentBehavior, riskLevel, safetyScore, activeAlerts, nearbyHotspot, isMonitoring, startMonitoring, stopMonitoring, updateBehavior: setCurrentBehavior };
};
