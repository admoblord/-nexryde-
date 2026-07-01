import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  AppState,
  Animated,
  Easing,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { buildInviteUrl, buildShareMessage } from '@/src/services/referralService';
import { useAppStore } from '@/src/store/appStore';
import {
  BACKEND_URL,
  getWalletMe,
  initiateRiderWalletCheckout,
  verifyPendingRiderWallet,
  getPendingWalletCheckout,
  cancelPendingWalletCheckout,
  messageFromAxiosError,
  formatApiDetail,
  isWalletCheckoutInitOk,
  WALLET_CHECKOUT_USER_ERROR,
  getAuthHeaders,
} from '@/src/services/api';
import {
  saveWalletCheckoutSession,
  loadWalletCheckoutSession,
  clearWalletCheckoutSession,
  parsePendingCheckoutConflict,
} from '@/src/services/walletCheckoutSession';
import { openSquadCheckoutUrl } from '@/src/services/squadCheckoutOpen';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: '#F0F4F8',
  card: '#0F172A',
  cardAlt: '#1E293B',
  green: '#22C55E',
  greenLight: '#4ADE80',
  greenDark: '#15803D',
  amber: '#F59E0B',
  amberLight: '#FDE68A',
  blue: '#3B82F6',
  red: '#EF4444',
  white: '#FFFFFF',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray400: '#94A3B8',
  gray600: '#475569',
  gray900: '#0F172A',
  border: '#E2E8F0',
  shadow: 'rgba(15,23,42,0.12)',
};

const PRESETS = [500, 1_000, 2_000, 5_000, 10_000, 20_000];

type TopupState =
  | { phase: 'idle' }
  | { phase: 'initiating'; amountNgn: number }
  | { phase: 'checkout'; reference: string; checkoutUrl: string; amountNgn: number }
  | { phase: 'verifying'; reference: string; startedAt: number }
  | { phase: 'success'; reference: string; amountNgn: number; balanceNgn: number }
  | { phase: 'failed'; reference?: string; reason: string }
  | { phase: 'cancelled'; reference?: string };

