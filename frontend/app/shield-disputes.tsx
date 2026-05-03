import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  createShieldDispute,
  getMyShieldDisputes,
  respondShieldDispute,
  getShieldDispute,
} from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

// ─── Constants ───────────────────────────────────────────────────────────────

const C = {
  bg: '#0D1420',
  card: '#1A2332',
  cardElevated: '#232F42',
  border: 'rgba(148,163,184,0.14)',
  green: '#00D46A',
  blue: '#0EA5E9',
  yellow: '#EAB308',
  red: '#EF4444',
  purple: '#9333EA',
  white: '#FFFFFF',
  muted: '#94A3B8',
  dim: '#64748B',
};

const ISSUE_TYPES = [
  { id: 'driver_behavior', label: 'Driver Behavior', icon: 'person-outline' as const, color: C.red },
  { id: 'wrong_fare',      label: 'Wrong Fare',      icon: 'cash-outline' as const,    color: C.yellow },
  { id: 'route_issue',     label: 'Route Issue',     icon: 'map-outline' as const,     color: C.blue },
  { id: 'safety_concern',  label: 'Safety Concern',  icon: 'shield-outline' as const,  color: C.purple },
  { id: 'other',           label: 'Other',           icon: 'ellipsis-horizontal-outline' as const, color: C.muted },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  awaiting_response: { label: 'Awaiting Response', color: C.yellow,  icon: 'time-outline' },
  under_review:      { label: 'Under Review',      color: C.blue,    icon: 'search-outline' },
  resolved:          { label: 'Resolved',          color: C.green,   icon: 'checkmark-circle-outline' },
  dismissed:         { label: 'Dismissed',         color: C.dim,     icon: 'close-circle-outline' },
};

const DECISION_CONFIG: Record<string, { label: string; color: string }> = {
  no_action:            { label: 'No Action Taken',     color: C.muted },
  warning:              { label: 'Warning Issued',      color: C.yellow },
  refund_partial:       { label: 'Partial Refund',      color: C.blue },
  refund_full:          { label: 'Full Refund',         color: C.green },
  account_restriction:  { label: 'Account Restricted',  color: C.red },
  account_suspension:   { label: 'Account Suspended',   color: '#DC2626' },
};

// ─── Timeline step component ─────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'pending';

