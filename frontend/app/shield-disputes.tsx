import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import * as Haptics from 'expo-haptics';
import {
  createShieldDispute,
  getMyShieldDisputes,
  respondShieldDispute,
  getShieldDispute,
} from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useRequireUserOrLogin } from '@/src/hooks/useRequireUserOrLogin';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:           '#0D1420',
  card:         '#151F2E',
  cardElevated: '#1E2D40',
  border:       'rgba(148,163,184,0.12)',
  borderHi:     'rgba(148,163,184,0.22)',
  green:        '#00D46A',
  greenSoft:    'rgba(0,212,106,0.14)',
  blue:         '#0EA5E9',
  yellow:       '#F59E0B',
  red:          '#EF4444',
  purple:       '#9333EA',
  white:        '#FFFFFF',
  muted:        '#94A3B8',
  dim:          '#64748B',
  ink:          '#0D1420',
};

// ─── Static data ──────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  { id: 'driver_behavior', label: 'Driver Behavior', icon: 'person-outline'              as const, color: C.red    },
  { id: 'wrong_fare',      label: 'Wrong Fare',      icon: 'cash-outline'                as const, color: C.yellow },
  { id: 'route_issue',     label: 'Route Issue',     icon: 'map-outline'                 as const, color: C.blue   },
  { id: 'safety_concern',  label: 'Safety Concern',  icon: 'shield-outline'              as const, color: C.purple },
  { id: 'other',           label: 'Other',           icon: 'ellipsis-horizontal-outline' as const, color: C.muted  },
] as const;

const STATUS_CFG: Record<string, { label: string; color: string; icon: string }> = {
  awaiting_response: { label: 'Awaiting Response', color: C.yellow, icon: 'time-outline'            },
  under_review:      { label: 'Under Review',      color: C.blue,   icon: 'search-outline'          },
  resolved:          { label: 'Resolved',          color: C.green,  icon: 'checkmark-circle-outline'},
  dismissed:         { label: 'Dismissed',         color: C.dim,    icon: 'close-circle-outline'    },
};

const DECISION_CFG: Record<string, { label: string; color: string }> = {
  no_action:           { label: 'No Action Taken',    color: C.muted  },
  warning:             { label: 'Warning Issued',     color: C.yellow },
  refund_partial:      { label: 'Partial Refund',     color: C.blue   },
  refund_full:         { label: 'Full Refund',        color: C.green  },
  account_restriction: { label: 'Account Restricted', color: C.red    },
  account_suspension:  { label: 'Account Suspended',  color: '#DC2626'},
};

type FilterKey = 'all' | 'awaiting_response' | 'under_review' | 'resolved';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',               label: 'All'       },
  { key: 'awaiting_response', label: 'Awaiting'  },
  { key: 'under_review',      label: 'In Review' },
  { key: 'resolved',          label: 'Resolved'  },
];

