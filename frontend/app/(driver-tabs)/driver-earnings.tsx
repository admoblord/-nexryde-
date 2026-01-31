import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function DriverEarningsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Text style={styles.headerSubtext}>Keep 100% of your earnings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Total Earnings Card */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Total Earnings</Text>
          <Text style={styles.earningsAmount}>{CURRENCY}0</Text>
          <View style={styles.earningsPeriod}>
            <TouchableOpacity style={[styles.periodBtn, styles.periodBtnActive]}>
              <Text style={[styles.periodText, styles.periodTextActive]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.periodBtn}>
              <Text style={styles.periodText}>This Week</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.periodBtn}>
              <Text style={styles.periodText}>This Month</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="car" size={24} color={COLORS.info} />
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="time" size={24} color={COLORS.accent} />
            <Text style={styles.statValue}>0h</Text>
            <Text style={styles.statLabel}>Online</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="navigate" size={24} color={COLORS.success} />
            <Text style={styles.statValue}>0km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
        </View>

        {/* Zero Commission Banner */}
        <View style={styles.commissionBanner}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
          <View style={styles.commissionContent}>
            <Text style={styles.commissionTitle}>Zero Commission</Text>
            <Text style={styles.commissionText}>You keep 100% of every fare</Text>
          </View>
        </View>

        {/* Bank Account */}
        <TouchableOpacity 
          style={styles.bankCard}
          onPress={() => router.push('/driver/bank')}
        >
          <View style={styles.bankIcon}>
            <Ionicons name="card" size={24} color={COLORS.info} />
          </View>
          <View style={styles.bankContent}>
            <Text style={styles.bankTitle}>Bank Account</Text>
            <Text style={styles.bankText}>Set up for withdrawals</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
        </TouchableOpacity>
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
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  headerSubtext: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accent,
    marginTop: SPACING.xs,
  },
  content: {
    padding: SPACING.lg,
  },
  earningsCard: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.lg,
  },
  earningsLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  earningsAmount: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '900',
    color: COLORS.accent,
    marginVertical: SPACING.sm,
    textShadowColor: 'rgba(34, 197, 94, 0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  earningsPeriod: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  periodBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  periodBtnActive: {
    backgroundColor: COLORS.accent,
  },
  periodText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray400,
  },
  periodTextActive: {
    fontWeight: '900',
    color: COLORS.primary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#64748B',
    marginTop: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  commissionContent: {
    flex: 1,
  },
  commissionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.success,
  },
  commissionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.success,
    opacity: 0.9,
  },
  bankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    ...SHADOWS.sm,
  },
  bankIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  bankTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: '#0F172A',
  },
  bankText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#475569',
  },
});
