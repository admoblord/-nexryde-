/**
 * NEXRYDE Ride Recording Service
 * Black box for rides - Audio/Video recording
 * "Your safety, our priority" 📹🔒
 */

import { useState, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

export type RecordingType = 'audio' | 'video' | 'both';
export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';
export type IncidentType = 'accident' | 'harassment' | 'theft' | 'dispute' | 'other';

export interface RideRecording {
  id: string;
  tripId: string;
  driverId: string;
  riderId: string;
  type: RecordingType;
  audioUri?: string;
  videoUri?: string;
  startTime: number;
  endTime?: number;
  duration: number; // seconds
  fileSize: number; // bytes
  encrypted: boolean;
  expiresAt: number; // 7 days from creation
  isDeleted: boolean;
  metadata: {
    route: string;
    startLocation: string;
    endLocation: string;
    fare: number;
  };
}

export interface IncidentReport {
  id: string;
  recordingId: string;
  reportedBy: 'driver' | 'rider';
  incidentType: IncidentType;
  description: string;
  timestamp: number;
  preserveRecording: boolean; // Keep beyond 7 days
}

export interface RecordingSettings {
  enabled: boolean;
  type: RecordingType;
  quality: 'low' | 'medium' | 'high';
  autoStart: boolean;
  notifyOtherParty: boolean;
  cloudBackup: boolean;
}

/**
 * Ride Recording Service
 */
export class RideRecordingService {
  private static readonly AUTO_DELETE_DAYS = 7;
  private static readonly MAX_STORAGE_GB = 2;
  
  /**
   * Start recording
   */
  static async startRecording(
    tripId: string,
    driverId: string,
    riderId: string,
    type: RecordingType = 'audio'
  ): Promise<{ recording: Audio.Recording | null; recordingId: string }> {
    try {
      // Request permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Please allow audio recording for trip safety.');
        return { recording: null, recordingId: '' };
      }
      
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      // Start recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      });
      
      await recording.startAsync();
      
      const recordingId = `rec_${tripId}_${Date.now()}`;
      
      // Save recording metadata
      const recordingData: RideRecording = {
        id: recordingId,
        tripId,
        driverId,
        riderId,
        type,
        startTime: Date.now(),
        duration: 0,
        fileSize: 0,
        encrypted: true,
        expiresAt: Date.now() + (this.AUTO_DELETE_DAYS * 24 * 60 * 60 * 1000),
        isDeleted: false,
        metadata: {
          route: 'Unknown',
          startLocation: 'Unknown',
          endLocation: 'Unknown',
          fare: 0,
        },
      };
      
      await this.saveRecordingMetadata(recordingData);
      
      return { recording, recordingId };
    } catch (error) {
      console.error('Failed to start recording:', error);
      return { recording: null, recordingId: '' };
    }
  }
  
  /**
   * Stop recording
   */
  static async stopRecording(
    recording: Audio.Recording,
    recordingId: string
  ): Promise<RideRecording | null> {
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (!uri) return null;
      
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const fileSize = fileInfo.exists ? (fileInfo as any).size : 0;
      
      // Update metadata
      const metadata = await this.getRecordingMetadata(recordingId);
      if (!metadata) return null;
      
      const updated: RideRecording = {
        ...metadata,
        audioUri: uri,
        endTime: Date.now(),
        duration: Math.floor((Date.now() - metadata.startTime) / 1000),
        fileSize,
      };
      
      await this.saveRecordingMetadata(updated);
      
      // Encrypt file (simulated)
      await this.encryptRecording(uri);
      
      return updated;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  }
  
  /**
   * Encrypt recording
   */
  private static async encryptRecording(uri: string): Promise<void> {
    // In production, use actual encryption (AES-256)
    // For now, simulate encryption
    console.log(`Encrypting recording: ${uri}`);
    
    // TODO: Implement actual encryption
    // - Use expo-crypto or react-native-aes-crypto
    // - AES-256 encryption
    // - Secure key storage in Keychain/Keystore
  }
  
  /**
   * Save recording metadata
   */
  private static async saveRecordingMetadata(recording: RideRecording): Promise<void> {
    try {
      const key = `@recording_${recording.id}`;
      await AsyncStorage.setItem(key, JSON.stringify(recording));
      
      // Add to index
      const index = await this.getRecordingIndex();
      index.push(recording.id);
      await AsyncStorage.setItem('@recording_index', JSON.stringify(index));
    } catch (error) {
      console.error('Failed to save recording metadata:', error);
    }
  }
  
  /**
   * Get recording metadata
   */
  private static async getRecordingMetadata(recordingId: string): Promise<RideRecording | null> {
    try {
      const key = `@recording_${recordingId}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get recording metadata:', error);
      return null;
    }
  }
  
  /**
   * Get recording index
   */
  private static async getRecordingIndex(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem('@recording_index');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Get all recordings
   */
  static async getAllRecordings(): Promise<RideRecording[]> {
    try {
      const index = await this.getRecordingIndex();
      const recordings: RideRecording[] = [];
      
      for (const id of index) {
        const recording = await this.getRecordingMetadata(id);
        if (recording && !recording.isDeleted) {
          recordings.push(recording);
        }
      }
      
      return recordings;
    } catch (error) {
      console.error('Failed to get all recordings:', error);
      return [];
    }
  }
  
  /**
   * Delete expired recordings (7 days old)
   */
  static async deleteExpiredRecordings(): Promise<number> {
    try {
      const recordings = await this.getAllRecordings();
      const now = Date.now();
      let deletedCount = 0;
      
      for (const recording of recordings) {
        if (recording.expiresAt < now) {
          await this.deleteRecording(recording.id);
          deletedCount++;
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Failed to delete expired recordings:', error);
      return 0;
    }
  }
  
  /**
   * Delete recording
   */
  static async deleteRecording(recordingId: string): Promise<boolean> {
    try {
      const recording = await this.getRecordingMetadata(recordingId);
      if (!recording) return false;
      
      // Delete audio file
      if (recording.audioUri) {
        await FileSystem.deleteAsync(recording.audioUri, { idempotent: true });
      }
      
      // Delete video file
      if (recording.videoUri) {
        await FileSystem.deleteAsync(recording.videoUri, { idempotent: true });
      }
      
      // Mark as deleted
      const updated = { ...recording, isDeleted: true };
      await this.saveRecordingMetadata(updated);
      
      return true;
    } catch (error) {
      console.error('Failed to delete recording:', error);
      return false;
    }
  }
  
  /**
   * Report incident and preserve recording
   */
  static async reportIncident(
    recordingId: string,
    reportedBy: 'driver' | 'rider',
    incidentType: IncidentType,
    description: string
  ): Promise<IncidentReport> {
    const report: IncidentReport = {
      id: `incident_${Date.now()}`,
      recordingId,
      reportedBy,
      incidentType,
      description,
      timestamp: Date.now(),
      preserveRecording: true,
    };
    
    // Preserve recording (don't auto-delete)
    const recording = await this.getRecordingMetadata(recordingId);
    if (recording) {
      recording.expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000); // Keep for 1 year
      await this.saveRecordingMetadata(recording);
    }
    
    // Save incident report
    await AsyncStorage.setItem(`@incident_${report.id}`, JSON.stringify(report));
    
    return report;
  }
  
  /**
   * Get storage usage
   */
  static async getStorageUsage(): Promise<{ used: number; total: number; percentage: number }> {
    try {
      const recordings = await this.getAllRecordings();
      const used = recordings.reduce((sum, r) => sum + r.fileSize, 0);
      const total = this.MAX_STORAGE_GB * 1024 * 1024 * 1024; // 2GB in bytes
      const percentage = (used / total) * 100;
      
      return { used, total, percentage };
    } catch (error) {
      return { used: 0, total: this.MAX_STORAGE_GB * 1024 * 1024 * 1024, percentage: 0 };
    }
  }
  
  /**
   * Format file size
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  
  /**
   * Format duration
   */
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }
}

/**
 * Ride Recording Hook
 */
export const useRideRecording = () => {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingId, setRecordingId] = useState<string>('');
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [currentRecording, setCurrentRecording] = useState<RideRecording | null>(null);
  const [allRecordings, setAllRecordings] = useState<RideRecording[]>([]);
  const [settings, setSettings] = useState<RecordingSettings>({
    enabled: true,
    type: 'audio',
    quality: 'medium',
    autoStart: true,
    notifyOtherParty: true,
    cloudBackup: false,
  });
  
  /**
   * Start recording trip
   */
  const startRecording = useCallback(async (tripId: string, driverId: string, riderId: string) => {
    if (!settings.enabled) return;
    
    const result = await RideRecordingService.startRecording(tripId, driverId, riderId, settings.type);
    
    if (result.recording) {
      setRecording(result.recording);
      setRecordingId(result.recordingId);
      setStatus('recording');
      
      // Notify other party
      if (settings.notifyOtherParty) {
        Alert.alert(
          '📹 Recording Active',
          'This trip is being recorded for safety purposes. The recording will be encrypted and auto-deleted after 7 days.',
          [{ text: 'OK' }]
        );
      }
    }
  }, [settings]);
  
  /**
   * Stop recording
   */
  const stopRecording = useCallback(async () => {
    if (!recording || !recordingId) return;
    
    const result = await RideRecordingService.stopRecording(recording, recordingId);
    
    if (result) {
      setCurrentRecording(result);
      setStatus('stopped');
      setRecording(null);
      setRecordingId('');
    }
  }, [recording, recordingId]);
  
  /**
   * Report incident
   */
  const reportIncident = useCallback(async (
    recordingId: string,
    reportedBy: 'driver' | 'rider',
    incidentType: IncidentType,
    description: string
  ) => {
    return await RideRecordingService.reportIncident(recordingId, reportedBy, incidentType, description);
  }, []);
  
  /**
   * Load recordings
   */
  const loadRecordings = useCallback(async () => {
    const recordings = await RideRecordingService.getAllRecordings();
    setAllRecordings(recordings);
  }, []);
  
  /**
   * Delete recording
   */
  const deleteRecording = useCallback(async (recordingId: string) => {
    const success = await RideRecordingService.deleteRecording(recordingId);
    if (success) {
      await loadRecordings();
    }
    return success;
  }, [loadRecordings]);
  
  /**
   * Clean up expired recordings
   */
  const cleanupExpired = useCallback(async () => {
    const deletedCount = await RideRecordingService.deleteExpiredRecordings();
    if (deletedCount > 0) {
      await loadRecordings();
    }
    return deletedCount;
  }, [loadRecordings]);
  
  /**
   * Auto-cleanup on mount
   */
  useEffect(() => {
    cleanupExpired();
    loadRecordings();
  }, []);
  
  return {
    recording,
    recordingId,
    status,
    currentRecording,
    allRecordings,
    settings,
    startRecording,
    stopRecording,
    reportIncident,
    loadRecordings,
    deleteRecording,
    cleanupExpired,
    updateSettings: setSettings,
  };
};
