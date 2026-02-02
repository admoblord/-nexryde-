/**
 * Smart Mode AI Logic - Ride Evaluation Engine
 * 
 * This module contains the AI logic for automatically evaluating
 * and accepting/rejecting rides based on driver preferences.
 */

export interface RideRequest {
  id: string;
  riderId: string;
  riderName: string;
  riderRating: number;
  pickupLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  dropoffLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  estimatedDistance: number; // km
  estimatedDuration: number; // minutes
  baseFare: number;
  surgeMultiplier: number;
  estimatedEarnings: number;
  requestTime: Date;
}

export interface SmartModePreferences {
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  minRating: number;
  acceptSurge: boolean;
  minSurgeMultiplier: number;
  avoidLowRated: boolean;
  lowRatingThreshold: number;
  preferredAreas: string[];
  autoRejectAfterHours: boolean;
  maxWaitTime: number;
}

export interface EvaluationResult {
  shouldAccept: boolean;
  score: number; // 0-100
  reasons: string[];
  warnings: string[];
  profitabilityIndex: number; // earnings per km per minute
}

/**
 * AI Ride Evaluation Engine
 */
export class SmartModeAI {
  /**
   * Evaluate a ride request against driver preferences
   */
  static evaluateRide(
    ride: RideRequest,
    preferences: SmartModePreferences,
    driverLocation?: { lat: number; lng: number }
  ): EvaluationResult {
    const reasons: string[] = [];
    const warnings: string[] = [];
    let score = 50; // Base score

    // If Smart Mode is disabled, don't auto-accept
    if (!preferences.enabled) {
      return {
        shouldAccept: false,
        score: 0,
        reasons: ['Smart Mode is disabled'],
        warnings: [],
        profitabilityIndex: 0,
      };
    }

    // 1. Distance Check (Weight: 30%)
    const distanceScore = this.evaluateDistance(ride, preferences, reasons, warnings);
    score += distanceScore * 0.3;

    // 2. Rating Check (Weight: 25%)
    const ratingScore = this.evaluateRating(ride, preferences, reasons, warnings);
    score += ratingScore * 0.25;

    // 3. Surge Pricing Check (Weight: 25%)
    const surgeScore = this.evaluateSurge(ride, preferences, reasons, warnings);
    score += surgeScore * 0.25;

    // 4. Profitability Check (Weight: 20%)
    const profitabilityIndex = this.calculateProfitability(ride);
    const profitabilityScore = this.evaluateProfitability(profitabilityIndex, reasons);
    score += profitabilityScore * 0.2;

    // Normalize score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Decision threshold: Accept if score >= 60
    const shouldAccept = score >= 60 && warnings.length === 0;

    return {
      shouldAccept,
      score: Math.round(score),
      reasons,
      warnings,
      profitabilityIndex,
    };
  }

  /**
   * Evaluate distance against preferences
   */
  private static evaluateDistance(
    ride: RideRequest,
    preferences: SmartModePreferences,
    reasons: string[],
    warnings: string[]
  ): number {
    const distance = ride.estimatedDistance;

    // Too short
    if (distance < preferences.minDistance) {
      warnings.push(`Ride too short: ${distance}km < ${preferences.minDistance}km minimum`);
      return -50;
    }

    // Too long
    if (distance > preferences.maxDistance) {
      warnings.push(`Ride too long: ${distance}km > ${preferences.maxDistance}km maximum`);
      return -50;
    }

    // Optimal distance (5-10km typically best)
    const optimalMin = preferences.minDistance + 2;
    const optimalMax = Math.min(preferences.maxDistance, 15);

    if (distance >= optimalMin && distance <= optimalMax) {
      reasons.push(`✅ Optimal distance: ${distance}km`);
      return 50;
    }

    // Acceptable distance
    reasons.push(`✓ Distance within range: ${distance}km`);
    return 30;
  }

  /**
   * Evaluate rider rating
   */
  private static evaluateRating(
    ride: RideRequest,
    preferences: SmartModePreferences,
    reasons: string[],
    warnings: string[]
  ): number {
    const rating = ride.riderRating;

    // Avoid low-rated riders if enabled
    if (preferences.avoidLowRated) {
      if (rating < preferences.lowRatingThreshold) {
        warnings.push(
          `Low-rated rider: ${rating}⭐ < ${preferences.lowRatingThreshold}⭐ threshold`
        );
        return -40;
      }

      if (rating < preferences.minRating) {
        warnings.push(`Rider rating: ${rating}⭐ < ${preferences.minRating}⭐ minimum`);
        return -30;
      }
    }

    // High-rated rider
    if (rating >= 4.8) {
      reasons.push(`✅ Excellent rider: ${rating}⭐`);
      return 50;
    }

    // Good rider
    if (rating >= preferences.minRating) {
      reasons.push(`✓ Good rider: ${rating}⭐`);
      return 35;
    }

    // Acceptable rider
    reasons.push(`→ Acceptable rider: ${rating}⭐`);
    return 20;
  }

