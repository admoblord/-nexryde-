import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RiderWalletScreen() {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const balance = 5000;

  const quickAmounts = [1000, 2000, 5000, 10000];

  const transactions = [
    { id: '1', type: 'credit', description: 'Wallet Top-up', amount: 5000, date: 'Today, 3:45 PM' },
    { id: '2', type: 'debit', description: 'Trip to Lekki', amount: -2500, date: 'Today, 2:30 PM' },
    { id: '3', type: 'credit', description: 'Referral Bonus', amount: 500, date: 'Yesterday' },
    { id: '4', type: 'debit', description: 'Trip to Ikeja', amount: -1800, date: 'Yesterday' },
  ];

  const handleTopUp = () => {
    if (!amount || parseInt(amount) < 500) {
      Alert.alert('Invalid Amount', 'Minimum top-up is ₦500');
      return;
    }
    Alert.alert('Coming Soon', 'Wallet top-up will be available soon!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceValue}>{CURRENCY}{balance.toLocaleString()}</Text>
          <View style={styles.balanceActions}>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="add-circle" size={20} color={COLORS.white} />
              <Text style={styles.actionButtonText}>Top Up</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
              <Ionicons name="arrow-down-circle" size={20} color={COLORS.primary} />
              <Text style={[styles.actionButtonText, { color: COLORS.primary }]}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.topUpSection}>
          <Text style={styles.sectionTitle}>Quick Top-Up</Text>
          <View style={styles.quickAmounts}>
            {quickAmounts.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[
                  styles.quickAmountBtn,
                  amount === String(amt) && styles.quickAmountBtnActive
                ]}
                onPress={() => setAmount(String(amt))}
              >
                <Text style={[
                  styles.quickAmountText,
                  amount === String(amt) && styles.quickAmountTextActive
                ]}>
                  {CURRENCY}{amt.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.customAmount}>
            <Text style={styles.inputLabel}>Or enter custom amount</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.currencyPrefix}>{CURRENCY}</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.topUpButton} onPress={handleTopUp}>
            <Text style={styles.topUpButtonText}>Proceed to Pay</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {transactions.map((tx) => (
          <View key={tx.id} style={styles.transactionCard}>
            <View style={[
              styles.txIcon,
              { backgroundColor: tx.type === 'credit' ? COLORS.successSoft : COLORS.errorSoft }
            ]}>
              <Ionicons
                name={tx.type === 'credit' ? 'arrow-down' : 'arrow-up'}
                size={20}
                color={tx.type === 'credit' ? COLORS.success : COLORS.error}
              />
            </View>
            <View style={styles.txInfo}>
              <Text style={styles.txDescription}>{tx.description}</Text>
              <Text style={styles.txDate}>{tx.date}</Text>
            </View>
            <Text style={[
              styles.txAmount,
              { color: tx.type === 'credit' ? COLORS.success : COLORS.error }
            ]}>
              {tx.type === 'credit' ? '+' : ''}{CURRENCY}{Math.abs(tx.amount).toLocaleString()}
            </Text>
          </View>
        ))}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  content: {
    padding: SPACING.lg,
  },
  balanceCard: {
    backgroundColor: COLORS.primary,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  balanceLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
  balanceValue: {
    fontSize: FONT_SIZE.display,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.xs,
  },
  balanceActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  actionButtonSecondary: {
    backgroundColor: COLORS.white,
  },
  actionButtonText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  topUpSection: {
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  quickAmounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  quickAmountBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  quickAmountBtnActive: {
    backgroundColor: COLORS.primarySoft,
    borderColor: COLORS.primary,
  },
  quickAmountText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  quickAmountTextActive: {
    color: COLORS.primary,
  },
  customAmount: {
    marginTop: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray600,
    marginBottom: SPACING.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    paddingHorizontal: SPACING.md,
  },
  currencyPrefix: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.gray600,
    marginRight: SPACING.xs,
  },
  input: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.gray800,
  },
  topUpButton: {
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  topUpButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  txDescription: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  txDate: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
  },
  txAmount: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
});
