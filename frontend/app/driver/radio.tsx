import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

// Nigeria Radio Stations (FREE API - Radio.Garden, TuneIn, or direct streams)
const NIGERIA_RADIO_STATIONS = [
  {
    id: '1',
    name: 'Cool FM Lagos',
    frequency: '96.9 FM',
    genre: 'Hip-Hop, R&B',
    logo: 'https://cdn-profiles.tunein.com/s24948/images/logog.png',
    streamUrl: 'http://coollagos.cdn.streamora.net:8000/live',
    location: 'Lagos',
    color: '#FF6B35',
  },
  {
    id: '2',
    name: 'Wazobia FM',
    frequency: '95.1 FM',
    genre: 'Pidgin, Talk',
    logo: 'https://wazobialagos.com/wp-content/uploads/2019/08/cropped-Logo.png',
    streamUrl: 'http://stream.zeno.fm/k4xc8n9h738uv',
    location: 'Lagos',
    color: '#00B4D8',
  },
  {
    id: '3',
    name: 'Smooth FM',
    frequency: '98.1 FM',
    genre: 'Smooth Jazz, Soul',
    logo: 'https://smoothlagos.com/assets/images/logo.png',
    streamUrl: 'http://smoothlagos.cdn.streamora.net:8000/live',
    location: 'Lagos',
    color: '#9B59B6',
  },
  {
    id: '4',
    name: 'Beat FM',
    frequency: '99.9 FM',
    genre: 'Pop, Afrobeats',
    logo: 'https://beatfm.ng/wp-content/uploads/2020/01/logo.png',
    streamUrl: 'http://beatfmlagos.cdn.streamora.net:8000/live',
    location: 'Lagos',
    color: '#E74C3C',
  },
  {
    id: '5',
    name: 'Naija FM',
    frequency: '102.7 FM',
    genre: 'Afrobeats, Highlife',
    logo: 'https://naijafm.com/assets/images/logo.png',
    streamUrl: 'http://naijafm.cdn.streamora.net:8000/live',
    location: 'Lagos',
    color: '#27AE60',
  },
  {
    id: '6',
    name: 'Classic FM',
    frequency: '97.3 FM',
    genre: 'News, Talk',
    logo: 'https://classicfm.ng/assets/images/logo.png',
    streamUrl: 'http://classicfm.cdn.streamora.net:8000/live',
    location: 'Lagos',
    color: '#34495E',
  },
  {
    id: '7',
    name: 'Rhythm FM',
    frequency: '93.7 FM',
    genre: 'Urban Contemporary',
    logo: 'https://rhythmfm.ng/assets/images/logo.png',
    streamUrl: 'http://rhythmfm.cdn.streamora.net:8000/live',
    location: 'Lagos',
    color: '#F39C12',
  },
  {
    id: '8',
    name: 'Nigeria Info FM',
    frequency: '99.3 FM',
    genre: 'News, Current Affairs',
    logo: 'https://nigeriainfofm.com/assets/images/logo.png',
    streamUrl: 'http://nigeriainfo.cdn.streamora.net:8000/live',
    location: 'Lagos',
    color: '#16A085',
  },
];

