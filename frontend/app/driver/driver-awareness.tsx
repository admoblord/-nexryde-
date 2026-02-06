import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface AwarenessAlert {
  type: string;
  severity: string;
  title: string;
  message: string;
  icon: string;
  color: string;
}

export default function DriverAwarenessScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<AwarenessAlert[]>([]);
  const [driverScore, setDriverScore] = useState(85);
  const [drivingHours, setDrivingHours] = useState(0);
  const [breakRecommended, setBreakRecommended] = useState(false);

  useEffect(() => {
    fetchAwarenessData();
    const interval = setInterval(fetchAwarenessData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAwarenessData = async () => {
    try {
      const driverId = user?.id || 'demo';
      const res = await fetch(
        `${BACKEND_URL}/api/driver/awareness?driver_id=${driverId}&lat=6.5244&lng=3.3792`
      );
      const data = await res.json();
      if (data.success) {
        setAlerts(data.alerts || []);
        setDriverScore(data.driver_score || 85);
        setDrivingHours(data.driving_hours_today || 0);
        setBreakRecommended(data.break_recommended || false);
      }
    } catch (e) {
      console.error('Awareness error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAwarenessData();
  };

  const getScoreColor = () => {
    if (driverScore >= 80) return COLORS.accentGreen;
    if (driverScore >= 60) return COLORS.warning;
    return '#EF4444';
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'high') return '#EF4444';
    if (severity === 'medium') return COLORS.warning;
    if (severity === 'info') return COLORS.accentBlue;
    return COLORS.accentGreen;
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1E3A5F', '#0D1B2A']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Awareness</Text>
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
            <Text style={styles.loadingText}>Analyzing driving conditions...</Text>
          </View>
        ) : (
          <>
            {/* Driver Score + Stats */}
            <View style={styles.scoreCard}>
              <View style={styles.scoreRow}>
                <View style={[styles.scoreCircle, { borderColor: getScoreColor() }]}>
                  <Ionicons
                    name="shield-checkmark"
                    size={28}
                    color={getScoreColor()}
                  />
                  <Text style={[styles.scoreNum, { color: getScoreColor() }]}>
                    {driverScore}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: SPACING.lg }}>
                  <Text style={styles.scoreLabel}>Safety Score</Text>
                  <Text style={styles.scoreDesc}>
                    {driverScore >= 80 ? 'Excellent driving! Keep it up.' : 'Room for improvement. Check alerts below.'}
                  </Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="time" size={20} color={COLORS.accentBlue} />
                  <Text style={styles.statValue}>{drivingHours.toFixed(1)}h</Text>
                  <Text style={styles.statLabel}>Driving Today</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons
                    name={breakRecommended ? 'cafe' : 'checkmark-circle'}
                    size={20}
                    color={breakRecommended ? '#EF4444' : COLORS.accentGreen}
                  />
                  <Text style={[styles.statValue, breakRecommended && { color: '#EF4444' }]}>
                    {breakRecommended ? 'Yes' : 'No'}
                  </Text>
                  <Text style={styles.statLabel}>Break Needed</Text>
                </View>
              </View>
            </View>

            {/* Break Alert */}
            {breakRecommended && (
              <TouchableOpacity
                style={styles.breakAlert}
                onPress={() => Alert.alert('Take a Break', 'Find a safe place to park and rest for 15 minutes. Your safety comes first!')}
              >
                <Ionicons name="warning" size={24} color="#FFF" />
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={styles.breakTitle}>Break Recommended</Text>
                  <Text style={styles.breakText}>
                    You've been driving during late hours. Take a 15-min rest.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            )}

            {/* Active Alerts */}
            <Text style={styles.sectionTitle}>
              Active Alerts ({alerts.length})
            </Text>

            {alerts.map((alert, i) => (
              <View
                key={i}
                style={[styles.alertCard, { borderLeftColor: getSeverityColor(alert.severity) }]}
              >
                <View style={[styles.alertIcon, { backgroundColor: alert.color + '20' }]}>
                  <Ionicons name={(alert.icon || 'alert-circle') as any} size={24} color={alert.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.alertHeader}>
                    <Text style={styles.alertTitle}>{alert.title}</Text>
                    <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(alert.severity) + '20' }]}>
                      <Text style={[styles.severityText, { color: getSeverityColor(alert.severity) }]}>
                        {alert.severity.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.alertMessage}>{alert.message}</Text>
                </View>
              </View>
            ))}

            {/* Quick Safety Actions */}
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              {[
                { icon: 'call', label: 'Emergency\nCall', color: '#EF4444', action: () => Alert.alert('Emergency', 'Calling 112...') },
                { icon: 'navigate', label: 'Find Safe\nParking', color: '#3B82F6', action: () => Alert.alert('Parking', 'Finding nearest safe parking...') },
                { icon: 'water', label: 'Hydration\nReminder', color: '#06B6D4', action: () => Alert.alert('Hydration', 'Remember to drink water every 2 hours!') },
                { icon: 'fitness', label: 'Stretch\nBreak', color: '#8B5CF6', action: () => Alert.alert('Stretch', 'Quick stretches: Roll your neck, stretch arms, flex wrists.') },
              ].map((action, i) => (
                <TouchableOpacity key={i} style={styles.actionCard} onPress={action.action}>
                  <View style={[styles.actionIcon, { backgroundColor: action.color + '15' }]}>
                    <Ionicons name={action.icon as any} size={28} color={action.color} />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.poweredBy}>
              <Text style={styles.poweredText}>AI-Powered Driver Safety System</Text>
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
  scoreCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: SPACING.lg, marginBottom: SPACING.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  scoreCircle: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC',
  },
  scoreNum: { fontSize: 24, fontWeight: '900', marginTop: 2 },
  scoreLabel: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  scoreDesc: { fontSize: 14, color: '#64748B', marginTop: 4, lineHeight: 20 },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: 16, padding: SPACING.md,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  statLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#E2E8F0', marginVertical: 4 },
  breakAlert: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EF4444', borderRadius: 16, padding: SPACING.md, marginBottom: SPACING.lg,
  },
  breakTitle: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  breakText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: SPACING.md },
  alertCard: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  alertIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  alertHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  alertTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', flex: 1 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  severityText: { fontSize: 10, fontWeight: '800' },
  alertMessage: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: SPACING.lg },
  actionCard: {
    width: '47%', backgroundColor: '#FFF', borderRadius: 16, padding: SPACING.md, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  actionIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', textAlign: 'center', lineHeight: 18 },
  poweredBy: { alignItems: 'center', paddingVertical: SPACING.lg },
  poweredText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
});
