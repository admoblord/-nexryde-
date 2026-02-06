import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface TrafficAlert {
  type: string;
  priority: string;
  title: string;
  message: string;
  location: string;
}

interface AIAnalysis {
  traffic_level: string;
  recommendation: string;
  estimated_earnings_impact: string;
  alternative_suggestion: string;
  confidence: number;
  factors: string[];
  avoid_areas: string[];
  best_time: string;
}

export default function TrafficPredictionScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default Lagos location
  const LAT = 6.5244;
  const LNG = 3.3792;

  useEffect(() => {
    fetchTrafficData();
  }, []);

  const fetchTrafficData = async () => {
    try {
      setError(null);
      
      // Fetch traffic alerts
      const alertsRes = await fetch(
        `${BACKEND_URL}/api/ai/traffic/alerts?driver_id=demo&lat=${LAT}&lng=${LNG}`
      );
      const alertsData = await alertsRes.json();
      if (alertsData.success) {
        setAlerts(alertsData.alerts || []);
      }

      // Fetch AI traffic prediction
      const predictRes = await fetch(`${BACKEND_URL}/api/ai/traffic/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `origin_lat=${LAT}&origin_lng=${LNG}&destination_lat=6.4541&destination_lng=3.3947&driver_id=demo`,
      });
      const predictData = await predictRes.json();
      if (predictData.success && predictData.ai_analysis) {
        setAiAnalysis(predictData.ai_analysis);
      }
    } catch (e) {
      console.error('Traffic data error:', e);
      setError('Could not load traffic data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTrafficData();
  };

  const getTrafficColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'light': return COLORS.accentGreen;
      case 'moderate': return COLORS.warning;
      case 'heavy': return '#EF4444';
      case 'severe': return '#DC2626';
      default: return COLORS.warning;
    }
  };

  const getTrafficIcon = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'light': return 'checkmark-circle';
      case 'moderate': return 'alert-circle';
      case 'heavy': return 'warning';
      case 'severe': return 'skull';
      default: return 'analytics';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1E3A5F', '#0F172A']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Traffic AI</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#FFF" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.accentBlue} />
            <Text style={styles.loadingText}>Analyzing traffic with AI...</Text>
          </View>
        ) : (
          <>
            {/* AI Analysis Card */}
            {aiAnalysis && (
              <View style={styles.aiCard}>
                <View style={styles.aiHeader}>
                  <Ionicons name="sparkles" size={24} color={COLORS.accentBlue} />
                  <Text style={styles.aiTitle}>ChatGPT Traffic Analysis</Text>
                </View>

                <View style={[styles.trafficLevel, { borderColor: getTrafficColor(aiAnalysis.traffic_level) }]}>
                  <Ionicons
                    name={getTrafficIcon(aiAnalysis.traffic_level) as any}
                    size={36}
                    color={getTrafficColor(aiAnalysis.traffic_level)}
                  />
                  <View style={{ flex: 1, marginLeft: SPACING.md }}>
                    <Text style={[styles.levelLabel, { color: getTrafficColor(aiAnalysis.traffic_level) }]}>
                      {(aiAnalysis.traffic_level || 'Unknown').toUpperCase()} TRAFFIC
                    </Text>
                    <Text style={styles.confidence}>
                      {aiAnalysis.confidence}% confidence
                    </Text>
                  </View>
                </View>

                <View style={styles.recommendBox}>
                  <Ionicons name="bulb" size={20} color={COLORS.warning} />
                  <Text style={styles.recommendText}>{aiAnalysis.recommendation}</Text>
                </View>

                <View style={styles.impactBox}>
                  <Ionicons name="cash" size={20} color={COLORS.accentGreen} />
                  <Text style={styles.impactText}>{aiAnalysis.estimated_earnings_impact}</Text>
                </View>

                {aiAnalysis.best_time && (
                  <View style={styles.bestTimeBox}>
                    <Ionicons name="time" size={18} color={COLORS.accentBlue} />
                    <Text style={styles.bestTimeText}>Best time: {aiAnalysis.best_time}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Avoid Areas */}
            {aiAnalysis?.avoid_areas && aiAnalysis.avoid_areas.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Areas to Avoid</Text>
                <View style={styles.avoidGrid}>
                  {aiAnalysis.avoid_areas.map((area, i) => (
                    <View key={i} style={styles.avoidBadge}>
                      <Ionicons name="close-circle" size={16} color="#EF4444" />
                      <Text style={styles.avoidText}>{area}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Traffic Factors */}
            {aiAnalysis?.factors && aiAnalysis.factors.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Traffic Factors</Text>
                <View style={styles.factorsGrid}>
                  {aiAnalysis.factors.map((factor, i) => (
                    <View key={i} style={styles.factorChip}>
                      <Ionicons name="information-circle" size={14} color={COLORS.accentBlue} />
                      <Text style={styles.factorText}>{factor}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Live Alerts */}
            {alerts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Live Alerts</Text>
                {alerts.map((alert, i) => (
                  <View key={i} style={[styles.alertCard, alert.priority === 'high' && styles.alertHigh]}>
                    <Ionicons
                      name={alert.type === 'warning' ? 'warning' : 'information-circle'}
                      size={24}
                      color={alert.priority === 'high' ? '#EF4444' : COLORS.warning}
                    />
                    <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                      <Text style={styles.alertTitle}>{alert.title}</Text>
                      <Text style={styles.alertMessage}>{alert.message}</Text>
                      <Text style={styles.alertLocation}>{alert.location}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Alternative Suggestion */}
            {aiAnalysis?.alternative_suggestion && (
              <View style={styles.altCard}>
                <Ionicons name="navigate" size={24} color={COLORS.accentGreen} />
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={styles.altTitle}>Alternative Suggestion</Text>
                  <Text style={styles.altText}>{aiAnalysis.alternative_suggestion}</Text>
                </View>
              </View>
            )}

            {/* Error State */}
            {error && (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle" size={24} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={fetchTrafficData}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.poweredBy}>
              <Text style={styles.poweredText}>Powered by Google Maps + ChatGPT</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  refreshBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: SPACING.lg, paddingBottom: 100 },
  loadingContainer: { alignItems: 'center', paddingTop: 80 },
  loadingText: { marginTop: SPACING.md, fontSize: 16, color: '#64748B', fontWeight: '600' },
  aiCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: SPACING.lg, marginBottom: SPACING.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.lg },
  aiTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  trafficLevel: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.md,
    borderRadius: 16, borderWidth: 2, backgroundColor: '#F8FAFC', marginBottom: SPACING.md,
  },
  levelLabel: { fontSize: 20, fontWeight: '900' },
  confidence: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 2 },
  recommendBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FFFBEB', padding: SPACING.md, borderRadius: 12, marginBottom: SPACING.sm,
  },
  recommendText: { flex: 1, fontSize: 14, color: '#92400E', fontWeight: '600', lineHeight: 20 },
  impactBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F0FDF4', padding: SPACING.md, borderRadius: 12, marginBottom: SPACING.sm,
  },
  impactText: { flex: 1, fontSize: 14, color: '#166534', fontWeight: '700' },
  bestTimeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: SPACING.sm,
  },
  bestTimeText: { fontSize: 14, color: '#1E40AF', fontWeight: '700' },
  section: { marginBottom: SPACING.lg },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: SPACING.md },
  avoidGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avoidBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  avoidText: { fontSize: 13, fontWeight: '700', color: '#991B1B' },
  factorsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  factorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  factorText: { fontSize: 13, fontWeight: '600', color: '#1E40AF' },
  alertCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFF', padding: SPACING.md, borderRadius: 16, marginBottom: 10,
    borderLeftWidth: 4, borderLeftColor: COLORS.warning,
  },
  alertHigh: { borderLeftColor: '#EF4444', backgroundColor: '#FEF2F2' },
  alertTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  alertMessage: { fontSize: 13, color: '#64748B', marginTop: 2, lineHeight: 18 },
  alertLocation: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontWeight: '600' },
  altCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#F0FDF4', padding: SPACING.lg, borderRadius: 20, marginBottom: SPACING.lg,
  },
  altTitle: { fontSize: 15, fontWeight: '800', color: '#166534', marginBottom: 4 },
  altText: { fontSize: 14, color: '#15803D', lineHeight: 20 },
  errorCard: { alignItems: 'center', padding: SPACING.xl, backgroundColor: '#FEF2F2', borderRadius: 20 },
  errorText: { fontSize: 14, color: '#991B1B', marginTop: SPACING.sm, fontWeight: '600' },
  retryBtn: { marginTop: SPACING.md, backgroundColor: '#EF4444', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: '#FFF', fontWeight: '700' },
  poweredBy: { alignItems: 'center', paddingVertical: SPACING.lg },
  poweredText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
});
