import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
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

// Complete list of ALL Nigerian banks
const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank of Nigeria',
  'First City Monument Bank (FCMB)', 'Globus Bank', 'Guaranty Trust Bank (GTBank)',
  'Heritage Bank', 'Keystone Bank', 'Polaris Bank', 'Providus Bank',
  'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Sterling Bank',
  'SunTrust Bank', 'Titan Trust Bank', 'Union Bank of Nigeria',
  'United Bank for Africa (UBA)', 'Unity Bank', 'Wema Bank', 'Zenith Bank',
  // Digital Banks
  'Kuda Bank', 'ALAT by Wema', 'Rubies Bank', 'VFD Microfinance Bank',
  // Payment Banks
  'OPay', 'PalmPay', 'Moniepoint', 'Paga', 'Carbon',
].sort();

export default function BankDetailsScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [payoutReady, setPayoutReady] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState('Add your bank details to receive direct rider payments.');
  const [withdrawAllowed, setWithdrawAllowed] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

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
      setVaultSpendable(0);
      setVaultLocked(0);
      setVaultPending(null);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.id) {
        setInitialLoading(false);
        return;
      }
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
        setPayoutReady(false);
        setWithdrawAllowed(false);
      } finally {
        if (active) setInitialLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
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

  const handleVaultLock = async () => {
    if (!user?.id) return;
    const amount = Number(vaultLockAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter how much to move into the vault.');
      return;
    }
    setVaultBusy(true);
    try {
      const res = await lockDriverEarningsVault(user.id, amount);
      setVaultLockAmount('');
      await refreshVault();
      Alert.alert('Vault updated', res.data.message);
    } catch (error: any) {
      Alert.alert('Could not lock', error?.response?.data?.detail || 'Try again.');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleVaultUnlockRequest = async () => {
    if (!user?.id) return;
    const amount = Number(vaultUnlockAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter how much to release from the vault.');
      return;
    }
    setVaultBusy(true);
    try {
      const res = await requestDriverEarningsVaultUnlock(user.id, amount);
      setVaultUnlockAmount('');
      setVaultPending(res.data.pending_release);
      Alert.alert('Unlock started', res.data.message);
    } catch (error: any) {
      Alert.alert('Unlock request failed', error?.response?.data?.detail || 'Try again.');
    } finally {
      setVaultBusy(false);
    }
  };

  const handleVaultConfirmRelease = async () => {
    if (!user?.id) return;
    if (!/^\d{4,8}$/.test(vaultReleasePin.trim())) {
      Alert.alert('PIN', 'Enter your 4–8 digit driver account PIN.');
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to release vault funds.');
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
    setVaultReleasing(true);
    try {
      const res = await confirmDriverEarningsVaultRelease(user.id, {
        pin: vaultReleasePin.trim(),
        face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
      });
      setVaultReleaseOpen(false);
      setVaultReleasePin('');
      await refreshVault();
      Alert.alert(
        'Funds released',
        `${res.data.message}\n\n₦${Math.round(res.data.released_amount).toLocaleString()} moved to your spendable wallet.`,
      );
    } catch (error: any) {
      Alert.alert('Release failed', error?.response?.data?.detail || 'Could not complete vault release.');
    } finally {
      setVaultReleasing(false);
    }
  };

  const filteredBanks = NIGERIAN_BANKS.filter(bank =>
    bank.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleVerifyAccount = async () => {
    if (!bankName) {
      Alert.alert('Required', 'Please select your bank');
      return;
    }
    if (!accountNumber || accountNumber.length !== 10) {
      Alert.alert('Invalid', 'Please enter a valid 10-digit account number');
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/drivers/${user?.id}/verify-bank`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ bank_name: bankName, account_number: accountNumber }),
      });
      const data = await res.json();
      if (data.account_name) {
        setAccountName(data.account_name);
        Alert.alert('Verified!', `Account name: ${data.account_name}`);
      } else {
        Alert.alert(
          'Enter Manually',
          'Please enter your account name exactly as it appears on your bank statement.',
        );
      }
    } catch {
      Alert.alert(
        'Enter Manually',
        'Please enter your account name exactly as it appears on your bank statement.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!bankName || !accountNumber || !accountName) {
      Alert.alert('Incomplete', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user?.id}/bank-details`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
        }),
      });

      if (response.ok) {
        Alert.alert('✅ Saved!', 'Your bank details have been updated', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('Error', 'Could not save bank details');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
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
      allowsEditing: false,
      quality: 0.7,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (capture.canceled || !capture.assets?.[0]?.base64) return;
    setWithdrawing(true);
    try {
      const res = await withdrawDriverEarningsWithBiometric(user.id, {
        amount,
        face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
      });
      const data = res.data;
      Alert.alert(
        'Withdrawal secured',
        `${data.message}\n\nAmount: ₦${Math.round(data.withdrawn_amount).toLocaleString()}\nRemaining balance: ₦${Math.round(data.remaining_balance).toLocaleString()}`,
      );
      setWithdrawAmount('');
      await refreshVault();
    } catch (error: any) {
      Alert.alert('Withdrawal failed', error?.response?.data?.detail || 'Could not process biometric withdrawal.');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bank Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.readinessCard}>
            <View style={styles.readinessHeader}>
              <View style={[styles.readinessIcon, { backgroundColor: payoutReady ? COLORS.successSoft : COLORS.warningSoft }]}>
                <Ionicons
                  name={payoutReady ? 'checkmark-circle' : 'alert-circle'}
                  size={22}
                  color={payoutReady ? COLORS.success : COLORS.warning}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.readinessTitle}>
                  {payoutReady ? 'Payout route ready' : 'Payout setup required'}
                </Text>
                <Text style={styles.readinessText}>{payoutMessage}</Text>
              </View>
            </View>
            <View style={styles.readinessMetaRow}>
              <View style={styles.readinessChip}>
                <Text style={styles.readinessChipLabel}>
                  {withdrawAllowed ? 'Earnings access enabled' : 'Subscription access required'}
                </Text>
              </View>
              <View style={styles.readinessChip}>
                <Text style={styles.readinessChipLabel}>Direct rider payment</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Biometric Earnings Withdrawal</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount to withdraw (NGN)"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              placeholderTextColor={COLORS.lightTextMuted}
            />
            <TouchableOpacity
              style={[styles.verifyButton, (!withdrawAllowed || withdrawing) && { opacity: 0.6, alignSelf: 'stretch', marginTop: 10 }]}
              disabled={!withdrawAllowed || withdrawing}
              onPress={() => void handleBiometricWithdraw()}
            >
              {withdrawing ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.verifyText}>Withdraw with Face Scan</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.helperText}>
              Withdrawal only succeeds when your live face matches your registered driver identity.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Earnings Vault</Text>
            <Text style={styles.helperText}>
              Lock part of your in-app balance as savings. Locked funds cannot be bank-withdrawn. To move them back,
              you start a {vaultCooldownHours}-hour cooldown, then confirm with your driver PIN and a face scan.
            </Text>
            <View style={styles.vaultSummary}>
              <View style={styles.vaultStat}>
                <Text style={styles.vaultStatLabel}>Spendable in app</Text>
                <Text style={styles.vaultStatValue}>₦{Math.round(vaultSpendable).toLocaleString()}</Text>
              </View>
              <View style={styles.vaultStat}>
                <Text style={styles.vaultStatLabel}>Locked in vault</Text>
                <Text style={styles.vaultStatValue}>₦{Math.round(vaultLocked).toLocaleString()}</Text>
              </View>
            </View>
            {vaultPending ? (
              <View style={styles.vaultPendingBox}>
                <Text style={styles.vaultPendingTitle}>Pending release</Text>
                <Text style={styles.vaultPendingAmount}>
                  ₦{Math.round(Number(vaultPending.amount) || 0).toLocaleString()}
                </Text>
                <Text style={styles.helperText}>{vaultCountdownLabel}</Text>
                <TouchableOpacity
                  style={[
                    styles.verifyButton,
                    { marginTop: SPACING.sm, alignSelf: 'stretch', opacity: vaultReleaseCooldownDone ? 1 : 0.5 },
                  ]}
                  onPress={() => setVaultReleaseOpen(true)}
                  disabled={vaultReleasing || !vaultReleaseCooldownDone}
                >
                  <Text style={styles.verifyText}>Confirm release (PIN + face)</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {!vaultPending ? (
              <>
                <TextInput
                  style={[styles.input, { marginTop: SPACING.sm }]}
                  placeholder="Amount to lock (NGN)"
                  value={vaultLockAmount}
                  onChangeText={setVaultLockAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.lightTextMuted}
                />
                <TouchableOpacity
                  style={[styles.verifyButton, { marginTop: SPACING.sm, alignSelf: 'stretch', opacity: vaultBusy ? 0.6 : 1 }]}
                  onPress={() => void handleVaultLock()}
                  disabled={vaultBusy}
                >
                  <Text style={styles.verifyText}>Move to vault</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, { marginTop: SPACING.md }]}
                  placeholder="Amount to unlock from vault (starts cooldown)"
                  value={vaultUnlockAmount}
                  onChangeText={setVaultUnlockAmount}
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.lightTextMuted}
                />
                <TouchableOpacity
                  style={[styles.verifyButton, { marginTop: SPACING.sm, alignSelf: 'stretch', opacity: vaultBusy ? 0.6 : 1 }]}
                  onPress={() => void handleVaultUnlockRequest()}
                  disabled={vaultBusy}
                >
                  <Text style={styles.verifyText}>Request vault unlock</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          <Modal visible={vaultReleaseOpen} animationType="slide" transparent>
            <View style={styles.vaultModalBackdrop}>
              <View style={styles.vaultModalCard}>
                <Text style={styles.modalTitle}>Confirm vault release</Text>
                <Text style={styles.helperText}>
                  Enter your driver PIN, then you will take a selfie for face match. This only works after the{' '}
                  {vaultCooldownHours}-hour cooldown.
                </Text>
                <TextInput
                  style={[styles.input, { marginTop: SPACING.md }]}
                  placeholder="Driver PIN"
                  value={vaultReleasePin}
                  onChangeText={setVaultReleasePin}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={8}
                  placeholderTextColor={COLORS.lightTextMuted}
                />
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
                  <TouchableOpacity
                    style={[styles.verifyButton, { flex: 1, backgroundColor: COLORS.lightSurface }]}
                    onPress={() => {
                      setVaultReleaseOpen(false);
                      setVaultReleasePin('');
                    }}
                  >
                    <Text style={[styles.verifyText, { color: COLORS.lightTextPrimary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.verifyButton, { flex: 1, opacity: vaultReleasing ? 0.6 : 1 }]}
                    onPress={() => void handleVaultConfirmRelease()}
                    disabled={vaultReleasing}
                  >
                    {vaultReleasing ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Text style={styles.verifyText}>Scan face</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Option Label */}
          <View style={styles.optionLabel}>
            <View style={[styles.optionBadge, { backgroundColor: COLORS.accentGreen }]}>
              <Text style={styles.optionBadgeText}>1</Text>
            </View>
            <Text style={styles.optionText}>Bank Transfer (Active)</Text>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark" size={32} color={COLORS.accentGreen} />
            <Text style={styles.infoTitle}>Direct Payment from Riders</Text>
            <Text style={styles.infoText}>
              Riders pay you directly to this bank account after each trip. No middleman, no delays — you receive 100% of your fare instantly.
            </Text>
          </View>

          {/* Bank Selection */}
          <View style={styles.section}>
            <Text style={styles.label}>Select Your Bank *</Text>
            <TouchableOpacity 
              style={styles.bankSelector}
              onPress={() => setShowBankModal(true)}
            >
              <Ionicons name="business" size={24} color={bankName ? COLORS.accentGreen : COLORS.lightTextMuted} />
              <Text style={[styles.bankSelectorText, !bankName && styles.placeholderText]}>
                {bankName || 'Choose your bank'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={COLORS.lightTextSecondary} />
            </TouchableOpacity>
          </View>

          {/* Account Number */}
          <View style={styles.section}>
            <Text style={styles.label}>Account Number *</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="10-digit account number"
                value={accountNumber}
                onChangeText={setAccountNumber}
                keyboardType="number-pad"
                maxLength={10}
                placeholderTextColor={COLORS.lightTextMuted}
              />
              {accountNumber.length === 10 && bankName && (
                <TouchableOpacity 
                  style={styles.verifyButton}
                  onPress={handleVerifyAccount}
                  disabled={verifying}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.verifyText}>Verify</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Account Name */}
          <View style={styles.section}>
            <Text style={styles.label}>Account Name *</Text>
            <TextInput
              style={[styles.input, accountName && styles.inputVerified]}
              placeholder="Enter name exactly as on your bank account"
              value={accountName}
              onChangeText={setAccountName}
              placeholderTextColor={COLORS.lightTextMuted}
              autoCapitalize="words"
            />
            <Text style={styles.helperText}>
              This name will be shown to riders for payment confirmation
            </Text>
          </View>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <Ionicons name="lock-closed" size={16} color={COLORS.accentGreen} />
            <Text style={styles.securityText}>
              🔒 Your banking information is encrypted end-to-end
            </Text>
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={[styles.saveButton, (!bankName || !accountNumber || !accountName) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!bankName || !accountNumber || !accountName || loading || initialLoading}
          >
            <LinearGradient
              colors={(!bankName || !accountNumber || !accountName) 
                ? [COLORS.lightBorder, COLORS.lightBorder]
                : [COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.saveGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
                  <Text style={styles.saveText}>Save Bank Details</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Option 2: Crypto Coming Soon */}
          <View style={styles.cryptoOption}>
            <View style={styles.optionLabel}>
              <View style={[styles.optionBadge, { backgroundColor: '#F7931A' }]}>
                <Text style={styles.optionBadgeText}>2</Text>
              </View>
              <Text style={styles.optionText}>Cryptocurrency</Text>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>COMING SOON</Text>
              </View>
            </View>
            <View style={styles.cryptoCard}>
              <View style={styles.cryptoRow}>
                <Ionicons name="logo-bitcoin" size={28} color="#F7931A" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cryptoTitle}>Crypto Wallet Payout</Text>
                  <Text style={styles.cryptoDesc}>Receive earnings in USDT, USDC, or BTC. Protect against Naira devaluation.</Text>
                </View>
              </View>
              <View style={styles.cryptoCoins}>
                <View style={styles.cryptoCoinChip}>
                  <Text style={styles.cryptoCoinText}>{'\u20BF'} BTC</Text>
                </View>
                <View style={styles.cryptoCoinChip}>
                  <Text style={styles.cryptoCoinText}>{'\u039E'} ETH</Text>
                </View>
                <View style={styles.cryptoCoinChip}>
                  <Text style={styles.cryptoCoinText}>$ USDT</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Bank Selection Modal */}
      <Modal
        visible={showBankModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Your Bank</Text>
            <TouchableOpacity onPress={() => setShowBankModal(false)}>
              <Ionicons name="close" size={28} color={COLORS.lightTextPrimary} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.lightTextSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search banks..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={COLORS.lightTextMuted}
            />
          </View>

          <ScrollView style={styles.bankList}>
            {filteredBanks.map((bank) => (
              <TouchableOpacity
                key={bank}
                style={styles.bankItem}
                onPress={() => {
                  setBankName(bank);
                  setShowBankModal(false);
                  setSearchQuery('');
                }}
              >
                <Ionicons name="business" size={24} color={COLORS.accentGreen} />
                <Text style={styles.bankItemText}>{bank}</Text>
                {bankName === bank && (
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  readinessCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  readinessHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  readinessIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  readinessText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    lineHeight: 20,
  },
  readinessMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  readinessChip: {
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  readinessChipLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextSecondary,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  bankSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    gap: SPACING.sm,
  },
  bankSelectorText: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    fontWeight: '600',
  },
  placeholderText: {
    color: COLORS.lightTextMuted,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  inputVerified: {
    borderColor: COLORS.accentGreen,
  },
  verifyButton: {
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  verifyText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: 4,
  },
  verifiedText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  helperText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
    marginTop: SPACING.xs,
    fontWeight: '600',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  securityText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  saveButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveGradient: {
    paddingVertical: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  saveText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  modalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    margin: SPACING.lg,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
  },
  bankList: {
    flex: 1,
  },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  bankItemText: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    fontWeight: '600',
  },
  optionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.md,
  },
  optionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBadgeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFF',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  comingSoonBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFF',
  },
  cryptoOption: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cryptoCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderStyle: 'dashed',
  },
  cryptoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  cryptoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400E',
  },
  cryptoDesc: {
    fontSize: 13,
    color: '#A16207',
    lineHeight: 18,
    marginTop: 2,
  },
  cryptoCoins: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.sm,
  },
  cryptoCoinChip: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cryptoCoinText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  vaultSummary: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  vaultStat: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  vaultStatLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextSecondary,
  },
  vaultStatValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginTop: 4,
  },
  vaultPendingBox: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.warningSoft,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  vaultPendingTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  vaultPendingAmount: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.warning,
    marginTop: 4,
  },
  vaultModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  vaultModalCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
});
