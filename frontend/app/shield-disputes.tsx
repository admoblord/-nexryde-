import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import {
  createShieldDispute,
  getMyShieldDisputes,
  respondShieldDispute,
} from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

export default function ShieldDisputesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { user } = useAppStore();
  const [tripId, setTripId] = useState((params.tripId as string) || '');
  const [statement, setStatement] = useState('');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [respondText, setRespondText] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user?.id) {
      setListLoading(false);
      return;
    }
    setListLoading(true);
    try {
      const res = await getMyShieldDisputes();
      setDisputes(res.data?.disputes || []);
    } catch {
      setDisputes([]);
    } finally {
      setListLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openDispute = async () => {
    if (!user?.id) {
      Alert.alert('Login required', 'Sign in to use NEXRYDE Shield.');
      return;
    }
    const tid = tripId.trim();
    if (!tid) {
      Alert.alert('Trip ID', 'Enter the trip ID shown on your receipt or trip screen.');
      return;
    }
    if (statement.trim().length < 10) {
      Alert.alert('Details', 'Please write at least 10 characters explaining the issue.');
      return;
    }
    setLoading(true);
    try {
      await createShieldDispute(tid, statement.trim(), 'general');
      Alert.alert(
        'Dispute opened',
        'Your side is on record. The other party can respond; NEXRYDE reviews both before any action — no automatic bans.'
      );
      setStatement('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not open dispute', e?.response?.data?.detail || 'Try again later.');
    } finally {
      setLoading(false);
    }
  };

  const submitResponse = async (disputeId: string) => {
    const text = (respondText[disputeId] || '').trim();
    if (text.length < 10) {
      Alert.alert('Details', 'Please write at least 10 characters.');
      return;
    }
    setLoading(true);
    try {
      await respondShieldDispute(disputeId, text);
      setRespondText((prev) => ({ ...prev, [disputeId]: '' }));
      await load();
      Alert.alert('Submitted', 'Your response was recorded for review.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.title}>NEXRYDE Shield</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={listLoading} onRefresh={() => void load()} />}
        >
          <View style={styles.hero}>
            <Ionicons name="shield-checkmark" size={40} color={COLORS.accentGreen} />
            <Text style={styles.heroTitle}>Fair dispute resolution</Text>
            <Text style={styles.heroText}>
              Both rider and driver submit their version. Support reviews the full record before decisions — unlike
              one-sided instant bans on other apps.
            </Text>
          </View>

          <Text style={styles.section}>Open a dispute</Text>
          <TextInput
            style={styles.input}
            placeholder="Trip ID (e.g. trip-...)"
            placeholderTextColor={COLORS.gray400}
            value={tripId}
            onChangeText={setTripId}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Describe what happened (min 10 characters)..."
            placeholderTextColor={COLORS.gray400}
            value={statement}
            onChangeText={setStatement}
            multiline
            numberOfLines={5}
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={openDispute} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Submit dispute</Text>}
          </TouchableOpacity>

          <Text style={styles.section}>Your disputes</Text>
          {listLoading && disputes.length === 0 ? (
            <ActivityIndicator color={COLORS.accentGreen} style={{ marginVertical: 24 }} />
          ) : disputes.length === 0 ? (
            <Text style={styles.empty}>No disputes yet.</Text>
          ) : (
            disputes.map((d) => {
              const iAmComplainant = d.opened_by === user?.id;
              const canRespond =
                !iAmComplainant && d.respondent_id === user?.id && !d.respondent_statement && d.status !== 'resolved';
              return (
                <View key={d.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTrip}>{d.trip_id}</Text>
                    <Text style={styles.cardStatus}>{d.status}</Text>
                  </View>
                  <Text style={styles.label}>Complainant said</Text>
                  <Text style={styles.body}>{d.complainant_statement}</Text>
                  {d.respondent_statement ? (
                    <>
                      <Text style={styles.label}>Other party said</Text>
                      <Text style={styles.body}>{d.respondent_statement}</Text>
                    </>
                  ) : (
                    <Text style={styles.pending}>Awaiting other party statement</Text>
                  )}
                  {canRespond && (
                    <>
                      <TextInput
                        style={[styles.input, styles.multiline, { marginTop: SPACING.md }]}
                        placeholder="Your side of the story..."
                        placeholderTextColor={COLORS.gray400}
                        value={respondText[d.id] || ''}
                        onChangeText={(t) => setRespondText((p) => ({ ...p, [d.id]: t }))}
                        multiline
                      />
                      <TouchableOpacity style={styles.secondaryBtn} onPress={() => submitResponse(d.id)} disabled={loading}>
                        <Text style={styles.secondaryBtnText}>Submit my response</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  back: { padding: SPACING.xs },
  title: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray900 },
  scroll: { padding: SPACING.lg, paddingBottom: 48 },
  hero: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  heroTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', marginTop: SPACING.sm, color: COLORS.gray900 },
  heroText: { fontSize: FONT_SIZE.sm, color: COLORS.gray600, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20 },
  section: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.gray900, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: COLORS.accentGreen,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: FONT_SIZE.md },
  secondaryBtn: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accentGreen,
  },
  secondaryBtnText: { color: COLORS.accentGreen, fontWeight: '700' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.sm },
  cardTrip: { fontWeight: '700', color: COLORS.gray900, flex: 1 },
  cardStatus: { fontSize: FONT_SIZE.xs, color: COLORS.accentGreen, fontWeight: '700', textTransform: 'uppercase' },
  label: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.gray500, marginTop: SPACING.xs },
  body: { fontSize: FONT_SIZE.sm, color: COLORS.gray800, lineHeight: 20 },
  pending: { fontSize: FONT_SIZE.sm, color: COLORS.warning, marginTop: SPACING.sm, fontStyle: 'italic' },
  empty: { color: COLORS.gray500, textAlign: 'center', marginVertical: SPACING.lg },
});
