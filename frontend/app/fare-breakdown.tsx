import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

export default function FareBreakdownScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Fare Breakdown</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Total Fare Card */}
          <View style={styles.totalCard}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.totalGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.totalLabel}>Total Fare</Text>
              <Text style={styles.totalAmount}>{CURRENCY}2,220</Text>
              <View style={styles.adjustedBadge}>
                <Text style={styles.adjustedText}>Adjusted from {CURRENCY}2000</Text>
              </View>
            </LinearGradient>
          </View>

          {/* Trip Info */}
          <View style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <View style={[styles.driverAvatar, { backgroundColor: COLORS.accentGreenSoft }]}>
                <Text style={styles.driverInitial}>C</Text>
              </View>
              <View style={styles.tripInfo}>
                <Text style={styles.driverName}>Chukwuemeka Okafor</Text>
                <Text style={styles.tripMeta}>12.5 km • 35 min</Text>
              </View>
            </View>
            
            <View style={styles.routeContainer}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.accentGreen }]} />
                <Text style={styles.routeText}>Victoria Island, Lagos</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.accentBlue }]} />
                <Text style={styles.routeText}>Ikeja City Mall</Text>
              </View>
            </View>
          </View>

          {/* Fare Details */}
          <Text style={styles.sectionTitle}>Fare Details</Text>
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Base Fare</Text>
              <Text style={styles.detailValue}>{CURRENCY}500</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Distance (12.5 km)</Text>
              <Text style={styles.detailValue}>{CURRENCY}1,200</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Time (35 min)</Text>
              <Text style={styles.detailValue}>{CURRENCY}320</Text>
            </View>
            <View style={[styles.detailRow, styles.adjustmentRow]}>
              <Text style={styles.adjustmentLabel}>Traffic Adjustment</Text>
              <Text style={styles.adjustmentValue}>+{CURRENCY}200</Text>
            </View>
            <View style={[styles.detailRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{CURRENCY}2,220</Text>
            </View>
          </View>
        </ScrollView>

        {/* Done Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity 
            style={styles.doneButton}
            onPress={() => router.push('/rider-home')}
          >
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.doneGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.doneText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  totalCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  totalGradient: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: SPACING.xs,
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  adjustedBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  adjustedText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
  },
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  driverInitial: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  tripInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  tripMeta: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  routeContainer: {
    paddingLeft: SPACING.sm,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.lightBorder,
    marginLeft: 5,
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  detailsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  detailLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextSecondary,
  },
  detailValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  adjustmentRow: {
    borderBottomWidth: 0,
  },
  adjustmentLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gold,
  },
  adjustmentValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.gold,
  },
  totalRow: {
    borderBottomWidth: 0,
    borderTopWidth: 2,
    borderTopColor: COLORS.lightBorder,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
  },
  totalLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  totalValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.accentGreen,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  doneButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  doneGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  doneText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
