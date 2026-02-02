/**
 * NEXRYDE Weather-Based Dynamic Pricing
 * "Fair pricing for tough conditions!" 🌤️💰
 */

export type WeatherCondition = 'clear' | 'rain' | 'heavy_rain' | 'storm' | 'fog';

export interface WeatherPricing {
  condition: WeatherCondition;
  baseMultiplier: number; // 1.0 - 2.5x
  surgeMultiplier: number;
  totalMultiplier: number;
  reasoning: string;
  driverBonus: number;
  estimatedFare: number;
}

export class WeatherPricingAI {
  static calculateWeatherPricing(
    condition: WeatherCondition,
    baseFare: number,
    currentDemand: number
  ): WeatherPricing {
    let weatherMultiplier = 1.0;
    let reasoning = 'Normal weather conditions';
    let driverBonus = 0;
    
    switch (condition) {
      case 'rain':
        weatherMultiplier = 1.3;
        reasoning = 'Light rain - slippery roads, reduced visibility';
        driverBonus = baseFare * 0.3;
        break;
      case 'heavy_rain':
        weatherMultiplier = 1.6;
        reasoning = 'Heavy rain - dangerous driving, poor visibility';
        driverBonus = baseFare * 0.6;
        break;
      case 'storm':
        weatherMultiplier = 2.0;
        reasoning = 'Storm - extreme danger, limited drivers';
        driverBonus = baseFare * 1.0;
        break;
      case 'fog':
        weatherMultiplier = 1.4;
        reasoning = 'Fog - very low visibility, slow driving';
        driverBonus = baseFare * 0.4;
        break;
      case 'clear':
      default:
        weatherMultiplier = 1.0;
        reasoning = 'Clear weather - normal conditions';
        driverBonus = 0;
    }
    
    const surgeMultiplier = 1.0 + (currentDemand / 100);
    const totalMultiplier = weatherMultiplier * surgeMultiplier;
    const estimatedFare = baseFare * totalMultiplier;
    
    return {
      condition,
      baseMultiplier: weatherMultiplier,
      surgeMultiplier,
      totalMultiplier,
      reasoning,
      driverBonus,
      estimatedFare,
    };
  }
}
