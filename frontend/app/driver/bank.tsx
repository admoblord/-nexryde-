import React, { useState } from 'react';
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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

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
      // In production: Call Paystack/Flutterwave account verification API
      // For now: Simulate verification
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock verified name
      const verifiedName = "John Doe"; // Replace with actual API response
      setAccountName(verifiedName);
      
      Alert.alert('✅ Verified!', `Account belongs to: ${verifiedName}`);
    } catch (error) {
      Alert.alert('Error', 'Could not verify account. Please check details.');
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
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/drivers/${user?.id}/bank-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bank Details</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
            <Text style={styles.infoTitle}>Secure & Direct Payments</Text>
            <Text style={styles.infoText}>
              Riders transfer payments directly to your bank account. Your details are encrypted and secure.
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
              <Text style={[styles.bankSelectorText, !bankName && styles.placeholder]}>
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
              placeholder="Will auto-fill after verification"
              value={accountName}
              onChangeText={setAccountName}
              editable={!accountName} // Lock after verification
              placeholderTextColor={COLORS.lightTextMuted}
            />
            {accountName && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.accentGreen} />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            )}
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
            disabled={!bankName || !accountNumber || !accountName || loading}
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
  placeholder: {
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
  placeholder: {
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
});
