import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function RiderWalletScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>₦0.00</Text>
          <Text style={styles.balanceSubtext}>Add funds to pay for rides</Text>
        </View>

        {/* Payment Methods */}
        <Text style={styles.sectionTitle}>Payment Methods</Text>
        <View style={styles.paymentCard}>
          <View style={[styles.paymentIcon, { backgroundColor: COLORS.successSoft }]}>
            <Ionicons name="cash" size={24} color={COLORS.success} />
          </View>
          <View style={styles.paymentContent}>
            <Text style={styles.paymentTitle}>Cash</Text>
            <Text style={styles.paymentDesc}>Pay driver directly</Text>
          </View>
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        </View>
        
        <View style={styles.paymentCard}>
          <View style={[styles.paymentIcon, { backgroundColor: COLORS.infoSoft }]}>
            <Ionicons name="card" size={24} color={COLORS.info} />
          </View>
          <View style={styles.paymentContent}>
            <Text style={styles.paymentTitle}>Bank Transfer</Text>
            <Text style={styles.paymentDesc}>Transfer to driver's account</Text>
          </View>
        </View>
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
    paddingVertical: SPACING.lg,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  content: {
    padding: SPACING.lg,
  },
  balanceCard: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
  },
  balanceLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  balanceAmount: {
    fontSize: FONT_SIZE.display,
    fontWeight: '800',
    color: COLORS.accent,
    marginVertical: SPACING.sm,
  },
  balanceSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentContent: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  paymentTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  paymentDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  defaultBadge: {
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  defaultBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.success,
  },
});
