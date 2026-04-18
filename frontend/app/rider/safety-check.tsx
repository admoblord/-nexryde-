import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { AreaBoySafety, AreaSafetyReport, useAreaBoySafety } from '@/src/services/areaBoySafety';
import * as Location from 'expo-location';
import { BACKEND_URL } from '@/src/services/api';

export default function RiderSafetyCheckScreen() {
  const router = useRouter();
  const { areaSafety, loading, checkAreaSafety } = useAreaBoySafety();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [resolving, setResolving] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const handleCheckArea = async (lat: number, lng: number, name: string) => {
    await checkAreaSafety(lat, lng, name);
  };

  const handleSearchArea = async () => {
    const query = searchQuery.trim();
    if (query.length < 2 || resolving) return;
    setResolving(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/places/geocode-address?address=${encodeURIComponent(`${query}, Nigeria`)}`,
      );
      const data = await res.json();
      if (res.ok && data?.latitude && data?.longitude) {
        await handleCheckArea(Number(data.latitude), Number(data.longitude), data.address || query);
      } else {
        const fallback = popularAreas.find((a) => a.name.toLowerCase().includes(query.toLowerCase()));
        if (fallback) {
          await handleCheckArea(fallback.lat, fallback.lng, fallback.name);
        }
      }
    } catch {
      const fallback = popularAreas.find((a) => a.name.toLowerCase().includes(query.toLowerCase()));
      if (fallback) {
        await handleCheckArea(fallback.lat, fallback.lng, fallback.name);
      }
    } finally {
      setResolving(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (locationLoading) return;
    setLocationLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      let name = `Current location (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`;
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/places/geocode?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`,
        );
        const data = await res.json();
        if (data?.address) name = data.address;
      } catch {}
      await handleCheckArea(latitude, longitude, name);
    } finally {
      setLocationLoading(false);
    }
  };

  const popularAreas = [
    { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
    { name: 'Abuja', lat: 9.0765, lng: 7.3986 },
    { name: 'Port Harcourt', lat: 4.8156, lng: 7.0498 },
    { name: 'Kano', lat: 12.0022, lng: 8.5920 },
    { name: 'Ibadan', lat: 7.3775, lng: 3.9470 },
    { name: 'Enugu', lat: 6.4499, lng: 7.5000 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={[COLORS.accentBlue, '#0096C7']}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>🛡️ Safety Check</Text>
          <Text style={styles.headerSubtitle}>Check Area Safety Before You Travel</Text>
        </View>
        <View style={styles.placeholder} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.searchCard}>
          <Text style={styles.sectionTitle}>🔍 Scan Any Area in Nigeria</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={COLORS.lightTextMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search location (city, district, landmark)..."
              placeholderTextColor={COLORS.lightTextMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              onSubmitEditing={() => void handleSearchArea()}
            />
            {resolving ? <Ionicons name="sync" size={18} color={COLORS.accentBlue} /> : null}
          </View>
          <TouchableOpacity style={styles.currentLocBtn} onPress={() => void handleUseCurrentLocation()}>
            <Ionicons name="navigate-outline" size={18} color={COLORS.accentBlue} />
            <Text style={styles.currentLocText}>
              {locationLoading ? 'Scanning around you...' : 'Use my current location'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.popularSection}>
          <Text style={styles.sectionTitle}>📍 Major Nigerian Cities</Text>
          <View style={styles.areaGrid}>
            {popularAreas.map((area) => (
              <TouchableOpacity
                key={area.name}
                style={styles.areaButton}
                onPress={() => handleCheckArea(area.lat, area.lng, area.name)}
              >
                <Ionicons name="location" size={24} color={COLORS.accentBlue} />
                <Text style={styles.areaName}>{area.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {areaSafety && (
          <View style={styles.reportCard}>
            <View style={[styles.reportHeader, { backgroundColor: AreaBoySafety.getSafetyColor(areaSafety.overallSafety) }]}>
              <Text style={styles.reportLocation}>{areaSafety.location.name}</Text>
              <Text style={styles.reportSafety}>{areaSafety.overallSafety.replace('_', ' ').toUpperCase()}</Text>
              <Text style={styles.reportScore}>Safety Score: {areaSafety.safetyScore}/100</Text>
            </View>
            
            <View style={styles.reportContent}>
              <Text style={styles.reportRecommendation}>{areaSafety.recommendation}</Text>
              
              {areaSafety.bestTimeToTravel && (
                <View style={styles.bestTimeBox}>
                  <Ionicons name="time" size={20} color={COLORS.accentGreen} />
                  <Text style={styles.bestTimeText}>{areaSafety.bestTimeToTravel}</Text>
                </View>
              )}
              
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{areaSafety.dangerZones.length}</Text>
                  <Text style={styles.statLabel}>Danger Zones</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{areaSafety.recentIncidents}</Text>
                  <Text style={styles.statLabel}>Recent Reports</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Rider Safety Tips</Text>
          <TipItem icon="shield-checkmark" text="Check area safety before booking rides" />
          <TipItem icon="time" text="Avoid travelling late at night to risky areas" />
          <TipItem icon="call" text="Share trip details with emergency contacts" />
          <TipItem icon="people" text="Trust community reports from drivers" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const TipItem = ({ icon, text }: any) => (
  <View style={styles.tipItem}>
    <Ionicons name={icon} size={20} color={COLORS.accentBlue} />
    <Text style={styles.tipText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    opacity: 0.9,
  },
  placeholder: { width: 44 },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  searchCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.lightBackground,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  currentLocBtn: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    alignSelf: 'flex-start',
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.accentBlue,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.infoSoft,
  },
  currentLocText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.accentBlue,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  popularSection: { marginBottom: SPACING.lg },
  areaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  areaButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  areaName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  reportCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  reportHeader: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  reportLocation: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  reportSafety: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  reportScore: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  reportContent: {
    padding: SPACING.lg,
  },
  reportRecommendation: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
    lineHeight: 22,
  },
  bestTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accentGreenSoft,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  bestTimeText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.lightBackground,
    borderRadius: BORDER_RADIUS.lg,
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  tipsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    lineHeight: 20,
  },
});
