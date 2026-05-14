/**
 * Nexryde Driver Withdrawal
 * Powerhouse withdrawal engine with banking-grade UI.
 *
 * Flow:
 *   1. View wallet balance (auto-credited from wallet rides)
 *   2. Tap "Withdraw" → enter amount → face scan → submitted
 *   3. Status: Under Review → Processing → Paid  (or Failed → refunded)
 *   4. Full transaction history with timeline
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Animated,
  Easing,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  useAppStore,
} from '@/src/store/appStore';
import {
  getDriverWithdrawals,
  withdrawDriverEarningsWithBiometric,
  type WithdrawalRecord,
} from '@/src/services/api';
import { useFlowLayout } from '@/src/constants/flowLayout';

// ── Status config ────────────────────────────────────────────────────────────

type StatusKey = 'pending_settlement' | 'processing' | 'paid' | 'failed' | string;

const STATUS_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string;
  icon: string; timelineLabel: string;
}> = {
  pending_settlement: {
    label: 'Under Review',
    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)',
    icon: 'time-outline', timelineLabel: 'Request received',
  },
  processing: {
    label: 'Processing',
    color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)',
    icon: 'sync-circle-outline', timelineLabel: 'Bank transfer in progress',
  },
  paid: {
    label: 'Paid',
    color: '#22C55E', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)',
    icon: 'checkmark-circle', timelineLabel: 'Money sent to your bank',
  },
  failed: {
    label: 'Failed · Refunded',
    color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.3)',
    icon: 'close-circle', timelineLabel: 'Refunded to wallet',
  },
};

function getStatusCfg(status: StatusKey) {
  return STATUS_CONFIG[status] ?? {
    label: status, color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)',
    icon: 'ellipse-outline', timelineLabel: 'Status unknown',
  };
}

// ── Timeline steps for a withdrawal ─────────────────────────────────────────

const TIMELINE_STEPS = [
  { status: 'pending_settlement', label: 'Submitted', sub: 'Nexryde received your request' },
  { status: 'processing',         label: 'Processing', sub: 'Bank transfer initiated' },
  { status: 'paid',               label: 'Paid',       sub: 'Money sent to your bank' },
];

function WithdrawalTimeline({ status }: { status: StatusKey }) {
  const isFailed = status === 'failed';
  const activeIdx = isFailed ? -1 : TIMELINE_STEPS.findIndex(s => s.status === status);

  return (
    <View style={tl.wrap}>
      {TIMELINE_STEPS.map((step, i) => {
        const done   = !isFailed && i < activeIdx;
        const active = !isFailed && i === activeIdx;
        const future = isFailed || i > activeIdx;
        const color  = done || active ? getStatusCfg(step.status).color : '#334155';

        return (
          <View key={step.status} style={tl.row}>
            {/* dot + line */}
            <View style={tl.dotCol}>
              <View style={[tl.dot, { backgroundColor: done ? '#22C55E' : active ? color : '#1e293b', borderColor: done || active ? color : '#334155' }]}>
                {done
                  ? <Ionicons name="checkmark" size={12} color="#fff" />
                  : active
                    ? <View style={[tl.innerDot, { backgroundColor: color }]} />
                    : null}
              </View>
              {i < TIMELINE_STEPS.length - 1 && (
                <View style={[tl.line, { backgroundColor: done ? '#22C55E' : '#1e293b' }]} />
              )}
            </View>
            {/* text */}
            <View style={tl.textCol}>
              <Text style={[tl.stepLabel, { color: done || active ? '#f8fafc' : '#475569' }]}>{step.label}</Text>
              <Text style={[tl.stepSub, active && { color: color }]}>{step.sub}</Text>
            </View>
          </View>
        );
      })}
      {isFailed && (
        <View style={[tl.failedBanner]}>
          <Ionicons name="close-circle" size={16} color="#EF4444" />
          <Text style={tl.failedText}>Transfer failed — amount refunded to your wallet.</Text>
        </View>
      )}
    </View>
  );
}

