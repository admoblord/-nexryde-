/**
 * NEXRYDE Mood-Based Ride Matching Service
 * Preference matching for better rides
 * 
 * "Your vibe, your ride!" 😊
 */

import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mood & Preference Types
export type RideMood = 
  | 'chatty'      // Conversational, social
  | 'quiet'       // Silent, peaceful
  | 'professional' // Business-like
  | 'friendly'    // Warm but not chatty
  | 'any';        // No preference

export type MusicPreference = 
  | 'afrobeats'   // Nigerian Afrobeats
  | 'gospel'      // Gospel music
  | 'hiphop'      // Hip-hop/Rap
  | 'jazz'        // Jazz/Blues
  | 'no_music'    // Silence preferred
  | 'any';        // Driver's choice

export type TemperaturePreference = 
  | 'cold'        // AC full blast
  | 'moderate'    // AC medium
  | 'warm'        // AC low/off
  | 'any';        // No preference

export type DrivingStyle = 
  | 'smooth'      // Gentle, careful
  | 'moderate'    // Normal speed
  | 'fast'        // Quick but safe
  | 'any';        // No preference

export interface RiderPreferences {
  mood: RideMood;
  music: MusicPreference;
  temperature: TemperaturePreference;
  drivingStyle: DrivingStyle;
  allowCalls: boolean;           // Allow driver to take calls
  allowEating: boolean;          // Allow driver to eat/drink
  preferFemaleDriver?: boolean;  // For female riders (safety)
  preferOlderDriver?: boolean;   // Experience preference
}

export interface DriverProfile {
  id: string;
  name: string;
  rating: number;
  trips: number;
  
  // Driver's natural preferences
  personality: RideMood;
  musicTaste: MusicPreference[];
  drivingStyle: DrivingStyle;
  
  // Flexibility
  canBeChatty: boolean;
  canBeQuiet: boolean;
  hasAC: boolean;
  allowsMusic: boolean;
  
  // Demographics
  age: number;
  gender: 'male' | 'female';
  yearsExperience: number;
  
  // Performance
  acceptanceRate: number;
  cancellationRate: number;
  onTimeRate: number;
  
  // Current state
  isOnline: boolean;
  currentLocation?: { latitude: number; longitude: number };
  distanceFromRider?: number; // km
}

export interface MatchScore {
  driverId: string;
  totalScore: number;        // 0-100
  moodScore: number;         // 0-25
  musicScore: number;        // 0-20
  temperatureScore: number;  // 0-15
  drivingScore: number;      // 0-15
  distanceScore: number;     // 0-15
  ratingScore: number;       // 0-10
  isCompatible: boolean;
  matchReason: string;
}

/**
 * Mood & Preference Configuration
 */
export const MOOD_OPTIONS = [
  {
    id: 'chatty' as RideMood,
    name: 'Chatty Driver',
    icon: '😊',
    description: 'I want to have a conversation',
    benefit: 'Great for social people, long trips',
  },
  {
    id: 'quiet' as RideMood,
    name: 'Quiet Ride',
    icon: '🤫',
    description: 'I prefer silence',
    benefit: 'Perfect for work calls, relaxation',
  },
  {
    id: 'professional' as RideMood,
    name: 'Professional',
    icon: '💼',
    description: 'Business-like, no small talk',
    benefit: 'Ideal for corporate trips',
  },
  {
    id: 'friendly' as RideMood,
    name: 'Friendly',
    icon: '🤗',
    description: 'Warm greeting, then quiet',
    benefit: 'Balance between social and peaceful',
  },
  {
    id: 'any' as RideMood,
    name: 'No Preference',
    icon: '🎭',
    description: "Driver's choice",
    benefit: 'Fastest match',
  },
];

export const MUSIC_OPTIONS = [
  {
    id: 'afrobeats' as MusicPreference,
    name: 'Afrobeats',
    icon: '🎵',
    description: 'Burna Boy, Wizkid, Davido',
    artists: ['Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Asake'],
  },
  {
    id: 'gospel' as MusicPreference,
    name: 'Gospel',
    icon: '🙏',
    description: 'Christian music',
    artists: ['Sinach', 'Frank Edwards', 'Mercy Chinwo'],
  },
  {
    id: 'hiphop' as MusicPreference,
    name: 'Hip-Hop',
    icon: '🎤',
    description: 'Rap, hip-hop',
    artists: ['Drake', 'J. Cole', 'Kendrick Lamar'],
  },
  {
    id: 'jazz' as MusicPreference,
    name: 'Jazz/Blues',
    icon: '🎷',
    description: 'Smooth, relaxing',
    artists: ['Miles Davis', 'John Coltrane', 'Asa'],
  },
  {
    id: 'no_music' as MusicPreference,
    name: 'No Music',
    icon: '🔇',
    description: 'Silence or nature sounds',
    artists: [],
  },
  {
    id: 'any' as MusicPreference,
    name: 'Any Music',
    icon: '🎶',
    description: "Driver's choice",
    artists: [],
  },
];