// ── Component ─────────────────────────────────────────────────────────────────
export default function RiderWalletScreen() {
  const toast = useErrorToast();
  const { user } = useAppStore();
  const { userId: uid, canCallAuthedApi } = useAuthedUserId();
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();

  const [balance, setBalance] = useState(0);
  const [promoCreditBalance, setPromoCreditBalance] = useState(0);
  const [firstRideRewardGranted, setFirstRideRewardGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amountStr, setAmountStr] = useState('2000');
  const [promoCode, setPromoCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralUsername, setReferralUsername] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [referralStats, setReferralStats] = useState<{ invited: number; rewarded: number; earned: number } | null>(null);
  const [showManualCode, setShowManualCode] = useState(false);
  const [busy, setBusy] = useState<'checkout' | 'verify' | null>(null);
  const [topupState, setTopupState] = useState<TopupState>({ phase: 'idle' });
  const [txs, setTxs] = useState<Record<string, unknown>[]>([]);
  const [pendingMeta, setPendingMeta] = useState<{ ref: string; url: string; amount: number } | null>(null);
  const [checkoutFailed, setCheckoutFailed] = useState(false);

  // Animations
  const balanceFade = useRef(new Animated.Value(0)).current;
  const balanceScale = useRef(new Animated.Value(0.92)).current;
  const successPulse = useRef(new Animated.Value(1)).current;
  const verifyShake = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  // ── Spin animation for verify loading ───────────────────────────────────────
  useEffect(() => {
    if (busy === 'verify') {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1000, useNativeDriver: true, easing: Easing.linear })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [busy]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ── Balance entry animation ──────────────────────────────────────────────────
  const animateBalanceIn = () => {
    Animated.parallel([
      Animated.timing(balanceFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(balanceScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();
  };

  // ── Success pulse ────────────────────────────────────────────────────────────
  const pulseSuccess = () => {
    Animated.sequence([
      Animated.timing(successPulse, { toValue: 1.06, duration: 200, useNativeDriver: true }),
      Animated.timing(successPulse, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(successPulse, { toValue: 1.06, duration: 200, useNativeDriver: true }),
      Animated.timing(successPulse, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  // ── Data load ────────────────────────────────────────────────────────────────
  const load = useCallback(async (): Promise<number | null> => {
    if (!uid || !canCallAuthedApi) { setLoading(false); return null; }
    try {
      const w = await getWalletMe(15);
      const bal = Number(w.data?.balance ?? 0);
      setBalance(bal);
      setTxs(Array.isArray(w.data?.transactions) ? (w.data.transactions as Record<string, unknown>[]) : []);
      balanceFade.setValue(0);
      balanceScale.setValue(0.92);
      animateBalanceIn();
      return bal;
    } catch {
      setBalance(0);
      setTxs([]);
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, canCallAuthedApi]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!uid || !canCallAuthedApi) { setReferralCode(''); setReferralUsername(''); setInviteUrl(''); setReferralStats(null); return; }
    let cancelled = false;
    const loadIncentives = async () => {
      try {
        const hdr = await getAuthHeaders();
        const [refRes, creditRes, firstRideRes, statsRes] = await Promise.allSettled([
          fetch(`${BACKEND_URL}/api/incentives/referral-code`, { headers: hdr }),
          fetch(`${BACKEND_URL}/api/incentives/my-credits`, { headers: hdr }),
          fetch(`${BACKEND_URL}/api/incentives/first-ride-status`, { headers: hdr }),
          fetch(`${BACKEND_URL}/api/incentives/referral-stats`, { headers: hdr }),
        ]);
        if (refRes.status === 'fulfilled' && refRes.value.ok) {
          const data = await refRes.value.json();
          if (!cancelled) {
            setReferralCode(data.referral_code ?? '');
            setReferralUsername(data.username ?? '');
            setInviteUrl(data.invite_url ?? '');
          }
        }
        if (creditRes.status === 'fulfilled' && creditRes.value.ok) {
          const data = await creditRes.value.json();
          if (!cancelled) setPromoCreditBalance(data.promo_credit_balance ?? 0);
        }
        if (firstRideRes.status === 'fulfilled' && firstRideRes.value.ok) {
          const data = await firstRideRes.value.json();
          if (!cancelled) setFirstRideRewardGranted(data.reward_granted ?? false);
        }
        if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
          const data = await statsRes.value.json();
          if (!cancelled) setReferralStats({
            invited: data.invited_count ?? 0,
            rewarded: data.rewarded_count ?? 0,
            earned: data.total_earned_ngn ?? 0,
          });
        }
      } catch { if (!cancelled) setReferralCode(''); }
    };
    void loadIncentives();
    return () => { cancelled = true; };
  }, [uid, canCallAuthedApi]);

  const syncPendingCheckout = useCallback(async () => {
    if (!uid || !canCallAuthedApi) { setPendingMeta(null); return; }
    try {
      const res = await getPendingWalletCheckout();
      const d = res.data;
      if (!d?.pending || !d.checkout_url || !d.transaction_ref) {
        await clearWalletCheckoutSession(uid);
        setPendingMeta(null);
        return;
      }
      const meta = { ref: String(d.transaction_ref), url: String(d.checkout_url), amount: Number(d.amount_ngn ?? 0) };
      await saveWalletCheckoutSession({ userId: uid, transaction_ref: meta.ref, checkout_url: meta.url, amount_ngn: meta.amount, savedAt: new Date().toISOString() });
      setPendingMeta(meta);
    } catch {
      const local = await loadWalletCheckoutSession(uid);
      if (local) setPendingMeta({ ref: local.transaction_ref, url: local.checkout_url, amount: local.amount_ngn });
    }
  }, [uid, canCallAuthedApi]);

  useEffect(() => {
    if (uid && canCallAuthedApi) void syncPendingCheckout();
  }, [uid, canCallAuthedApi, syncPendingCheckout]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { void syncPendingCheckout(); void load(); }
    });
    return () => sub.remove();
  }, [syncPendingCheckout, load]);

  const onRefresh = () => { setRefreshing(true); load(); };
  const parsedAmount = (): number => { const n = parseFloat(String(amountStr).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

  // ── Checkout helpers ─────────────────────────────────────────────────────────
  const persistAndOpenCheckout = async (data: { checkout_url?: string; transaction_ref?: string; transactionRef?: string; amount_ngn?: number }) => {
    const url = data.checkout_url;
    const ref = data.transaction_ref ?? data.transactionRef;
    if (!uid || !url || typeof url !== 'string' || !ref) return false;
    const amountNgn = Number(data.amount_ngn ?? parsedAmount());
    await saveWalletCheckoutSession({ userId: uid, transaction_ref: String(ref), checkout_url: url, amount_ngn: amountNgn, savedAt: new Date().toISOString() });
    setPendingMeta({ ref: String(ref), url, amount: amountNgn });
    const ok = await openSquadCheckoutUrl(url);
    if (!ok) { toast.show('Could not open the payment page. Try again.', 'error'); return false; }
    return true;
  };

  const startCardCheckoutReplace = async (amount: number) => {
    setBusy('checkout');
    setCheckoutFailed(false);
    try {
      const res = await initiateRiderWalletCheckout(amount, true);
      const data = res.data || {};
      if (isWalletCheckoutInitOk(data)) { setCheckoutFailed(false); await persistAndOpenCheckout(data); }
      else { setCheckoutFailed(true); toast.show(WALLET_CHECKOUT_USER_ERROR, 'error'); }
    } catch (e: unknown) {
      setCheckoutFailed(true);
      toast.show(messageFromAxiosError(e, WALLET_CHECKOUT_USER_ERROR), 'error');
    } finally { setBusy(null); }
  };

  const startCardCheckout = async () => {
    const amount = parsedAmount();
    if (amount < 100) { toast.show('Minimum top-up is ₦100', 'warning'); return; }
    setBusy('checkout');
    setCheckoutFailed(false);
    try {
      const res = await initiateRiderWalletCheckout(amount, false);
      const data = res.data || {};
      if (isWalletCheckoutInitOk(data)) { setCheckoutFailed(false); await persistAndOpenCheckout(data); }
      else {
        setCheckoutFailed(true);
        toast.show(WALLET_CHECKOUT_USER_ERROR, 'error');
      }
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        const conflict = parsePendingCheckoutConflict(e.response.data?.detail);
        if (conflict?.checkout_url) {
          const amt = Number(conflict.pending_amount_ngn ?? 0);
          Alert.alert(
            'Pending top-up',
            `You have a pending ₦${amt.toLocaleString()} payment. Resume it or cancel to use ₦${amount.toLocaleString()}.`,
            [
              { text: 'Resume', onPress: () => void persistAndOpenCheckout({ checkout_url: conflict.checkout_url, transaction_ref: conflict.transaction_ref, amount_ngn: amt }) },
              { text: 'Use new amount', style: 'destructive', onPress: () => void startCardCheckoutReplace(amount) },
              { text: 'Cancel', style: 'cancel' },
            ],
          );
        } else {
          setCheckoutFailed(true);
          toast.show(messageFromAxiosError(e, WALLET_CHECKOUT_USER_ERROR), 'error');
        }
      } else {
        setCheckoutFailed(true);
        toast.show(messageFromAxiosError(e, WALLET_CHECKOUT_USER_ERROR), 'error');
      }
    } finally { setBusy(null); }
  };

  const handleCancelPendingSession = () => {
    Alert.alert('Cancel pending top-up?', 'This does not undo money already sent from your bank.', [
      { text: 'Keep session', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: () => void (async () => {
          try {
            await cancelPendingWalletCheckout();
            if (uid) await clearWalletCheckoutSession(uid);
            setPendingMeta(null);
          } catch { Alert.alert('Cancel', 'Could not cancel. Try again.'); }
        })(),
      },
    ]);
  };

  // ── Verify payment ───────────────────────────────────────────────────────────
  const verifyPending = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setBusy('verify');
    try {
      const ref = pendingMeta?.ref || (uid ? (await loadWalletCheckoutSession(uid))?.transaction_ref : undefined);
      if (!ref) {
        if (!silent) Alert.alert('No payment found', 'Start a new top-up or pull down to refresh.');
        return;
      }
      if (!silent) setTopupState({ phase: 'verifying', reference: ref, startedAt: Date.now() });

      let terminal: Record<string, unknown> | null = null;
      for (let i = 0; i < 24; i += 1) {
        try {
          const res = await verifyPendingRiderWallet(ref);
          const data = res.data as Record<string, unknown>;
          if (data.verified && (data.credited || data.duplicate)) { terminal = data; break; }
          if (data.terminal || data.detail === 'amount_mismatch' || String(data.status || '').toLowerCase() === 'cancelled') { terminal = data; break; }
        } catch { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 3000));
      }

      const data = terminal;
      if (data?.verified && (data.credited || data.duplicate)) {
        const amountForDisplay = pendingMeta?.amount ?? parsedAmount();
        if (uid) await clearWalletCheckoutSession(uid);
        setPendingMeta(null);
        const balAfter = await load();
        setTopupState({ phase: 'success', reference: ref, amountNgn: amountForDisplay, balanceNgn: typeof balAfter === 'number' ? balAfter : 0 });
        pulseSuccess();
        if (!silent) Alert.alert('Wallet Funded', `₦${amountForDisplay.toLocaleString()} has been added to your Nexryde wallet.`);
      } else {
        const isCancelled = String(data?.status || '').toLowerCase() === 'cancelled';
        const isMismatch = data?.detail === 'amount_mismatch';
        const reason = isMismatch
          ? 'Amount mismatch. If money left your bank, contact support with your receipt.'
          : isCancelled ? 'Payment was cancelled.'
          : 'Payment not confirmed yet. Tap Verify again in a few seconds.';
        if (isCancelled) setTopupState({ phase: 'cancelled', reference: ref });
        else setTopupState({ phase: 'idle' });
        if (!silent) {
          Alert.alert(
            isCancelled ? 'Payment Cancelled' : isMismatch ? 'Amount Mismatch' : 'Not Confirmed Yet',
            reason,
            [{ text: 'OK' }, ...(!isCancelled && !isMismatch ? [{ text: 'Try Again', onPress: () => void verifyPending() }] : [])],
          );
        }
      }
    } catch (e: unknown) {
      if (!silent) {
        const msg = axios.isAxiosError(e) ? formatApiDetail(e.response?.data?.detail) || messageFromAxiosError(e, '') : '';
        const isNotFound = axios.isAxiosError(e) && e.response?.status === 404;
        Alert.alert(
          isNotFound ? 'Payment Pending' : 'Verify',
          isNotFound ? 'Squad is still processing. Tap Verify again in a few seconds.' : msg || 'Connection error. Try again.',
          [{ text: 'OK' }, { text: 'Try Again', onPress: () => void verifyPending() }],
        );
      }
    } finally { if (!silent) setBusy(null); }
  }, [uid, pendingMeta, load]);

  const applyPromoCode = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) { Alert.alert('Referral code', 'Enter a referral code first.'); return; }
    try {
      const hdr = await getAuthHeaders();
      const res = await fetch(`${BACKEND_URL}/api/incentives/apply-referral-code`, {
        method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_code: code }),
      });
      const data = await res.json();
      if (res.ok) { Alert.alert('Code applied! 🎉', data.message || 'Complete your first ride to earn ₦500.'); setPromoCode(''); }
      else Alert.alert('Could not apply code', data.detail || 'Invalid or already-used code.');
    } catch { Alert.alert('Error', 'Could not apply code. Try again.'); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isSuccess = topupState.phase === 'success';
  const hasPromo = promoCreditBalance > 0;
  const formattedBalance = loading ? '—' : `₦${balance.toLocaleString()}`;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={[
          s.scroll,
          {
            paddingHorizontal: flow.padH,
            paddingBottom: tabPad,
            gap: Math.round(flow.sectionGap * 0.25),
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HERO BALANCE CARD ──────────────────────────────────────────── */}
        <LinearGradient colors={['#0F172A', '#1E3A5F', '#0F172A']} style={[s.heroCard, { paddingHorizontal: flow.cardPad }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {/* Glow orb */}
          <View style={s.heroGlow} />

          <View style={s.heroTop}>
            <View>
              <Text style={s.heroLabel}>NEXRYDE WALLET</Text>
              <Text style={s.heroName}>{user?.name?.split(' ')[0] || 'Rider'}</Text>
            </View>
            <View style={s.heroBadge}>
              <Ionicons name="wallet" size={18} color={C.green} />
              <Text style={s.heroBadgeText}>Active</Text>
            </View>
          </View>

          <Animated.View style={{ opacity: balanceFade, transform: [{ scale: balanceScale }] }}>
            <Text style={s.heroBalanceLabel}>Available Balance</Text>
            <Text style={s.heroBalance}>{formattedBalance}</Text>
          </Animated.View>

          {hasPromo && (
            <View style={s.promoStrip}>
              <Ionicons name="gift" size={14} color={C.amber} />
              <Text style={s.promoStripText}>+₦{promoCreditBalance.toLocaleString()} promo credit available</Text>
            </View>
          )}

          <View style={s.heroFooter}>
            <View style={s.heroFooterItem}>
              <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={s.heroFooterText}>Secured by Squad</Text>
            </View>
            <View style={s.heroFooterItem}>
              <Ionicons name="refresh-circle-outline" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={s.heroFooterText}>Pull to refresh</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── SUCCESS BANNER ─────────────────────────────────────────────── */}
        {isSuccess && (
          <Animated.View style={[s.successBanner, { transform: [{ scale: successPulse }] }]}>
            <LinearGradient colors={['#DCFCE7', '#F0FDF4']} style={s.successBannerGrad}>
              <View style={s.successIconWrap}>
                <Ionicons name="checkmark-circle" size={28} color={C.greenDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.successTitle}>Wallet Funded!</Text>
                <Text style={s.successSub}>
                  +₦{(topupState as any).amountNgn?.toLocaleString()} · Balance: ₦{(topupState as any).balanceNgn?.toLocaleString()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTopupState({ phase: 'idle' })}>
                <Ionicons name="close-circle" size={22} color={C.greenDark} />
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        )}

        {/* ── PENDING PAYMENT BANNER ─────────────────────────────────────── */}
        {pendingMeta && (
          <View style={s.pendingCard}>
            <LinearGradient colors={['#451A03', '#78350F']} style={s.pendingGrad}>
              <View style={s.pendingHeader}>
                <View style={s.pendingIconWrap}>
                  <Ionicons name="time" size={20} color={C.amber} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pendingTitle}>Payment In Progress</Text>
                  <Text style={s.pendingSub}>₦{pendingMeta.amount.toLocaleString()} — Squad session active</Text>
                </View>
                <TouchableOpacity onPress={handleCancelPendingSession}>
                  <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
              <View style={s.pendingActions}>
                <TouchableOpacity
                  style={s.pendingResume}
                  onPress={() => void openSquadCheckoutUrl(pendingMeta.url)}
                  disabled={busy !== null}
                >
                  <Ionicons name="open-outline" size={16} color={C.amber} />
                  <Text style={s.pendingResumeText}>Resume Payment</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.pendingVerify}
                  onPress={() => void verifyPending()}
                  disabled={busy !== null}
                >
                  {busy === 'verify' ? (
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <Ionicons name="refresh" size={16} color={C.white} />
                    </Animated.View>
                  ) : (
                    <Ionicons name="checkmark-done" size={16} color={C.white} />
                  )}
                  <Text style={s.pendingVerifyText}>{busy === 'verify' ? 'Checking…' : 'Verify Now'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}

        {/* ── TOP UP SECTION ─────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIconWrap}>
              <Ionicons name="add-circle" size={20} color={C.green} />
            </View>
            <Text style={s.sectionTitle}>Top Up Wallet</Text>
          </View>

          {/* Amount presets */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetsRow}>
            {PRESETS.map((p) => {
              const selected = amountStr === String(p);
              return (
                <TouchableOpacity key={p} style={[s.preset, selected && s.presetOn]} onPress={() => setAmountStr(String(p))}>
                  <Text style={[s.presetText, selected && s.presetTextOn]}>
                    {p >= 1000 ? `₦${p / 1000}k` : `₦${p}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Custom amount */}
          <View style={s.amountWrap}>
            <Text style={s.amountPrefix}>₦</Text>
            <TextInput
              style={s.amountInput}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor={C.gray400}
              value={amountStr}
              onChangeText={setAmountStr}
              returnKeyType="done"
            />
          </View>

          {/* Pay button */}
          <TouchableOpacity
            style={[s.payBtn, busy === 'checkout' && { opacity: 0.75 }]}
            onPress={startCardCheckout}
            disabled={busy !== null}
            activeOpacity={0.88}
          >
            <LinearGradient colors={busy === 'checkout' ? ['#475569', '#334155'] : [C.green, '#16A34A']} style={s.payBtnGrad}>
              {busy === 'checkout' ? (
                <View style={s.payBtnInner}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={s.payBtnText}>Opening Squad…</Text>
                </View>
              ) : (
                <View style={s.payBtnInner}>
                  <Ionicons name="card" size={22} color="#FFF" />
                  <Text style={s.payBtnText}>
                    Pay ₦{parsedAmount() > 0 ? parsedAmount().toLocaleString() : '—'} via Squad
                  </Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
          {checkoutFailed && (
            <TouchableOpacity style={s.retryBtn} onPress={() => { setCheckoutFailed(false); void startCardCheckout(); }} disabled={busy !== null}>
              <Ionicons name="refresh" size={16} color={C.blue} />
              <Text style={s.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>already paid?</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[s.verifyBtn, busy === 'verify' && { opacity: 0.75 }]}
            onPress={() => void verifyPending()}
            disabled={busy !== null}
            activeOpacity={0.88}
          >
            {busy === 'verify' ? (
              <View style={s.verifyBtnInner}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <Ionicons name="refresh" size={18} color={C.white} />
                </Animated.View>
                <Text style={s.verifyBtnText}>Checking with Squad…</Text>
              </View>
            ) : (
              <View style={s.verifyBtnInner}>
                <Ionicons name="checkmark-done-outline" size={18} color={C.white} />
                <Text style={s.verifyBtnText}>Verify Payment</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={s.verifyHint}>Tap after completing payment in Squad to instantly credit your wallet.</Text>
        </View>

        {/* ── REWARDS ────────────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="gift" size={20} color={C.amber} />
            </View>
            <Text style={s.sectionTitle}>Rewards & Bonuses</Text>
          </View>

          {/* First ride bonus */}
          <View style={[s.rewardCard, { borderLeftColor: firstRideRewardGranted ? C.green : C.amber }]}>
            <View style={[s.rewardIcon, { backgroundColor: firstRideRewardGranted ? '#DCFCE7' : '#FEF3C7' }]}>
              <Ionicons name={firstRideRewardGranted ? 'checkmark-circle' : 'flash'} size={22} color={firstRideRewardGranted ? C.greenDark : '#D97706'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rewardTitle}>{firstRideRewardGranted ? '🎉 First Ride Bonus Earned!' : 'First Ride Bonus'}</Text>
              <Text style={s.rewardText}>
                {firstRideRewardGranted ? '₦500 bonus has been added to your wallet.' : 'Complete your first ride and get ₦500 instantly.'}
              </Text>
            </View>
            {!firstRideRewardGranted && <View style={s.rewardBadge}><Text style={s.rewardBadgeText}>₦500</Text></View>}
          </View>

          {/* Promo balance */}
          {hasPromo && (
            <View style={[s.rewardCard, { borderLeftColor: C.green }]}>
              <View style={[s.rewardIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="wallet" size={22} color={C.greenDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rewardTitle}>Promo Credit</Text>
                <Text style={[s.rewardText, { color: C.greenDark, fontWeight: '800', fontSize: 18 }]}>₦{promoCreditBalance.toLocaleString()}</Text>
                <Text style={[s.rewardText, { fontSize: 11, marginTop: 2 }]}>Applied automatically — max ₦500 / 40% per fare</Text>
              </View>
            </View>
          )}

          {/* ── Referral Card ─────────────────────────────────────────── */}
          <LinearGradient
            colors={['#2E1065', '#4C1D95', '#2E1065']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.referralCard}
          >
            {/* Glow */}
            <View style={s.referralGlow} />

            {/* Header */}
            <View style={s.referralHeader}>
              <View style={s.referralIconBig}>
                <Ionicons name="people" size={24} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.referralCardTitle}>Invite Friends</Text>
                <Text style={s.referralCardSub}>You & your friend each earn ₦500 after their first ride</Text>
              </View>
              <View style={s.referralBadgePill}>
                <Text style={s.referralBadgeText}>₦500</Text>
              </View>
            </View>

            {/* Stats row */}
            {referralStats !== null && (
              <View style={s.referralStats}>
                <View style={s.referralStatItem}>
                  <Text style={s.referralStatNum}>{referralStats.invited}</Text>
                  <Text style={s.referralStatLabel}>Invited</Text>
                </View>
                <View style={s.referralStatDivider} />
                <View style={s.referralStatItem}>
                  <Text style={s.referralStatNum}>{referralStats.rewarded}</Text>
                  <Text style={s.referralStatLabel}>Rode & Earned</Text>
                </View>
                <View style={s.referralStatDivider} />
                <View style={s.referralStatItem}>
                  <Text style={[s.referralStatNum, { color: '#4ADE80' }]}>
                    {referralStats.earned > 0 ? `₦${referralStats.earned.toLocaleString()}` : '₦0'}
                  </Text>
                  <Text style={s.referralStatLabel}>You Earned</Text>
                </View>
              </View>
            )}

            {/* Invite Link */}
            {referralCode ? (
              <View style={s.referralLinkBox}>
                <View style={{ flex: 1 }}>
                  <Text style={s.referralLinkLabel}>YOUR INVITE LINK</Text>
                  <Text style={s.referralLinkText} numberOfLines={1}>
                    {referralUsername
                      ? `nexryde.app/invite/${referralUsername}`
                      : `nexryde.app/invite?code=${referralCode}`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.referralShareBtn}
                  onPress={() => {
                    const url = inviteUrl || buildInviteUrl(referralUsername, referralCode);
                    const msg = buildShareMessage(referralUsername, referralCode, user?.name ?? undefined);
                    const { Share } = require('react-native');
                    Share.share({ message: msg, url }, { dialogTitle: 'Invite to Nexryde' }).catch(() => {});
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="share-social" size={16} color="#FFF" />
                  <Text style={s.referralShareBtnText}>Share</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.referralLinkBox}>
                <Text style={[s.referralLinkLabel, { color: 'rgba(167,139,250,0.5)' }]}>Loading your invite link…</Text>
              </View>
            )}

            {/* Username + code row */}
            {referralCode ? (
              <View style={s.referralCodeOnly}>
                {referralUsername ? (
                  <>
                    <Text style={s.referralCodeOnlyLabel}>USERNAME</Text>
                    <Text style={s.referralCodeOnlyText}>{referralUsername}</Text>
                  </>
                ) : (
                  <>
                    <Text style={s.referralCodeOnlyLabel}>CODE</Text>
                    <Text style={s.referralCodeOnlyText}>{referralCode}</Text>
                  </>
                )}
              </View>
            ) : null}

            {/* Manual code entry — optional fallback */}
            <TouchableOpacity
              style={s.referralToggleManual}
              onPress={() => setShowManualCode((v) => !v)}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil-outline" size={13} color="rgba(167,139,250,0.6)" />
              <Text style={s.referralToggleManualText}>
                {showManualCode ? 'Hide manual entry' : "Have a friend's username or code?"}
              </Text>
              <Ionicons
                name={showManualCode ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="rgba(167,139,250,0.5)"
              />
            </TouchableOpacity>

            {showManualCode && (
              <View style={s.referralManualRow}>
                <TextInput
                  style={s.referralManualInput}
                  placeholder="username or code (e.g. funnybony)"
                  placeholderTextColor="rgba(167,139,250,0.4)"
                  value={promoCode}
                  onChangeText={setPromoCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={s.referralManualBtn} onPress={applyPromoCode}>
                  <Text style={s.referralManualBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── TRANSACTION HISTORY ────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="receipt" size={20} color={C.blue} />
            </View>
            <Text style={s.sectionTitle}>Recent Activity</Text>
          </View>

          {txs.length === 0 ? (
            <View style={s.emptyTx}>
              <Ionicons name="receipt-outline" size={36} color={C.gray400} />
              <Text style={s.emptyTxText}>No transactions yet</Text>
              <Text style={s.emptyTxSub}>Top up to get started</Text>
            </View>
          ) : (
            txs.map((row, i) => {
              const t = row as Record<string, unknown>;
              const amt = Number(t.amount || 0);
              const typ = String(t.type || '');
              const src = String(t.source || '');
              const isCreditTopUp = typ === 'topup' || (typ === 'credit' && (src === 'squad' || !src));
              const isRideDebit = typ === 'debit' || typ === 'ride_payment';
              const ts = t.timestamp ? String(t.timestamp) : '';
              const label = isCreditTopUp ? 'Top up' : isRideDebit ? 'Ride payment' : typ === 'credit' ? 'Credit' : typ || 'Transaction';
              const iconBg = isCreditTopUp ? '#DCFCE7' : '#FEE2E2';
              const iconColor = isCreditTopUp ? C.greenDark : C.red;
              return (
                <View key={String(t.id || i)} style={s.txRow}>
                  <View style={[s.txIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={isCreditTopUp ? 'arrow-down-circle' : 'car'} size={20} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.txLabel}>{label}</Text>
                    <Text style={s.txMeta} numberOfLines={1}>
                      {ts ? new Date(ts).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                      {t.reference ? ` · #${String(t.reference).slice(-6)}` : ''}
                    </Text>
                  </View>
                  <Text style={[s.txAmt, { color: isCreditTopUp ? C.greenDark : C.red }]}>
                    {isCreditTopUp ? '+' : '-'}₦{Math.abs(amt).toLocaleString()}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* ── COMING SOON ────────────────────────────────────────────────── */}
        <LinearGradient colors={['#ECFEFF', '#F0FEFF']} style={s.futureCard}>
          <View style={s.futureHeader}>
            <View style={[s.sectionIconWrap, { backgroundColor: '#CFFAFE' }]}>
              <Ionicons name="business-outline" size={20} color="#0891B2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.futureTitle}>Nexryde Banking</Text>
              <Text style={s.futureSub}>Earn interest, send money, pay bills — coming soon</Text>
            </View>
            <View style={s.futureBadge}><Text style={s.futureBadgeText}>SOON</Text></View>
          </View>
          <View style={s.futureChips}>
            {['Interest earnings', 'Send money', 'Buy airtime', 'Pay bills'].map((f) => (
              <View key={f} style={s.futureChip}>
                <Text style={s.futureChipText}>{f}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

      </ScrollView>

      {/* ── VERIFYING OVERLAY ──────────────────────────────────────────────── */}
      {topupState.phase === 'verifying' && (
        <View style={s.overlay}>
          <View style={s.overlayCard}>
            <LinearGradient colors={[C.green, '#16A34A']} style={s.overlayIconWrap}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Ionicons name="refresh" size={28} color="#FFF" />
              </Animated.View>
            </LinearGradient>
            <Text style={s.overlayTitle}>Confirming with Squad</Text>
            <Text style={s.overlaySub}>Please wait — do not close the app.</Text>
            <View style={s.overlayDots}>
              {[0, 1, 2].map((i) => <View key={i} style={s.overlayDot} />)}
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { gap: 0 },

  // Hero
  heroCard: { marginHorizontal: 0, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, position: 'relative', overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: C.green, opacity: 0.07 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  heroLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  heroName: { color: C.white, fontSize: 18, fontWeight: '900' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  heroBadgeText: { color: C.green, fontSize: 12, fontWeight: '800' },
  heroBalanceLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  heroBalance: { color: C.white, fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  promoStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 16, alignSelf: 'flex-start' },
  promoStripText: { color: C.amberLight, fontSize: 12, fontWeight: '700' },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  heroFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroFooterText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },

  // Success
  successBanner: { marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  successBannerGrad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  successIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(21,128,61,0.1)', alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 16, fontWeight: '900', color: '#14532D' },
  successSub: { fontSize: 13, fontWeight: '600', color: C.greenDark, marginTop: 2 },

  // Pending
  pendingCard: { marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  pendingGrad: { padding: 16 },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  pendingIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.2)', alignItems: 'center', justifyContent: 'center' },
  pendingTitle: { color: C.white, fontSize: 15, fontWeight: '900' },
  pendingSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  pendingActions: { flexDirection: 'row', gap: 10 },
  pendingResume: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.2)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', borderRadius: 12, paddingVertical: 12 },
  pendingResumeText: { color: C.amber, fontSize: 13, fontWeight: '800' },
  pendingVerify: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green, borderRadius: 12, paddingVertical: 12 },
  pendingVerifyText: { color: C.white, fontSize: 13, fontWeight: '800' },

  // Section
  section: { backgroundColor: C.white, marginTop: 16, borderRadius: 20, padding: 20, shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sectionIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.gray900 },

  // Presets
  presetsRow: { gap: 8, paddingBottom: 4, marginBottom: 12 },
  preset: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: C.gray100, borderWidth: 2, borderColor: C.border },
  presetOn: { backgroundColor: '#DCFCE7', borderColor: C.green },
  presetText: { fontSize: 14, fontWeight: '800', color: C.gray600 },
  presetTextOn: { color: C.greenDark },

  // Amount input
  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.gray50, borderWidth: 2, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, marginBottom: 16 },
  amountPrefix: { fontSize: 22, fontWeight: '900', color: C.gray900, marginRight: 4 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '900', color: C.gray900, paddingVertical: Platform.OS === 'ios' ? 14 : 10 },

  // Pay button
  payBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12, shadowColor: C.green, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  payBtnGrad: { paddingVertical: 18, paddingHorizontal: 24 },
  payBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  payBtnText: { color: C.white, fontSize: 17, fontWeight: '900' },

  // Retry
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: C.blue, marginBottom: 12 },
  retryBtnText: { color: C.blue, fontSize: 14, fontWeight: '800' },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: C.gray400, fontSize: 12, fontWeight: '700' },

  // Verify button
  verifyBtn: { backgroundColor: '#0F766E', borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  verifyBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  verifyBtnText: { color: C.white, fontSize: 15, fontWeight: '800' },
  verifyHint: { color: C.gray400, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Rewards
  rewardCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.gray50, borderRadius: 14, padding: 14, borderLeftWidth: 4, marginBottom: 12 },
  rewardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rewardTitle: { fontSize: 14, fontWeight: '800', color: C.gray900 },
  rewardText: { fontSize: 12, fontWeight: '600', color: C.gray600, marginTop: 2, lineHeight: 18 },
  rewardBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  rewardBadgeText: { fontSize: 13, fontWeight: '900', color: '#92400E' },
  // Referral card (replaces old referralRow/shareBtn/codeInput)
  referralCard: { marginTop: 12, borderRadius: 20, padding: 20, overflow: 'hidden', position: 'relative' },
  referralGlow: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: '#7C3AED', opacity: 0.18 },
  referralHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  referralIconBig: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(167,139,250,0.2)', alignItems: 'center', justifyContent: 'center' },
  referralCardTitle: { color: '#E9D5FF', fontSize: 17, fontWeight: '900' },
  referralCardSub: { color: 'rgba(233,213,255,0.6)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  referralBadgePill: { backgroundColor: 'rgba(74,222,128,0.2)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  referralBadgeText: { color: '#4ADE80', fontSize: 14, fontWeight: '900' },
  referralStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, padding: 16, marginBottom: 16 },
  referralStatItem: { flex: 1, alignItems: 'center' },
  referralStatNum: { color: '#E9D5FF', fontSize: 22, fontWeight: '900' },
  referralStatLabel: { color: 'rgba(233,213,255,0.5)', fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 0.5 },
  referralStatDivider: { width: 1, height: 36, backgroundColor: 'rgba(167,139,250,0.25)' },
  referralLinkBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 14, padding: 14, marginBottom: 10 },
  referralLinkLabel: { color: 'rgba(167,139,250,0.7)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  referralLinkText: { color: '#C4B5FD', fontSize: 13, fontWeight: '700' },
  referralShareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7C3AED', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
  referralShareBtnText: { color: C.white, fontSize: 13, fontWeight: '900' },
  referralCodeOnly: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  referralCodeOnlyLabel: { color: 'rgba(167,139,250,0.5)', fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  referralCodeOnlyText: { color: '#DDD6FE', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  referralToggleManual: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 8 },
  referralToggleManualText: { color: 'rgba(167,139,250,0.7)', fontSize: 12, fontWeight: '700' },
  referralManualRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  referralManualInput: { flex: 1, borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 14, fontWeight: '700', color: '#E9D5FF', backgroundColor: 'rgba(0,0,0,0.25)' },
  referralManualBtn: { backgroundColor: '#7C3AED', borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  referralManualBtnText: { color: C.white, fontSize: 13, fontWeight: '900' },
  // Legacy (unused, kept for safety)
  referralRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  referralCode: { backgroundColor: C.white, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  referralCodeText: { fontWeight: '900', fontSize: 16, color: C.gray900, letterSpacing: 2 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  shareBtnText: { color: C.white, fontSize: 12, fontWeight: '800' },
  codeInputRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  codeInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 14, fontWeight: '700', color: C.gray900, backgroundColor: C.white },
  codeApplyBtn: { backgroundColor: C.gray900, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  codeApplyText: { color: C.white, fontSize: 13, fontWeight: '800' },

  // Transactions
  emptyTx: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyTxText: { fontSize: 15, fontWeight: '800', color: C.gray600 },
  emptyTxSub: { fontSize: 13, color: C.gray400 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txLabel: { fontSize: 14, fontWeight: '800', color: C.gray900 },
  txMeta: { fontSize: 11, color: C.gray400, marginTop: 2 },
  txAmt: { fontSize: 15, fontWeight: '900', flexShrink: 0 },

  // Coming soon
  futureCard: { marginTop: 16, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#A5F3FC' },
  futureHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  futureTitle: { fontSize: 15, fontWeight: '900', color: C.gray900 },
  futureSub: { fontSize: 12, fontWeight: '600', color: C.gray600, marginTop: 2 },
  futureBadge: { backgroundColor: C.gray900, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  futureBadgeText: { color: C.white, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  futureChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  futureChip: { backgroundColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  futureChipText: { fontSize: 12, fontWeight: '700', color: '#0F766E' },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 99 },
  overlayCard: { backgroundColor: C.white, borderRadius: 24, padding: 32, alignItems: 'center', width: '80%', gap: 12 },
  overlayIconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  overlayTitle: { fontSize: 18, fontWeight: '900', color: C.gray900, textAlign: 'center' },
  overlaySub: { fontSize: 13, color: C.gray600, textAlign: 'center' },
  overlayDots: { flexDirection: 'row', gap: 8, marginTop: 8 },
  overlayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
});
