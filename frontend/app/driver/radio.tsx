import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { getRadioStations } from '@/src/services/api';

type Station = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  stream_url: string;
  frequency?: string;
};

export default function DriverRadioScreen() {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    loadStations();
    return () => {
      if (playerRef.current) {
        playerRef.current.release();
      }
    };
  }, []);

  const loadStations = async () => {
    try {
      setIsLoading(true);
      const res = await getRadioStations();
      const rows = Array.isArray(res.data?.stations) ? res.data.stations : [];
      setStations(rows);
      if (!currentStation && rows[0]) setCurrentStation(rows[0]);
    } catch (e) {
      if (__DEV__) console.warn('Radio stations load failed', e);
      setStations([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const playStation = async (station: Station) => {
    try {
      setIsLoading(true);

      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.release();
        playerRef.current = null;
      }

      const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });

      const player = createAudioPlayer(station.stream_url);
      playerRef.current = player;
      player.play();

      setCurrentStation(station);
      setIsPlaying(true);
    } catch (error) {
      if (__DEV__) console.warn('Playback error', error);
      Alert.alert(
        'Streaming Error',
        `Could not connect to ${station.name}. Please check your internet connection and try again.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = async () => {
    if (!currentStation) return;
    if (!playerRef.current) {
      await playStation(currentStation);
      return;
    }
    try {
      if (isPlaying) {
        playerRef.current.pause();
        setIsPlaying(false);
      } else {
        playerRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      if (__DEV__) console.warn('Toggle error', error);
    }
  };

  const stopRadio = async () => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.release();
      } catch (error) {
        if (__DEV__) console.warn('Stop error', error);
      } finally {
        playerRef.current = null;
        setIsPlaying(false);
      }
    }
  };

  const stepStation = (direction: 1 | -1) => {
    if (!stations.length || !currentStation) return;
    const currentIndex = stations.findIndex((s) => s.id === currentStation.id);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + stations.length) % stations.length;
    playStation(stations[nextIndex]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Radio</Text>
        <TouchableOpacity onPress={stopRadio} style={styles.stopButton}>
          <Ionicons name="close-circle" size={24} color={COLORS.lightTextSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStations(); }} />}
      >
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
          <Text style={styles.nowPlayingStation}>{currentStation?.name || 'No station selected'}</Text>
          <Text style={styles.nowPlayingFreq}>{currentStation?.frequency || 'Live'}</Text>

          {isPlaying && (
            <View style={styles.liveIndicator}>
              <View style={styles.livePulse} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlButton} onPress={() => stepStation(-1)} disabled={isLoading || !stations.length}>
              <Ionicons name="play-skip-back" size={28} color={COLORS.lightTextSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.playButton} onPress={togglePlayPause} disabled={isLoading || !currentStation}>
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color={COLORS.white} />
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlButton} onPress={() => stepStation(1)} disabled={isLoading || !stations.length}>
              <Ionicons name="play-skip-forward" size={28} color={COLORS.lightTextSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Available Stations ({stations.length})</Text>

        {!stations.length && !isLoading ? (
          <View style={styles.emptyState}>
            <Ionicons name="radio-outline" size={40} color={COLORS.lightTextMuted} />
            <Text style={styles.emptyText}>No radio stations configured yet.</Text>
          </View>
        ) : (
          stations.map((station) => (
            <TouchableOpacity
              key={station.id}
              style={[styles.stationCard, currentStation?.id === station.id && styles.stationCardActive]}
              onPress={() => playStation(station)}
              disabled={isLoading}
            >
              <View style={[styles.stationIcon, currentStation?.id === station.id && styles.stationIconActive]}>
                <Ionicons
                  name={(station.icon as any) || 'radio'}
                  size={28}
                  color={currentStation?.id === station.id ? COLORS.white : COLORS.accentGreen}
                />
              </View>

              <View style={styles.stationInfo}>
                <Text style={[styles.stationName, currentStation?.id === station.id && styles.stationNameActive]}>
                  {station.name}
                </Text>
                <Text style={styles.stationDesc}>
                  {station.description} • {station.frequency || 'Live'}
                </Text>
              </View>

              {currentStation?.id === station.id && isPlaying && (
                <View style={styles.playingBadge}>
                  <Ionicons name="volume-high" size={20} color={COLORS.accentGreen} />
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={COLORS.accentBlue} />
          <Text style={styles.infoText}>
            Radio continues playing in the background while you drive. Pull down to refresh stations.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
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
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.lightTextPrimary },
  stopButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  nowPlayingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  playerVisual: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.lightBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  nowPlayingLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.lightTextSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.xs,
  },
  nowPlayingStation: { fontSize: 24, fontWeight: '900', color: COLORS.lightTextPrimary, marginBottom: 4, textAlign: 'center' },
  nowPlayingFreq: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.accentGreen, marginBottom: SPACING.md },
  liveIndicator: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accentGreenSoft, paddingHorizontal: SPACING.sm,
    paddingVertical: 4, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.lg, gap: 6,
  },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accentGreen },
  liveText: { fontSize: 11, fontWeight: '800', color: COLORS.accentGreen, letterSpacing: 0.5 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xl },
  controlButton: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.lightBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  playButton: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.accentGreen, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.accentGreen, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.lightTextPrimary, marginBottom: SPACING.md },
  emptyState: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, alignItems: 'center', marginBottom: SPACING.md },
  emptyText: { marginTop: SPACING.xs, color: COLORS.lightTextMuted, fontWeight: '600' },
  stationCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 2, borderColor: 'transparent',
  },
  stationCardActive: { borderColor: COLORS.accentGreen },
  stationIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md,
  },
  stationIconActive: { backgroundColor: COLORS.accentGreen },
  stationInfo: { flex: 1 },
  stationName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.lightTextPrimary, marginBottom: 2 },
  stationNameActive: { color: COLORS.accentGreen },
  stationDesc: { fontSize: FONT_SIZE.xs, color: COLORS.lightTextSecondary },
  playingBadge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginTop: SPACING.lg, gap: SPACING.sm,
  },
  infoText: { flex: 1, fontSize: FONT_SIZE.xs, color: COLORS.lightTextSecondary, lineHeight: 18 },
});
