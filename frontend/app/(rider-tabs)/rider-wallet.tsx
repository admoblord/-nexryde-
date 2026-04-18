import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from '@/src/services/api';
import {
  saveWalletCheckoutSession,
  loadWalletCheckoutSession,
  clearWalletCheckoutSession,
  parsePendingCheckoutConflict,
} from '@/src/services/walletCheckoutSession';
import { openSquadCheckoutUrl } from '@/src/services/squadCheckoutOpen';

const PRESETS = [500, 1000, 2000, 5000, 10000, 20000];

export default function RiderWalletScreen() {
  const { user } = useAppStore();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amountStr, setAmountStr] = useState('2000');
  const [promoCode, setPromoCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [busy, setBusy] = useState<'checkout' | 'verify' | null>(null);
  const [txs, setTxs] = useState<Record<string, unknown>[]>([]);
  /** In-progress Squad checkout (server + local; survives app background). */
  const [pendingMeta, setPendingMeta] = useState<{
    ref: string;
    url: string;
    amount: number;
  } | null>(null);
  const [checkoutFailed, setCheckoutFailed] = useState(false);

  const uid = user?.id;

  const load = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      const w = await getWalletMe(15);
      setBalance(Number(w.data?.balance ?? 0));
      setTxs(
        Array.isArray(w.data?.transactions)
          ? (w.data.transactions as Record<string, unknown>[])
          : []
      );
    } catch {
      setBalance(0);
      setTxs([]);
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
    const loadReferral = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/referral/code/${uid}`);
        const data = await res.json();
        if (!cancelled) {
          setReferralCode(typeof data?.referral_code === 'string' ? data.referral_code : '');
        }
      } catch {
        if (!cancelled) {
          setReferralCode('');
        }
      }
    };
    void loadReferral();
    return () => {
      cancelled = true;
    };
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

  const applyPromoCode = () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Promo code', 'Enter a promo code to continue.');
      return;
    }
    Alert.alert(
      'Promo code',
      'Promo redemption will be available soon. Your wallet remains the home for promo credits and rewards.',
    );
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
        const res = await verifyPendingRiderWallet(ref);
        const data = res.data as Record<string, unknown>;
        if (data.verified && (data.credited || data.duplicate)) {
          if (uid) await clearWalletCheckoutSession(uid);
          setPendingMeta(null);
          await load();
          if (!silent) {
            Alert.alert('Success', 'Wallet updated.');
          }
        } else {
          const mismatch =
            data.detail === 'amount_mismatch'
              ? 'Amount mismatch with bank. Contact support with your receipt if money left your account.'
              : '';
          const vr = data.verify_result as Record<string, unknown> | undefined;
          const reason =
            mismatch ||
            (typeof vr?.reason === 'string' ? vr.reason : '') ||
            'Payment not confirmed yet. Wait a moment and tap Verify again.';
          if (!silent) {
            Alert.alert('Not yet', reason);
          }
        }
      } catch (e: unknown) {
        if (!silent) {
          const msg = axios.isAxiosError(e)
            ? formatApiDetail(e.response?.data?.detail) || messageFromAxiosError(e, '')
            : '';
          Alert.alert(
            'Verify',
            msg || 'No pending checkout or payment not verified yet. Pull down to refresh your balance.',
          );
        }
      } finally {
        if (!silent) setBusy(null);
      }
    },
    [uid, pendingMeta?.ref, load],
  );

  const verifyPendingRef = useRef(verifyPending);
  verifyPendingRef.current = verifyPending;

  useEffect(() => {
    let verifyTimer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncPendingCheckout();
        void load();
        if (pendingMeta?.ref) {
          if (verifyTimer) clearTimeout(verifyTimer);
          verifyTimer = setTimeout(() => void verifyPendingRef.current({ silent: true }), 900);
        }
      }
    });
    return () => {
      if (verifyTimer) clearTimeout(verifyTimer);
      sub.remove();
    };
  }, [syncPendingCheckout, load, pendingMeta?.ref]);

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
              <Text style={styles.pendingBannerTitle}>Payment in progress</Text>
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
          disabled={busy !== null}
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

        <TouchableOpacity style={styles.textLink} onPress={() => void verifyPending()} disabled={busy !== null}>
          {busy === 'verify' ? (
            <ActivityIndicator color={COLORS.accentGreen} />
          ) : (
            <Text style={styles.textLinkLabel}>Verify Payment</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Rewards & promo</Text>
        <Text style={styles.sectionHint}>
          Keep your referral rewards and promo credits in one place. Share your code or enter a promo when available.
        </Text>
        <View style={styles.rewardsCard}>
          <View style={styles.rewardsRow}>
            <View style={[styles.rewardsIcon, { backgroundColor: '#E0E7FF' }]}>
              <Ionicons name="gift-outline" size={20} color="#4338CA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rewardsTitle}>Invite & earn</Text>
              <Text style={styles.rewardsText}>
                {referralCode ? `Referral code ${referralCode}` : 'Referral code will appear here when ready.'}
              </Text>
            </View>
          </View>
          <View style={styles.promoBox}>
            <Text style={styles.promoLabel}>Promo code</Text>
            <TextInput
              style={styles.promoInput}
              placeholder="e.g. NEXRYDE2026"
              placeholderTextColor={COLORS.gray400}
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.promoBtn} onPress={applyPromoCode}>
              <Text style={styles.promoBtnText}>Apply code</Text>
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
  textLink: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
  },
  textLinkLabel: {
    color: COLORS.accentGreen,
    fontWeight: '800',
    fontSize: FONT_SIZE.sm,
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
});
