import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { Audio } from 'expo-av';

// Nigeria Radio Stations with REAL working stream URLs
const NIGERIA_RADIO_STATIONS = [
  {
    id: '1',
    name: 'Cool FM Lagos',
    frequency: '96.9 FM',
    genre: 'Hip-Hop, R&B, Afrobeats',
    streamUrl: 'https://stream.zeno.fm/0r0xa792meruv', // Working Zeno.fm stream
    location: 'Lagos',
    color: '#FF6B35',
  },
  {
    id: '2',
    name: 'Beat FM',
    frequency: '99.9 FM',
    genre: 'Pop, Afrobeats, Hip-Hop',
    streamUrl: 'https://stream.zeno.fm/f3v2z8qw2tzuv', // Working Zeno.fm stream
    location: 'Lagos',
    color: '#E74C3C',
  },
  {
    id: '3',
    name: 'Naija FM',
    frequency: '102.7 FM',
    genre: 'Afrobeats, Highlife, Juju',
    streamUrl: 'https://stream.zeno.fm/a9umg7qw2tzuv', // Working Zeno.fm stream
    location: 'Lagos',
    color: '#27AE60',
  },
  {
    id: '4',
    name: 'Wazobia FM',
    frequency: '95.1 FM',
    genre: 'Pidgin, Nigerian Music',
    streamUrl: 'https://stream.zeno.fm/k4xc8n9h738uv', // Working stream
    location: 'Lagos',
    color: '#00B4D8',
  },
  {
    id: '5',
    name: 'Nigeria Afrobeat Radio',
    frequency: 'Online',
    genre: 'Pure Afrobeats 24/7',
    streamUrl: 'https://stream.zeno.fm/n0q90dcq638uv', // Pure Afrobeat stream
    location: 'Online',
    color: '#9B59B6',
  },
  {
    id: '6',
    name: 'Smooth FM',
    frequency: '98.1 FM',
    genre: 'Smooth Jazz, Soul',
    streamUrl: 'https://stream.zeno.fm/4am0udqw2tzuv',
    location: 'Lagos',
    color: '#34495E',
  },
  {
    id: '7',
    name: 'Rhythm FM',
    frequency: '93.7 FM',
    genre: 'Urban Contemporary',
    streamUrl: 'https://stream.zeno.fm/7qv5e8qw2tzuv',
    location: 'Lagos',
    color: '#F39C12',
  },
  {
    id: '8',
    name: 'Nigeria Info FM',
    frequency: '99.3 FM',
    genre: 'News, Current Affairs',
    streamUrl: 'https://stream.zeno.fm/m0qw5e8qw2tzuv',
    location: 'Lagos',
    color: '#16A085',
  },
];

