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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface FuelEntry {
  id: string;
  date: string;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  odometer: number;
  station: string;
  efficiency?: number;
}

export default function FuelTrackerScreen() {
  const router = useRouter();
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([
    {
      id: '1',
      date: 'Today, 10:30 AM',
      liters: 45,
      pricePerLiter: 617,
      totalCost: 27765,
      odometer: 45230,
      station: 'Total Energies, Lekki',
      efficiency: 12.5,
    },
    {
      id: '2',
      date: 'Yesterday, 2:15 PM',
      liters: 40,
      pricePerLiter: 615,
      totalCost: 24600,
      odometer: 44730,
      station: 'Mobil, VI',
      efficiency: 12.8,
    },
    {
      id: '3',
      date: 'Jan 28, 3:45 PM',
      liters: 42,
      pricePerLiter: 612,
      totalCost: 25704,
      odometer: 44230,
      station: 'Conoil, Ikoyi',
      efficiency: 13.2,
    },
  ]);

  // Calculate statistics
  const totalSpent = fuelEntries.reduce((sum, entry) => sum + entry.totalCost, 0);
  const totalLiters = fuelEntries.reduce((sum, entry) => sum + entry.liters, 0);
  const avgEfficiency = fuelEntries
    .filter(e => e.efficiency)
    .reduce((sum, entry) => sum + (entry.efficiency || 0), 0) / fuelEntries.length;
  const avgPricePerLiter = totalSpent / totalLiters;

  const handleAddFuel = () => {
    Alert.alert('Add Fuel Entry', 'Feature coming soon!');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryLight]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Ionicons name="water" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Fuel Tracker</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={handleAddFuel}>
            <Ionicons name="add" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Statistics Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
                style={styles.statGradient}
              >
                <Ionicons name="cash" size={32} color={COLORS.white} />
                <Text style={styles.statValue}>₦{totalSpent.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Total Spent</Text>
              </LinearGradient>
            </View>

            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.accentBlue, COLORS.accentBlueDark]}
                style={styles.statGradient}
              >
                <Ionicons name="water" size={32} color={COLORS.white} />
                <Text style={styles.statValue}>{totalLiters.toFixed(1)}L</Text>
                <Text style={styles.statLabel}>Total Liters</Text>
              </LinearGradient>
            </View>

            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.accentOrange, '#D97706']}
                style={styles.statGradient}
              >
                <Ionicons name="speedometer" size={32} color={COLORS.white} />
                <Text style={styles.statValue}>{avgEfficiency.toFixed(1)} km/L</Text>
                <Text style={styles.statLabel}>Avg Efficiency</Text>
              </LinearGradient>
            </View>

            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.accentPurple, '#7C3AED']}
                style={styles.statGradient}
              >
                <Ionicons name="trending-up" size={32} color={COLORS.white} />
                <Text style={styles.statValue}>₦{avgPricePerLiter.toFixed(0)}</Text>
                <Text style={styles.statLabel}>Avg Price/L</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Efficiency Insights */}
          <View style={styles.insightsCard}>
            <View style={styles.insightsHeader}>
              <Ionicons name="bulb" size={24} color={COLORS.accentGreen} />
              <Text style={styles.insightsTitle}>💡 Fuel Insights</Text>
            </View>
            <View style={styles.insightsList}>
              <View style={styles.insightItem}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                <Text style={styles.insightText}>
                  Your fuel efficiency is {avgEfficiency.toFixed(1)} km/L - Good!
                </Text>
              </View>
              <View style={styles.insightItem}>
                <Ionicons name="trending-down" size={20} color={COLORS.accentBlue} />
                <Text style={styles.insightText}>
                  Fuel prices dropped by ₦5 from last week
                </Text>
              </View>
              <View style={styles.insightItem}>
                <Ionicons name="car-sport" size={20} color={COLORS.accentOrange} />
                <Text style={styles.insightText}>
                  Drive at 60-80 km/h for optimal efficiency
                </Text>
              </View>
            </View>
          </View>

          {/* Fuel History */}
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Fuel History</Text>
            {fuelEntries.map((entry) => (
              <View key={entry.id} style={styles.fuelCard}>
                <View style={styles.fuelHeader}>
                  <View style={styles.fuelIcon}>
                    <Ionicons name="water" size={24} color={COLORS.accentBlue} />
                  </View>
                  <View style={styles.fuelInfo}>
                    <Text style={styles.fuelStation}>{entry.station}</Text>
                    <Text style={styles.fuelDate}>{entry.date}</Text>
                  </View>
                  <View style={styles.fuelCost}>
                    <Text style={styles.fuelCostValue}>₦{entry.totalCost.toLocaleString()}</Text>
                    {entry.efficiency && (
                      <View style={styles.efficiencyBadge}>
                        <Ionicons name="leaf" size={12} color={COLORS.accentGreen} />
                        <Text style={styles.efficiencyText}>{entry.efficiency} km/L</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.fuelDetails}>
                  <View style={styles.fuelDetailItem}>
                    <Text style={styles.fuelDetailLabel}>Liters</Text>
                    <Text style={styles.fuelDetailValue}>{entry.liters}L</Text>
                  </View>
                  <View style={styles.fuelDetailSeparator} />
                  <View style={styles.fuelDetailItem}>
                    <Text style={styles.fuelDetailLabel}>Price/L</Text>
                    <Text style={styles.fuelDetailValue}>₦{entry.pricePerLiter}</Text>
                  </View>
                  <View style={styles.fuelDetailSeparator} />
                  <View style={styles.fuelDetailItem}>
                    <Text style={styles.fuelDetailLabel}>Odometer</Text>
                    <Text style={styles.fuelDetailValue}>{entry.odometer.toLocaleString()} km</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Tips Section */}
          <View style={styles.tipsSection}>
            <Text style={styles.tipsTitle}>⛽ Fuel Saving Tips</Text>
            <View style={styles.tipCard}>
              <Text style={styles.tipNumber}>1</Text>
              <Text style={styles.tipText}>Maintain steady speed • Save up to 20%</Text>
            </View>
            <View style={styles.tipCard}>
              <Text style={styles.tipNumber}>2</Text>
              <Text style={styles.tipText}>Check tire pressure weekly • Improve efficiency</Text>
            </View>
            <View style={styles.tipCard}>
              <Text style={styles.tipNumber}>3</Text>
              <Text style={styles.tipText}>Avoid idling • Turn off engine when parked</Text>
            </View>
            <View style={styles.tipCard}>
              <Text style={styles.tipNumber}>4</Text>
              <Text style={styles.tipText}>Use AC wisely • Open windows at low speeds</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  statCard: {
    width: '48%',
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  statGradient: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  insightsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  insightsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  insightsList: {
    gap: SPACING.md,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  insightText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    lineHeight: 20,
  },
  historySection: {
    marginBottom: SPACING.lg,
  },
  historyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  fuelCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  fuelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  fuelIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentBlueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fuelInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  fuelStation: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  fuelDate: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextMuted,
  },
  fuelCost: {
    alignItems: 'flex-end',
  },
  fuelCostValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  efficiencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
    gap: 4,
  },
  efficiencyText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  fuelDetails: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
  },
  fuelDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  fuelDetailLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
    marginBottom: 4,
  },
  fuelDetailValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  fuelDetailSeparator: {
    width: 1,
    backgroundColor: COLORS.lightBorder,
    marginHorizontal: SPACING.sm,
  },
  tipsSection: {
    marginTop: SPACING.lg,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  tipNumber: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.accentGreen,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    lineHeight: 28,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
});
