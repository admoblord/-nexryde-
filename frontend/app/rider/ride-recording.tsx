import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { startRecording as startTripRecording, stopRecording as stopTripRecording, uploadTripVideoRecording } from '@/src/services/api';

export default function RideRecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const currentTrip = useAppStore((s) => s.currentTrip);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<'audio' | 'video' | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioRecording, setAudioRecording] = useState<Audio.Recording | null>(null);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const activeTripId = String(params.tripId || currentTrip?.id || '');

  useEffect(() => {
    requestPermissions();
  }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const requestPermissions = async () => {
    try {
      const audioStatus = await Audio.requestPermissionsAsync();
      const cameraStatus = await Camera.requestCameraPermissionsAsync();
      
      if (audioStatus.status === 'granted' && cameraStatus.status === 'granted') {
        setHasPermissions(true);
      } else {
        Alert.alert(
          'Permissions Required',
          'Camera and microphone permissions are needed for ride recording.'
        );
      }
    } catch (error) {
      console.error('Permission error:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async (type: 'audio' | 'video') => {
    if (!hasPermissions) {
      Alert.alert('Error', 'Recording permissions not granted');
      return;
    }
    if (!activeTripId) {
      Alert.alert('Trip required', 'Open ride recording while your trip is active.');
      return;
    }

    try {
      await startTripRecording(activeTripId);
      if (type === 'audio') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        
        setAudioRecording(recording);
        setRecordingType('audio');
        setIsRecording(true);
        setRecordingTime(0);
        startedAtRef.current = Date.now();
        
        Alert.alert(
          '🎙️ Audio Recording Started',
          'Recording will be saved securely and can be used as evidence if needed.'
        );
      } else {
        setRecordingType('video');
        setIsRecording(true);
        setRecordingTime(0);
        startedAtRef.current = Date.now();

        // Opens native phone camera directly for trip evidence capture.
        const videoResult = await ImagePicker.launchCameraAsync({
          mediaTypes: ['videos'],
          quality: 0.7,
          videoMaxDuration: 180,
          allowsEditing: false,
        });
        if (videoResult.canceled || !videoResult.assets?.[0]?.uri) {
          setIsRecording(false);
          setRecordingType(null);
          await stopTripRecording(activeTripId);
          return;
        }

        const asset = videoResult.assets[0];
        const uri = asset.uri;
        const fileName = asset.fileName || `trip-${activeTripId}-${Date.now()}.mp4`;
        const mimeType = asset.mimeType || 'video/mp4';
        const durationSecs = asset.duration ? Math.round(asset.duration / 1000) : recordingTime;

        const formData = new FormData();
        formData.append('duration_seconds', String(durationSecs));
        formData.append('started_at', new Date(startedAtRef.current || Date.now()).toISOString());
        formData.append('stopped_at', new Date().toISOString());
        formData.append('source', 'rider_camera');
        formData.append('video', {
          uri,
          name: fileName,
          type: mimeType,
        } as any);

        setSavingVideo(true);
        await uploadTripVideoRecording(activeTripId, formData);
        await stopTripRecording(activeTripId);
        setSavingVideo(false);
        setIsRecording(false);
        setRecordingType(null);
        setRecordingTime(0);

        Alert.alert(
          '✅ Video Uploaded',
          'Trip video recording has been uploaded to backend and is now available in the admin review queue.'
        );
      }
    } catch (error) {
      console.error('Start recording error:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      if (activeTripId) {
        try {
          await stopTripRecording(activeTripId);
        } catch {}
      }
      setSavingVideo(false);
      setIsRecording(false);
      setRecordingType(null);
    }
  };

  const stopRecording = async () => {
    try {
      if (audioRecording && recordingType === 'audio') {
        await audioRecording.stopAndUnloadAsync();
        const uri = audioRecording.getURI();
        
        Alert.alert(
          '✅ Audio Recording Saved',
          `Your ${formatTime(recordingTime)} audio recording has been saved securely at: ${uri?.substring(0, 50)}...`,
          [{ text: 'OK' }]
        );
        
        setAudioRecording(null);
        if (activeTripId) {
          await stopTripRecording(activeTripId);
        }
      } else {
        Alert.alert(
          '✅ Recording Saved',
          `Your ${recordingType} recording (${formatTime(recordingTime)}) has been saved securely.`,
          [{ text: 'OK' }]
        );
      }
      
      setIsRecording(false);
      setRecordingType(null);
      startedAtRef.current = null;
    } catch (error) {
      console.error('Stop recording error:', error);
      Alert.alert('Error', 'Failed to stop recording properly.');
      setIsRecording(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1a1a2e', COLORS.primary]} style={styles.gradient}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride Recording</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.content}>
          {/* Recording Status */}
          {isRecording && (
            <View style={styles.recordingStatus}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>Recording {recordingType?.toUpperCase()}</Text>
              <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
            </View>
          )}

          {/* Main Icon */}
          <View style={[styles.iconContainer, isRecording && styles.iconContainerRecording]}>
            <Ionicons 
              name={isRecording ? (recordingType === 'video' ? 'videocam' : 'mic') : 'shield-checkmark'} 
              size={64} 
              color={isRecording ? COLORS.error : COLORS.accentGreen} 
            />
          </View>

          <Text style={styles.title}>
            {isRecording ? '🔴 Recording in Progress' : '🎬 Ride Safety Recording'}
          </Text>
          <Text style={styles.subtitle}>
            {isRecording 
              ? 'Your recording is being saved securely'
              : 'Record your ride for safety and evidence'}
          </Text>
          {!!activeTripId && (
            <Text style={styles.tripBadge}>Trip: {activeTripId}</Text>
          )}
          {savingVideo && (
            <Text style={styles.uploadingText}>Uploading video evidence to backend...</Text>
          )}

          {/* Recording Options */}
          {!isRecording ? (
            <View style={styles.optionsContainer}>
              <TouchableOpacity 
                style={styles.optionCard}
                onPress={() => startRecording('audio')}
              >
                <View style={[styles.optionIcon, { backgroundColor: '#9C27B020' }]}>
                  <Ionicons name="mic" size={32} color="#9C27B0" />
                </View>
                <Text style={styles.optionTitle}>Audio Recording</Text>
                <Text style={styles.optionDesc}>Record audio during your trip</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.optionCard}
                onPress={() => startRecording('video')}
              >
                <View style={[styles.optionIcon, { backgroundColor: '#E9194420' }]}>
                  <Ionicons name="videocam" size={32} color="#E91944" />
                </View>
                <Text style={styles.optionTitle}>Video Recording</Text>
                <Text style={styles.optionDesc}>Record video for extra safety</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
              <Ionicons name="stop-circle" size={24} color={COLORS.white} />
              <Text style={styles.stopButtonText}>Stop Recording</Text>
            </TouchableOpacity>
          )}

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={COLORS.accentBlue} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Privacy & Security</Text>
              <Text style={styles.infoText}>
                • Recordings are encrypted and stored securely{"\n"}
                • Only accessible by you and NEXRYDE support{"\n"}
                • Auto-deleted after 30 days if not flagged{"\n"}
                • Can be used as evidence in disputes
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: { padding: SPACING.sm },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.xl,
  },
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,0,0,0.2)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.xl,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.error,
  },
  recordingText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.error,
  },
  recordingTime: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,255,136,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  iconContainerRecording: {
    backgroundColor: 'rgba(255,0,0,0.2)',
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray300,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  tripBadge: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray300,
    marginBottom: SPACING.md,
  },
  uploadingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentBlue,
    marginBottom: SPACING.md,
    fontWeight: '700',
  },
  optionsContainer: {
    width: '100%',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  optionCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  optionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  optionDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.xl,
  },
  stopButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,150,255,0.1)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  infoContent: { flex: 1 },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.accentBlue,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray300,
    lineHeight: 20,
  },
});