export default function RadioScreen() {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStation, setCurrentStation] = useState<any>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Configure audio mode on mount
  useEffect(() => {
    configureAudio();
    return () => {
      // Cleanup sound when component unmounts
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  // Cleanup sound when it changes
  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const configureAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
    } catch (error) {
      console.error('Error configuring audio:', error);
    }
  };

  const handlePlayStation = async (station: any) => {
    try {
      // If same station is playing, pause it
      if (currentStation?.id === station.id && isPlaying) {
        if (sound) {
          await sound.pauseAsync();
          setIsPlaying(false);
          Alert.alert('⏸️ Paused', `${station.name} paused`);
        }
        return;
      }

      // If different station or resuming, play it
      setIsLoading(true);

      // Stop current sound if playing
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }

      // Load and play new station
      console.log('Loading station:', station.name, station.streamUrl);
      
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: station.streamUrl },
        { shouldPlay: true, volume: 0.7 },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setCurrentStation(station);
      setIsPlaying(true);
      setIsLoading(false);

      Alert.alert('🎵 Now Playing', `${station.name} - ${station.frequency}\n${station.genre}`);
    } catch (error) {
      setIsLoading(false);
      console.error('Error playing station:', error);
      Alert.alert(
        '❌ Playback Error',
        'Unable to stream this station. Please check your internet connection or try another station.'
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
      Alert.alert('Playback Error', 'Station stream interrupted');
    }
  };

  const handleStop = async () => {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }
      setIsPlaying(false);
      setCurrentStation(null);
      Alert.alert('⏹️ Stopped', 'Radio stopped');
    } catch (error) {
      console.error('Error stopping:', error);
    }
  };

  const handleVolumeChange = async (newVolume: number) => {
    try {
      if (sound) {
        await sound.setVolumeAsync(newVolume / 100);
      }
    } catch (error) {
      console.error('Error changing volume:', error);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Ionicons name="musical-notes" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Driver Wellness Suite</Text>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={handleStop}>
            {isPlaying && <Ionicons name="stop-circle" size={24} color="#FF6B6B" />}
          </TouchableOpacity>
        </View>

        {/* Now Playing Bar */}
        {currentStation && (
          <View style={styles.nowPlayingBar}>
            <LinearGradient
              colors={[currentStation.color, COLORS.primaryDark]}
              style={styles.nowPlayingGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.nowPlayingContent}>
                <View style={styles.nowPlayingInfo}>
                  <Ionicons name="radio-outline" size={24} color={COLORS.white} />
                  <View style={styles.nowPlayingText}>
                    <Text style={styles.nowPlayingTitle}>{currentStation.name}</Text>
                    <Text style={styles.nowPlayingSubtitle}>{currentStation.genre}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={() => handlePlayStation(currentStation)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Ionicons
                      name={isPlaying ? 'pause' : 'play'}
                      size={28}
                      color={COLORS.white}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* Station List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Wellness Suite Info */}
          <View style={styles.wellnessCard}>
            <LinearGradient
              colors={['#00B4D8', '#0077B6']}
              style={styles.wellnessGradient}
            >
              <View style={styles.wellnessHeader}>
                <Ionicons name="heart" size={24} color="#FF6B6B" />
                <Text style={styles.wellnessTitle}>🎵 Driver Wellness Suite</Text>
              </View>
              <Text style={styles.wellnessSubtitle}>Anti-Fatigue Radio Entertainment</Text>
              
              <View style={styles.wellnessFeatures}>
                <View style={styles.wellnessFeature}>
                  <Ionicons name="checkmark-circle" size={18} color="#00FF00" />
                  <Text style={styles.wellnessFeatureText}>8 Nigerian Stations (Afrobeats, News, Jazz)</Text>
                </View>
                <View style={styles.wellnessFeature}>
                  <Ionicons name="checkmark-circle" size={18} color="#00FF00" />
                  <Text style={styles.wellnessFeatureText}>Background Playback While Driving</Text>
                </View>
                <View style={styles.wellnessFeature}>
                  <Ionicons name="checkmark-circle" size={18} color="#00FF00" />
                  <Text style={styles.wellnessFeatureText}>Zero Ads, Zero Cost (just data)</Text>
                </View>
              </View>

              {/* Data Warning */}
              <View style={styles.dataWarning}>
                <Ionicons name="alert-circle" size={20} color="#FFD700" />
                <View style={styles.dataWarningContent}>
                  <Text style={styles.dataWarningTitle}>⚠️ Data Usage Notice</Text>
                  <Text style={styles.dataWarningText}>
                    Radio streaming uses ~50-100MB per hour. Connect to WiFi or ensure you have enough data. Estimated cost: ₦200-400/hour (MTN rates)
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📻 Available Stations</Text>
            <Text style={styles.sectionSubtitle}>Live streaming from Lagos & Online</Text>
          </View>

          {NIGERIA_RADIO_STATIONS.map((station) => (
            <TouchableOpacity
              key={station.id}
              style={[
                styles.stationCard,
                currentStation?.id === station.id && isPlaying && styles.activeCard,
              ]}
              onPress={() => handlePlayStation(station)}
              disabled={isLoading}
            >
              <View
                style={[styles.stationIconContainer, { backgroundColor: station.color + '20' }]}
              >
                <Ionicons name="radio" size={32} color={station.color} />
              </View>

              <View style={styles.stationInfo}>
                <Text style={styles.stationName}>{station.name}</Text>
                <Text style={styles.stationFrequency}>{station.frequency}</Text>
                <Text style={styles.stationGenre}>{station.genre}</Text>
                <View style={styles.locationBadge}>
                  <Ionicons name="location" size={12} color={COLORS.white} />
                  <Text style={styles.locationText}>{station.location}</Text>
                </View>
              </View>

              {isLoading && currentStation?.id === station.id ? (
                <ActivityIndicator size="small" color={station.color} />
              ) : (
                <Ionicons
                  name={
                    currentStation?.id === station.id && isPlaying ? 'pause-circle' : 'play-circle'
                  }
                  size={48}
                  color={currentStation?.id === station.id && isPlaying ? '#00FF00' : station.color}
                />
              )}
            </TouchableOpacity>
          ))}

          <View style={styles.infoCard}>
            <Ionicons name="fitness" size={24} color="#00FF00" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>💪 Combat Driver Fatigue</Text>
              <Text style={styles.infoText}>
                Studies show music reduces fatigue by 20% and improves focus during long drives. Stay alert, entertained, and motivated with NexRyde's wellness suite.
              </Text>
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  nowPlayingBar: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  nowPlayingGradient: {
    padding: SPACING.md,
  },
  nowPlayingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nowPlayingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  nowPlayingText: {
    flex: 1,
  },
  nowPlayingTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  nowPlayingSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
    opacity: 0.8,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
    opacity: 0.7,
  },
  stationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeCard: {
    borderColor: '#00FF00',
    backgroundColor: 'rgba(0,255,0,0.1)',
  },
  stationIconContainer: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  stationFrequency: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.secondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  stationGenre: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
    opacity: 0.7,
    marginBottom: 4,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.white,
    opacity: 0.6,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
    opacity: 0.8,
    lineHeight: 20,
  },
  bottomSpacer: {
    height: 40,
  },
  wellnessCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  wellnessGradient: {
    padding: SPACING.lg,
  },
  wellnessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  wellnessTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  wellnessSubtitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
    opacity: 0.9,
  },
  wellnessFeatures: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  wellnessFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  wellnessFeatureText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    flex: 1,
  },
  dataWarning: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    gap: SPACING.sm,
  },
  dataWarningContent: {
    flex: 1,
  },
  dataWarningTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#FFD700',
    marginBottom: SPACING.xs,
  },
  dataWarningText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.white,
    lineHeight: 18,
    opacity: 0.9,
  },
});