const STAGE_NUM: Record<string, number> = {
  awaiting_response: 1, under_review: 2, resolved: 3, dismissed: 3,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'pending';

function TimelineStep({
  label, sub, state, last = false,
}: { label: string; sub?: string; state: StepState; last?: boolean }) {
  const color = state === 'done' ? C.green : state === 'active' ? C.blue : C.dim;
  const icon  = state === 'done' ? 'checkmark-circle' : state === 'active' ? 'radio-button-on' : 'radio-button-off';
  return (
    <View style={tl.step}>
      <View style={tl.left}>
        <View style={[tl.iconWrap, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Ionicons name={icon as any} size={16} color={color} />
        </View>
        {!last && (
          <View style={[tl.connector, state !== 'pending' && { backgroundColor: color + '60' }]} />
        )}
      </View>
      <View style={tl.body}>
        <Text style={[tl.label, state === 'pending' && { color: C.dim }]}>{label}</Text>
        {sub ? <Text style={tl.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function getSteps(status: string): StepState[] {
  const n = STAGE_NUM[status] ?? 0;
  return [0, 1, 2, 3].map((i): StepState => {
    if (i + 1 < n) return 'done';
    if (i + 1 === n) return n === STAGE_NUM['resolved'] && status === 'resolved' ? 'done' : 'active';
    return 'pending';
  });
}

// Character counter component
function CharCounter({ text, max }: { text: string; max: number }) {
  const count = text.length;
  const pct = count / max;
  const color = pct > 0.9 ? C.red : pct > 0.7 ? C.yellow : C.dim;
  return (
    <Text style={[cc.counter, { color }]}>{count}/{max}</Text>
  );
}
const cc = StyleSheet.create({ counter: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: -12, marginBottom: 10 } });

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NexrydeShieldScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ tripId?: string; mode?: string }>();
  const { user } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();
  const authed = useRequireUserOrLogin();

  // ── list state ──────────────────────────────────────────────────────────────
  const [disputes,    setDisputes]    = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [filter,      setFilter]      = useState<FilterKey>('all');

  // ── report modal state ──────────────────────────────────────────────────────
  const [showReport,       setShowReport]       = useState(false);
  const [reportTripId,     setReportTripId]     = useState('');
  const [reportIssueType,  setReportIssueType]  = useState('');
  const [reportStatement,  setReportStatement]  = useState('');
  const [submitting,       setSubmitting]       = useState(false);

  // ── detail modal state ──────────────────────────────────────────────────────
  const [detailCase,   setDetailCase]   = useState<any>(null);
  const [detailLoad,   setDetailLoad]   = useState(false);
  const [responseText, setResponseText] = useState('');
  const [responding,   setResponding]   = useState(false);

  // ── entrance animation ──────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [fadeAnim]);

  // ── load ─────────────────────────────────────────────────────────────────────
  const loadDisputes = useCallback(async () => {
    if (!userId || !canCallAuthedApi) { setListLoading(false); return; }
    try {
      const res = await getMyShieldDisputes();
      setDisputes(res.data?.disputes || []);
    } catch { setDisputes([]); }
    finally { setListLoading(false); setRefreshing(false); }
  }, [userId, canCallAuthedApi]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    void loadDisputes();
  }, [loadDisputes, canCallAuthedApi]);

  // ── deep-link: auto-open report from trip screen ───────────────────────────
  useEffect(() => {
    if (params.tripId && params.mode === 'report') {
      setReportTripId(String(params.tripId));
      setReportIssueType('');
      setReportStatement('');
      setShowReport(true);
    }
  }, [params.tripId, params.mode]);

  // ── derived counts ──────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: disputes.length };
    disputes.forEach((d) => { c[d.status] = (c[d.status] ?? 0) + 1; });
    return c;
  }, [disputes]);

  const visible = useMemo(
    () => filter === 'all' ? disputes : disputes.filter((d) => d.status === filter),
    [disputes, filter],
  );

  // ── helpers ──────────────────────────────────────────────────────────────────
  const fmt = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // A user can respond if they are the non-opener party AND no respondent_statement exists yet
  const canRespond = (d: any): boolean => {
    if (!d || !userId) return false;
    if (d.status !== 'awaiting_response') return false;
    if (d.opened_by === userId) return false;
    // Check if this user's role statement is already filed
    if (d.rider_id === userId && d.rider_statement) return false;
    if (d.driver_id === userId && d.driver_statement) return false;
    return true;
  };

  // ── actions ───────────────────────────────────────────────────────────────────
  const submitReport = async () => {
    Keyboard.dismiss();
    if (!reportIssueType) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Select Issue Type', 'Please choose a category before submitting.');
      return;
    }
    if (reportStatement.trim().length < 10) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Add Details', 'Please describe what happened (at least 10 characters).');
      return;
    }
    if (!reportTripId.trim()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Trip ID required', 'Please enter the Trip ID for this report.');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      await createShieldDispute(reportTripId.trim(), reportStatement.trim(), reportIssueType);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '✓ Report Submitted',
        'Your Nexryde Shield case has been opened. The other party will be notified and has 24 hours to respond.',
        [{
          text: 'Got it',
          onPress: () => {
            setShowReport(false);
            setReportStatement('');
            setReportIssueType('');
            setReportTripId('');
            void loadDisputes();
          },
        }],
      );
    } catch (e: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Submission Failed', e?.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally { setSubmitting(false); }
  };

  const openCaseDetail = async (d: any) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDetailCase(d);
    setDetailLoad(true);
    setResponseText('');
    try {
      const res = await getShieldDispute(d.id);
      setDetailCase(res.data?.dispute || d);
    } catch { /* use cached data */ }
    finally { setDetailLoad(false); }
  };

  const submitResponse = async () => {
    Keyboard.dismiss();
    if (responseText.trim().length < 10) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Add Details', 'Please write your response (at least 10 characters).');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setResponding(true);
    try {
      await respondShieldDispute(detailCase.id, responseText.trim());
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '✓ Response Submitted',
        'Your statement has been recorded. Our team will now review both sides of the case.',
        [{
          text: 'OK',
          onPress: () => { setDetailCase(null); setResponseText(''); void loadDisputes(); },
        }],
      );
    } catch (e: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to submit response. Please try again.');
    } finally { setResponding(false); }
  };

  if (!authed) {
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  const reportModal = (
    <Modal
      visible={showReport}
      animationType="slide"
      transparent
      onRequestClose={() => setShowReport(false)}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalBg}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={s.modalHandle} />

            {/* Header */}
            <View style={s.modalHeader}>
              <View style={s.shieldRow}>
                <LinearGradient colors={[C.green + '40', C.green + '10']} style={s.shieldIconWrap}>
                  <Ionicons name="shield-checkmark" size={18} color={C.green} />
                </LinearGradient>
                <Text style={s.shieldRowText}>Nexryde Shield</Text>
              </View>
              <TouchableOpacity onPress={() => setShowReport(false)} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <View style={s.closeBtn}><Ionicons name="close" size={18} color={C.muted} /></View>
              </TouchableOpacity>
            </View>

            <Text style={s.modalTitle}>Report an Issue</Text>
            <Text style={s.modalSub}>
              Every report is reviewed with both sides heard and trip data verified — fairly and transparently.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Issue type */}
              <Text style={s.fieldLabel}>WHAT WENT WRONG?</Text>
              <View style={s.issueGrid}>
                {ISSUE_TYPES.map((it) => {
                  const sel = reportIssueType === it.id;
                  return (
                    <TouchableOpacity
                      key={it.id}
                      style={[s.issueTile, sel && { borderColor: it.color, backgroundColor: it.color + '16' }]}
                      onPress={() => { void Haptics.selectionAsync(); setReportIssueType(it.id); }}
                      activeOpacity={0.72}
                    >
                      <View style={[s.issueTileIcon, { backgroundColor: it.color + (sel ? '30' : '16') }]}>
                        <Ionicons name={it.icon} size={20} color={sel ? it.color : C.dim} />
                      </View>
                      <Text style={[s.issueTileLabel, sel && { color: it.color }]}>{it.label}</Text>
                      {sel && (
                        <View style={[s.issueTileCheck, { backgroundColor: it.color }]}>
                          <Ionicons name="checkmark" size={10} color="#FFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Statement */}
              <Text style={[s.fieldLabel, { marginTop: 18 }]}>DESCRIBE WHAT HAPPENED</Text>
              <TextInput
                style={[s.textArea, reportStatement.length > 0 && { borderColor: C.borderHi }]}
                placeholder="Give as much detail as possible — what happened, when, and how it affected your trip…"
                placeholderTextColor={C.dim}
                multiline
                numberOfLines={5}
                value={reportStatement}
                onChangeText={setReportStatement}
                textAlignVertical="top"
                maxLength={2000}
              />
              <CharCounter text={reportStatement} max={2000} />

              {/* Trip ID — only show if not passed via params */}
              {!params.tripId && (
                <>
                  <Text style={[s.fieldLabel, { marginTop: 8 }]}>TRIP ID</Text>
                  <TextInput
                    style={s.textInput}
                    placeholder="Paste your Trip ID (from trip receipt)"
                    placeholderTextColor={C.dim}
                    value={reportTripId}
                    onChangeText={setReportTripId}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              )}

              {/* Info note */}
              <View style={s.infoNote}>
                <Ionicons name="information-circle-outline" size={16} color={C.blue} />
                <Text style={s.infoNoteText}>
                  Trip data (route, fare, timing) is automatically attached. No instant bans — both parties have a chance to respond.
                </Text>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[s.submitBtn, submitting && s.submitBtnDisabled]}
                onPress={submitReport}
                disabled={submitting}
                activeOpacity={0.86}
              >
                <LinearGradient
                  colors={[C.green, '#00A857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.submitGrad}
                >
                  {submitting ? (
                    <ActivityIndicator color={C.ink} />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark" size={18} color={C.ink} />
                      <Text style={s.submitText}>Submit Report</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CASE DETAIL MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  const detailModal = (
    <Modal
      visible={!!detailCase}
      animationType="slide"
      transparent
      onRequestClose={() => setDetailCase(null)}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalBg}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={s.modalHandle} />

            {/* Header */}
            <View style={s.modalHeader}>
              <View style={s.shieldRow}>
                <LinearGradient colors={[C.green + '40', C.green + '10']} style={s.shieldIconWrap}>
                  <Ionicons name="shield-checkmark" size={16} color={C.green} />
                </LinearGradient>
                <Text style={s.shieldRowText}>
                  Case #{(detailCase?.id || '').slice(-6).toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDetailCase(null)} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <View style={s.closeBtn}><Ionicons name="close" size={18} color={C.muted} /></View>
              </TouchableOpacity>
            </View>

            {detailLoad ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <ActivityIndicator size="large" color={C.green} />
                <Text style={{ color: C.muted, marginTop: 14, fontWeight: '600' }}>Loading case…</Text>
              </View>
            ) : detailCase && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Status + issue badges */}
                {(() => {
                  const sc = STATUS_CFG[detailCase.status] || STATUS_CFG['under_review'];
                  const it = ISSUE_TYPES.find((i) => i.id === detailCase.issue_type) ?? ISSUE_TYPES[4];
                  return (
                    <View style={s.badgeRow}>
                      <View style={[s.badge, { backgroundColor: it.color + '20', borderColor: it.color + '45' }]}>
                        <Ionicons name={it.icon} size={12} color={it.color} />
                        <Text style={[s.badgeText, { color: it.color }]}>{it.label}</Text>
                      </View>
                      <View style={[s.badge, { backgroundColor: sc.color + '20', borderColor: sc.color + '45' }]}>
                        <Ionicons name={sc.icon as any} size={12} color={sc.color} />
                        <Text style={[s.badgeText, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                      <Text style={s.filedDate}>Filed {fmt(detailCase.created_at)}</Text>
                    </View>
                  );
                })()}

                {/* ── Timeline ── */}
                <Text style={s.sectionLabel}>CASE PROGRESS</Text>
                <View style={s.timelineCard}>
                  {(() => {
                    const steps = getSteps(detailCase.status);
                    const labels = [
                      { label: 'Report Submitted',   sub: fmt(detailCase.created_at) },
                      { label: 'Awaiting Response',   sub: 'Other party notified within 24h' },
                      { label: 'Under Review',        sub: 'Our team reviews both statements' },
                      { label: 'Case Resolved',       sub: detailCase.resolved_at ? fmt(detailCase.resolved_at) : undefined },
                    ];
                    return labels.map((l, i) => (
                      <TimelineStep key={i} label={l.label} sub={l.sub} state={steps[i]} last={i === 3} />
                    ));
                  })()}
                </View>

                {/* ── Trip Evidence ── */}
                {detailCase.trip_evidence && (() => {
                  const ev = detailCase.trip_evidence;
                  const rows = [
                    ['Fare',        ev.fare       ? `₦${Number(ev.fare).toLocaleString()}` : null],
                    ['Distance',    ev.distance_km ? `${Number(ev.distance_km).toFixed(1)} km` : null],
                    ['Duration',    ev.duration_mins ? `~${ev.duration_mins} min` : null],
                    ['Payment',     ev.payment_method],
                    ['Pickup',      ev.pickup_address],
                    ['Drop-off',    ev.dropoff_address],
                    ['Trip started', fmt(ev.trip_start_time)],
                    ['Trip ended',  fmt(ev.trip_end_time)],
                  ].filter(([, v]) => v) as [string, string][];
                  if (!rows.length) return null;
                  return (
                    <>
                      <Text style={s.sectionLabel}>TRIP EVIDENCE</Text>
                      <View style={s.evidenceCard}>
                        {rows.map(([k, v], i) => (
                          <View key={k} style={[s.evidenceRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                            <Text style={s.evidenceKey}>{k}</Text>
                            <Text style={s.evidenceVal} numberOfLines={2}>{v}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  );
                })()}

                {/* ── Statements ── */}
                <Text style={s.sectionLabel}>STATEMENTS</Text>
                <StatementBlock
                  role="Rider"
                  icon="person-circle-outline"
                  color={C.blue}
                  text={detailCase.rider_statement}
                />
                <StatementBlock
                  role="Driver"
                  icon="car-outline"
                  color={C.green}
                  text={detailCase.driver_statement}
                  style={{ marginTop: 8 }}
                />

                {/* ── Decision ── */}
                {detailCase.status === 'resolved' && detailCase.decision && (() => {
                  const dc = DECISION_CFG[detailCase.decision] ?? { label: detailCase.decision, color: C.muted };
                  return (
                    <>
                      <Text style={s.sectionLabel}>FINAL DECISION</Text>
                      <View style={[s.decisionCard, { borderColor: dc.color + '50' }]}>
                        <LinearGradient
                          colors={[dc.color + '22', dc.color + '08']}
                          style={s.decisionGrad}
                        >
                          <Ionicons name="shield-checkmark" size={22} color={dc.color} />
                          <Text style={[s.decisionLabel, { color: dc.color }]}>{dc.label}</Text>
                        </LinearGradient>
                        {detailCase.decision_reason ? (
                          <Text style={s.decisionReason}>{detailCase.decision_reason}</Text>
                        ) : null}
                      </View>
                    </>
                  );
                })()}

                {/* ── Respond section ── */}
                {canRespond(detailCase) && (
                  <>
                    <View style={s.respondAlert}>
                      <Ionicons name="alert-circle" size={18} color={C.yellow} />
                      <Text style={s.respondAlertText}>
                        A report was filed for this trip. Please share your side within 24 hours.
                      </Text>
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 16 }]}>YOUR RESPONSE</Text>
                    <TextInput
                      style={[s.textArea, responseText.length > 0 && { borderColor: C.borderHi }]}
                      placeholder="Explain your side of events clearly and factually…"
                      placeholderTextColor={C.dim}
                      multiline
                      numberOfLines={5}
                      value={responseText}
                      onChangeText={setResponseText}
                      textAlignVertical="top"
                      maxLength={2000}
                    />
                    <CharCounter text={responseText} max={2000} />
                    <TouchableOpacity
                      style={[s.submitBtn, responding && s.submitBtnDisabled]}
                      onPress={submitResponse}
                      disabled={responding}
                      activeOpacity={0.86}
                    >
                      <LinearGradient
                        colors={[C.blue, '#0369A1']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.submitGrad}
                      >
                        {responding ? (
                          <ActivityIndicator color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="send" size={16} color="#FFF" />
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
      </KeyboardAvoidingView>
    </Modal>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={s.root} edges={['top']}>

      {/* ── Gradient header ── */}
      <LinearGradient colors={['#0A1628', C.bg]} style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <LinearGradient colors={[C.green + '50', C.green + '10']} style={s.headerShieldWrap}>
            <Ionicons name="shield-checkmark" size={18} color={C.green} />
          </LinearGradient>
          <View>
            <Text style={s.headerTitle}>Nexryde Shield</Text>
            <Text style={s.headerSub}>Dispute resolution</Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReportTripId(''); setReportIssueType(''); setReportStatement(''); setShowReport(true); }}
          accessibilityLabel="File new report"
        >
          <View style={s.newBtnInner}>
            <Ionicons name="add" size={18} color={C.green} />
          </View>
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Info banner ── */}
      <View style={s.bannerCard}>
        <Ionicons name="shield-checkmark-outline" size={20} color={C.green} />
        <Text style={s.bannerText}>
          Every report is reviewed with both sides heard and trip data verified.
        </Text>
      </View>

      {/* ── Filter tabs ── */}
      <View style={s.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const cnt = counts[f.key] ?? 0;
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.filterTab, active && s.filterTabActive]}
              onPress={() => { void Haptics.selectionAsync(); setFilter(f.key); }}
              activeOpacity={0.75}
            >
              <Text style={[s.filterTabText, active && s.filterTabTextActive]}>{f.label}</Text>
              {cnt > 0 && (
                <View style={[s.filterCount, active && { backgroundColor: C.green }]}>
                  <Text style={[s.filterCountText, active && { color: C.ink }]}>{cnt}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── List ── */}
      {listLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={s.loadingText}>Loading cases…</Text>
        </View>
      ) : (
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          <ScrollView
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); void loadDisputes(); }}
                tintColor={C.green}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {visible.length === 0 ? (
              <View style={s.empty}>
                <LinearGradient colors={[C.green + '22', C.green + '06']} style={s.emptyIconWrap}>
                  <Ionicons name="shield-outline" size={44} color={C.green} />
                </LinearGradient>
                <Text style={s.emptyTitle}>
                  {filter === 'all' ? 'No cases yet' : `No ${filter.replace('_', ' ')} cases`}
                </Text>
                <Text style={s.emptySubtitle}>
                  {filter === 'all'
                    ? 'Had an issue with a trip? Tap + to file a report — your voice matters.'
                    : 'Switch to "All" to see your complete case history.'}
                </Text>
                {filter === 'all' && (
                  <TouchableOpacity
                    style={s.emptyBtn}
                    onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReportTripId(''); setReportIssueType(''); setReportStatement(''); setShowReport(true); }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={C.green} />
                    <Text style={s.emptyBtnText}>Report an Issue</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              visible.map((d) => {
                const sc = STATUS_CFG[d.status] ?? STATUS_CFG['under_review'];
                const it = ISSUE_TYPES.find((i) => i.id === d.issue_type) ?? ISSUE_TYPES[4];
                const stage = STAGE_NUM[d.status] ?? 0;
                const needsReply = canRespond(d);
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[s.caseCard, needsReply && { borderColor: C.yellow + '60' }]}
                    onPress={() => openCaseDetail(d)}
                    activeOpacity={0.78}
                  >
                    {/* Top row */}
                    <View style={s.caseTop}>
                      <View style={[s.caseIcon, { backgroundColor: it.color + '22' }]}>
                        <Ionicons name={it.icon} size={20} color={it.color} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={s.caseLabel}>{d.issue_type_label || it.label}</Text>
                        <Text style={s.caseMeta}>
                          #{d.id?.slice(-6).toUpperCase()} · {fmt(d.created_at)}
                        </Text>
                      </View>
                      <View style={[s.statusPill, { backgroundColor: sc.color + '1A', borderColor: sc.color + '50' }]}>
                        <Text style={[s.statusPillText, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                    </View>

                    {/* Mini progress bar */}
                    <View style={s.progressBar}>
                      {[1, 2, 3].map((step) => (
                        <View
                          key={step}
                          style={[
                            s.progressSegment,
                            { backgroundColor: step <= stage ? C.green : C.border },
                            step < 3 && { marginRight: 4 },
                          ]}
                        />
                      ))}
                    </View>

                    {/* Response nudge */}
                    {needsReply && (
                      <View style={s.nudge}>
                        <Ionicons name="alert-circle" size={14} color={C.yellow} />
                        <Text style={s.nudgeText}>Your response is requested — tap to respond</Text>
                      </View>
                    )}

                    {/* Chevron */}
                    <View style={s.chevron}>
                      <Ionicons name="chevron-forward" size={16} color={C.dim} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      )}

      {reportModal}
      {detailModal}
    </SafeAreaView>
  );
}

// ─── StatementBlock helper ────────────────────────────────────────────────────

function StatementBlock({
  role, icon, color, text, style,
}: { role: string; icon: string; color: string; text?: string | null; style?: any }) {
  if (text) {
    return (
      <View style={[sb.card, style]}>
        <View style={sb.header}>
          <View style={[sb.iconWrap, { backgroundColor: color + '20' }]}>
            <Ionicons name={icon as any} size={14} color={color} />
          </View>
          <Text style={[sb.role, { color }]}>{role} Statement</Text>
        </View>
        <Text style={sb.text}>{text}</Text>
      </View>
    );
  }
  return (
    <View style={[sb.card, { borderColor: '#F59E0B40' }, style]}>
      <View style={sb.header}>
        <Ionicons name="time-outline" size={15} color="#F59E0B" />
        <Text style={[sb.role, { color: '#F59E0B' }]}>{role} Response Pending</Text>
      </View>
      <Text style={sb.pending}>Waiting for the {role.toLowerCase()} to respond…</Text>
    </View>
  );
}

const sb = StyleSheet.create({
  card: {
    backgroundColor: C.cardElevated,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  iconWrap: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  role: { fontSize: 12, fontWeight: '800' },
  text: { fontSize: 13, color: C.white, lineHeight: 21 },
  pending: { fontSize: 12, color: C.dim, fontStyle: 'italic' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 18,
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerShieldWrap: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: C.white, letterSpacing: 0.2 },
  headerSub: { fontSize: 11, color: C.dim, fontWeight: '600' },
  newBtn: { padding: 4 },
  newBtnInner: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: C.greenSoft,
    borderWidth: 1, borderColor: C.green + '40',
    alignItems: 'center', justifyContent: 'center',
  },

  // Banner
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: C.greenSoft,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.green + '30',
  },
  bannerText: { flex: 1, fontSize: 12, color: '#A7F3D0', lineHeight: 17, fontWeight: '500' },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
  },
  filterTabActive: { backgroundColor: C.greenSoft, borderColor: C.green + '50' },
  filterTabText: { fontSize: 12, fontWeight: '700', color: C.muted },
  filterTabTextActive: { color: C.green },
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.cardElevated,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterCountText: { fontSize: 10, fontWeight: '800', color: C.muted },

  // List
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: C.muted, marginTop: 12, fontWeight: '600', fontSize: 13 },
  list: { paddingHorizontal: 16, paddingTop: 4 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 20 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: C.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.greenSoft, borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 13,
    borderWidth: 1, borderColor: C.green + '40',
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: C.green },

  // Case cards
  caseCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  caseTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingRight: 20 },
  caseIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  caseLabel: { fontSize: 14, fontWeight: '700', color: C.white },
  caseMeta: { fontSize: 11, color: C.dim, fontWeight: '600' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, flexShrink: 0 },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  progressBar: { flexDirection: 'row', marginBottom: 10 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nudgeText: { fontSize: 12, color: C.yellow, fontWeight: '700' },
  chevron: { position: 'absolute', right: 16, top: 20 },

  // Modals
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 22, paddingTop: 12,
    maxHeight: '93%',
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.dim, alignSelf: 'center', marginBottom: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  shieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shieldIconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  shieldRowText: { fontSize: 14, fontWeight: '800', color: C.green },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.cardElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: C.white, marginBottom: 6 },
  modalSub: { fontSize: 13, color: C.muted, lineHeight: 20, marginBottom: 18 },

  // Form
  fieldLabel: {
    fontSize: 11, fontWeight: '800', color: C.dim,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 10,
  },
  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  issueTile: {
    width: '47%', borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.cardElevated, padding: 12, position: 'relative',
  },
  issueTileIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  issueTileLabel: { fontSize: 13, fontWeight: '700', color: C.white },
  issueTileCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  textArea: {
    backgroundColor: C.cardElevated,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14, fontSize: 14, color: C.white, minHeight: 120, marginBottom: 4,
  },
  textInput: {
    backgroundColor: C.cardElevated,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    padding: 14, fontSize: 14, color: C.white, marginBottom: 16,
  },
  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(14,165,233,0.1)',
    borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(14,165,233,0.2)',
  },
  infoNoteText: { flex: 1, fontSize: 12, color: '#BAE6FD', lineHeight: 18, fontWeight: '500' },
  submitBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  submitBtnDisabled: { opacity: 0.65 },
  submitGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, minHeight: 54,
  },
  submitText: { fontSize: 16, fontWeight: '900', color: C.ink },

  // Detail
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  filedDate: { fontSize: 11, color: C.dim, fontWeight: '600', marginLeft: 'auto' },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: C.dim,
    letterSpacing: 0.9, textTransform: 'uppercase',
    marginTop: 20, marginBottom: 10,
  },
  timelineCard: {
    backgroundColor: C.cardElevated,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },
  evidenceCard: {
    backgroundColor: C.cardElevated,
    borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  evidenceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  evidenceKey: { fontSize: 12, fontWeight: '700', color: C.muted },
  evidenceVal: { fontSize: 12, fontWeight: '700', color: C.white, maxWidth: '58%', textAlign: 'right' },
  respondAlert: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 12, padding: 12, marginTop: 20,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  },
  respondAlertText: { flex: 1, fontSize: 13, color: '#FDE68A', lineHeight: 19, fontWeight: '500' },
  decisionCard: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 8,
  },
  decisionGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16,
  },
  decisionLabel: { fontSize: 16, fontWeight: '900', flex: 1 },
  decisionReason: {
    fontSize: 13, color: C.muted, lineHeight: 20,
    paddingHorizontal: 16, paddingBottom: 16,
  },
});

// ─── Timeline styles ──────────────────────────────────────────────────────────
const tl = StyleSheet.create({
  step:      { flexDirection: 'row', minHeight: 40 },
  left:      { width: 32, alignItems: 'center' },
  iconWrap:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  connector: { flex: 1, width: 2, backgroundColor: 'rgba(0,212,106,0.25)', marginVertical: 3 },
  body:      { flex: 1, paddingLeft: 10, paddingBottom: 14, justifyContent: 'center' },
  label:     { fontSize: 13, fontWeight: '700', color: C.white },
  sub:       { fontSize: 11, color: C.dim, marginTop: 2 },
});