export const TEMPERATURE_OPTIONS = [
  {
    id: 'cold' as TemperaturePreference,
    name: 'Cold (AC Full)',
    icon: '❄️',
    description: 'AC at maximum',
  },
  {
    id: 'moderate' as TemperaturePreference,
    name: 'Moderate',
    icon: '🌡️',
    description: 'AC at medium',
  },
  {
    id: 'warm' as TemperaturePreference,
    name: 'Warm (AC Low)',
    icon: '☀️',
    description: 'AC low or windows',
  },
  {
    id: 'any' as TemperaturePreference,
    name: 'No Preference',
    icon: '🎯',
    description: 'Any temperature',
  },
];

export const DRIVING_STYLE_OPTIONS = [
  {
    id: 'smooth' as DrivingStyle,
    name: 'Smooth & Gentle',
    icon: '🐢',
    description: 'Careful, no sudden moves',
  },
  {
    id: 'moderate' as DrivingStyle,
    name: 'Moderate',
    icon: '🚗',
    description: 'Normal driving speed',
  },
  {
    id: 'fast' as DrivingStyle,
    name: 'Fast (But Safe)',
    icon: '🏎️',
    description: 'Quick, efficient',
  },
  {
    id: 'any' as DrivingStyle,
    name: 'No Preference',
    icon: '🎯',
    description: 'Any style',
  },
];

/**
 * Matching Algorithm
 */
export class MoodMatcher {
  /**
   * Match rider with best drivers
   */
  static matchRiderWithDrivers(
    riderPreferences: RiderPreferences,
    availableDrivers: DriverProfile[]
  ): MatchScore[] {
    const scores: MatchScore[] = [];
    
    for (const driver of availableDrivers) {
      const score = this.calculateMatchScore(riderPreferences, driver);
      scores.push(score);
    }
    
    // Sort by total score (highest first)
    return scores.sort((a, b) => b.totalScore - a.totalScore);
  }
  
  /**
   * Calculate compatibility score for a driver
   */
  static calculateMatchScore(
    preferences: RiderPreferences,
    driver: DriverProfile
  ): MatchScore {
    let totalScore = 0;
    
    // 1. Mood/Personality Match (25 points)
    const moodScore = this.calculateMoodScore(preferences.mood, driver);
    totalScore += moodScore;
    
    // 2. Music Match (20 points)
    const musicScore = this.calculateMusicScore(preferences.music, driver);
    totalScore += musicScore;
    
    // 3. Temperature Match (15 points)
    const temperatureScore = this.calculateTemperatureScore(preferences.temperature, driver);
    totalScore += temperatureScore;
    
    // 4. Driving Style Match (15 points)
    const drivingScore = this.calculateDrivingScore(preferences.drivingStyle, driver);
    totalScore += drivingScore;
    
    // 5. Distance (15 points - closer is better)
    const distanceScore = this.calculateDistanceScore(driver.distanceFromRider || 0);
    totalScore += distanceScore;
    
    // 6. Rating (10 points)
    const ratingScore = this.calculateRatingScore(driver.rating);
    totalScore += ratingScore;
    
    // Bonus/Penalty factors
    if (preferences.preferFemaleDriver && driver.gender !== 'female') {
      totalScore -= 20; // Penalty for gender mismatch
    }
    
    if (preferences.preferOlderDriver && driver.age < 35) {
      totalScore -= 10; // Penalty for age preference
    }
    
    // Check minimum compatibility threshold
    const isCompatible = totalScore >= 60; // At least 60% match
    
    // Generate match reason
    const matchReason = this.generateMatchReason(
      moodScore,
      musicScore,
      distanceScore,
      driver
    );
    
    return {
      driverId: driver.id,
      totalScore,
      moodScore,
      musicScore,
      temperatureScore,
      drivingScore,
      distanceScore,
      ratingScore,
      isCompatible,
      matchReason,
    };
  }
  
  /**
   * Calculate mood compatibility score
   */
  private static calculateMoodScore(mood: RideMood, driver: DriverProfile): number {
    if (mood === 'any') return 25; // Full points for no preference
    
    // Perfect match
    if (mood === driver.personality) return 25;
    
    // Check driver flexibility
    if (mood === 'chatty' && driver.canBeChatty) return 20;
    if (mood === 'quiet' && driver.canBeQuiet) return 20;
    
    // Partial match
    if (mood === 'friendly') {
      if (driver.personality === 'chatty' || driver.personality === 'quiet') {
        return 18; // Friendly is middle ground
      }
    }
    
    // Mismatch
    return 10;
  }
  
