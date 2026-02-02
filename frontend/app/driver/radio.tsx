import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function DriverRadioScreen() {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState('NEXRYDE FM');

  const stations = [
    { name: 'NEXRYDE FM', description: 'Traffic updates & driver tips', icon: 'car' },
    { name: 'Cool FM', description: 'Lagos 96.9', icon: 'musical-notes' },
    { name: 'Wazobia FM', description: 'Pidgin Radio', icon: 'radio' },
    { name: 'Beat FM', description: '99.9 Lagos', icon: 'pulse' },
  ];

  const handlePlay = (station: string) => {
    setCurrentStation(station);
    setIsPlaying(true);
    Alert.alert('Coming Soon', 'Radio streaming will be available in the next update!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Radio</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.nowPlayingCard}>
          <View style={styles.playerVisual}>
            <Ionicons name="radio" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.nowPlayingLabel}>Now Playing</Text>
          <Text style={styles.nowPlayingStation}>{currentStation}</Text>
          
          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="play-skip-back" size={24} color={COLORS.gray600} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.playButton}
              onPress={() => handlePlay(currentStation)}
            >
              <Ionicons 
                name={isPlaying ? 'pause' : 'play'} 
                size={32} 
                color={COLORS.white} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton}>
              <Ionicons name="play-skip-forward" size={24} color={COLORS.gray600} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Available Stations</Text>

        {stations.map((station, index) => (
          <TouchableOpacity 
            key={index} 
            style={[
              styles.stationCard,
              currentStation === station.name && styles.stationCardActive
            ]}
            onPress={() => handlePlay(station.name)}
          >
            <View style={[styles.stationIcon, currentStation === station.name && styles.stationIconActive]}>
              <Ionicons 
                name={station.icon as any} 
                size={24} 
                color={currentStation === station.name ? COLORS.white : COLORS.primary} 
              />
            </View>
            <View style={styles.stationInfo}>
              <Text style={styles.stationName}>{station.name}</Text>
              <Text style={styles.stationDesc}>{station.description}</Text>
            </View>
            {currentStation === station.name && (
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  content: {
    padding: SPACING.lg,
  },
  nowPlayingCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  playerVisual: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  nowPlayingLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  nowPlayingStation: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.gray800,
    marginTop: SPACING.xs,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    gap: SPACING.lg,
  },
  controlButton: {
    padding: SPACING.md,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  stationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  stationCardActive: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  stationIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationIconActive: {
    backgroundColor: COLORS.primary,
  },
  stationInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  stationName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  stationDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  liveText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.error,
  },
});
