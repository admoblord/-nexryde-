import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HeatZone {
  lat: number;
  lng: number;
  intensity: number;
  name: string;
  surge: number;
}

export default function DriverHeatmapScreen() {
  const router = useRouter();
  const [zones, setZones] = useState<HeatZone[]>([]);
  const [recommendation, setRecommendation] = useState('');

  useEffect(() => {
    loadHeatmap();
    const interval = setInterval(loadHeatmap, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadHeatmap = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/driver/heatmap`);
      const data = await res.json();
      setZones(data.zones || []);
      setRecommendation(data.recommendation || '');
    } catch (e) {
      console.error('Load heatmap error:', e);
    }
  };

  const getIntensityColor = (intensity: number) => {
    if (intensity >= 0.8) return '#EF4444';
    if (intensity >= 0.6) return '#F59E0B';
    if (intensity >= 0.4) return '#FBBF24';
    return '#22C55E';
  };

  const getIntensityLabel = (intensity: number) => {
    if (intensity >= 0.8) return 'Very High';
    if (intensity >= 0.6) return 'High';
    if (intensity >= 0.4) return 'Medium';
    return 'Low';
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Demand Heatmap</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadHeatmap}>
            <Ionicons name="refresh" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Recommendation Card */}
          {recommendation && (
            <LinearGradient
              colors={['rgba(99,102,241,0.2)', 'rgba(139,92,246,0.1)']}
              style={styles.recommendationCard}
            >
              <View style={styles.recommendationIcon}>
                <Ionicons name="bulb" size={24} color="#FBBF24" />
              </View>
              <View style={styles.recommendationContent}>
                <Text style={styles.recommendationLabel}>AI Recommendation</Text>
                <Text style={styles.recommendationText}>{recommendation}</Text>
              </View>
            </LinearGradient>
          )}

          {/* Peak Hours Info */}
          <View style={styles.peakHoursCard}>
            <Text style={styles.peakHoursTitle}>Peak Hours Today</Text>
            <View style={styles.peakHoursRow}>
              <View style={styles.peakHourItem}>
                <Ionicons name="sunny" size={20} color="#F59E0B" />
                <Text style={styles.peakHourTime}>7AM - 10AM</Text>
                <Text style={styles.peakHourLabel}>Morning Rush</Text>
              </View>
              <View style={styles.peakHourDivider} />
              <View style={styles.peakHourItem}>
                <Ionicons name="moon" size={20} color="#8B5CF6" />
                <Text style={styles.peakHourTime}>5PM - 9PM</Text>
                <Text style={styles.peakHourLabel}>Evening Rush</Text>
              </View>
            </View>
          </View>

          {/* Heatmap Zones */}
          <Text style={styles.sectionTitle}>High Demand Areas</Text>
          
          {zones.sort((a, b) => b.intensity - a.intensity).map((zone, idx) => (
            <TouchableOpacity key={idx} style={styles.zoneCard}>
              <View style={styles.zoneHeader}>
                <View style={[
                  styles.intensityIndicator,
                  { backgroundColor: getIntensityColor(zone.intensity) }
                ]} />
                <View style={styles.zoneInfo}>
                  <Text style={styles.zoneName}>{zone.name}</Text>
                  <Text style={styles.zoneIntensity}>
                    {getIntensityLabel(zone.intensity)} Demand
                  </Text>
                </View>
                <View style={styles.surgeBadge}>
                  <Ionicons name="flash" size={14} color="#F59E0B" />
                  <Text style={styles.surgeText}>{zone.surge}x</Text>
                </View>
              </View>
              
              {/* Demand Bar */}
              <View style={styles.demandBarContainer}>
                <View 
                  style={[
                    styles.demandBar,
                    { 
                      width: `${zone.intensity * 100}%`,
                      backgroundColor: getIntensityColor(zone.intensity)
                    }
                  ]} 
                />
              </View>
              
              <View style={styles.zoneFooter}>
                <View style={styles.zoneStats}>
                  <Ionicons name="car" size={14} color="#64748B" />
                  <Text style={styles.zoneStat}>{Math.floor(zone.intensity * 20)} drivers nearby</Text>
                </View>
                <TouchableOpacity style={styles.navigateBtn}>
                  <Text style={styles.navigateBtnText}>Navigate</Text>
                  <Ionicons name="navigate" size={14} color="#6366F1" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}

          {/* Legend */}
          <View style={styles.legendCard}>
            <Text style={styles.legendTitle}>Demand Level</Text>
            <View style={styles.legendRow}>
              {[
                { color: '#EF4444', label: 'Very High' },
                { color: '#F59E0B', label: 'High' },
                { color: '#FBBF24', label: 'Medium' },
                { color: '#22C55E', label: 'Low' },
              ].map((item, idx) => (
                <View key={idx} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, padding: 16 },
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  recommendationIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  recommendationContent: { flex: 1 },
  recommendationLabel: { fontSize: 12, color: '#A5B4FC', marginBottom: 4 },
  recommendationText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', lineHeight: 20 },
  peakHoursCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  peakHoursTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 14 },
  peakHoursRow: { flexDirection: 'row', alignItems: 'center' },
  peakHourItem: { flex: 1, alignItems: 'center' },
  peakHourTime: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginTop: 8 },
  peakHourLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
  peakHourDivider: { width: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.1)' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  zoneCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  intensityIndicator: {
    width: 12,
    height: 40,
    borderRadius: 6,
    marginRight: 14,
  },
  zoneInfo: { flex: 1 },
  zoneName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  zoneIntensity: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  surgeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  surgeText: { fontSize: 13, fontWeight: '700', color: '#F59E0B' },
  demandBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  demandBar: { height: '100%', borderRadius: 3 },
  zoneFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoneStat: { fontSize: 12, color: '#64748B' },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navigateBtnText: { fontSize: 13, fontWeight: '600', color: '#6366F1' },
  legendCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  legendTitle: { fontSize: 12, color: '#64748B', marginBottom: 10 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-around' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#94A3B8' },
});