  /**
   * Calculate music compatibility score
   */
  private static calculateMusicScore(music: MusicPreference, driver: DriverProfile): number {
    if (music === 'any') return 20; // Full points for no preference
    if (!driver.allowsMusic && music !== 'no_music') return 5; // Driver doesn't play music
    
    // Perfect match
    if (driver.musicTaste.includes(music)) return 20;
    
    // Driver plays requested music type
    if (driver.musicTaste.length > 2) return 15; // Diverse taste
    
    // No music match
    if (music === 'no_music' && !driver.allowsMusic) return 20;
    
    return 10;
  }
  
  /**
   * Calculate temperature compatibility score
   */
  private static calculateTemperatureScore(temp: TemperaturePreference, driver: DriverProfile): number {
    if (temp === 'any') return 15; // Full points for no preference
    if (!driver.hasAC && temp === 'cold') return 0; // No AC available
    
    return 12; // Assume driver can adjust
  }
  
  /**
   * Calculate driving style compatibility score
   */
  private static calculateDrivingScore(style: DrivingStyle, driver: DriverProfile): number {
    if (style === 'any') return 15; // Full points for no preference
    
    // Perfect match
    if (style === driver.drivingStyle) return 15;
    
    // Close match
    if (style === 'moderate') return 12; // Moderate works for most
    
    return 10;
  }
  
  /**
   * Calculate distance score (0-15 points)
   */
  private static calculateDistanceScore(distanceKm: number): number {
    if (distanceKm <= 1) return 15;      // Very close
    if (distanceKm <= 2) return 13;      // Close
    if (distanceKm <= 3) return 11;      // Moderate
    if (distanceKm <= 5) return 9;       // Far
    if (distanceKm <= 10) return 6;      // Very far
    return 3;                            // Too far
  }
  
  /**
   * Calculate rating score (0-10 points)
   */
  private static calculateRatingScore(rating: number): number {
    return Math.round((rating / 5) * 10);
  }
  
  /**
   * Generate human-readable match reason
   */
  private static generateMatchReason(
    moodScore: number,
    musicScore: number,
    distanceScore: number,
    driver: DriverProfile
  ): string {
    const reasons: string[] = [];
    
    if (moodScore >= 20) reasons.push('Perfect vibe match');
    if (musicScore >= 18) reasons.push('Loves your music');
    if (distanceScore >= 13) reasons.push('Very close by');
    if (driver.rating >= 4.8) reasons.push('Highly rated');
    if (driver.trips >= 1000) reasons.push('Experienced');
    
    if (reasons.length === 0) {
      return 'Available and compatible';
    }
    
    return reasons.slice(0, 2).join(' • ');
  }
  
  /**
   * Get best match for rider
   */
  static getBestMatch(
    riderPreferences: RiderPreferences,
    availableDrivers: DriverProfile[]
  ): DriverProfile | null {
    const matches = this.matchRiderWithDrivers(riderPreferences, availableDrivers);
    
    // Filter compatible matches (score >= 60)
    const compatibleMatches = matches.filter(m => m.isCompatible);
    
    if (compatibleMatches.length === 0) {
      // No perfect match, return best available
      return matches.length > 0 ? availableDrivers.find(d => d.id === matches[0].driverId) || null : null;
    }
    
    // Return driver with highest score
    const bestMatch = compatibleMatches[0];
    return availableDrivers.find(d => d.id === bestMatch.driverId) || null;
  }
}

/**
 * Mood-Based Matching React Hook
 */
export const useMoodMatching = () => {
  const [riderPreferences, setRiderPreferences] = useState<RiderPreferences>({
    mood: 'any',
    music: 'any',
    temperature: 'any',
    drivingStyle: 'any',
    allowCalls: true,
    allowEating: true,
  });
  
  const [matchedDrivers, setMatchedDrivers] = useState<MatchScore[]>([]);
  const [loading, setLoading] = useState(false);
  
  /**
   * Load saved preferences
   */
  const loadPreferences = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('@rider_preferences');
      if (stored) {
        setRiderPreferences(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }, []);
  
  /**
   * Save preferences
   */
  const savePreferences = useCallback(async (prefs: Partial<RiderPreferences>) => {
    try {
      const updated = { ...riderPreferences, ...prefs };
      setRiderPreferences(updated);
      await AsyncStorage.setItem('@rider_preferences', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }, [riderPreferences]);
  
  /**
   * Find matching drivers
   */
  const findMatches = useCallback(async (availableDrivers: DriverProfile[]) => {
    setLoading(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const matches = MoodMatcher.matchRiderWithDrivers(riderPreferences, availableDrivers);
    setMatchedDrivers(matches);
    
    setLoading(false);
    return matches;
  }, [riderPreferences]);
  
  /**
   * Get best match
   */
  const getBestMatch = useCallback((availableDrivers: DriverProfile[]) => {
    return MoodMatcher.getBestMatch(riderPreferences, availableDrivers);
  }, [riderPreferences]);
  
  return {
    riderPreferences,
    matchedDrivers,
    loading,
    savePreferences,
    findMatches,
    getBestMatch,
    loadPreferences,
  };
};