function TimelineStep({ label, sub, state }: { label: string; sub?: string; state: StepState }) {
  const color = state === 'done' ? C.green : state === 'active' ? C.blue : C.dim;
  const icon = state === 'done' ? 'checkmark-circle' : state === 'active' ? 'radio-button-on' : 'radio-button-off';
  return (
    <View style={tl.step}>
      <View style={tl.stepLeft}>
        <Ionicons name={icon as any} size={20} color={color} />
        <View style={[tl.line, state === 'pending' && { backgroundColor: 'rgba(100,116,139,0.3)' }]} />
      </View>
      <View style={tl.stepBody}>
        <Text style={[tl.stepLabel, { color: state === 'pending' ? C.dim : C.white }]}>{label}</Text>
        {sub ? <Text style={tl.stepSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function getTimelineStates(status: string): [StepState, StepState, StepState, StepState] {
  switch (status) {
    case 'awaiting_response': return ['done', 'active', 'pending', 'pending'];
    case 'under_review':      return ['done', 'done', 'active', 'pending'];
    case 'resolved':
    case 'dismissed':         return ['done', 'done', 'done', 'done'];
    default:                  return ['done', 'pending', 'pending', 'pending'];
  }
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NexrydeShieldScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId?: string; mode?: string }>();
  const { user } = useAppStore();

  const [disputes, setDisputes] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Report Issue modal state
  const [showReport, setShowReport] = useState(false);
  const [reportTripId, setReportTripId] = useState('');
  const [reportIssueType, setReportIssueType] = useState('');
  const [reportStatement, setReportStatement] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Case detail modal
  const [detailCase, setDetailCase] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [responding, setResponding] = useState(false);

  const loadDisputes = useCallback(async () => {
    if (!user?.id) { setListLoading(false); return; }
    try {
      const res = await getMyShieldDisputes();
      setDisputes(res.data?.disputes || []);
    } catch { setDisputes([]); }
    finally { setListLoading(false); setRefreshing(false); }
  }, [user?.id]);

  useEffect(() => { void loadDisputes(); }, [loadDisputes]);

  // If navigated from trip screen with a tripId, open the report modal immediately
  useEffect(() => {
    if (params.tripId && (params.mode === 'report' || !params.mode)) {
      setReportTripId(String(params.tripId));
      setShowReport(true);
    }
  }, [params.tripId, params.mode]);

  const submitReport = async () => {
    if (!reportIssueType) { Alert.alert('Select Issue Type', 'Please choose the type of issue before submitting.'); return; }
    if (reportStatement.trim().length < 10) { Alert.alert('Add Details', 'Please describe what happened (min 10 characters).'); return; }
    if (!reportTripId.trim()) { Alert.alert('Trip ID required', 'Please enter the Trip ID.'); return; }
    setSubmitting(true);
    try {
      await createShieldDispute(reportTripId.trim(), reportStatement.trim(), reportIssueType);
      Alert.alert(
        'Report Submitted ✓',
        'Your Nexryde Shield case has been opened. The other party will be notified and asked to respond within 24 hours.',
        [{ text: 'OK', onPress: () => { setShowReport(false); setReportStatement(''); setReportIssueType(''); void loadDisputes(); } }]
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to submit report. Please try again.');
    } finally { setSubmitting(false); }
  };

  const openCaseDetail = async (d: any) => {
    setDetailCase(d);
    setDetailLoading(true);
    try {
      const res = await getShieldDispute(d.id);
      setDetailCase(res.data?.dispute || d);
    } catch { /* use cached data */ }
    finally { setDetailLoading(false); }
  };

  const submitResponse = async () => {
    if (!detailCase || responseText.trim().length < 10) {
      Alert.alert('Add Details', 'Please write your response (min 10 characters).');
      return;
    }
    setResponding(true);
    try {
      await respondShieldDispute(detailCase.id, responseText.trim());
      Alert.alert('Response Submitted ✓', 'Your statement has been recorded. The case is now under review by our team.');
      setResponseText('');
      setDetailCase(null);
      void loadDisputes();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to submit response.');
    } finally { setResponding(false); }
  };

  const formatDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isRespondent = (d: any) => user?.id && user.id !== d?.opened_by && user.id !== d?.respondent_statement;
  const canRespond = (d: any) =>
    d?.status === 'awaiting_response' &&
    user?.id &&
    user.id !== d?.opened_by &&
    !d?.respondent_statement;

  // ─── Report Issue Modal ───────────────────────────────────────────────────

  const reportModal = (
    <Modal visible={showReport} animationType="slide" transparent onRequestClose={() => setShowReport(false)}>
      <View style={s.modalBg}>
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <View style={s.shieldBadge}>
              <Ionicons name="shield-checkmark" size={20} color={C.green} />
              <Text style={s.shieldBadgeText}>Nexryde Shield</Text>
            </View>
            <TouchableOpacity onPress={() => setShowReport(false)}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>

          <Text style={s.modalTitle}>Report an Issue</Text>
          <Text style={s.modalSub}>
            Nexryde Shield protects both riders and drivers by ensuring every report is reviewed with both sides heard and trip data verified.
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.fieldLabel}>ISSUE TYPE</Text>
            <View style={s.issueGrid}>
              {ISSUE_TYPES.map((it) => (
                <TouchableOpacity
                  key={it.id}
                  style={[s.issueTile, reportIssueType === it.id && { borderColor: it.color, backgroundColor: it.color + '18' }]}
                  onPress={() => setReportIssueType(it.id)}
                  activeOpacity={0.75}
                >
                  <View style={[s.issueTileIcon, { backgroundColor: it.color + (reportIssueType === it.id ? '28' : '15') }]}>
                    <Ionicons name={it.icon} size={20} color={reportIssueType === it.id ? it.color : C.muted} />
                  </View>
                  <Text style={[s.issueTileLabel, reportIssueType === it.id && { color: it.color }]}>{it.label}</Text>
                  {reportIssueType === it.id && (
                    <View style={[s.issueTileCheck, { backgroundColor: it.color }]}>
                      <Ionicons name="checkmark" size={10} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { marginTop: 20 }]}>WHAT HAPPENED?</Text>
            <TextInput
              style={s.textArea}
              placeholder="Explain what happened in detail…"
              placeholderTextColor={C.dim}
              multiline
              numberOfLines={5}
              value={reportStatement}
              onChangeText={setReportStatement}
              textAlignVertical="top"
            />

            {!params.tripId && (
              <>
                <Text style={[s.fieldLabel, { marginTop: 16 }]}>TRIP ID</Text>
                <TextInput
                  style={s.textInput}
                  placeholder="Paste your Trip ID"
                  placeholderTextColor={C.dim}
                  value={reportTripId}
                  onChangeText={setReportTripId}
                  autoCapitalize="none"
                />
              </>
            )}

            <TouchableOpacity
              style={[s.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={submitReport}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[C.green, '#00B455']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.submitGrad}>
                {submitting ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={18} color="#0D1420" />
                    <Text style={s.submitText}>Submit Report</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ─── Case Detail Modal ────────────────────────────────────────────────────

  const detailModal = detailCase && (
    <Modal visible={!!detailCase} animationType="slide" transparent onRequestClose={() => setDetailCase(null)}>
      <View style={s.modalBg}>
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <View style={s.shieldBadge}>
              <Ionicons name="shield-checkmark" size={18} color={C.green} />
              <Text style={s.shieldBadgeText}>Case #{detailCase.id?.slice(-6).toUpperCase()}</Text>
            </View>
            <TouchableOpacity onPress={() => setDetailCase(null)}>
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>

          {detailLoading ? (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <ActivityIndicator color={C.green} />
              <Text style={{ color: C.muted, marginTop: 12 }}>Loading case…</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Issue type + status */}
              <View style={s.detailRow}>
                {(() => {
                  const it = ISSUE_TYPES.find((i) => i.id === detailCase.issue_type) || ISSUE_TYPES[4];
                  return (
                    <View style={[s.detailBadge, { backgroundColor: it.color + '20', borderColor: it.color + '40' }]}>
                      <Ionicons name={it.icon} size={13} color={it.color} />
                      <Text style={[s.detailBadgeText, { color: it.color }]}>{it.label}</Text>
                    </View>
                  );
                })()}
                {(() => {
                  const sc = STATUS_CONFIG[detailCase.status] || STATUS_CONFIG['under_review'];
                  return (
                    <View style={[s.detailBadge, { backgroundColor: sc.color + '20', borderColor: sc.color + '40' }]}>
                      <Ionicons name={sc.icon as any} size={13} color={sc.color} />
                      <Text style={[s.detailBadgeText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                  );
                })()}
              </View>
              <Text style={s.detailDate}>Filed {formatDate(detailCase.created_at)}</Text>

              {/* Case timeline */}
              <Text style={s.sectionLabel}>CASE PROGRESS</Text>
              <View style={s.timelineCard}>
                {(() => {
                  const [s1, s2, s3, s4] = getTimelineStates(detailCase.status);
                  return (
                    <>
                      <TimelineStep label="Report Submitted" sub={formatDate(detailCase.created_at)} state={s1} />
                      <TimelineStep label="Awaiting Response" sub="Other party notified within 24h" state={s2} />
                      <TimelineStep label="Under Review" sub="Our team reviews both statements" state={s3} />
                      <TimelineStep label="Resolved" sub={detailCase.resolved_at ? formatDate(detailCase.resolved_at) : undefined} state={s4} />
                    </>
                  );
                })()}
              </View>

              {/* Trip evidence */}
              {detailCase.trip_evidence && (
                <>
                  <Text style={s.sectionLabel}>TRIP EVIDENCE</Text>
                  <View style={s.evidenceCard}>
                    {[
                      ['Fare', detailCase.trip_evidence.fare ? `₦${Number(detailCase.trip_evidence.fare).toLocaleString()}` : null],
                      ['Distance', detailCase.trip_evidence.distance_km ? `${Number(detailCase.trip_evidence.distance_km).toFixed(1)} km` : null],
                      ['Duration', detailCase.trip_evidence.duration_mins ? `~${detailCase.trip_evidence.duration_mins} min` : null],
                      ['Pickup', detailCase.trip_evidence.pickup_address],
                      ['Drop-off', detailCase.trip_evidence.dropoff_address],
                      ['Trip started', formatDate(detailCase.trip_evidence.trip_start_time)],
                      ['Trip ended', formatDate(detailCase.trip_evidence.trip_end_time)],
                      ['Payment', detailCase.trip_evidence.payment_method],
                    ].filter(([, v]) => v).map(([key, val]) => (
                      <View key={String(key)} style={s.evidenceRow}>
                        <Text style={s.evidenceKey}>{key}</Text>
                        <Text style={s.evidenceVal}>{val}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Statements */}
              <Text style={s.sectionLabel}>STATEMENTS</Text>
              {detailCase.rider_statement ? (
                <View style={s.statementCard}>
                  <View style={s.statementHeader}>
                    <Ionicons name="person-circle-outline" size={16} color={C.blue} />
                    <Text style={[s.statementRole, { color: C.blue }]}>Rider Statement</Text>
                  </View>
                  <Text style={s.statementText}>{detailCase.rider_statement}</Text>
                </View>
              ) : (
                <View style={[s.statementCard, { borderColor: C.yellow + '40' }]}>
                  <View style={s.statementHeader}>
                    <Ionicons name="time-outline" size={16} color={C.yellow} />
                    <Text style={[s.statementRole, { color: C.yellow }]}>Rider Response Pending</Text>
                  </View>
                </View>
              )}
              {detailCase.driver_statement ? (
                <View style={[s.statementCard, { marginTop: 8 }]}>
                  <View style={s.statementHeader}>
                    <Ionicons name="car-outline" size={16} color={C.green} />
                    <Text style={[s.statementRole, { color: C.green }]}>Driver Statement</Text>
                  </View>
                  <Text style={s.statementText}>{detailCase.driver_statement}</Text>
                </View>
              ) : (
                <View style={[s.statementCard, { borderColor: C.yellow + '40', marginTop: 8 }]}>
                  <View style={s.statementHeader}>
                    <Ionicons name="time-outline" size={16} color={C.yellow} />
                    <Text style={[s.statementRole, { color: C.yellow }]}>Driver Response Pending</Text>
                  </View>
                </View>
              )}

              {/* Decision */}
              {detailCase.status === 'resolved' && detailCase.decision && (() => {
                const dc = DECISION_CONFIG[detailCase.decision] || { label: detailCase.decision, color: C.muted };
                return (
                  <>
                    <Text style={s.sectionLabel}>DECISION</Text>
                    <View style={[s.decisionCard, { borderColor: dc.color + '50' }]}>
                      <View style={[s.decisionBadge, { backgroundColor: dc.color + '20' }]}>
                        <Ionicons name="shield-checkmark" size={18} color={dc.color} />
                        <Text style={[s.decisionLabel, { color: dc.color }]}>{dc.label}</Text>
                      </View>
                      {detailCase.decision_reason ? (
                        <Text style={s.decisionReason}>{detailCase.decision_reason}</Text>
                      ) : null}
                    </View>
                  </>
                );
              })()}

              {/* Respond section */}
              {canRespond(detailCase) && (
                <>
                  <Text style={s.sectionLabel}>YOUR RESPONSE</Text>
                  <Text style={s.responseSub}>
                    A report was filed for this trip. Please provide your statement within 24 hours.
                  </Text>
                  <TextInput
                    style={s.textArea}
                    placeholder="Explain your side of events…"
                    placeholderTextColor={C.dim}
                    multiline
                    numberOfLines={5}
                    value={responseText}
                    onChangeText={setResponseText}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[s.submitBtn, responding && { opacity: 0.7 }]}
                    onPress={submitResponse}
                    disabled={responding}
                    activeOpacity={0.85}
                  >
                    <LinearGradient colors={[C.blue, '#0284C7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.submitGrad}>
                      {responding ? <ActivityIndicator color="#FFF" /> : (
                        <>
                          <Ionicons name="send-outline" size={16} color="#FFF" />
                          <Text style={[s.submitText, { color: '#FFF' }]}>Submit My Response</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );

  // ─── Main list ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={['#0F1E33', C.bg]} style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Ionicons name="shield-checkmark" size={20} color={C.green} />
          <Text style={s.headerTitle}>Nexryde Shield</Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={() => { setReportTripId(''); setShowReport(true); }}>
          <Ionicons name="add" size={20} color={C.green} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Banner */}
      <View style={s.bannerCard}>
        <Ionicons name="shield-checkmark-outline" size={22} color={C.green} />
        <Text style={s.bannerText}>
          Nexryde Shield protects both riders and drivers by ensuring every report is reviewed with both sides heard and trip data verified.
        </Text>
      </View>

      {/* Cases list */}
      {listLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={{ color: C.muted, marginTop: 12, fontWeight: '600' }}>Loading cases…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadDisputes(); }} tintColor={C.green} />}
          showsVerticalScrollIndicator={false}
        >
          {disputes.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="shield-outline" size={48} color={C.dim} />
              </View>
              <Text style={s.emptyTitle}>No cases yet</Text>
              <Text style={s.emptySubtitle}>
                If you experience an issue on a trip, tap the button below to file a report.
              </Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => { setReportTripId(''); setShowReport(true); }}>
                <Ionicons name="add-circle-outline" size={18} color={C.green} />
                <Text style={s.emptyBtnText}>Report an Issue</Text>
              </TouchableOpacity>
            </View>
          ) : (
            disputes.map((d) => {
              const sc = STATUS_CONFIG[d.status] || STATUS_CONFIG['under_review'];
              const it = ISSUE_TYPES.find((i) => i.id === d.issue_type) || ISSUE_TYPES[4];
              return (
                <TouchableOpacity key={d.id} style={s.caseCard} onPress={() => openCaseDetail(d)} activeOpacity={0.8}>
                  <View style={s.caseTop}>
                    <View style={[s.caseIssueIcon, { backgroundColor: it.color + '22' }]}>
                      <Ionicons name={it.icon} size={20} color={it.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.caseIssueLabel}>{d.issue_type_label || it.label}</Text>
                      <Text style={s.caseMeta}>Case #{d.id?.slice(-6).toUpperCase()} · {formatDate(d.created_at)}</Text>
                    </View>
                    <View style={[s.statusPill, { backgroundColor: sc.color + '20', borderColor: sc.color + '45' }]}>
                      <Text style={[s.statusPillText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                  </View>

                  {/* Mini timeline bar */}
                  <View style={s.miniTimeline}>
                    {(['awaiting_response', 'under_review', 'resolved'] as const).map((step, i) => {
                      const stages: Record<string, number> = { awaiting_response: 1, under_review: 2, resolved: 3, dismissed: 3 };
                      const current = stages[d.status] ?? 0;
                      const done = i + 1 <= current;
                      return (
                        <React.Fragment key={step}>
                          <View style={[s.miniDot, { backgroundColor: done ? C.green : C.dim }]} />
                          {i < 2 && <View style={[s.miniLine, { backgroundColor: done && i + 2 <= current ? C.green : C.dim }]} />}
                        </React.Fragment>
                      );
                    })}
                  </View>

                  {canRespond(d) && (
                    <View style={s.respondNudge}>
                      <Ionicons name="alert-circle" size={14} color={C.yellow} />
                      <Text style={s.respondNudgeText}>Your response is requested</Text>
                    </View>
                  )}
                  <View style={s.caseChevron}>
                    <Ionicons name="chevron-forward" size={16} color={C.dim} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {reportModal}
      {detailModal}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  newBtn: { padding: 4 },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    margin: 16,
    marginTop: 0,
    backgroundColor: 'rgba(0,212,106,0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,212,106,0.25)',
  },
  bannerText: { flex: 1, fontSize: 12, color: '#A7F3D0', lineHeight: 18, fontWeight: '500' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(100,116,139,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, maxWidth: 280, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,212,106,0.15)', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(0,212,106,0.3)' },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: C.green },
  caseCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border, position: 'relative',
  },
  caseTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  caseIssueIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  caseIssueLabel: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 2 },
  caseMeta: { fontSize: 11, color: C.muted, fontWeight: '600' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  miniTimeline: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  miniDot: { width: 10, height: 10, borderRadius: 5 },
  miniLine: { flex: 1, height: 2, marginHorizontal: 4 },
  respondNudge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  respondNudgeText: { fontSize: 12, color: C.yellow, fontWeight: '700' },
  caseChevron: { position: 'absolute', right: 16, top: '50%', marginTop: -8 },

  // Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, maxHeight: '92%',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.dim, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  shieldBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shieldBadgeText: { fontSize: 14, fontWeight: '800', color: C.green },
  modalTitle: { fontSize: 22, fontWeight: '900', color: C.white, marginBottom: 6 },
  modalSub: { fontSize: 13, color: C.muted, lineHeight: 20, marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: C.dim, letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  issueTile: {
    width: '47%', borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.cardElevated, padding: 12, position: 'relative',
  },
  issueTileIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  issueTileLabel: { fontSize: 13, fontWeight: '700', color: C.white },
  issueTileCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  textArea: {
    backgroundColor: C.cardElevated, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14, fontSize: 14, color: C.white, minHeight: 120, marginBottom: 16,
  },
  textInput: {
    backgroundColor: C.cardElevated, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14, fontSize: 14, color: C.white, marginBottom: 16,
  },
  submitBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  submitGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, minHeight: 54 },
  submitText: { fontSize: 16, fontWeight: '900', color: '#0D1420' },

  // Detail modal
  detailRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  detailBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  detailBadgeText: { fontSize: 12, fontWeight: '700' },
  detailDate: { fontSize: 12, color: C.dim, marginBottom: 20, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: C.dim, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 20 },
  timelineCard: { backgroundColor: C.cardElevated, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  evidenceCard: { backgroundColor: C.cardElevated, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  evidenceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  evidenceKey: { fontSize: 12, fontWeight: '700', color: C.muted },
  evidenceVal: { fontSize: 12, fontWeight: '700', color: C.white, maxWidth: '60%', textAlign: 'right' },
  statementCard: { backgroundColor: C.cardElevated, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  statementHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statementRole: { fontSize: 12, fontWeight: '800' },
  statementText: { fontSize: 13, color: C.white, lineHeight: 20 },
  decisionCard: { backgroundColor: C.cardElevated, borderRadius: 14, padding: 16, borderWidth: 1 },
  decisionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, marginBottom: 10 },
  decisionLabel: { fontSize: 15, fontWeight: '800' },
  decisionReason: { fontSize: 13, color: C.muted, lineHeight: 20 },
  responseSub: { fontSize: 13, color: C.yellow, marginBottom: 12, lineHeight: 18 },
});

const tl = StyleSheet.create({
  step: { flexDirection: 'row', marginBottom: 4 },
  stepLeft: { width: 28, alignItems: 'center' },
  line: { flex: 1, width: 2, backgroundColor: 'rgba(0,212,106,0.35)', marginTop: 4, marginBottom: -4 },
  stepBody: { flex: 1, paddingLeft: 10, paddingBottom: 16 },
  stepLabel: { fontSize: 13, fontWeight: '700', color: C.white },
  stepSub: { fontSize: 11, color: C.muted, marginTop: 2 },
});