const tl = StyleSheet.create({
  wrap: { paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 0 },
  dotCol: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  innerDot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 2, flex: 1, minHeight: 20, marginVertical: 2 },
  textCol: { flex: 1, paddingBottom: 16 },
  stepLabel: { fontSize: 13, fontWeight: '800' },
  stepSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  failedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10, marginTop: 4, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  failedText: { fontSize: 12, fontWeight: '700', color: '#EF4444', flex: 1 },
});

// ── Withdrawal card ──────────────────────────────────────────────────────────

function WithdrawalCard({ item, onExpand }: { item: WithdrawalRecord; onExpand: () => void }) {
  const cfg = getStatusCfg(item.status);
  const date = item.created_at ? new Date(item.created_at) : null;
  const dateStr = date
    ? date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  const timeStr = date ? date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <TouchableOpacity style={wc.card} onPress={onExpand} activeOpacity={0.88}>
      <View style={wc.row}>
        {/* Icon */}
        <View style={[wc.iconWrap, { backgroundColor: cfg.bg, borderColor: cfg.border, borderWidth: 1 }]}>
          <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
        </View>

        {/* Info */}
        <View style={wc.info}>
          <Text style={wc.amount}>₦{Math.round(item.amount).toLocaleString()}</Text>
          <Text style={wc.bank} numberOfLines={1}>
            {item.bank_name || 'Bank'} · {item.account_number ? `****${item.account_number.slice(-4)}` : '—'}
          </Text>
          <Text style={wc.date}>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</Text>
        </View>

        {/* Status */}
        <View style={[wc.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[wc.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const wc = StyleSheet.create({
  card: { backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1e293b' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  amount: { fontSize: 18, fontWeight: '900', color: '#f8fafc' },
  bank:   { fontSize: 12, color: '#64748b', marginTop: 2 },
  date:   { fontSize: 11, color: '#475569', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '800' },
});

// ── Quick amount presets ──────────────────────────────────────────────────────

function AmountPresets({ balance, onSelect }: { balance: number; onSelect: (v: string) => void }) {
  const presets = [
    { label: '₦5,000',  value: 5000 },
    { label: '₦10,000', value: 10000 },
    { label: '₦20,000', value: 20000 },
    { label: 'All',     value: Math.floor(balance) },
  ].filter(p => p.value > 0 && p.value <= balance);

  if (presets.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {presets.map(p => (
        <TouchableOpacity
          key={p.label}
          style={{ backgroundColor: '#1e293b', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#334155' }}
          onPress={() => onSelect(String(p.value))}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#94a3b8' }}>{p.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Spinning status icon ──────────────────────────────────────────────────────

function ProcessingSpinner({ color }: { color: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, useNativeDriver: true, easing: Easing.linear })).start();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ transform: [{ rotate }] }}><Ionicons name="sync" size={16} color={color} /></Animated.View>;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function WithdrawalScreen() {
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { user } = useAppStore();

  const [walletBalance, setWalletBalance] = useState(0);
  const [earningsFrozen, setEarningsFrozen] = useState(false);
  const [bankReady, setBankReady] = useState(false);
  const [bank, setBank] = useState({ bank_name: '', account_number: '', account_name: '' });
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Withdraw modal state
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'amount' | 'confirm' | 'success'>('amount');
  const [lastResult, setLastResult] = useState<{ amount: number; reference: string } | null>(null);

  const modalAnim = useRef(new Animated.Value(0)).current;

  const openModal = () => {
    setStep('amount');
    setAmount('');
    setShowModal(true);
    Animated.spring(modalAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 9 }).start();
  };

  const closeModal = () => {
    Animated.timing(modalAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShowModal(false);
      setStep('amount');
      setAmount('');
    });
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await getDriverWithdrawals(user.id);
      const d = res.data;
      setWalletBalance(d.wallet_balance);
      setEarningsFrozen(d.earnings_frozen);
      setBankReady(d.bank_ready);
      setBank(d.bank);
      setWithdrawals(d.withdrawals);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleWithdraw = async () => {
    if (!user?.id) return;
    const amt = parseFloat(amount.replace(/,/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid withdrawal amount.');
      return;
    }
    if (amt > walletBalance) {
      Alert.alert('Insufficient balance', `Your available balance is ₦${Math.floor(walletBalance).toLocaleString()}.`);
      return;
    }
    if (amt < 500) {
      Alert.alert('Minimum withdrawal', 'Minimum withdrawal amount is ₦500.');
      return;
    }
    if (!bankReady) {
      Alert.alert('Bank required', 'Please add your bank details before withdrawing.', [
        { text: 'Add Bank', onPress: () => { closeModal(); router.push('/driver/bank'); } },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    // Move to confirm step
    setStep('confirm');
  };

  const handleFaceScan = async () => {
    if (!user?.id) return;
    const amt = parseFloat(amount.replace(/,/g, ''));

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Camera required', 'Camera permission is needed to verify your identity for withdrawal.');
      return;
    }

    const capture = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (capture.canceled || !capture.assets?.[0]?.base64) return;

    setSubmitting(true);
    try {
      const res = await withdrawDriverEarningsWithBiometric(user.id, {
        amount: amt,
        face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
      });
      const d = res.data;
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWalletBalance(d.remaining_balance);
      setLastResult({ amount: d.withdrawn_amount, reference: `withdraw_${Date.now()}` });
      setStep('success');
      // Refresh list after short delay
      setTimeout(() => void loadData(), 1500);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Withdrawal failed. Please try again.';
      Alert.alert('Withdrawal failed', detail);
    } finally {
      setSubmitting(false);
    }
  };

  const parsedAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const canSubmit = parsedAmount >= 500 && parsedAmount <= walletBalance && bankReady && !earningsFrozen;

  const pendingCount = withdrawals.filter(w => w.status === 'pending_settlement' || w.status === 'processing').length;

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 6, paddingHorizontal: flow.padH }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Withdraw Earnings</Text>
          <Text style={s.headerSub}>Bank · {bank.bank_name || 'No bank added'}</Text>
        </View>
        <TouchableOpacity style={s.backBtn} onPress={() => router.push('/driver/bank')}>
          <Ionicons name="settings-outline" size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22C55E" />}
        contentContainerStyle={[
          s.content,
          {
            paddingHorizontal: flow.padH,
            paddingBottom: insets.bottom + 32,
            gap: Math.round(flow.sectionGap * 0.35),
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
      >

        {/* ── WALLET BALANCE HERO ────────────────────────────────────────── */}
        <LinearGradient
          colors={earningsFrozen ? ['#1f2937', '#111827'] : ['#052e16', '#064e3b', '#0D1420']}
          style={s.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={s.heroTop}>
            <View style={s.heroLabelRow}>
              <Ionicons name="wallet" size={14} color={earningsFrozen ? '#475569' : '#86efac'} />
              <Text style={[s.heroLabel, earningsFrozen && { color: '#475569' }]}>
                {earningsFrozen ? 'EARNINGS FROZEN' : 'AVAILABLE TO WITHDRAW'}
              </Text>
            </View>
            {pendingCount > 0 && (
              <View style={s.pendingChip}>
                <ProcessingSpinner color="#F59E0B" />
                <Text style={s.pendingChipText}>{pendingCount} pending</Text>
              </View>
            )}
          </View>

          <Text style={[s.heroAmount, earningsFrozen && { color: '#475569' }]}>
            {loading ? '—' : `₦${Math.floor(walletBalance).toLocaleString()}`}
            <Text style={s.heroAmountDecimal}>
              {loading ? '' : `.${String(Math.round((walletBalance % 1) * 100)).padStart(2, '0')}`}
            </Text>
          </Text>

          {earningsFrozen ? (
            <View style={s.frozenBanner}>
              <Ionicons name="lock-closed" size={14} color="#EF4444" />
              <Text style={s.frozenText}>Earnings frozen — contact support to resolve</Text>
            </View>
          ) : !bankReady ? (
            <TouchableOpacity style={s.bankNeededBtn} onPress={() => router.push('/driver/bank')}>
              <Ionicons name="alert-circle" size={14} color="#F59E0B" />
              <Text style={s.bankNeededText}>Add bank details to withdraw</Text>
              <Ionicons name="chevron-forward" size={14} color="#F59E0B" />
            </TouchableOpacity>
          ) : (
            <View style={s.bankRow}>
              <Ionicons name="checkmark-circle" size={14} color="#86efac" />
              <Text style={s.bankRowText}>
                {bank.bank_name} · ****{bank.account_number.slice(-4)} · {bank.account_name}
              </Text>
            </View>
          )}

          {/* Withdraw button */}
          <TouchableOpacity
            style={[s.withdrawBtn, (earningsFrozen || walletBalance < 500 || !bankReady) && s.withdrawBtnDisabled]}
            onPress={openModal}
            disabled={earningsFrozen || walletBalance < 500 || !bankReady}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-up-circle" size={20} color={earningsFrozen || walletBalance < 500 || !bankReady ? '#475569' : '#022C22'} />
            <Text style={[s.withdrawBtnText, (earningsFrozen || walletBalance < 500 || !bankReady) && { color: '#475569' }]}>
              {walletBalance < 500 ? 'Min ₦500 required' : 'Withdraw Now'}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
        <View style={s.howCard}>
          <Text style={s.howTitle}>How withdrawals work</Text>
          <View style={s.howSteps}>
            {[
              { icon: 'wallet-outline', label: 'Wallet rides auto-credit your balance instantly' },
              { icon: 'arrow-up-circle-outline', label: 'Tap Withdraw, enter amount, scan your face' },
              { icon: 'time-outline', label: 'Nexryde reviews and processes your payout' },
              { icon: 'checkmark-circle-outline', label: 'Money arrives in your bank account' },
            ].map((step, i) => (
              <View key={i} style={s.howStep}>
                <View style={s.howDot}>
                  <Ionicons name={step.icon as any} size={16} color="#22C55E" />
                </View>
                <Text style={s.howText}>{step.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── WITHDRAWAL HISTORY ─────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Withdrawal History</Text>
            {withdrawals.length > 0 && (
              <Text style={s.sectionSub}>{withdrawals.length} request{withdrawals.length !== 1 ? 's' : ''}</Text>
            )}
          </View>

          {loading ? (
            <View style={s.emptyCard}>
              <ActivityIndicator color="#22C55E" />
              <Text style={s.emptyText}>Loading…</Text>
            </View>
          ) : withdrawals.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="receipt-outline" size={28} color="#334155" />
              <Text style={s.emptyText}>No withdrawals yet</Text>
              <Text style={s.emptySub}>Your withdrawal history will appear here</Text>
            </View>
          ) : (
            withdrawals.map(w => (
              <View key={w.id}>
                <WithdrawalCard
                  item={w}
                  onExpand={() => setExpandedId(expandedId === w.id ? null : w.id)}
                />
                {expandedId === w.id && (
                  <View style={s.expandedCard}>
                    {/* Reference */}
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Reference</Text>
                      <Text style={s.detailValue}>{w.reference || '—'}</Text>
                    </View>
                    {w.provider_reference && (
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Provider ref</Text>
                        <Text style={s.detailValue}>{w.provider_reference}</Text>
                      </View>
                    )}
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Account</Text>
                      <Text style={s.detailValue}>{w.account_name || '—'}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Bank</Text>
                      <Text style={s.detailValue}>{w.bank_name || '—'}</Text>
                    </View>
                    {w.settlement_reason && (
                      <View style={[s.detailRow, { marginTop: 4 }]}>
                        <Text style={s.detailLabel}>Note</Text>
                        <Text style={[s.detailValue, { color: '#94a3b8' }]}>{w.settlement_reason}</Text>
                      </View>
                    )}
                    {/* Timeline */}
                    <View style={s.timelineWrap}>
                      <WithdrawalTimeline status={w.status} />
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

      </ScrollView>

      {/* ── WITHDRAWAL MODAL ──────────────────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="none" onRequestClose={closeModal}>
        <View style={m.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ justifyContent: 'flex-end', flex: 1 }}
          >
            <Animated.View
              style={[m.sheet, {
                transform: [{
                  translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }),
                }],
              }]}
            >
              {/* Handle */}
              <View style={m.handle} />

              {step === 'amount' && (
                <>
                  <Text style={m.title}>Withdraw Earnings</Text>
                  <Text style={m.sub}>
                    Available: <Text style={m.subGreen}>₦{Math.floor(walletBalance).toLocaleString()}</Text>
                  </Text>

                  {/* Bank info */}
                  <View style={m.bankInfoRow}>
                    <Ionicons name="business-outline" size={16} color="#64748b" />
                    <Text style={m.bankInfoText}>{bank.bank_name} · ****{bank.account_number.slice(-4)} · {bank.account_name}</Text>
                  </View>

                  {/* Amount input */}
                  <Text style={m.label}>Amount to withdraw</Text>
                  <View style={m.inputWrap}>
                    <Text style={m.currencySymbol}>₦</Text>
                    <TextInput
                      style={m.input}
                      placeholder="0"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="numeric"
                      placeholderTextColor="#334155"
                      autoFocus
                    />
                  </View>
                  {parsedAmount > 0 && parsedAmount > walletBalance && (
                    <Text style={m.errorHint}>Exceeds available balance</Text>
                  )}
                  {parsedAmount > 0 && parsedAmount < 500 && parsedAmount <= walletBalance && (
                    <Text style={m.errorHint}>Minimum withdrawal is ₦500</Text>
                  )}

                  {/* Presets */}
                  <AmountPresets balance={walletBalance} onSelect={setAmount} />

                  {/* Fee note */}
                  <View style={m.feeNote}>
                    <Ionicons name="information-circle-outline" size={14} color="#475569" />
                    <Text style={m.feeText}>No withdrawal fees — you keep 100% of your earnings.</Text>
                  </View>

                  {/* Actions */}
                  <View style={m.btnRow}>
                    <TouchableOpacity style={m.cancelBtn} onPress={closeModal}>
                      <Text style={m.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[m.primaryBtn, !canSubmit && m.primaryBtnDisabled]}
                      onPress={handleWithdraw}
                      disabled={!canSubmit}
                    >
                      <Text style={m.primaryText}>Continue</Text>
                      <Ionicons name="arrow-forward" size={16} color="#022C22" />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {step === 'confirm' && (
                <>
                  <Text style={m.title}>Confirm Withdrawal</Text>
                  <Text style={m.sub}>Scan your face to verify your identity</Text>

                  {/* Summary */}
                  <View style={m.summaryCard}>
                    <View style={m.summaryRow}>
                      <Text style={m.summaryLabel}>Amount</Text>
                      <Text style={m.summaryValue}>₦{parsedAmount.toLocaleString()}</Text>
                    </View>
                    <View style={m.summaryDivider} />
                    <View style={m.summaryRow}>
                      <Text style={m.summaryLabel}>Bank</Text>
                      <Text style={m.summaryValue}>{bank.bank_name}</Text>
                    </View>
                    <View style={m.summaryRow}>
                      <Text style={m.summaryLabel}>Account</Text>
                      <Text style={m.summaryValue}>{bank.account_name}</Text>
                    </View>
                    <View style={m.summaryRow}>
                      <Text style={m.summaryLabel}>Number</Text>
                      <Text style={m.summaryValue}>****{bank.account_number.slice(-4)}</Text>
                    </View>
                    <View style={m.summaryDivider} />
                    <View style={m.summaryRow}>
                      <Text style={m.summaryLabel}>Fee</Text>
                      <Text style={[m.summaryValue, { color: '#22C55E' }]}>₦0 (free)</Text>
                    </View>
                    <View style={m.summaryRow}>
                      <Text style={[m.summaryLabel, { fontWeight: '800', color: '#f8fafc' }]}>You receive</Text>
                      <Text style={[m.summaryValue, { fontSize: 18, color: '#22C55E' }]}>₦{parsedAmount.toLocaleString()}</Text>
                    </View>
                  </View>

                  <View style={m.faceNote}>
                    <Ionicons name="scan-circle" size={18} color="#22C55E" />
                    <Text style={m.faceNoteText}>Your face will be matched to your registered driver identity for security.</Text>
                  </View>

                  <View style={m.btnRow}>
                    <TouchableOpacity style={m.cancelBtn} onPress={() => setStep('amount')}>
                      <Ionicons name="arrow-back" size={16} color="#64748b" />
                      <Text style={m.cancelText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[m.primaryBtn, submitting && { opacity: 0.65 }]}
                      onPress={() => void handleFaceScan()}
                      disabled={submitting}
                    >
                      {submitting
                        ? <ActivityIndicator color="#022C22" />
                        : <>
                            <Ionicons name="camera" size={18} color="#022C22" />
                            <Text style={m.primaryText}>Scan Face & Submit</Text>
                          </>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {step === 'success' && lastResult && (
                <>
                  <View style={m.successIcon}>
                    <LinearGradient colors={['#052e16', '#064e3b']} style={m.successGrad}>
                      <Ionicons name="checkmark-circle" size={44} color="#22C55E" />
                    </LinearGradient>
                  </View>
                  <Text style={m.successTitle}>Withdrawal Submitted!</Text>
                  <Text style={m.successAmount}>₦{Math.round(lastResult.amount).toLocaleString()}</Text>
                  <Text style={m.successSub}>
                    Your request is under review. We'll process it to {bank.bank_name} shortly.
                  </Text>

                  <View style={m.successSteps}>
                    {[
                      { icon: 'checkmark-circle', color: '#22C55E', label: 'Submitted successfully' },
                      { icon: 'time-outline', color: '#F59E0B', label: 'Under review by Nexryde' },
                      { icon: 'card-outline', color: '#3B82F6', label: 'Transfer to your bank' },
                    ].map((s, i) => (
                      <View key={i} style={m.successStep}>
                        <Ionicons name={s.icon as any} size={16} color={s.color} />
                        <Text style={m.successStepText}>{s.label}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity style={[m.primaryBtn, { alignSelf: 'stretch', marginTop: 8 }]} onPress={closeModal}>
                    <Text style={m.primaryText}>Done</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={{ height: Math.max(insets.bottom, 16) }} />
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1420' },
  content: { gap: 0 },

  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, backgroundColor: '#0D1420', gap: 8, borderBottomWidth: 1, borderBottomColor: '#111827' },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  headerSub: { fontSize: 11, color: '#64748b', marginTop: 1 },

  // Hero
  hero: { marginHorizontal: 0, marginTop: 8, marginBottom: 12, borderRadius: 22, padding: 22, gap: 8, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroLabel: { fontSize: 11, fontWeight: '800', color: '#86efac', letterSpacing: 1, textTransform: 'uppercase' },
  heroAmount: { fontSize: 46, fontWeight: '900', color: '#22C55E', lineHeight: 50, letterSpacing: -1 },
  heroAmountDecimal: { fontSize: 28, fontWeight: '700', color: '#22C55E' },
  pendingChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,158,11,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  pendingChipText: { fontSize: 11, fontWeight: '800', color: '#F59E0B' },
  frozenBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  frozenText: { fontSize: 12, fontWeight: '700', color: '#EF4444', flex: 1 },
  bankNeededBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' },
  bankNeededText: { fontSize: 12, fontWeight: '700', color: '#F59E0B', flex: 1 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bankRowText: { fontSize: 12, color: '#86efac', fontWeight: '600', flex: 1 },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 16, marginTop: 6,
  },
  withdrawBtnDisabled: { backgroundColor: '#1e293b' },
  withdrawBtnText: { fontSize: 16, fontWeight: '900', color: '#022C22' },

  // How it works
  howCard: { marginHorizontal: 0, marginBottom: 12, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e293b' },
  howTitle: { fontSize: 13, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  howSteps: { gap: 10 },
  howStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howDot: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.1)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  howText: { fontSize: 13, color: '#94a3b8', flex: 1, lineHeight: 18 },

  // History
  section: { marginHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  sectionSub: { fontSize: 12, color: '#64748b' },
  emptyCard: { backgroundColor: '#111827', borderRadius: 14, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#1e293b' },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  emptySub:  { fontSize: 12, color: '#334155', textAlign: 'center' },

  // Expanded detail
  expandedCard: { backgroundColor: '#0b111e', borderRadius: 12, padding: 14, marginBottom: 10, marginTop: -4, borderWidth: 1, borderColor: '#1e293b' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  detailLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#cbd5e1', fontWeight: '700', maxWidth: '65%', textAlign: 'right' },
  timelineWrap: { borderTopWidth: 1, borderTopColor: '#1e293b', marginTop: 10, paddingTop: 12 },
});

// ── Modal styles ──────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 12, borderWidth: 1, borderColor: '#1e293b' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: '#f8fafc', marginBottom: 4 },
  sub: { fontSize: 14, color: '#64748b', marginBottom: 12 },
  subGreen: { color: '#22C55E', fontWeight: '800' },
  bankInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e293b', borderRadius: 10, padding: 10, marginBottom: 16 },
  bankInfoText: { fontSize: 12, color: '#94a3b8', fontWeight: '600', flex: 1 },
  label: { fontSize: 13, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1420', borderRadius: 14, borderWidth: 2, borderColor: '#22C55E', paddingHorizontal: 16, paddingVertical: 4, marginBottom: 6 },
  currencySymbol: { fontSize: 26, fontWeight: '900', color: '#22C55E', marginRight: 4 },
  input: { flex: 1, fontSize: 36, fontWeight: '900', color: '#f8fafc', paddingVertical: 10 },
  errorHint: { fontSize: 12, color: '#EF4444', fontWeight: '700', marginBottom: 8 },
  feeNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 16 },
  feeText: { fontSize: 12, color: '#475569', flex: 1 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 0.45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#1e293b', borderRadius: 14, paddingVertical: 15 },
  cancelText: { fontSize: 15, fontWeight: '800', color: '#64748b' },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 15 },
  primaryBtnDisabled: { backgroundColor: '#1e293b', opacity: 0.6 },
  primaryText: { fontSize: 15, fontWeight: '900', color: '#022C22' },

  // Confirm step
  summaryCard: { backgroundColor: '#0D1420', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1e293b', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  summaryLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  summaryValue: { fontSize: 14, color: '#f8fafc', fontWeight: '800' },
  summaryDivider: { height: 1, backgroundColor: '#1e293b', marginVertical: 4 },
  faceNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)', marginBottom: 14 },
  faceNoteText: { fontSize: 12, color: '#86efac', flex: 1, lineHeight: 18 },

  // Success step
  successIcon: { alignItems: 'center', marginBottom: 12 },
  successGrad: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#f8fafc', textAlign: 'center', marginBottom: 4 },
  successAmount: { fontSize: 40, fontWeight: '900', color: '#22C55E', textAlign: 'center', marginBottom: 6 },
  successSub: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  successSteps: { backgroundColor: '#0D1420', borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: '#1e293b', marginBottom: 12 },
  successStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  successStepText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
});
