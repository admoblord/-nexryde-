import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { getUserTrips, getUserLostItems, reportLostItem } from '@/src/services/api';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useRequireUserOrLogin } from '@/src/hooks/useRequireUserOrLogin';

export default function LostFoundScreen() {
  const router = useRouter();
  const authed = useRequireUserOrLogin();
  const { user } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();

  const [activeTab, setActiveTab] = useState<'report' | 'history'>('report');
  const [description, setDescription] = useState('');
  const [selectedTripId, setSelectedTripId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const load = async () => {
    if (!userId || !canCallAuthedApi || !user) {
      setLoading(false);
      return;
    }
    try {
      const role = user.role === 'driver' ? 'driver' : 'rider';
      const [tripRes, historyRes] = await Promise.all([
        getUserTrips(userId, role),
        getUserLostItems(userId),
      ]);
      const trips = Array.isArray(tripRes.data) ? tripRes.data : [];
      const completedTrips = trips
        .filter((t) => String(t.status || '').toLowerCase() === 'completed')
        .slice(0, 10);
      setRecentTrips(completedTrips);
      if (!selectedTripId && completedTrips[0]?.id) setSelectedTripId(completedTrips[0].id);
      setHistory(Array.isArray(historyRes.data?.items) ? historyRes.data.items : []);
    } catch (e) {
      console.log('Lost & Found load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [userId, canCallAuthedApi, user?.role]);

  const submitReport = async () => {
    if (!userId || !canCallAuthedApi || !user) return;
    if (!selectedTripId) {
      Alert.alert('Select Trip', 'Please select the trip where item was lost.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Describe Item', 'Please enter item description.');
      return;
    }
    try {
      setSubmitting(true);
      await reportLostItem({
        trip_id: selectedTripId,
        description: description.trim(),
        reporter_id: userId,
        reporter_role: user.role === 'driver' ? 'driver' : 'rider',
      });
      Alert.alert('Reported', 'Lost item report submitted successfully.');
      setDescription('');
      setActiveTab('history');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
    [history]
  );

  if (!authed) {
    return null;
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lost & Found</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 'report' && styles.tabActive]} onPress={() => setActiveTab('report')}>
            <Text style={[styles.tabText, activeTab === 'report' && styles.tabTextActive]}>Report Lost Item</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'history' && styles.tabActive]} onPress={() => setActiveTab('history')}>
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {activeTab === 'report' ? (
                <>
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Describe Lost Item</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="E.g., Black leather wallet with ID cards"
                      placeholderTextColor={COLORS.lightTextMuted}
                      multiline
                      numberOfLines={4}
                      value={description}
                      onChangeText={setDescription}
                      textAlignVertical="top"
                    />
                  </View>

                  <Text style={styles.sectionTitle}>Select Recent Completed Trip</Text>
                  {recentTrips.length ? recentTrips.map((trip) => {
                    const tripId = String(trip.id);
                    const selected = selectedTripId === tripId;
                    const route = `${trip.pickup_location?.address || 'Pickup'} → ${trip.dropoff_location?.address || 'Dropoff'}`;
                    const when = new Date(trip.completed_at || trip.created_at || Date.now()).toLocaleString();
                    return (
                      <TouchableOpacity key={tripId} style={styles.tripCard} onPress={() => setSelectedTripId(tripId)}>
                        <View style={[styles.tripIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                          <Ionicons name="car" size={20} color={COLORS.accentGreen} />
                        </View>
                        <View style={styles.tripInfo}>
                          <Text style={styles.tripDriver}>{trip.driver_name || trip.driver_id || 'Trip'}</Text>
                          <Text style={styles.tripRoute} numberOfLines={1}>{route}</Text>
                          <Text style={styles.tripTime}>{when}</Text>
                        </View>
                        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                          {selected ? <View style={styles.radioInner} /> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  }) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyDesc}>No completed trips available for reporting.</Text>
                    </View>
                  )}
                </>
              ) : (
                sortedHistory.length ? sortedHistory.map((item: any) => (
                  <View key={item.id} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyTrip}>Trip: {item.trip_id}</Text>
                      <Text style={[styles.historyStatus, item.status === 'found' ? styles.found : styles.reported]}>
                        {String(item.status || 'reported').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.historyDesc}>{item.description}</Text>
                    <Text style={styles.historyDate}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : 'Recent'}
                    </Text>
                  </View>
                )) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No Reports Yet</Text>
                    <Text style={styles.emptyDesc}>Your lost item reports will appear here</Text>
                  </View>
                )
              )}
            </ScrollView>

            {activeTab === 'report' && (
              <View style={styles.bottomContainer}>
                <TouchableOpacity style={styles.submitButton} onPress={submitReport} disabled={submitting || !recentTrips.length}>
                  <LinearGradient colors={[COLORS.accentGreen, COLORS.accentBlue]} style={styles.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Text style={styles.submitText}>{submitting ? 'Submitting...' : 'Submit Report'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.lightBorder },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.lightTextPrimary },
  placeholder: { width: 44 },
  tabContainer: { flexDirection: 'row', marginHorizontal: SPACING.lg, marginBottom: SPACING.lg, backgroundColor: COLORS.lightSurface, borderRadius: BORDER_RADIUS.full, padding: 4 },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: BORDER_RADIUS.full },
  tabActive: { backgroundColor: COLORS.accentGreen },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.lightTextSecondary },
  tabTextActive: { color: COLORS.white },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: SPACING.sm, color: COLORS.lightTextMuted, fontWeight: '600' },
  inputCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.lightBorder },
  inputLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.lightTextSecondary, marginBottom: SPACING.sm },
  textInput: { fontSize: FONT_SIZE.md, color: COLORS.lightTextPrimary, minHeight: 100, padding: 0 },
  sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.lightTextSecondary, marginBottom: SPACING.md },
  tripCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.lightBorder },
  tripIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  tripInfo: { flex: 1 },
  tripDriver: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.lightTextPrimary },
  tripRoute: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary },
  tripTime: { fontSize: FONT_SIZE.xs, color: COLORS.lightTextMuted },
  radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.accentGreen, alignItems: 'center', justifyContent: 'center' },
  radioOuterSelected: { backgroundColor: COLORS.accentGreen + '15' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.accentGreen },
  historyCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.lightBorder, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTrip: { fontWeight: '700', color: COLORS.lightTextPrimary },
  historyStatus: { fontWeight: '800', fontSize: FONT_SIZE.xs },
  found: { color: COLORS.success },
  reported: { color: COLORS.warning },
  historyDesc: { marginTop: SPACING.sm, color: COLORS.lightTextPrimary },
  historyDate: { marginTop: SPACING.xs, color: COLORS.lightTextMuted, fontSize: FONT_SIZE.xs },
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxl },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.lightTextPrimary, marginBottom: 4 },
  emptyDesc: { fontSize: FONT_SIZE.sm, color: COLORS.lightTextSecondary, textAlign: 'center' },
  bottomContainer: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  submitButton: { borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  submitGradient: { paddingVertical: SPACING.lg, alignItems: 'center' },
  submitText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
});