  /**
   * Evaluate surge pricing
   */
  private static evaluateSurge(
    ride: RideRequest,
    preferences: SmartModePreferences,
    reasons: string[],
    warnings: string[]
  ): number {
    const surge = ride.surgeMultiplier;

    // No surge
    if (surge === 1.0) {
      if (preferences.acceptSurge && preferences.minSurgeMultiplier > 1.0) {
        // Driver prefers surge rides only
        warnings.push('No surge pricing (driver prefers surge rides)');
        return -20;
      }
      return 0; // Neutral
    }

    // Has surge pricing
    if (surge < preferences.minSurgeMultiplier) {
      warnings.push(
        `Surge too low: ${surge}x < ${preferences.minSurgeMultiplier}x minimum`
      );
      return -10;
    }

    // Good surge
    if (surge >= 2.0) {
      reasons.push(`✅ High surge: ${surge}x multiplier`);
      return 50;
    }

    // Moderate surge
    reasons.push(`✓ Surge pricing: ${surge}x`);
    return 35;
  }

  /**
   * Calculate profitability index (earnings per km per minute)
   */
  private static calculateProfitability(ride: RideRequest): number {
    const earnings = ride.estimatedEarnings;
    const distance = ride.estimatedDistance;
    const duration = ride.estimatedDuration;

    if (distance === 0 || duration === 0) return 0;

    // Profitability Index = Earnings / (Distance * Duration)
    // Higher is better
    return earnings / (distance * duration);
  }

  /**
   * Evaluate profitability
   */
  private static evaluateProfitability(
    profitabilityIndex: number,
    reasons: string[]
  ): number {
    // Thresholds (example values, adjust based on market)
    const excellent = 15; // ₦15 per km per minute
    const good = 10;
    const fair = 5;

    if (profitabilityIndex >= excellent) {
      reasons.push(`✅ Excellent profitability: ₦${profitabilityIndex.toFixed(1)}/km/min`);
      return 50;
    }

    if (profitabilityIndex >= good) {
      reasons.push(`✓ Good profitability: ₦${profitabilityIndex.toFixed(1)}/km/min`);
      return 35;
    }

    if (profitabilityIndex >= fair) {
      reasons.push(`→ Fair profitability: ₦${profitabilityIndex.toFixed(1)}/km/min`);
      return 20;
    }

    reasons.push(`⚠ Low profitability: ₦${profitabilityIndex.toFixed(1)}/km/min`);
    return 0;
  }

  /**
   * Get human-readable decision explanation
   */
  static getDecisionExplanation(result: EvaluationResult): string {
    if (result.shouldAccept) {
      return `✅ ACCEPT (Score: ${result.score}/100)\n\n${result.reasons.join('\n')}`;
    } else {
      const allReasons = [...result.warnings, ...result.reasons];
      return `❌ REJECT (Score: ${result.score}/100)\n\n${allReasons.join('\n')}`;
    }
  }

  /**
   * Simulate ride evaluation for testing/preview
   */
  static simulateEvaluation(preferences: SmartModePreferences): EvaluationResult[] {
    const testRides: RideRequest[] = [
      {
        id: 'ride-1',
        riderId: 'rider-1',
        riderName: 'John Doe',
        riderRating: 4.9,
        pickupLocation: { lat: 6.5244, lng: 3.3792, address: 'Victoria Island' },
        dropoffLocation: { lat: 6.4474, lng: 3.3903, address: 'Lekki Phase 1' },
        estimatedDistance: 8.5,
        estimatedDuration: 18,
        baseFare: 1500,
        surgeMultiplier: 1.8,
        estimatedEarnings: 2700,
        requestTime: new Date(),
      },
      {
        id: 'ride-2',
        riderId: 'rider-2',
        riderName: 'Jane Smith',
        riderRating: 3.2,
        pickupLocation: { lat: 6.5244, lng: 3.3792, address: 'Ikeja' },
        dropoffLocation: { lat: 6.4474, lng: 3.3903, address: 'Ajah' },
        estimatedDistance: 25,
        estimatedDuration: 45,
        baseFare: 3000,
        surgeMultiplier: 1.0,
        estimatedEarnings: 3000,
        requestTime: new Date(),
      },
      {
        id: 'ride-3',
        riderId: 'rider-3',
        riderName: 'Mike Johnson',
        riderRating: 4.7,
        pickupLocation: { lat: 6.5244, lng: 3.3792, address: 'Yaba' },
        dropoffLocation: { lat: 6.4474, lng: 3.3903, address: 'Surulere' },
        estimatedDistance: 6.5,
        estimatedDuration: 15,
        baseFare: 1200,
        surgeMultiplier: 2.5,
        estimatedEarnings: 3000,
        requestTime: new Date(),
      },
    ];

    return testRides.map(ride => this.evaluateRide(ride, preferences));
  }
}

/**
 * React Hook for Smart Mode
 */
export const useSmartMode = (preferences: SmartModePreferences) => {
  /**
   * Evaluate a ride and optionally auto-accept
   */
  const evaluateAndAccept = async (
    ride: RideRequest,
    onAccept: () => void,
    onReject: () => void
  ): Promise<EvaluationResult> => {
    const result = SmartModeAI.evaluateRide(ride, preferences);

    // Wait for maxWaitTime before auto-accepting
    await new Promise(resolve => setTimeout(resolve, preferences.maxWaitTime * 1000));

    if (result.shouldAccept && preferences.enabled) {
      onAccept();
    } else if (result.warnings.length > 0) {
      onReject();
    }

    return result;
  };

  return {
    evaluateRide: (ride: RideRequest) => SmartModeAI.evaluateRide(ride, preferences),
    evaluateAndAccept,
    getExplanation: SmartModeAI.getDecisionExplanation,
    simulateEvaluation: () => SmartModeAI.simulateEvaluation(preferences),
  };
};
