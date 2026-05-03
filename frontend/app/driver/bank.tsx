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
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import {
  BACKEND_URL,
  getAuthHeaders,
  getDriverBankDetails,
  getDriverPayoutRestrictions,
  withdrawDriverEarningsWithBiometric,
  getDriverEarningsVault,
  lockDriverEarningsVault,
  requestDriverEarningsVaultUnlock,
  confirmDriverEarningsVaultRelease,
  type EarningsVaultPendingRelease,
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
  track: { height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, overflow: 'hidden', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  fill: { height: '100%', backgroundColor: '#00D46A', borderRadius: 2 },
});

export default function BankDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAppStore();

  // Bank form state
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

  // Payout state
  const [payoutReady, setPayoutReady] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState('Add your bank details to receive direct rider payments.');
  const [withdrawAllowed, setWithdrawAllowed] = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Vault state
  const [vaultSpendable, setVaultSpendable] = useState(0);
  const [vaultLocked, setVaultLocked] = useState(0);
  const [vaultPending, setVaultPending] = useState<EarningsVaultPendingRelease | null>(null);
  const [vaultCooldownHours, setVaultCooldownHours] = useState(48);
  const [vaultLockAmount, setVaultLockAmount] = useState('');
  const [vaultUnlockAmount, setVaultUnlockAmount] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultTick, setVaultTick] = useState(0);
  const [vaultReleaseOpen, setVaultReleaseOpen] = useState(false);
  const [vaultReleasePin, setVaultReleasePin] = useState('');
  const [vaultReleasing, setVaultReleasing] = useState(false);

  // Completion step for progress bar (0–3: bank, number, name, ready)
  const formStep = [bankName, accountNumber.length === 10, accountName].filter(Boolean).length;

  const refreshVault = async () => {
    if (!user?.id) return;
    try {
      const res = await getDriverEarningsVault(user.id);
      const d = res.data;
      setVaultSpendable(Number(d.wallet_spendable) || 0);
      setVaultLocked(Number(d.vault_locked) || 0);
      setVaultPending(d.pending_release ?? null);
      if (typeof d.cooldown_hours === 'number') setVaultCooldownHours(d.cooldown_hours);
    } catch {
      setVaultSpendable(0); setVaultLocked(0); setVaultPending(null);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.id) { setInitialLoading(false); return; }
      try {
        const [bankRes, restrictionRes, vaultRes] = await Promise.all([
          getDriverBankDetails(user.id),
          getDriverPayoutRestrictions(user.id),
          getDriverEarningsVault(user.id).catch(() => null),
        ]);
        if (!active) return;
        const bankData = bankRes.data;
        setBankName(bankData.bank_name || '');
        setAccountNumber(bankData.account_number || '');
        setAccountName(bankData.account_name || '');
        setPayoutReady(Boolean(bankData.payout_ready));
        setPayoutMessage(bankData.message || 'Riders pay this account directly after completed trips.');
        setWithdrawAllowed(Boolean(restrictionRes.data?.can_withdraw_earnings));
        if (vaultRes?.data) {
          const vd = vaultRes.data;
          setVaultSpendable(Number(vd.wallet_spendable) || 0);
          setVaultLocked(Number(vd.vault_locked) || 0);
          setVaultPending(vd.pending_release ?? null);
          if (typeof vd.cooldown_hours === 'number') setVaultCooldownHours(vd.cooldown_hours);
        }
      } catch {
        if (!active) return;
        setPayoutReady(false); setWithdrawAllowed(false);
      } finally {
        if (active) setInitialLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!vaultPending?.release_available_at) return;
    const id = setInterval(() => setVaultTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, [vaultPending?.release_available_at]);

  const vaultCountdownLabel = (() => {
    if (!vaultPending?.release_available_at) return '';
    const end = new Date(vaultPending.release_available_at).getTime();
    const ms = end - Date.now();
    void vaultTick;
    if (ms <= 0) return 'Cooldown complete — confirm with your driver PIN and a face scan.';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m until you can release to your spendable wallet.`;
  })();

  const vaultReleaseCooldownDone = (() => {
    if (!vaultPending?.release_available_at) return false;
    void vaultTick;
    return new Date(vaultPending.release_available_at).getTime() <= Date.now();
  })();

  // Auto-verify when 10 digits entered and bank selected
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
      const res = await fetch(`${BACKEND_URL}/api/drivers/${user?.id}/verify-bank`, {
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
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user?.id}/bank-details`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_name: bankName, account_number: accountNumber, account_name: accountName }),
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

  const handleBiometricWithdraw = async () => {
    if (!user?.id) return;
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid withdrawal amount.');
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required for biometric withdrawal.');
      return;
    }
    const capture = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.7, base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (capture.canceled || !capture.assets?.[0]?.base64) return;
    setWithdrawing(true);
    try {
      const res = await withdrawDriverEarningsWithBiometric(user.id, {
        amount, face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
      });
      const data = res.data;
      Alert.alert('Withdrawal secured', `${data.message}\n\nAmount: ₦${Math.round(data.withdrawn_amount).toLocaleString()}\nRemaining: ₦${Math.round(data.remaining_balance).toLocaleString()}`);
      setWithdrawAmount('');
      await refreshVault();
    } catch (error: any) {
      Alert.alert('Withdrawal failed', error?.response?.data?.detail || 'Could not process withdrawal.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleVaultLock = async () => {
    if (!user?.id) return;
    const amount = Number(vaultLockAmount);
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('Invalid amount', 'Enter how much to move into the vault.'); return; }
    setVaultBusy(true);
    try {
      const res = await lockDriverEarningsVault(user.id, amount);
      setVaultLockAmount('');
      await refreshVault();
      Alert.alert('Vault updated', res.data.message);
    } catch (error: any) {
      Alert.alert('Could not lock', error?.response?.data?.detail || 'Try again.');
    } finally { setVaultBusy(false); }
  };

  const handleVaultUnlockRequest = async () => {
    if (!user?.id) return;
    const amount = Number(vaultUnlockAmount);
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('Invalid amount', 'Enter how much to release from the vault.'); return; }
    setVaultBusy(true);
    try {
      const res = await requestDriverEarningsVaultUnlock(user.id, amount);
      setVaultUnlockAmount('');
      setVaultPending(res.data.pending_release);
      Alert.alert('Unlock started', res.data.message);
    } catch (error: any) {
      Alert.alert('Unlock request failed', error?.response?.data?.detail || 'Try again.');
    } finally { setVaultBusy(false); }
  };

  const handleVaultConfirmRelease = async () => {
    if (!user?.id) return;
    if (!/^\d{4,8}$/.test(vaultReleasePin.trim())) { Alert.alert('PIN', 'Enter your 4–8 digit driver account PIN.'); return; }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') { Alert.alert('Permission needed', 'Camera permission is required to release vault funds.'); return; }
    const capture = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.7, base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (capture.canceled || !capture.assets?.[0]?.base64) return;
    setVaultReleasing(true);
    try {
      const res = await confirmDriverEarningsVaultRelease(user.id, {
        pin: vaultReleasePin.trim(),
        face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
      });
      setVaultReleaseOpen(false);
      setVaultReleasePin('');
      await refreshVault();
      Alert.alert('Funds released', `${res.data.message}\n\n₦${Math.round(res.data.released_amount).toLocaleString()} moved to your spendable wallet.`);
    } catch (error: any) {
      Alert.alert('Release failed', error?.response?.data?.detail || 'Could not complete vault release.');
    } finally { setVaultReleasing(false); }
  };

  const filteredBanks = NIGERIAN_BANKS.filter(b => b.toLowerCase().includes(searchQuery.toLowerCase()));
  const formComplete = Boolean(bankName && accountNumber.length === 10 && accountName);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Bank Details</Text>
          </View>
          {payoutReady && (
            <View style={styles.payoutReadyPill}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={styles.payoutReadyText}>Verified</Text>
            </View>
          )}
        </View>

        {/* ── Progress bar ── */}
        <ProgressBar step={formStep} total={3} />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 20) + 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Status banner ── */}
            <View style={[styles.statusBanner, payoutReady ? styles.statusBannerReady : styles.statusBannerPending]}>
              <View style={[styles.statusIcon, { backgroundColor: payoutReady ? '#D1FAE5' : '#FEF3C7' }]}>
                <Ionicons
                  name={payoutReady ? 'shield-checkmark' : 'alert-circle'}
                  size={20}
                  color={payoutReady ? '#16A34A' : '#D97706'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {payoutReady ? 'Payout route active' : 'Setup required to receive payments'}
                </Text>
                <Text style={styles.statusSub}>{payoutMessage}</Text>
              </View>
            </View>

            {/* ── SECTION 1: Bank Form ── */}
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

              {/* Bank selector */}
              <Text style={styles.fieldLabel}>Select Your Bank <Text style={styles.required}>*</Text></Text>
              <TouchableOpacity
                style={[styles.selector, bankName ? styles.selectorFilled : null]}
                onPress={() => setShowBankModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="business"
                  size={20}
                  color={bankName ? '#16A34A' : '#94A3B8'}
                />
                <Text style={[styles.selectorText, !bankName && styles.placeholder]}>
                  {bankName || 'Choose your bank'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Account number */}
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
                  onChangeText={v => {
                    setAccountNumber(v);
                    if (v.length < 10) { setAccountName(''); setVerifyError(''); }
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

              {/* Account name */}
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

            {/* ── SECTION 2: Crypto (informational, non-blocking) ── */}
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
                {[{ symbol: '₿', label: 'BTC' }, { symbol: 'Ξ', label: 'ETH' }, { symbol: '$', label: 'USDT' }, { symbol: '$', label: 'USDC' }].map(c => (
                  <View key={c.label} style={styles.cryptoChip}>
                    <Text style={styles.cryptoChipText}>{c.symbol} {c.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── SECTION 3: Earnings & Vault (collapsible) ── */}
            {(vaultSpendable > 0 || vaultLocked > 0 || withdrawAllowed) && (
              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced(v => !v)}
                activeOpacity={0.88}
              >
                <Ionicons name="wallet-outline" size={18} color="#2563EB" />
                <Text style={styles.advancedToggleText}>Earnings & Vault</Text>
                <View style={styles.vaultTotalChip}>
                  <Text style={styles.vaultTotalText}>
                    ₦{(vaultSpendable + vaultLocked).toLocaleString()}
                  </Text>
                </View>
                <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={18} color="#64748B" />
              </TouchableOpacity>
            )}

            {showAdvanced && (
              <View style={styles.card}>
                {/* Vault balance summary */}
                <View style={styles.vaultGrid}>
                  <View style={[styles.vaultTile, { borderColor: '#BBF7D0' }]}>
                    <Ionicons name="wallet" size={18} color="#16A34A" />
                    <Text style={styles.vaultTileLabel}>Spendable</Text>
                    <Text style={[styles.vaultTileValue, { color: '#16A34A' }]}>
                      ₦{Math.round(vaultSpendable).toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.vaultTile, { borderColor: '#BFDBFE' }]}>
                    <Ionicons name="lock-closed" size={18} color="#2563EB" />
                    <Text style={styles.vaultTileLabel}>Locked</Text>
                    <Text style={[styles.vaultTileValue, { color: '#2563EB' }]}>
                      ₦{Math.round(vaultLocked).toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* Pending vault release */}
                {vaultPending ? (
                  <View style={styles.vaultPendingBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="hourglass" size={16} color="#D97706" />
                      <Text style={styles.vaultPendingTitle}>Pending release</Text>
                    </View>
                    <Text style={styles.vaultPendingAmount}>
                      ₦{Math.round(Number(vaultPending.amount) || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.fieldHint}>{vaultCountdownLabel}</Text>
                    <TouchableOpacity
                      style={[styles.actionBtn, { opacity: vaultReleaseCooldownDone ? 1 : 0.45, marginTop: SPACING.sm }]}
                      onPress={() => setVaultReleaseOpen(true)}
                      disabled={vaultReleasing || !vaultReleaseCooldownDone}
                    >
                      <Ionicons name="scan" size={16} color="#FFF" />
                      <Text style={styles.actionBtnText}>Confirm release (PIN + face)</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.fieldLabel, { marginBottom: SPACING.xs }]}>Move to vault (savings)</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="Amount (₦)"
                        value={vaultLockAmount}
                        onChangeText={setVaultLockAmount}
                        keyboardType="numeric"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={[styles.inlineBtn, vaultBusy && { opacity: 0.5 }]}
                        onPress={() => void handleVaultLock()}
                        disabled={vaultBusy}
                      >
                        {vaultBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.inlineBtnText}>Lock</Text>}
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.fieldLabel, { marginTop: SPACING.md, marginBottom: SPACING.xs }]}>
                      Request vault unlock (starts {vaultCooldownHours}h cooldown)
                    </Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="Amount to release (₦)"
                        value={vaultUnlockAmount}
                        onChangeText={setVaultUnlockAmount}
                        keyboardType="numeric"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={[styles.inlineBtn, { backgroundColor: '#EF4444' }, vaultBusy && { opacity: 0.5 }]}
                        onPress={() => void handleVaultUnlockRequest()}
                        disabled={vaultBusy}
                      >
                        {vaultBusy ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.inlineBtnText}>Unlock</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* Biometric withdrawal */}
                {withdrawAllowed && (
                  <>
                    <View style={styles.divider} />
                    <Text style={styles.fieldLabel}>Biometric Withdrawal</Text>
                    <Text style={styles.fieldHint}>
                      Your face must match your registered driver identity to process a withdrawal.
                    </Text>
                    <View style={[styles.inputRow, { marginTop: SPACING.sm }]}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="Amount to withdraw (₦)"
                        value={withdrawAmount}
                        onChangeText={setWithdrawAmount}
                        keyboardType="numeric"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={[styles.inlineBtn, !withdrawAllowed && { opacity: 0.45 }]}
                        disabled={!withdrawAllowed || withdrawing}
                        onPress={() => void handleBiometricWithdraw()}
                      >
                        {withdrawing
                          ? <ActivityIndicator size="small" color="#FFF" />
                          : <Ionicons name="scan" size={18} color="#FFF" />}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
          </ScrollView>

          {/* ── Sticky Save Button (bottom, not absolute-positioned over content) ── */}
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

      {/* ── Bank Picker Modal ── */}
      <Modal visible={showBankModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Your Bank</Text>
            <TouchableOpacity onPress={() => { setShowBankModal(false); setSearchQuery(''); }}>
              <Ionicons name="close" size={28} color="#0F172A" />
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
            {filteredBanks.map(bank => (
              <TouchableOpacity
                key={bank}
                style={[styles.bankItem, bankName === bank && styles.bankItemSelected]}
                onPress={() => { setBankName(bank); setShowBankModal(false); setSearchQuery(''); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <View style={[styles.bankItemIcon, bankName === bank && { backgroundColor: '#D1FAE5' }]}>
                  <Ionicons name="business" size={18} color={bankName === bank ? '#16A34A' : '#64748B'} />
                </View>
                <Text style={[styles.bankItemText, bankName === bank && { color: '#16A34A', fontWeight: '800' }]}>
                  {bank}
                </Text>
                {bankName === bank && <Ionicons name="checkmark-circle" size={20} color="#16A34A" />}
              </TouchableOpacity>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Vault Release Modal ── */}
      <Modal visible={vaultReleaseOpen} animationType="slide" transparent>
        <View style={styles.overlayBackdrop}>
          <View style={styles.overlayCard}>
            <Text style={styles.modalTitle}>Confirm Vault Release</Text>
            <Text style={[styles.fieldHint, { marginTop: 4 }]}>
              Enter your driver PIN, then take a selfie for face verification. Only works after the {vaultCooldownHours}-hour cooldown.
            </Text>
            <TextInput
              style={[styles.input, { marginTop: SPACING.md }]}
              placeholder="Driver PIN (4–8 digits)"
              value={vaultReleasePin}
              onChangeText={setVaultReleasePin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholderTextColor="#94A3B8"
            />
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
              <TouchableOpacity
                style={[styles.inlineBtn, { flex: 1, backgroundColor: '#F1F5F9', paddingVertical: 14 }]}
                onPress={() => { setVaultReleaseOpen(false); setVaultReleasePin(''); }}
              >
                <Text style={[styles.inlineBtnText, { color: '#374151' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1, opacity: vaultReleasing ? 0.6 : 1 }]}
                onPress={() => void handleVaultConfirmRelease()}
                disabled={vaultReleasing}
              >
                {vaultReleasing
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <><Ionicons name="scan" size={16} color="#FFF" /><Text style={styles.actionBtnText}>Scan Face</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 } }),
    elevation: 2,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#0F172A' },
  payoutReadyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1, borderColor: '#BBF7D0',
  },
  payoutReadyText: { fontSize: 12, fontWeight: '800', color: '#16A34A' },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.md, borderRadius: 14, marginBottom: SPACING.lg,
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
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 } }),
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  sectionBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionBadgeText: { fontSize: 13, fontWeight: '900' },
  cardTitle: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '800', color: '#0F172A' },
  activeBadge: {
    backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '900', color: '#16A34A', letterSpacing: 0.5 },
  comingSoonBadge: {
    backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, borderWidth: 1, borderColor: '#FDE68A',
  },
  comingSoonText: { fontSize: 10, fontWeight: '900', color: '#D97706', letterSpacing: 0.5 },
  cardDesc: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#374151', marginBottom: 6 },
  required: { color: '#EF4444' },
  selector: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: SPACING.md,
    borderWidth: 2, borderColor: '#E2E8F0',
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
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.sm,
  },
  verifyingText: { fontSize: 12, color: '#2563EB', fontWeight: '700' },
  fieldHint: { fontSize: 12, color: '#94A3B8', marginTop: 5, fontWeight: '500' },
  verifyError: { fontSize: 12, color: '#EF4444', marginTop: 5, fontWeight: '600' },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  verifiedRowText: { fontSize: 12, color: '#16A34A', fontWeight: '700' },
  securityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: SPACING.md, paddingTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  securityText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  cryptoCoins: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cryptoChip: {
    backgroundColor: '#FFFBEB', borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  cryptoChipText: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  advancedToggle: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#FFF', borderRadius: 14, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: '#DBEAFE',
  },
  advancedToggleText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#1D4ED8' },
  vaultTotalChip: {
    backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
  },
  vaultTotalText: { fontSize: 12, fontWeight: '800', color: '#2563EB' },
  vaultGrid: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  vaultTile: {
    flex: 1, borderRadius: 12, padding: SPACING.md,
    alignItems: 'center', backgroundColor: '#F8FAFC',
    borderWidth: 1, gap: 4,
  },
  vaultTileLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 4 },
  vaultTileValue: { fontSize: FONT_SIZE.md, fontWeight: '900' },
  vaultPendingBox: {
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: '#FDE68A', marginBottom: SPACING.sm,
  },
  vaultPendingTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: '#92400E' },
  vaultPendingAmount: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: '#D97706', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: SPACING.md },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
  },
  actionBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: '#FFF' },
  inlineBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 70,
  },
  inlineBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  saveBar: {
    backgroundColor: '#FFF',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8 } }),
    elevation: 8,
  },
  saveBtn: { borderRadius: 14, overflow: 'hidden' },
  saveBtnDisabled: { opacity: 0.55 },
  saveGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 17, gap: SPACING.sm,
  },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  savedConfirm: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#F0FDF4', borderRadius: 14, paddingVertical: 17,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  savedConfirmText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: '#16A34A' },
  // Bank picker modal
  modalRoot: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#0F172A' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    margin: SPACING.lg, paddingHorizontal: SPACING.md,
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 2, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: FONT_SIZE.md, color: '#0F172A' },
  bankItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#FFF', padding: SPACING.md,
    marginHorizontal: SPACING.lg, marginBottom: 6,
    borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9',
  },
  bankItemSelected: { borderColor: '#86EFAC', backgroundColor: '#F0FDF4' },
  bankItemIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  bankItemText: { flex: 1, fontSize: FONT_SIZE.md, color: '#374151', fontWeight: '600' },
  // Vault release overlay
  overlayBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', padding: SPACING.xl,
  },
  overlayCard: { backgroundColor: '#FFF', borderRadius: 20, padding: SPACING.xl },
});
