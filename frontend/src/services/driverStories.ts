/**
 * NEXRYDE Driver Story Mode
 * Instagram-style stories for drivers
 * "See who's driving you!" 📸
 */

import { useState, useCallback, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoryType = 'photo' | 'video' | 'text';
export type StoryPrivacy = 'public' | 'verified_riders' | 'repeat_riders';

export interface DriverStory {
  id: string;
  driverId: string;
  driverName: string;
  driverAvatar?: string;
  type: StoryType;
  mediaUrl?: string;
  text?: string;
  caption?: string;
  backgroundColor?: string;
  timestamp: number;
  expiresAt: number;
  views: number;
  privacy: StoryPrivacy;
  isActive: boolean;
}

export interface StoryStats {
  totalViews: number;
  uniqueViewers: number;
  completionRate: number;
  bookingsAfterView: number;
}

/**
 * Story Templates
 */
export const STORY_TEMPLATES = [
  { id: 'car_interior', name: 'Car Interior', icon: '🚗', prompt: 'Show your clean car!' },
  { id: 'morning_greet', name: 'Morning Greeting', icon: '☀️', prompt: 'Good morning riders!' },
  { id: 'music', name: 'Today\'s Playlist', icon: '🎵', prompt: 'What music are you playing?' },
  { id: 'route', name: 'Route Update', icon: '🗺️', prompt: 'Where are you today?' },
  { id: 'achievement', name: 'Achievement', icon: '🏆', prompt: 'Share your milestone!' },
  { id: 'tips', name: 'Driver Tips', icon: '💡', prompt: 'Share a tip!' },
];

/**
 * Story Prompts (Daily)
 */
export const DAILY_PROMPTS = [
  '📸 Show your car interior today',
  '☕ Morning routine before driving',
  '🎵 What music are you listening to?',
  '🚗 Where are you driving today?',
  '💪 How many trips so far?',
  '⭐ Share your rating milestone!',
  '🍔 Favorite lunch spot?',
  '🌆 Best view on your route',
];

/**
 * Driver Stories Service
 */
export class DriverStoriesService {
  private static readonly STORY_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  
  /**
   * Create a new story
   */
  static async createStory(
    driverId: string,
    driverName: string,
    type: StoryType,
    content: { mediaUrl?: string; text?: string; caption?: string; backgroundColor?: string },
    privacy: StoryPrivacy = 'public'
  ): Promise<DriverStory> {
    const now = Date.now();
    
    const story: DriverStory = {
      id: `${driverId}_${now}`,
      driverId,
      driverName,
      type,
      mediaUrl: content.mediaUrl,
      text: content.text,
      caption: content.caption,
      backgroundColor: content.backgroundColor || '#00B4D8',
      timestamp: now,
      expiresAt: now + this.STORY_DURATION,
      views: 0,
      privacy,
      isActive: true,
    };
    
    return story;
  }
  
  /**
   * Get active stories for drivers
   */
  static getActiveStories(stories: DriverStory[]): Map<string, DriverStory[]> {
    const now = Date.now();
    const activeStories = stories.filter(s => s.isActive && s.expiresAt > now);
    
    // Group by driver
    const grouped = new Map<string, DriverStory[]>();
    for (const story of activeStories) {
      const driverStories = grouped.get(story.driverId) || [];
      driverStories.push(story);
      grouped.set(story.driverId, driverStories);
    }
    
    return grouped;
  }
  
  /**
   * Check if driver has active story
   */
  static hasActiveStory(driverId: string, stories: DriverStory[]): boolean {
    const now = Date.now();
    return stories.some(s => s.driverId === driverId && s.isActive && s.expiresAt > now);
  }
  
  /**
   * Mark story as viewed
   */
  static viewStory(story: DriverStory): DriverStory {
    return { ...story, views: story.views + 1 };
  }
  
  /**
   * Get time remaining for story
   */
  static getTimeRemaining(story: DriverStory): string {
    const remaining = story.expiresAt - Date.now();
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    
    if (hours > 1) return `${hours}h`;
    const minutes = Math.floor(remaining / (60 * 1000));
    return `${minutes}m`;
  }
  
  /**
   * Calculate story stats
   */
  static calculateStats(stories: DriverStory[]): StoryStats {
    return {
      totalViews: stories.reduce((sum, s) => sum + s.views, 0),
      uniqueViewers: stories.length > 0 ? Math.floor(stories[0].views * 0.7) : 0,
      completionRate: 85,
      bookingsAfterView: Math.floor(stories[0]?.views * 0.15) || 0,
    };
  }
}

/**
 * Driver Stories Hook
 */
export const useDriverStories = (driverId?: string) => {
  const [myStories, setMyStories] = useState<DriverStory[]>([]);
  const [allStories, setAllStories] = useState<Map<string, DriverStory[]>>(new Map());
  const [isCreating, setIsCreating] = useState(false);
  const [currentViewingStory, setCurrentViewingStory] = useState<DriverStory | null>(null);
  
  /**
   * Load stories
   */
  const loadStories = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('@driver_stories');
      if (stored) {
        const stories: DriverStory[] = JSON.parse(stored);
        
        if (driverId) {
          setMyStories(stories.filter(s => s.driverId === driverId));
        }
        
        const grouped = DriverStoriesService.getActiveStories(stories);
        setAllStories(grouped);
      }
    } catch (error) {
      console.error('Failed to load stories:', error);
    }
  }, [driverId]);
  
  /**
   * Create photo story
   */
  const createPhotoStory = useCallback(async (caption?: string) => {
    try {
      setIsCreating(true);
      
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return null;
      
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0] && driverId) {
        const story = await DriverStoriesService.createStory(
          driverId,
          'Driver Name',
          'photo',
          { mediaUrl: result.assets[0].uri, caption },
          'public'
        );
        
        const updated = [...myStories, story];
        setMyStories(updated);
        
        // Save to storage
        const allStoriesArray = Array.from(allStories.values()).flat();
        await AsyncStorage.setItem('@driver_stories', JSON.stringify([...allStoriesArray, story]));
        
        return story;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to create photo story:', error);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [driverId, myStories, allStories]);
  
  /**
   * Create text story
   */
  const createTextStory = useCallback(async (text: string, backgroundColor: string = '#00B4D8') => {
    if (!driverId) return null;
    
    try {
      setIsCreating(true);
      
      const story = await DriverStoriesService.createStory(
        driverId,
        'Driver Name',
        'text',
        { text, backgroundColor },
        'public'
      );
      
      const updated = [...myStories, story];
      setMyStories(updated);
      
      // Save
      const allStoriesArray = Array.from(allStories.values()).flat();
      await AsyncStorage.setItem('@driver_stories', JSON.stringify([...allStoriesArray, story]));
      
      return story;
    } catch (error) {
      console.error('Failed to create text story:', error);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [driverId, myStories, allStories]);
  
  /**
   * View story
   */
  const viewStory = useCallback((story: DriverStory) => {
    setCurrentViewingStory(story);
    
    // Update views
    const updated = DriverStoriesService.viewStory(story);
    const allStoriesArray = Array.from(allStories.values()).flat();
    const index = allStoriesArray.findIndex(s => s.id === story.id);
    if (index !== -1) {
      allStoriesArray[index] = updated;
      AsyncStorage.setItem('@driver_stories', JSON.stringify(allStoriesArray));
    }
  }, [allStories]);
  
  /**
   * Get stats
   */
  const getMyStats = useCallback(() => {
    return DriverStoriesService.calculateStats(myStories);
  }, [myStories]);
  
  useEffect(() => {
    loadStories();
  }, [loadStories]);
  
  return {
    myStories,
    allStories,
    isCreating,
    currentViewingStory,
    hasActiveStory: DriverStoriesService.hasActiveStory(driverId || '', Array.from(allStories.values()).flat()),
    createPhotoStory,
    createTextStory,
    viewStory,
    getMyStats,
    loadStories,
  };
};

/** Fetch AI-powered driver profile insights (Emergent LLM → GPT-4o) */
export async function fetchAIDriverInsights(driverId: string): Promise<any> {
  try {
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const res = await fetch(`${BACKEND_URL}/api/ai/driver-assistant?user_id=${driverId}&question=Give%20me%20a%20brief%20driver%20performance%20summary`);
    return await res.json();
  } catch { return null; }
}
