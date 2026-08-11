import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SPACING, FONT_SIZE, useThemeColors } from '@/src/constants/theme';
import { SURFACE } from '@/src/constants/designSystem';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import {
  BACKEND_URL,
  getAuthHeaders,
  getDriverBankDetails,
} from '@/src/services/api';

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank of Nigeria',
  'First City Monument Bank (FCMB)', 'Globus Bank', 'Guaranty Trust Bank (GTBank)',
  'Heritage Bank', 'Keystone Bank', 'Polaris Bank', 'Providus Bank',
  'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Sterling Bank',
  'SunTrust Bank', 'Titan Trust Bank', 'Union Bank of Nigeria',
  'United Bank for Africa (UBA)', 'Unity Bank', 'Wema Bank', 'Zenith Bank',
  'Kuda Bank', 'ALAT by Wema', 'Rubies Bank', 'VFD Microfinance Bank',
  'OPay', 'PalmPay', 'Moniepoint', 'Paga', 'Carbon',
].sort();

function ProgressBar({ step, total }: { step: number; total: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(progress, {
      toValue: step / total,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start();
  }, [step, total]);
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={pb.track}>
      <Animated.View style={[pb.fill, { width }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden', marginBottom: SPACING.sm },
  fill: { height: '100%', backgroundColor: '#00D46A', borderRadius: 2 },
});

export default function BankDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { userId: driverId } = useAuthedUserId();
  const { colors, isDark } = useThemeColors();
  const screenBg = isDark ? colors.background : '#F8FAFC';
  const cardBg = isDark ? SURFACE.cardDark : '#FFF';
  const textPrimary = colors.text;
  const border = isDark ? SURFACE.hairline : '#E2E8F0';

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [payoutReady, setPayoutReady] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState(
    'Add your bank details so riders can transfer fares to you after trips.',
  );

  const formStep = [bankName, accountNumber.length === 10, accountName].filter(Boolean).length;

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!driverId) {
        setInitialLoading(false);
        return;
      }
      try {
        const bankRes = await getDriverBankDetails(driverId);
        if (!active) return;
        const bankData = bankRes.data;
        setBankName(bankData.bank_name || '');
        setAccountNumber(bankData.account_number || '');
        setAccountName(bankData.account_name || '');
        setPayoutReady(Boolean(bankData.payout_ready));
        setPayoutMessage(
          bankData.message || 'Riders pay this account directly after completed trips.',
        );
      } catch {
        if (!active) return;
        setPayoutReady(false);
      } finally {
        if (active) setInitialLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [driverId]);

  const prevAccountRef = useRef('');
  useEffect(() => {
    if (accountNumber.length === 10 && bankName && prevAccountRef.current !== accountNumber) {
      prevAccountRef.current = accountNumber;
      void handleVerifyAccount();
    }
  }, [accountNumber, bankName]);

  const handleVerifyAccount = async () => {
    if (!bankName || accountNumber.length !== 10) return;
    setVerifying(true);
    setVerifyError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/verify-bank`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_name: bankName, account_number: accountNumber }),
      });
      const data = await res.json();
      if (data.account_name) {
        setAccountName(data.account_name);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setVerifyError('Could not auto-verify. Enter your account name manually below.');
      }
    } catch {
      setVerifyError('Could not auto-verify. Enter your account name manually below.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!bankName || !accountNumber || !accountName) {
      Alert.alert('Incomplete', 'Please fill in all fields to continue.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/bank-details`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
        }),
      });
      if (response.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSaved(true);
        setPayoutReady(true);
        setTimeout(() => router.back(), 1200);
      } else {
        Alert.alert('Error', 'Could not save bank details. Please try again.');
      }
    } catch {
      Alert.alert('Network Error', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredBanks = NIGERIAN_BANKS.filter((b) =>
    b.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const formComplete = Boolean(bankName && accountNumber.length === 10 && accountName);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <SafeAreaView style={{ flex: 1, backgroundColor: screenBg }} edges={['top']}>
        <TabBrandStrip role="driver" />
        <View
          style={[
            styles.header,
            { backgroundColor: cardBg, borderBottomColor: border, paddingHorizontal: flow.padH },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: textPrimary }]}>Bank Details</Text>
          </View>
          {payoutReady && (
            <View style={styles.payoutReadyPill}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={styles.payoutReadyText}>Verified</Text>
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: flow.padH, marginBottom: SPACING.sm }}>
          <ProgressBar step={formStep} total={3} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              {
                paddingHorizontal: flow.padH,
                paddingTop: flow.sectionGap * 0.65,
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                [styles.statusBanner, { backgroundColor: cardBg, borderColor: border }],
                payoutReady ? styles.statusBannerReady : styles.statusBannerPending,
              ]}
            >
              <View
                style={[
                  styles.statusIcon,
                  { backgroundColor: payoutReady ? '#D1FAE5' : '#FEF3C7' },
                ]}
              >
                <Ionicons
                  name={payoutReady ? 'shield-checkmark' : 'alert-circle'}
                  size={20}
                  color={payoutReady ? '#16A34A' : '#D97706'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {payoutReady ? 'Ready for rider transfers' : 'Setup required to receive payments'}
                </Text>
                <Text style={styles.statusSub}>{payoutMessage}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.sectionBadge, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[styles.sectionBadgeText, { color: '#16A34A' }]}>1</Text>
                </View>
                <Text style={styles.cardTitle}>Bank Transfer</Text>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>
                Riders pay directly to this account after every trip. 100% of your fare, instantly.
              </Text>

              <Text style={styles.fieldLabel}>
                Select Your Bank <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.selector, bankName ? styles.selectorFilled : null]}
                onPress={() => setShowBankModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="business" size={20} color={bankName ? '#16A34A' : '#94A3B8'} />
                <Text style={[styles.selectorText, !bankName && styles.placeholder]}>
                  {bankName || 'Choose your bank'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94A3B8" />
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>
                Account Number <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.input,
                    accountNumber.length === 10 && styles.inputSuccess,
                    { flex: 1 },
                  ]}
                  placeholder="10-digit account number"
                  value={accountNumber}
                  onChangeText={(v) => {
                    setAccountNumber(v);
                    if (v.length < 10) {
                      setAccountName('');
                      setVerifyError('');
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholderTextColor="#94A3B8"
                />
                {verifying && (
                  <View style={styles.verifyBadge}>
                    <ActivityIndicator size="small" color="#2563EB" />
                    <Text style={styles.verifyingText}>Verifying…</Text>
                  </View>
                )}
                {accountName && !verifying && (
                  <View style={styles.verifyBadge}>
                    <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  </View>
                )}
              </View>
              {accountNumber.length === 10 && !bankName && (
                <Text style={styles.fieldHint}>Select your bank above to auto-verify.</Text>
              )}

              <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>
                Account Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, accountName ? styles.inputSuccess : null]}
                placeholder="Auto-filled after verification, or enter manually"
                value={accountName}
                onChangeText={setAccountName}
                autoCapitalize="words"
                placeholderTextColor="#94A3B8"
              />
              {verifyError ? (
                <Text style={styles.verifyError}>{verifyError}</Text>
              ) : accountName ? (
                <View style={styles.verifiedRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                  <Text style={styles.verifiedRowText}>Account name confirmed</Text>
                </View>
              ) : (
                <Text style={styles.fieldHint}>Shown to riders for payment confirmation</Text>
              )}

              <View style={styles.securityRow}>
                <Ionicons name="lock-closed" size={13} color="#16A34A" />
                <Text style={styles.securityText}>Banking info is encrypted end-to-end</Text>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.sectionBadge, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.sectionBadgeText, { color: '#D97706' }]}>2</Text>
                </View>
                <Text style={styles.cardTitle}>Cryptocurrency</Text>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>COMING SOON</Text>
                </View>
              </View>
              <Text style={styles.cardDesc}>
                Receive earnings in USDT, USDC, or BTC and protect against Naira devaluation.
              </Text>
              <View style={styles.cryptoCoins}>
                {[
                  { symbol: '₿', label: 'BTC' },
                  { symbol: 'Ξ', label: 'ETH' },
                  { symbol: '$', label: 'USDT' },
                  { symbol: '$', label: 'USDC' },
                ].map((c) => (
                  <View key={c.label} style={styles.cryptoChip}>
                    <Text style={styles.cryptoChipText}>
                      {c.symbol} {c.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {saved ? (
              <View style={styles.savedConfirm}>
                <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
                <Text style={styles.savedConfirmText}>Saved successfully!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.saveBtn, !formComplete && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!formComplete || loading || initialLoading}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={formComplete ? ['#00C853', '#0070F3'] : ['#CBD5E1', '#CBD5E1']}
                  style={styles.saveGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                      <Text style={styles.saveBtnText}>Save Bank Details</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={showBankModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Your Bank</Text>
            <TouchableOpacity
              onPress={() => {
                setShowBankModal(false);
                setSearchQuery('');
              }}
            >
              <Ionicons name="close" size={28} color={textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search bank name…"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {filteredBanks.map((bank) => (
              <TouchableOpacity
                key={bank}
                style={[styles.bankItem, bankName === bank && styles.bankItemSelected]}
                onPress={() => {
                  setBankName(bank);
                  setShowBankModal(false);
                  setSearchQuery('');
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <View
                  style={[
                    styles.bankItemIcon,
                    bankName === bank && { backgroundColor: '#D1FAE5' },
                  ]}
                >
                  <Ionicons
                    name="business"
                    size={18}
                    color={bankName === bank ? '#16A34A' : '#64748B'}
                  />
                </View>
                <Text
                  style={[
                    styles.bankItemText,
                    bankName === bank && { color: '#16A34A', fontWeight: '800' },
                  ]}
                >
                  {bank}
                </Text>
                {bankName === bank && (
                  <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                )}
              </TouchableOpacity>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    }),
    elevation: 2,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#0F172A' },
  payoutReadyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  payoutReadyText: { fontSize: 12, fontWeight: '800', color: '#16A34A' },
  scroll: { paddingTop: SPACING.md },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: 14,
    marginBottom: SPACING.lg,
    borderWidth: 1,
  },
  statusBannerReady: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  statusBannerPending: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  statusIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  statusSub: { fontSize: 12, color: '#64748B', lineHeight: 17 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  sectionBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: { fontSize: 13, fontWeight: '900' },
  cardTitle: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '800', color: '#0F172A' },
  activeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '900', color: '#16A34A', letterSpacing: 0.5 },
  comingSoonBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  comingSoonText: { fontSize: 10, fontWeight: '900', color: '#D97706', letterSpacing: 0.5 },
  cardDesc: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#374151', marginBottom: 6 },
  required: { color: '#EF4444' },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  selectorFilled: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  selectorText: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '600', color: '#0F172A' },
  placeholder: { color: '#94A3B8', fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: '#0F172A',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    fontWeight: '600',
  },
  inputSuccess: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  verifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm,
  },
  verifyingText: { fontSize: 12, color: '#2563EB', fontWeight: '700' },
  fieldHint: { fontSize: 12, color: '#94A3B8', marginTop: 5, fontWeight: '500' },
  verifyError: { fontSize: 12, color: '#EF4444', marginTop: 5, fontWeight: '600' },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  verifiedRowText: { fontSize: 12, color: '#16A34A', fontWeight: '700' },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  securityText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  cryptoCoins: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cryptoChip: {
    backgroundColor: '#FFFBEB',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cryptoChipText: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  saveBar: {
    backgroundColor: '#FFF',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
    elevation: 8,
  },
  saveBtn: { borderRadius: 14, overflow: 'hidden' },
  saveBtnDisabled: { opacity: 0.55 },
  saveGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    gap: SPACING.sm,
  },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  savedConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    paddingVertical: 17,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  savedConfirmText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: '#16A34A' },
  modalRoot: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#0F172A' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    margin: SPACING.lg,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: FONT_SIZE.md, color: '#0F172A' },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#FFF',
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  bankItemSelected: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  bankItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankItemText: { flex: 1, fontSize: FONT_SIZE.md, color: '#374151', fontWeight: '600' },
});
