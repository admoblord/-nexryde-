import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
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

const PRESETS = [500, 1000, 2000, 5000, 10000, 20000];

type TopupState =
  | { phase: 'idle' }
  | { phase: 'initiating'; amountNgn: number }
  | { phase: 'checkout'; reference: string; checkoutUrl: string; amountNgn: number }
  | { phase: 'verifying'; reference: string; startedAt: number }
  | { phase: 'success'; reference: string; amountNgn: number; balanceNgn: number }
  | { phase: 'failed'; reference?: string; reason: string }
  | { phase: 'cancelled'; reference?: string };

export default function RiderWalletScreen() {
  const { user } = useAppStore();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(0);
  const [promoCreditBalance, setPromoCreditBalance] = useState(0);
  const [firstRideCompleted, setFirstRideCompleted] = useState(false);
  const [firstRideRewardGranted, setFirstRideRewardGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amountStr, setAmountStr] = useState('2000');
  const [promoCode, setPromoCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [busy, setBusy] = useState<'checkout' | 'verify' | null>(null);
  const [topupState, setTopupState] = useState<TopupState>({ phase: 'idle' });
  const [txs, setTxs] = useState<Record<string, unknown>[]>([]);
  /** In-progress Squad checkout (server + local; survives app background). */
  const [pendingMeta, setPendingMeta] = useState<{
    ref: string;
    url: string;
    amount: number;
  } | null>(null);
  const [checkoutFailed, setCheckoutFailed] = useState(false);

  const uid = user?.id;

  const load = useCallback(async (): Promise<number | null> => {
    if (!uid) {
      setLoading(false);
      return null;
    }
    try {
      const w = await getWalletMe(15);
      const bal = Number(w.data?.balance ?? 0);
      setBalance(bal);
      setTxs(
        Array.isArray(w.data?.transactions)
          ? (w.data.transactions as Record<string, unknown>[])
          : []
      );
      return bal;
    } catch {
      setBalance(0);
      setTxs([]);
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!uid) {
      setReferralCode('');
      return;
    }
    let cancelled = false;
    const loadIncentives = async () => {
      try {
        // Load referral code
        const hdr = await getAuthHeaders();
        const [refRes, creditRes, firstRideRes] = await Promise.allSettled([
          fetch(`${BACKEND_URL}/api/incentives/referral-code`, { headers: hdr }),
          fetch(`${BACKEND_URL}/api/incentives/my-credits`, { headers: hdr }),
          fetch(`${BACKEND_URL}/api/incentives/first-ride-status`, { headers: hdr }),
        ]);
        if (refRes.status === 'fulfilled' && refRes.value.ok) {
          const data = await refRes.value.json();
          if (!cancelled) setReferralCode(data.referral_code ?? '');
        }
        if (creditRes.status === 'fulfilled' && creditRes.value.ok) {
          const data = await creditRes.value.json();
          if (!cancelled) setPromoCreditBalance(data.promo_credit_balance ?? 0);
        }
        if (firstRideRes.status === 'fulfilled' && firstRideRes.value.ok) {
          const data = await firstRideRes.value.json();
          if (!cancelled) {
            setFirstRideCompleted(data.first_ride_completed ?? false);
            setFirstRideRewardGranted(data.reward_granted ?? false);
          }
        }
      } catch {
        if (!cancelled) setReferralCode('');
      }
    };
    void loadIncentives();
    return () => { cancelled = true; };
  }, [uid]);

  const syncPendingCheckout = useCallback(async () => {
    if (!uid) {
      setPendingMeta(null);
      return;
    }
    try {
      const res = await getPendingWalletCheckout();
      const d = res.data;
      if (!d?.pending || !d.checkout_url || !d.transaction_ref) {
        await clearWalletCheckoutSession(uid);
        setPendingMeta(null);
        return;
      }
      const meta = {
        ref: String(d.transaction_ref),
        url: String(d.checkout_url),
        amount: Number(d.amount_ngn ?? 0),
      };
      await saveWalletCheckoutSession({
        userId: uid,
        transaction_ref: meta.ref,
        checkout_url: meta.url,
        amount_ngn: meta.amount,
        savedAt: new Date().toISOString(),
      });
      setPendingMeta(meta);
    } catch {
      const local = await loadWalletCheckoutSession(uid);
      if (local) {
        setPendingMeta({
          ref: local.transaction_ref,
          url: local.checkout_url,
          amount: local.amount_ngn,
        });
      }
    }
  }, [uid]);

  useEffect(() => {
    if (uid) void syncPendingCheckout();
  }, [uid, syncPendingCheckout]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const parsedAmount = (): number => {
    const n = parseFloat(String(amountStr).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const applyPromoCode = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Referral code', 'Enter a referral code to continue.');
      return;
    }
    try {
      const hdr = await getAuthHeaders();
      const res = await fetch(`${BACKEND_URL}/api/incentives/apply-referral-code`, {
        method: 'POST',
        headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ referral_code: code }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Code applied! 🎉', data.message || 'Complete your first ride to earn ₦500.');
        setPromoCode('');
      } else {
        Alert.alert('Could not apply code', data.detail || 'Invalid or already-used code.');
      }
    } catch {
      Alert.alert('Error', 'Could not apply code. Please try again.');
    }
  };

  const persistAndOpenCheckout = async (data: {
    checkout_url?: string;
    transaction_ref?: string;
    transactionRef?: string;
    amount_ngn?: number;
  }) => {
    const url = data.checkout_url;
    const ref = data.transaction_ref ?? data.transactionRef;
    if (!uid || !url || typeof url !== 'string' || !ref) return false;
    const amountNgn = Number(data.amount_ngn ?? parsedAmount());
    await saveWalletCheckoutSession({
      userId: uid,
      transaction_ref: String(ref),
      checkout_url: url,
      amount_ngn: amountNgn,
      savedAt: new Date().toISOString(),
    });
    setPendingMeta({ ref: String(ref), url, amount: amountNgn });
    const ok = await openSquadCheckoutUrl(url);
    if (!ok) {
      Alert.alert('Checkout', 'Could not open the payment page. Try again.');
      return false;
    }
    Alert.alert('Squad checkout', 'Complete payment in the window that opened, then tap Verify Payment.', [
      { text: 'Verify Payment', onPress: () => void verifyPending() },
      { text: 'OK', style: 'cancel' },
    ]);
    return true;
  };

  const startCardCheckoutReplace = async (amount: number) => {
    setBusy('checkout');
    setCheckoutFailed(false);
    try {
      const res = await initiateRiderWalletCheckout(amount, true);
      const data = res.data || {};
      if (isWalletCheckoutInitOk(data)) {
        setCheckoutFailed(false);
        await persistAndOpenCheckout(data);
      } else {
        setCheckoutFailed(true);
        Alert.alert('Payment', WALLET_CHECKOUT_USER_ERROR);
      }
    } catch (e: unknown) {
      setCheckoutFailed(true);
      Alert.alert('Payment', messageFromAxiosError(e, WALLET_CHECKOUT_USER_ERROR));
    } finally {
      setBusy(null);
    }
  };

  const startCardCheckout = async () => {
    const amount = parsedAmount();
    if (amount < 100) {
      Alert.alert('Amount', 'Minimum top-up is ₦100');
      return;
    }
    setBusy('checkout');
    setCheckoutFailed(false);
    try {
      const res = await initiateRiderWalletCheckout(amount, false);
      const data = res.data || {};
      if (isWalletCheckoutInitOk(data)) {
        setCheckoutFailed(false);
        await persistAndOpenCheckout(data);
      } else {
        setCheckoutFailed(true);
        Alert.alert('Payment', WALLET_CHECKOUT_USER_ERROR);
      }
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        const conflict = parsePendingCheckoutConflict(e.response.data?.detail);
        if (conflict?.checkout_url) {
          const amt = Number(conflict.pending_amount_ngn ?? 0);
          Alert.alert(
            'Pending top-up',
            `You already started a ₦${amt.toLocaleString()} payment. Resume the same checkout, or cancel it to use ₦${amount.toLocaleString()} instead.`,
            [
              {
                text: 'Resume checkout',
                onPress: () =>
                  void persistAndOpenCheckout({
                    checkout_url: conflict.checkout_url,
                    transaction_ref: conflict.transaction_ref,
                    amount_ngn: amt,
                  }),
              },
              {
                text: 'Cancel old & pay new amount',
                style: 'destructive',
                onPress: () => void startCardCheckoutReplace(amount),
              },
              { text: 'Not now', style: 'cancel' },
            ]
          );
        } else {
          setCheckoutFailed(true);
          Alert.alert('Payment', messageFromAxiosError(e, WALLET_CHECKOUT_USER_ERROR));
        }
      } else {
        setCheckoutFailed(true);
        Alert.alert('Payment', messageFromAxiosError(e, WALLET_CHECKOUT_USER_ERROR));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleCancelPendingSession = () => {
    Alert.alert(
      'Cancel pending top-up?',
      'You can start a new amount afterward. This does not undo money already sent from your bank.',
      [
        { text: 'Keep session', style: 'cancel' },
        {
          text: 'Cancel session',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              try {
                await cancelPendingWalletCheckout();
                if (uid) await clearWalletCheckoutSession(uid);
                setPendingMeta(null);
              } catch {
                Alert.alert('Cancel', 'Could not cancel. Try again.');
              }
            })(),
        },
      ]
    );
  };

  const verifyPending = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) setBusy('verify');
      try {
        const ref =
          pendingMeta?.ref ||
          (uid ? (await loadWalletCheckoutSession(uid))?.transaction_ref : undefined);
        if (!ref) {
          if (!silent)
            Alert.alert('No payment found', 'Start a new top-up or pull down to refresh your balance.');
          return;
        }
        if (!silent) setTopupState({ phase: 'verifying', reference: ref, startedAt: Date.now() });

        // Poll up to 24× (72 seconds) — Squad sometimes takes up to 60s to settle a card payment.
        let terminal: Record<string, unknown> | null = null;
        for (let i = 0; i < 24; i += 1) {
          try {
            const res = await verifyPendingRiderWallet(ref);
            const data = res.data as Record<string, unknown>;

            // Wallet successfully credited (or duplicate — already credited before)
            if (data.verified && (data.credited || data.duplicate)) {
              terminal = data;
              break;
            }
            // Terminal failure — no point retrying
            if (
              data.terminal ||
              data.detail === 'amount_mismatch' ||
              String(data.status || '').toLowerCase() === 'cancelled'
            ) {
              terminal = data;
              break;
            }
            // "squad_not_confirmed_yet" — keep polling silently
          } catch {
            // Network hiccup — keep polling
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        const data = terminal;
        if (data?.verified && (data.credited || data.duplicate)) {
          const amountForDisplay = pendingMeta?.amount ?? parsedAmount();
          if (uid) await clearWalletCheckoutSession(uid);
          setPendingMeta(null);
          const balAfter = await load();
          setTopupState({
            phase: 'success',
            reference: ref,
            amountNgn: amountForDisplay,
            balanceNgn: typeof balAfter === 'number' ? balAfter : 0,
          });
          if (!silent) {
            Alert.alert(
              '✅ Wallet Funded!',
              `₦${(amountForDisplay).toLocaleString()} has been added to your wallet.`,
            );
          }
        } else {
          const isCancelled = String(data?.status || '').toLowerCase() === 'cancelled';
          const isMismatch = data?.detail === 'amount_mismatch';
          const reason = isMismatch
            ? 'Amount mismatch. If money left your bank, contact support with your receipt.'
            : isCancelled
              ? 'Payment was cancelled.'
              : 'Payment not confirmed yet. Tap "Verify Payment" again in a few seconds, or pull down to refresh your balance.';

          if (isCancelled) {
            setTopupState({ phase: 'cancelled', reference: ref });
          } else {
            // Keep phase as idle (not failed) so the UI stays usable and user can tap Verify again
            setTopupState({ phase: 'idle' });
          }
          if (!silent) {
            Alert.alert(
              isCancelled ? 'Payment Cancelled' : isMismatch ? 'Amount Mismatch' : 'Not Confirmed Yet',
              reason,
              [
                { text: 'OK' },
                ...(!isCancelled && !isMismatch
                  ? [{ text: 'Try Again', onPress: () => void verifyPending() }]
                  : []),
              ],
            );
          }
        }
      } catch (e: unknown) {
        if (!silent) {
          const msg = axios.isAxiosError(e)
            ? formatApiDetail(e.response?.data?.detail) || messageFromAxiosError(e, '')
            : '';
          // 404 most likely means Squad hasn't forwarded the event yet
          const isNotFound = axios.isAxiosError(e) && e.response?.status === 404;
          Alert.alert(
            isNotFound ? 'Payment Pending' : 'Verify',
            isNotFound
              ? 'Squad is still processing your payment. Tap "Verify Payment" again in a few seconds.'
              : msg || 'Could not reach the server. Check your connection and try again.',
            [
              { text: 'OK' },
              { text: 'Try Again', onPress: () => void verifyPending() },
            ],
          );
        }
      } finally {
        if (!silent) setBusy(null);
      }
    },
    [uid, pendingMeta, load],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPendingCheckout();
        void load();
      }
    });
    return () => {
      sub.remove();
    };
  }, [syncPendingCheckout, load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
        <Text style={styles.headerSub}>Top up with card or bank (Squad)</Text>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: SPACING.xxl + Math.max(insets.bottom, 12) + 56 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          {loading ? (
            <ActivityIndicator color="#FBBF24" style={{ marginVertical: 12 }} />
          ) : (
            <Text style={styles.balanceAmount}>₦{balance.toLocaleString()}</Text>
          )}
          <Text style={styles.balanceSubtext}>
            Use wallet for in-app ride payments where enabled. Cash remains available for rides.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Top up</Text>
        <Text style={styles.sectionHint}>
          Choose an amount, then pay with card or bank in Squad. Your session is saved until you pay or cancel.
        </Text>

        {pendingMeta ? (
          <View style={styles.pendingBanner}>
            <Ionicons name="time-outline" size={22} color="#B45309" />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingBannerTitle}>Payment pending</Text>
              <Text style={styles.pendingBannerText}>
                ₦{pendingMeta.amount.toLocaleString()} — same Squad session. Tap Resume if the browser closed.
              </Text>
            </View>
          </View>
        ) : null}

        {pendingMeta ? (
          <View style={styles.pendingActions}>
            <TouchableOpacity
              style={styles.resumeBtn}
              onPress={() => void openSquadCheckoutUrl(pendingMeta.url)}
              disabled={busy !== null}
            >
              <Ionicons name="open-outline" size={20} color="#FFF" />
              <Text style={styles.resumeBtnText}>Resume checkout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelSessionBtn}
              onPress={handleCancelPendingSession}
              disabled={busy !== null}
            >
              <Text style={styles.cancelSessionBtnText}>Cancel session</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.presetRow}>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.presetChip, amountStr === String(p) && styles.presetChipOn]}
              onPress={() => setAmountStr(String(p))}
            >
              <Text style={[styles.presetChipText, amountStr === String(p) && styles.presetChipTextOn]}>
                ₦{(p / 1000).toLocaleString()}k
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.amountInput}
          keyboardType="decimal-pad"
          placeholder="Amount (NGN)"
          placeholderTextColor={COLORS.gray400}
          value={amountStr}
          onChangeText={setAmountStr}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, busy === 'checkout' && { opacity: 0.7 }]}
          onPress={startCardCheckout}
          disabled={busy !== null || (topupState.phase !== 'idle' && topupState.phase !== 'failed' && topupState.phase !== 'cancelled' && topupState.phase !== 'success')}
        >
          {busy === 'checkout' ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="card" size={22} color="#FFF" />
              <Text style={styles.primaryBtnText}>Pay with card / bank (Squad)</Text>
            </>
          )}
        </TouchableOpacity>

        {checkoutFailed ? (
          <TouchableOpacity
            style={styles.retryCheckoutBtn}
            onPress={() => {
              setCheckoutFailed(false);
              void startCardCheckout();
            }}
            disabled={busy !== null}
          >
            <Ionicons name="refresh" size={20} color={COLORS.primary} />
            <Text style={styles.retryCheckoutBtnText}>Try again</Text>
          </TouchableOpacity>
        ) : null}

        {topupState.phase === 'success' && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
            <View style={{ flex: 1 }}>
              <Text style={styles.successBannerTitle}>Wallet Funded Successfully</Text>
              <Text style={styles.successBannerText}>
                ₦{(topupState.amountNgn ?? 0).toLocaleString()} added · New balance: ₦{(topupState.balanceNgn ?? 0).toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.verifyBtn, busy === 'verify' && { opacity: 0.7 }]}
          onPress={() => void verifyPending()}
          disabled={busy !== null}
        >
          {busy === 'verify' ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-done-outline" size={18} color="#FFF" />
              <Text style={styles.verifyBtnText}>Verify Payment</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.verifyHint}>
          Tap after completing payment in Squad. We'll check with Squad and credit your wallet instantly.
        </Text>

        <Text style={styles.sectionTitle}>Rewards & Bonuses</Text>
        <Text style={styles.sectionHint}>
          Earn rewards through real trips only — no fake credits, no abuse.
        </Text>

        {/* First-ride reward card */}
        <View style={[styles.rewardsCard, { borderLeftWidth: 4, borderLeftColor: firstRideRewardGranted ? '#22C55E' : '#F59E0B' }]}>
          <View style={styles.rewardsRow}>
            <View style={[styles.rewardsIcon, { backgroundColor: firstRideRewardGranted ? '#DCFCE7' : '#FEF3C7' }]}>
              <Ionicons name={firstRideRewardGranted ? 'checkmark-circle' : 'flash'} size={22} color={firstRideRewardGranted ? '#16A34A' : '#D97706'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardsTitle}>
                {firstRideRewardGranted ? '🎉 First Ride Bonus Earned!' : 'First Ride Bonus'}
              </Text>
              <Text style={styles.rewardsText}>
                {firstRideRewardGranted
                  ? '₦500 promo credit has been added to your wallet.'
                  : 'Complete your first ride and get ₦500 bonus credit instantly.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Promo credit balance */}
        {promoCreditBalance > 0 && (
          <View style={[styles.rewardsCard, { backgroundColor: '#F0FDF4' }]}>
            <View style={styles.rewardsRow}>
              <View style={[styles.rewardsIcon, { backgroundColor: '#DCFCE7' }]}>
                <Ionicons name="wallet" size={22} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rewardsTitle}>Promo Credit Balance</Text>
                <Text style={[styles.rewardsText, { color: '#16A34A', fontWeight: '700', fontSize: 18 }]}>
                  ₦{promoCreditBalance.toLocaleString()}
                </Text>
                <Text style={[styles.rewardsText, { fontSize: 11, color: '#6B7280' }]}>
                  Applied automatically (max ₦500 / 40% of fare per ride · expires in 7 days)
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Referral card */}
        <View style={styles.rewardsCard}>
          <View style={styles.rewardsRow}>
            <View style={[styles.rewardsIcon, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="people" size={20} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardsTitle}>Invite Friends — Earn ₦500 Each</Text>
              <Text style={styles.rewardsText}>
                When your friend completes their first ride you both earn ₦500 credit.
              </Text>
              {referralCode ? (
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontWeight: '800', fontSize: 16, color: '#111827', letterSpacing: 2 }}>{referralCode}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: '#7C3AED', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    onPress={() => {
                      const { Share } = require('react-native');
                      Share.share({ message: `Join Nexryde with my code ${referralCode} and we both earn ₦500 after your first ride! Download: https://nexryde.app` });
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Share</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.rewardsText, { color: '#9CA3AF', marginTop: 4 }]}>Loading your code…</Text>
              )}
            </View>
          </View>
          {/* Apply a referral code */}
          <View style={styles.promoBox}>
            <Text style={styles.promoLabel}>Have a referral code?</Text>
            <TextInput
              style={styles.promoInput}
              placeholder="Enter code e.g. NX1A2B3C"
              placeholderTextColor={COLORS.gray400}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.promoBtn} onPress={applyPromoCode}>
              <Text style={styles.promoBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Nexryde Wallet as a Bank</Text>
        <Text style={styles.sectionHint}>
          Your rider wallet will evolve into a mini banking experience inside Nexryde.
        </Text>
        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonHeader}>
            <View style={styles.comingSoonIcon}>
              <Ionicons name="business-outline" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.comingSoonTitle}>Banking features</Text>
              <Text style={styles.comingSoonText}>
                Earn interest on balance, send money, pay bills, and buy airtime without leaving Nexryde.
              </Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
            </View>
          </View>
          <View style={styles.comingSoonGrid}>
            <View style={styles.comingSoonChip}>
              <Ionicons name="trending-up-outline" size={16} color="#0F766E" />
              <Text style={styles.comingSoonChipText}>Interest earnings</Text>
            </View>
            <View style={styles.comingSoonChip}>
              <Ionicons name="swap-horizontal-outline" size={16} color="#0F766E" />
              <Text style={styles.comingSoonChipText}>Send money</Text>
            </View>
            <View style={styles.comingSoonChip}>
              <Ionicons name="flash-outline" size={16} color="#0F766E" />
              <Text style={styles.comingSoonChipText}>Buy airtime</Text>
            </View>
            <View style={styles.comingSoonChip}>
              <Ionicons name="receipt-outline" size={16} color="#0F766E" />
              <Text style={styles.comingSoonChipText}>Pay bills</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Recent wallet activity</Text>
        {txs.length === 0 ? (
          <Text style={styles.emptyTx}>No transactions yet. Top up to get started.</Text>
        ) : (
          txs.map((row, i) => {
            const t = row as Record<string, unknown>;
            const amt = Number(t.amount || 0);
            const typ = String(t.type || '');
            const src = String(t.source || '');
            const isCreditTopUp =
              typ === 'topup' || (typ === 'credit' && (src === 'squad' || !src));
            const isRideDebit = typ === 'debit' || typ === 'ride_payment';
            const ts = t.timestamp ? String(t.timestamp) : '';
            const txLabel = isCreditTopUp
              ? 'Top up'
              : isRideDebit
                ? 'Ride payment'
                : typ === 'credit'
                  ? 'Credit'
                  : typ || 'Transaction';
            const iconBg = isCreditTopUp ? '#D1FAE5' : '#FEE2E2';
            const iconColor = isCreditTopUp ? '#059669' : '#DC2626';
            return (
              <View key={String(t.id || i)} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: iconBg }]}>
                  <Ionicons
                    name={isCreditTopUp ? 'arrow-down-circle' : 'car'}
                    size={20}
                    color={iconColor}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txType}>{txLabel}</Text>
                  <Text style={styles.txMeta} numberOfLines={1}>
                    {ts}
                    {t.reference ? ` · ${String(t.reference).slice(-8)}` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmt,
                    { color: amt >= 0 ? '#059669' : '#DC2626' },
                  ]}
                >
                  {amt >= 0 ? '+' : ''}₦{Math.abs(amt).toLocaleString()}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
      <Modal visible={topupState.phase === 'verifying'} transparent animationType="fade">
        <View style={styles.verifyModalOverlay}>
          <View style={styles.verifyModalCard}>
            <ActivityIndicator color={COLORS.accentGreen} />
            <Text style={styles.verifyModalTitle}>Confirming payment with Squad…</Text>
            <Text style={styles.verifyModalText}>Do not close the app. We only credit after Squad confirms income.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
  },
  headerSub: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  balanceCard: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.lg,
  },
  balanceLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    fontSize: FONT_SIZE.display,
    fontWeight: '900',
    color: '#FBBF24',
    marginVertical: SPACING.sm,
  },
  balanceSubtext: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#FDE68A',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  sectionHint: {
    fontSize: FONT_SIZE.sm,
    color: '#64748B',
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  pendingBannerTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  pendingBannerText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#78350F',
    lineHeight: 18,
  },
  pendingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EA580C',
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  resumeBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#FFF',
  },
  cancelSessionBtn: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    justifyContent: 'center',
  },
  cancelSessionBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#64748B',
    textDecorationLine: 'underline',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.md,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  presetChipOn: {
    borderColor: COLORS.accentGreen,
    backgroundColor: '#ECFDF5',
  },
  presetChipText: {
    fontWeight: '800',
    color: '#64748B',
    fontSize: FONT_SIZE.sm,
  },
  presetChipTextOn: {
    color: '#059669',
  },
  amountInput: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    marginBottom: SPACING.md,
    color: '#0F172A',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accentGreen,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  retryCheckoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: -8,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
  },
  retryCheckoutBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.primary,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F766E',
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: 8,
  },
  verifyBtnText: {
    color: '#FFF',
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  verifyHint: {
    color: '#64748B',
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#F0FDF4',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successBannerTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 2,
  },
  successBannerText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: '#15803D',
  },
  rewardsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  comingSoonCard: {
    backgroundColor: '#ECFEFF',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#A5F3FC',
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  comingSoonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  comingSoonIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: '#CFFAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.gray900,
  },
  comingSoonText: {
    marginTop: 4,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray600,
    lineHeight: 20,
  },
  comingSoonBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  comingSoonBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  comingSoonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  comingSoonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  comingSoonChipText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.gray700,
  },
  rewardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rewardsIcon: {
    width: 42,
    height: 42,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardsTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  rewardsText: {
    marginTop: 2,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  promoBox: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  promoLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: COLORS.lightTextMuted,
    marginBottom: SPACING.xs,
  },
  promoInput: {
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    backgroundColor: COLORS.gray50,
  },
  promoBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  promoBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
  },
  emptyTx: {
    color: '#64748B',
    fontSize: FONT_SIZE.sm,
    fontStyle: 'italic',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  txType: {
    fontWeight: '800',
    color: '#0F172A',
    fontSize: FONT_SIZE.sm,
  },
  txMeta: {
    fontSize: FONT_SIZE.xs,
    color: '#64748B',
    marginTop: 2,
  },
  txAmt: {
    fontWeight: '900',
    fontSize: FONT_SIZE.md,
  },
  verifyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  verifyModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  verifyModalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray900,
    textAlign: 'center',
  },
  verifyModalText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    textAlign: 'center',
  },
});