export default function RadioScreen() {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState<any>(null);
  const [volume, setVolume] = useState(70);

  const handlePlayStation = (station: any) => {
    if (currentStation?.id === station.id && isPlaying) {
      // Pause current station
      setIsPlaying(false);
      Alert.alert('Paused', `${station.name} paused`);
    } else {
      // Play new station
      setCurrentStation(station);
      setIsPlaying(true);
      Alert.alert('Now Playing', `${station.name} - ${station.frequency}`);
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentStation(null);
    Alert.alert('Stopped', 'Radio stopped');
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
            <Ionicons name="radio" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Nigeria Radio</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        {/* Now Playing Bar */}
        {currentStation && (
          <View style={styles.nowPlayingBar}>
            <LinearGradient
              colors={[currentStation.color, COLORS.primaryDark]}
              style={styles.nowPlayingGradient}
            >
              <View style={styles.nowPlayingContent}>
                <View style={styles.nowPlayingInfo}>
                  <View style={styles.pulseIndicator}>
                    {isPlaying && <View style={styles.pulse} />}
                  </View>
                  <View>
                    <Text style={styles.nowPlayingTitle}>{currentStation.name}</Text>
                    <Text style={styles.nowPlayingFreq}>{currentStation.frequency}</Text>
                  </View>
                </View>
                <View style={styles.nowPlayingControls}>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => handlePlayStation(currentStation)}
                  >
                    <Ionicons
                      name={isPlaying ? 'pause' : 'play'}
                      size={24}
                      color={COLORS.white}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.controlButton} onPress={handleStop}>
                    <Ionicons name="stop" size={24} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* Stations List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🇳🇬 Nigerian Stations</Text>
            <Text style={styles.sectionSubtitle}>
              {NIGERIA_RADIO_STATIONS.length} stations available
            </Text>
          </View>

          {NIGERIA_RADIO_STATIONS.map((station) => (
            <TouchableOpacity
              key={station.id}
              style={[
                styles.stationCard,
                currentStation?.id === station.id && styles.stationCardActive,
              ]}
              onPress={() => handlePlayStation(station)}
            >
              <View
                style={[
                  styles.stationColorBar,
                  { backgroundColor: station.color },
                ]}
              />
              
              <View style={styles.stationContent}>
                <View style={styles.stationInfo}>
                  <View style={styles.stationHeader}>
                    <Text style={styles.stationName}>{station.name}</Text>
                    {currentStation?.id === station.id && isPlaying && (
                      <View style={styles.playingBadge}>
                        <View style={styles.soundWave}>
                          <View style={[styles.bar, styles.bar1]} />
                          <View style={[styles.bar, styles.bar2]} />
                          <View style={[styles.bar, styles.bar3]} />
                        </View>
                        <Text style={styles.playingText}>LIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.stationFrequency}>{station.frequency}</Text>
                  <View style={styles.stationMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="musical-notes" size={14} color={COLORS.lightTextMuted} />
                      <Text style={styles.metaText}>{station.genre}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="location" size={14} color={COLORS.lightTextMuted} />
                      <Text style={styles.metaText}>{station.location}</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.playButton,
                    currentStation?.id === station.id && isPlaying && styles.playButtonActive,
                  ]}
                  onPress={() => handlePlayStation(station)}
                >
                  <Ionicons
                    name={
                      currentStation?.id === station.id && isPlaying
                        ? 'pause'
                        : 'play'
                    }
                    size={24}
                    color={COLORS.white}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}

          {/* Coming Soon Section */}
          <View style={styles.comingSoonSection}>
            <View style={styles.comingSoonHeader}>
              <Text style={styles.comingSoonTitle}>🔜 Coming Soon</Text>
            </View>
            <View style={styles.comingSoonCard}>
              <Ionicons name="music-note" size={32} color={COLORS.accentGreen} />
              <Text style={styles.comingSoonFeature}>Podcasts & Audiobooks</Text>
            </View>
            <View style={styles.comingSoonCard}>
              <Ionicons name="mic" size={32} color={COLORS.accentBlue} />
              <Text style={styles.comingSoonFeature}>Custom Playlists</Text>
            </View>
            <View style={styles.comingSoonCard}>
              <Ionicons name="headset" size={32} color={COLORS.accentOrange} />
              <Text style={styles.comingSoonFeature}>Premium Music Streaming</Text>
            </View>
          </View>
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    fontWeight: '700',
    color: COLORS.white,
  },
  nowPlayingBar: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  nowPlayingGradient: {
    padding: SPACING.md,
  },
  nowPlayingContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nowPlayingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  pulseIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
  },
  pulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
  },
  nowPlayingTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  nowPlayingFreq: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  nowPlayingControls: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  sectionHeader: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  stationCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  stationCardActive: {
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
  },
  stationColorBar: {
    height: 4,
    width: '100%',
  },
  stationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  stationInfo: {
    flex: 1,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  stationName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  playingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },
  soundWave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bar: {
    width: 3,
    backgroundColor: COLORS.accentGreen,
    borderRadius: 2,
  },
  bar1: {
    height: 8,
  },
  bar2: {
    height: 12,
  },
  bar3: {
    height: 6,
  },
  playingText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  stationFrequency: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.accentBlue,
    marginBottom: SPACING.xs,
  },
  stationMeta: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  metaText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonActive: {
    backgroundColor: COLORS.accentGreen,
  },
  comingSoonSection: {
    marginTop: SPACING.xl,
  },
  comingSoonHeader: {
    marginBottom: SPACING.md,
  },
  comingSoonTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  comingSoonCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  comingSoonFeature: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
});
