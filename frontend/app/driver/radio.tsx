import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAudioPlayer, AudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

// Real Nigerian Radio Station Streaming URLs
const STATIONS = [
  {
    id: 'nexryde',
    name: 'NEXRYDE FM',
    description: 'Naija Hits & Driver Vibes',
    icon: 'car',
    streamUrl: 'https://stream.zeno.fm/thbqnu2wvmzuv',
    frequency: '24/7',
  },
  {
    id: 'smooth',
    name: 'Smooth 98.1 FM',
    description: 'Soul, Jazz & Classics - Lagos',
    icon: 'musical-notes',
    streamUrl: 'https://stream.zeno.fm/04dyxm2rqy5tv',
    frequency: '98.1 FM',
  },
  {
    id: 'fresh',
    name: 'Fresh 105.3 FM',
    description: 'Fresh Music - Lagos',
    icon: 'radio',
    streamUrl: 'https://stream.zeno.fm/fgcaapesa78uv',
    frequency: '105.3 FM',
  },
  {
    id: 'kennis',
    name: 'Kennis 104.1 FM',
    description: 'Afrobeats & Entertainment',
    icon: 'pulse',
    streamUrl: 'https://stream.zeno.fm/cszax8ea7bruv',
    frequency: '104.1 FM',
  },
  {
    id: 'lagos_talks',
    name: 'Lagos Talks',
    description: 'News & Current Affairs',
    icon: 'chatbubbles',
    streamUrl: 'https://stream.zeno.fm/s32my50ywd0uv',
    frequency: '91.3 FM',
  },
  {
    id: 'inspiration',
    name: 'Inspiration FM',
    description: 'Uplifting Music & Talk',
    icon: 'sunny',
    streamUrl: 'https://stream.zeno.fm/bd69qqfg64zuv',
    frequency: '92.3 FM',
  },
  {
    id: 'ekofm',
    name: 'Eko FM',
    description: 'The Voice of Lagos',
    icon: 'mic',
    streamUrl: 'https://stream.zeno.fm/k5ijvlwyuszvv',
    frequency: '89.75 FM',
  },
  {
    id: 'radiolagos',
    name: 'Radio Lagos',
    description: 'Lagos State Broadcasting',
    icon: 'radio-outline',
    streamUrl: 'https://stream.zeno.fm/yqy6w4e82hhvv',
    frequency: '107.5 FM',
  },
];

export default function DriverRadioScreen() {
  const router = useRouter();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStation, setCurrentStation] = useState(STATIONS[0]);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // Setup audio mode
    setupAudio();
    
    return () => {
      // Cleanup on unmount
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const setupAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Audio setup error:', error);
    }
  };

  const playStation = async (station: typeof STATIONS[0]) => {
    try {
      setIsLoading(true);
      
      // Stop current stream if playing
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Create and load new sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: station.streamUrl },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      soundRef.current = newSound;
      setSound(newSound);
      setCurrentStation(station);
      setIsPlaying(true);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      console.error('Playback error:', error);
      Alert.alert(
        'Streaming Error',
        `Could not connect to ${station.name}. Please check your internet connection and try again.`,
        [{ text: 'OK' }]
      );
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    } else if (status.error) {
      console.error('Playback error:', status.error);
      setIsPlaying(false);
      setIsLoading(false);
    }
  };

  const togglePlayPause = async () => {
    if (!soundRef.current) {
      // Start playing if no sound loaded
      await playStation(currentStation);
      return;
    }

    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  const stopRadio = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setIsPlaying(false);
      } catch (error) {
        console.error('Stop error:', error);
      }
    }
  };

  const nextStation = () => {
    const currentIndex = STATIONS.findIndex(s => s.id === currentStation.id);
    const nextIndex = (currentIndex + 1) % STATIONS.length;
    playStation(STATIONS[nextIndex]);
  };

  const previousStation = () => {
    const currentIndex = STATIONS.findIndex(s => s.id === currentStation.id);
    const prevIndex = (currentIndex - 1 + STATIONS.length) % STATIONS.length;
    playStation(STATIONS[prevIndex]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Radio</Text>
        <TouchableOpacity onPress={stopRadio} style={styles.stopButton}>
          <Ionicons name="close-circle" size={24} color={COLORS.lightTextSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Now Playing Card */}
        <View style={styles.nowPlayingCard}>
          <View style={styles.playerVisual}>
            {isLoading ? (
              <ActivityIndicator size="large" color={COLORS.accentGreen} />
            ) : (
              <Ionicons 
                name={isPlaying ? 'radio' : 'radio-outline'} 
                size={64} 
                color={isPlaying ? COLORS.accentGreen : COLORS.lightTextMuted} 
              />
            )}
          </View>
          
          <Text style={styles.nowPlayingLabel}>Now Playing</Text>
          <Text style={styles.nowPlayingStation}>{currentStation.name}</Text>
          <Text style={styles.nowPlayingFreq}>{currentStation.frequency}</Text>

          {isPlaying && (
            <View style={styles.liveIndicator}>
              <View style={styles.livePulse} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}

          {/* Player Controls */}
          <View style={styles.controlsRow}>
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={previousStation}
              disabled={isLoading}
            >
              <Ionicons name="play-skip-back" size={28} color={COLORS.lightTextSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.playButton}
              onPress={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Ionicons 
                  name={isPlaying ? 'pause' : 'play'} 
                  size={36} 
                  color={COLORS.white} 
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.controlButton}
              onPress={nextStation}
              disabled={isLoading}
            >
              <Ionicons name="play-skip-forward" size={28} color={COLORS.lightTextSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Station List */}
        <Text style={styles.sectionTitle}>Available Stations ({STATIONS.length})</Text>

        {STATIONS.map((station) => (
          <TouchableOpacity 
            key={station.id} 
            style={[
              styles.stationCard,
              currentStation.id === station.id && styles.stationCardActive
            ]}
            onPress={() => playStation(station)}
            disabled={isLoading}
          >
            <View style={[
              styles.stationIcon,
              currentStation.id === station.id && styles.stationIconActive
            ]}>
              <Ionicons 
                name={station.icon as any} 
                size={28} 
                color={currentStation.id === station.id ? COLORS.white : COLORS.accentGreen} 
              />
            </View>
            
            <View style={styles.stationInfo}>
              <Text style={[
                styles.stationName,
                currentStation.id === station.id && styles.stationNameActive
              ]}>
                {station.name}
              </Text>
              <Text style={styles.stationDesc}>
                {station.description} • {station.frequency}
              </Text>
            </View>

            {currentStation.id === station.id && isPlaying && (
              <View style={styles.playingBadge}>
                <Ionicons name="volume-high" size={20} color={COLORS.accentGreen} />
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={COLORS.accentBlue} />
          <Text style={styles.infoText}>
            Radio continues playing in the background while you drive. Use volume buttons to adjust.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  stopButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  nowPlayingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  playerVisual: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  nowPlayingLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  nowPlayingStation: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  nowPlayingFreq: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentGreen,
    marginBottom: SPACING.md,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    gap: 6,
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accentGreen,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accentGreen,
    letterSpacing: 0.5,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xl,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  stationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stationCardActive: {
    borderColor: COLORS.accentGreen,
  },
  stationIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  stationIconActive: {
    backgroundColor: COLORS.accentGreen,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  stationNameActive: {
    color: COLORS.accentGreen,
  },
  stationDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
  },
  playingBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    lineHeight: 18,
  },
});
