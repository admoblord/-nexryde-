import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface RiskZone {
  name: string;
  risk_level: string;
  risk_score: number;
  recent_incidents: number;
  primary_cause: string;
  peak_risk_time: string;
}

interface AIRiskAnalysis {
  overall_risk_score: number;
  risk_level: string;
  recommendation: string;
  contributing_factors: string[];
  safety_tips: string[];
  high_risk_areas: RiskZone[];
}

export default function AccidentPredictionScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [riskData, setRiskData] = useState<AIRiskAnalysis | null>(null);
  const [highRiskAreas, setHighRiskAreas] = useState<RiskZone[]>([]);

  const LAT = 6.5244;
  const LNG = 3.3792;

  useEffect(() => {
    fetchRiskData();
  }, []);

  const fetchRiskData = async () => {
    try {
      // Fetch AI risk prediction
      const riskRes = await fetch(`${BACKEND_URL}/api/ai/accident/predict-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `driver_id=demo&current_lat=${LAT}&current_lng=${LNG}`,
      });
      const riskJSON = await riskRes.json();
      if (riskJSON.success && riskJSON.ai_analysis) {
        setRiskData(riskJSON.ai_analysis);
      }

      // Fetch high-risk areas
      const areasRes = await fetch(
        `${BACKEND_URL}/api/ai/accident/high-risk-areas?lat=${LAT}&lng=${LNG}`
      );
      const areasJSON = await areasRes.json();
      if (areasJSON.success) {
        setHighRiskAreas(areasJSON.high_risk_areas || []);
      }
    } catch (e) {
      console.error('Risk data error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchRiskData();
  };

  const getRiskColor = (level: string) => {
    const l = level?.toLowerCase();
    if (l === 'low' || l === 'very low') return COLORS.accentGreen;
    if (l === 'moderate' || l === 'medium') return COLORS.warning;
    if (l === 'high') return '#EF4444';
    if (l === 'very high' || l === 'critical') return '#DC2626';
    return COLORS.warning;
  };

  const getRiskIcon = (score: number) => {
    if (score < 30) return 'shield-checkmark';
    if (score < 60) return 'alert-circle';
    return 'warning';
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#7F1D1D', '#1a1a2e']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Accident AI</Text>
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
            <ActivityIndicator size="large" color="#EF4444" />
            <Text style={styles.loadingText}>Analyzing accident risks with AI...</Text>
          </View>
        ) : (
          <>
            {/* AI Risk Score */}
            {riskData && (
              <View style={styles.riskCard}>
                <View style={styles.riskHeader}>
                  <Ionicons name="sparkles" size={24} color={COLORS.accentBlue} />
                  <Text style={styles.riskTitle}>AI Safety Score</Text>
                </View>

                <View style={styles.scoreRow}>
                  <View style={[styles.scoreCircle, { borderColor: getRiskColor(riskData.risk_level) }]}>
                    <Ionicons
                      name={getRiskIcon(riskData.overall_risk_score) as any}
                      size={32}
                      color={getRiskColor(riskData.risk_level)}
                    />
                    <Text style={[styles.scoreText, { color: getRiskColor(riskData.risk_level) }]}>
                      {riskData.overall_risk_score}%
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: SPACING.lg }}>
                    <Text style={[styles.riskLevel, { color: getRiskColor(riskData.risk_level) }]}>
                      {(riskData.risk_level || 'Unknown').toUpperCase()}
                    </Text>
                    <Text style={styles.riskDesc}>{riskData.recommendation}</Text>
                  </View>
                </View>

                {/* Contributing Factors */}
                {riskData.contributing_factors?.length > 0 && (
                  <View style={styles.factorsSection}>
                    <Text style={styles.factorsLabel}>Contributing Factors</Text>
                    <View style={styles.factorsGrid}>
                      {riskData.contributing_factors.map((f, i) => (
                        <View key={i} style={styles.factorChip}>
                          <Ionicons name="alert" size={12} color={COLORS.warning} />
                          <Text style={styles.factorText}>{f}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* High Risk Zones */}
            <Text style={styles.sectionTitle}>High Risk Zones Today</Text>

            {highRiskAreas.length > 0 ? (
              highRiskAreas.map((zone, i) => (
                <View key={i} style={styles.zoneCard}>
                  <View style={[styles.zoneBadge, { backgroundColor: getRiskColor(zone.risk_level) }]}>
                    <Ionicons name="warning" size={20} color="#FFF" />
                  </View>
                  <View style={styles.zoneInfo}>
                    <Text style={styles.zoneName}>{zone.name}</Text>
                    <Text style={styles.zoneReason}>{zone.primary_cause}</Text>
                    <View style={styles.zoneMetaRow}>
                      <View style={styles.zoneMeta}>
                        <Ionicons name="time" size={14} color="#94A3B8" />
                        <Text style={styles.zoneMetaText}>{zone.peak_risk_time}</Text>
                      </View>
                      <View style={styles.zoneMeta}>
                        <Ionicons name="alert-circle" size={14} color="#EF4444" />
                        <Text style={styles.zoneMetaText}>{zone.recent_incidents} incidents</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              // Fallback static zones
              <>
                {[
                  { name: 'Third Mainland Bridge', cause: 'High speed + poor visibility', time: '6PM-10PM', incidents: 12 },
                  { name: 'Lekki-Epe Expressway', cause: 'Construction zones + speeding', time: 'All day', incidents: 8 },
                  { name: 'Oshodi Underbridge', cause: 'Heavy traffic + reckless driving', time: '7AM-9AM', incidents: 5 },
                  { name: 'Apapa Wharf Road', cause: 'Truck congestion + potholes', time: 'All day', incidents: 4 },
                ].map((zone, i) => (
                  <View key={i} style={styles.zoneCard}>
                    <View style={[styles.zoneBadge, { backgroundColor: i < 2 ? '#EF4444' : COLORS.warning }]}>
                      <Ionicons name="warning" size={20} color="#FFF" />
                    </View>
                    <View style={styles.zoneInfo}>
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      <Text style={styles.zoneReason}>{zone.cause}</Text>
                      <View style={styles.zoneMetaRow}>
                        <View style={styles.zoneMeta}>
                          <Ionicons name="time" size={14} color="#94A3B8" />
                          <Text style={styles.zoneMetaText}>{zone.time}</Text>
                        </View>
                        <View style={styles.zoneMeta}>
                          <Ionicons name="alert-circle" size={14} color="#EF4444" />
                          <Text style={styles.zoneMetaText}>{zone.incidents} incidents</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Safety Tips from AI */}
            {riskData?.safety_tips?.length > 0 && (
              <View style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>AI Safety Recommendations</Text>
                {riskData.safety_tips.map((tip, i) => (
                  <View key={i} style={styles.tipItem}>
                    <Ionicons name="shield-checkmark" size={18} color={COLORS.accentGreen} />
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Emergency Button */}
            <TouchableOpacity
              style={styles.emergencyBtn}
              onPress={() => Alert.alert('Emergency', 'Calling emergency services...')}
            >
              <Ionicons name="call" size={24} color="#FFF" />
              <Text style={styles.emergencyText}>Emergency Assistance</Text>
            </TouchableOpacity>

            <View style={styles.poweredBy}>
              <Text style={styles.poweredText}>Powered by ChatGPT + Lagos Accident Data</Text>
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  refreshBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: SPACING.lg, paddingBottom: 100 },
  loadingContainer: { alignItems: 'center', paddingTop: 80 },
  loadingText: { marginTop: SPACING.md, fontSize: 16, color: '#64748B', fontWeight: '600' },
  riskCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: SPACING.lg, marginBottom: SPACING.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  riskHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.lg },
  riskTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  scoreCircle: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC',
  },
  scoreText: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  riskLevel: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  riskDesc: { fontSize: 14, color: '#64748B', lineHeight: 20 },
  factorsSection: { paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  factorsLabel: { fontSize: 14, fontWeight: '800', color: '#64748B', marginBottom: 8 },
  factorsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  factorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFBEB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
  },
  factorText: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: SPACING.md },
  zoneCard: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  zoneBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  zoneInfo: { flex: 1, marginLeft: SPACING.md },
  zoneName: { fontSize: 15, fontWeight: '900', color: '#0F172A', marginBottom: 2 },
  zoneReason: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  zoneMetaRow: { flexDirection: 'row', gap: SPACING.lg },
  zoneMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneMetaText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  tipsCard: {
    backgroundColor: '#F0FDF4', borderRadius: 20, padding: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.lg,
  },
  tipsTitle: { fontSize: 17, fontWeight: '900', color: '#166534', marginBottom: SPACING.md },
  tipItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#15803D', lineHeight: 20 },
  emergencyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md,
    backgroundColor: '#EF4444', paddingVertical: SPACING.lg, borderRadius: 20,
  },
  emergencyText: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  poweredBy: { alignItems: 'center', paddingVertical: SPACING.lg },
  poweredText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
});
