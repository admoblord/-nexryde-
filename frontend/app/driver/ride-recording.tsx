import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import {
  startRecording as startTripRecording,
  stopRecording as stopTripRecording,
  uploadTripVideoRecording,
} from '@/src/services/api';

export default function DriverRideRecordingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const currentTrip = useAppStore((s) => s.currentTrip);

  const [isRecording, setIsRecording]   = useState(false);
  const [recordingType, setRecordingType] = useState<'audio' | 'video' | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioRecording, setAudioRecording] = useState<Audio.Recording | null>(null);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [savingVideo, setSavingVideo]   = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const activeTripId = String(params.tripId || currentTrip?.id || '');

  useEffect(() => { void requestPermissions(); }, []);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const requestPermissions = async () => {
    try {
      const audio  = await Audio.requestPermissionsAsync();
      const camera = await Camera.requestCameraPermissionsAsync();
      if (audio.status === 'granted' && camera.status === 'granted') {
        setHasPermissions(true);
      } else {
        Alert.alert('Permissions Required', 'Camera and microphone permissions are needed for trip recording.');
      }
    } catch { /* silent */ }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const startRecording = async (type: 'audio' | 'video') => {
    if (!hasPermissions) { Alert.alert('Error', 'Recording permissions not granted.'); return; }
    if (!activeTripId)   { Alert.alert('Trip required', 'Start your trip before recording.'); return; }

    try {
      await startTripRecording(activeTripId);

      if (type === 'audio') {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        setAudioRecording(recording);
        setRecordingType('audio');
        setIsRecording(true);
        setRecordingTime(0);
        startedAtRef.current = Date.now();
        Alert.alert('Audio Recording Started', 'Audio is being saved securely as trip evidence.');
      } else {
        setRecordingType('video');
        setIsRecording(true);
        setRecordingTime(0);
        startedAtRef.current = Date.now();

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['videos'],
          quality: 0.7,
          videoMaxDuration: 180,
          allowsEditing: false,
        });

        if (result.canceled || !result.assets?.[0]?.uri) {
          setIsRecording(false);
          setRecordingType(null);
          await stopTripRecording(activeTripId);
          return;
        }

        const asset    = result.assets[0];
        const fileName = asset.fileName || `driver-trip-${activeTripId}-${Date.now()}.mp4`;
        const mimeType = asset.mimeType  || 'video/mp4';
        const durSecs  = asset.duration  ? Math.round(asset.duration / 1000) : recordingTime;

        const formData = new FormData();
        formData.append('duration_seconds', String(durSecs));
        formData.append('started_at', new Date(startedAtRef.current || Date.now()).toISOString());
        formData.append('stopped_at', new Date().toISOString());
        formData.append('source', 'driver_camera');
        formData.append('video', { uri: asset.uri, name: fileName, type: mimeType } as any);

        setSavingVideo(true);
        await uploadTripVideoRecording(activeTripId, formData);
        await stopTripRecording(activeTripId);

        setSavingVideo(false);
        setIsRecording(false);
        setRecordingType(null);
        setRecordingTime(0);
        Alert.alert('Video Uploaded', 'Trip video evidence uploaded and queued for admin review if needed.');
      }
    } catch {
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      try { await stopTripRecording(activeTripId); } catch { /* ignore */ }
      setSavingVideo(false);
      setIsRecording(false);
      setRecordingType(null);
    }
  };

  const stopRecording = async () => {
    try {
      if (audioRecording && recordingType === 'audio') {
        await audioRecording.stopAndUnloadAsync();
        setAudioRecording(null);
        if (activeTripId) await stopTripRecording(activeTripId);
        Alert.alert('Audio Saved', `${fmt(recordingTime)} audio recording saved securely.`);
      } else {
        Alert.alert('Recording Saved', `${recordingType} recording (${fmt(recordingTime)}) saved.`);
      }
      setIsRecording(false);
      setRecordingType(null);
      startedAtRef.current = null;
    } catch {
      Alert.alert('Error', 'Failed to stop recording properly.');
      setIsRecording(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <LinearGradient colors={['#0D1420', '#1A2332']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Ionicons name="videocam" size={20} color="#00D46A" />
          <Text style={s.headerTitle}>Trip Recording</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Live recording indicator */}
        {isRecording && (
          <View style={s.liveRow}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>
              {recordingType?.toUpperCase()} RECORDING — {fmt(recordingTime)}
            </Text>
          </View>
        )}
        {savingVideo && (
          <View style={[s.liveRow, { backgroundColor: 'rgba(14,165,233,0.18)' }]}>
            <Ionicons name="cloud-upload-outline" size={16} color="#0EA5E9" />
            <Text style={[s.liveText, { color: '#0EA5E9' }]}>Uploading to secure storage…</Text>
          </View>
        )}

        {/* Central icon */}
        <View style={[s.iconWrap, isRecording && s.iconWrapActive]}>
          <Ionicons
            name={isRecording ? (recordingType === 'video' ? 'videocam' : 'mic') : 'shield-checkmark'}
            size={58}
            color={isRecording ? '#EF4444' : '#00D46A'}
          />
        </View>

        <Text style={s.title}>
          {isRecording ? '🔴 Recording in Progress' : '🎬 Driver Trip Recording'}
        </Text>
        <Text style={s.subtitle}>
          {isRecording
            ? 'Your recording is saved securely as evidence'
            : 'Record audio or video to protect yourself on every trip'}
        </Text>

        {activeTripId ? (
          <View style={s.tripBadge}>
            <Ionicons name="car-outline" size={14} color="#94A3B8" />
            <Text style={s.tripBadgeText}>Trip: #{activeTripId.slice(-6).toUpperCase()}</Text>
          </View>
        ) : (
          <View style={[s.tripBadge, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
            <Ionicons name="warning-outline" size={14} color="#F59E0B" />
            <Text style={[s.tripBadgeText, { color: '#F59E0B' }]}>No active trip — recording still possible</Text>
          </View>
        )}

        {/* Options / Stop */}
        {!isRecording ? (
          <View style={s.optionsRow}>
            <TouchableOpacity style={s.optionCard} onPress={() => startRecording('audio')} activeOpacity={0.8}>
              <LinearGradient colors={['rgba(147,51,234,0.25)', 'rgba(147,51,234,0.08)']} style={s.optionGrad}>
                <View style={[s.optionIcon, { backgroundColor: 'rgba(147,51,234,0.2)' }]}>
                  <Ionicons name="mic" size={32} color="#9333EA" />
                </View>
                <Text style={s.optionTitle}>Audio</Text>
                <Text style={s.optionDesc}>Capture voice & sound throughout the trip</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={s.optionCard} onPress={() => startRecording('video')} activeOpacity={0.8}>
              <LinearGradient colors={['rgba(239,68,68,0.2)', 'rgba(239,68,68,0.06)']} style={s.optionGrad}>
                <View style={[s.optionIcon, { backgroundColor: 'rgba(239,68,68,0.2)' }]}>
                  <Ionicons name="videocam" size={32} color="#EF4444" />
                </View>
                <Text style={s.optionTitle}>Video</Text>
                <Text style={s.optionDesc}>Record a short clip as trip evidence</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.stopBtn} onPress={stopRecording} activeOpacity={0.85}>
            <Ionicons name="stop-circle" size={22} color="#FFF" />
            <Text style={s.stopBtnText}>Stop Recording</Text>
          </TouchableOpacity>
        )}

        {/* Info card */}
        <View style={s.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#0EA5E9" />
          <View style={{ flex: 1 }}>
            <Text style={s.infoTitle}>Privacy & Security</Text>
            <Text style={s.infoText}>
              {'• Recordings are stored securely and never shared automatically\n'}
              {'• Only accessible by you or admin during a NEXRYDE Shield review\n'}
              {'• Auto-deleted after 30 days if no dispute is filed\n'}
              {'• Can be submitted directly as evidence in a Shield case'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1420' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },

  content: { alignItems: 'center', padding: 20, paddingBottom: 40 },

  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.18)',
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  liveText: { fontSize: 13, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 },

  iconWrap: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(0,212,106,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(0,212,106,0.3)',
    marginBottom: 20,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.4)',
  },

  title: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20, marginBottom: 16, maxWidth: 280 },

  tripBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(148,163,184,0.1)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    marginBottom: 28,
  },
  tripBadgeText: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },

  optionsRow: { flexDirection: 'row', gap: 12, marginBottom: 28, width: '100%' },
  optionCard: { flex: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(148,163,184,0.12)' },
  optionGrad: { alignItems: 'center', padding: 20, gap: 10 },
  optionIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: 15, fontWeight: '900', color: '#FFF' },
  optionDesc: { fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 16 },

  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EF4444', borderRadius: 16,
    paddingHorizontal: 32, paddingVertical: 16, marginBottom: 28,
  },
  stopBtnText: { fontSize: 16, fontWeight: '900', color: '#FFF' },

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: 'rgba(14,165,233,0.08)',
    borderRadius: 16, padding: 16, width: '100%',
    borderWidth: 1, borderColor: 'rgba(14,165,233,0.2)',
  },
  infoTitle: { fontSize: 13, fontWeight: '800', color: '#0EA5E9', marginBottom: 6 },
  infoText: { fontSize: 12, color: '#94A3B8', lineHeight: 20 },
});
