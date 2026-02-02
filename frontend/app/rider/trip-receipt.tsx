import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

export default function TripReceiptScreen() {
  const router = useRouter();

  const receipt = {
    id: 'NXR-2024-001234',
    date: 'February 2, 2026',
    time: '2:30 PM',
    pickup: 'Victoria Island, Lagos',
    dropoff: 'Lekki Phase 1, Lagos',
    distance: '8.5 km',
    duration: '25 mins',
    driver: {
      name: 'Emeka Okonkwo',
      rating: 4.9,
      car: 'Toyota Camry',
      plate: 'LAG 234 XY',
    },
    breakdown: {
      baseFare: 500,
      distance: 1700,
      time: 300,
      surge: 0,
      discount: -200,
    },
    total: 2300,
    paymentMethod: 'Wallet',
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `NEXRYDE Trip Receipt\n\nTrip ID: ${receipt.id}\nDate: ${receipt.date}\nFrom: ${receipt.pickup}\nTo: ${receipt.dropoff}\nTotal: ${CURRENCY}${receipt.total}\n\nThank you for riding with NEXRYDE!`,
      });
    } catch (error) {
      Alert.alert('Error', 'Could not share receipt');
    }
  };

  const handleDownload = () => {
    Alert.alert('✅ Downloaded', 'Receipt saved to your device');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Receipt</Text>
        <TouchableOpacity onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Receipt Header */}
        <View style={styles.receiptHeader}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>NEXRYDE</Text>
          </View>
          <Text style={styles.receiptId}>Receipt #{receipt.id}</Text>
          <Text style={styles.receiptDate}>{receipt.date} at {receipt.time}</Text>
        </View>

        {/* Trip Route */}
        <View style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.accentGreen }]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Pickup</Text>
              <Text style={styles.routeAddress}>{receipt.pickup}</Text>
            </View>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Dropoff</Text>
              <Text style={styles.routeAddress}>{receipt.dropoff}</Text>
            </View>
          </View>
        </View>

        {/* Trip Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="navigate" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{receipt.distance}</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{receipt.duration}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
        </View>

        {/* Driver Info */}
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverInitial}>{receipt.driver.name.charAt(0)}</Text>
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>{receipt.driver.name}</Text>
            <View style={styles.driverMeta}>
              <Ionicons name="star" size={14} color={COLORS.accent} />
              <Text style={styles.driverRating}>{receipt.driver.rating}</Text>
              <Text style={styles.driverCar}>{receipt.driver.car} • {receipt.driver.plate}</Text>
            </View>
          </View>
        </View>

        {/* Fare Breakdown */}
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Fare Breakdown</Text>
          
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Base Fare</Text>
            <Text style={styles.breakdownValue}>{CURRENCY}{receipt.breakdown.baseFare}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Distance ({receipt.distance})</Text>
            <Text style={styles.breakdownValue}>{CURRENCY}{receipt.breakdown.distance}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Time ({receipt.duration})</Text>
            <Text style={styles.breakdownValue}>{CURRENCY}{receipt.breakdown.time}</Text>
          </View>
          {receipt.breakdown.surge > 0 && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Surge Pricing</Text>
              <Text style={[styles.breakdownValue, { color: COLORS.warning }]}>+{CURRENCY}{receipt.breakdown.surge}</Text>
            </View>
          )}
          {receipt.breakdown.discount < 0 && (
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: COLORS.accentGreen }]}>Promo Discount</Text>
              <Text style={[styles.breakdownValue, { color: COLORS.accentGreen }]}>{CURRENCY}{receipt.breakdown.discount}</Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{CURRENCY}{receipt.total}</Text>
          </View>

          <View style={styles.paymentRow}>
            <Ionicons name="wallet" size={16} color={COLORS.primary} />
            <Text style={styles.paymentText}>Paid via {receipt.paymentMethod}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleDownload}>
            <Ionicons name="download-outline" size={20} color={COLORS.primary} />
            <Text style={styles.actionText}>Download PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
            <Text style={styles.actionText}>Email Receipt</Text>
          </TouchableOpacity>
        </View>

        {/* Support */}
        <TouchableOpacity style={styles.supportButton}>
          <Ionicons name="help-circle-outline" size={20} color={COLORS.gray600} />
          <Text style={styles.supportText}>Need help with this trip?</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
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
  backButton: { padding: SPACING.sm },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  content: { padding: SPACING.lg },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoContainer: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  logoText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.accent,
  },
  receiptId: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray600,
  },
  receiptDate: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    marginTop: 2,
  },
  routeCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  routeInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  routeLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  routeAddress: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  routeLine: {
    width: 2,
    height: 30,
    backgroundColor: COLORS.gray200,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  statItem: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.gray800,
    marginTop: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInitial: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.accent,
  },
  driverInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  driverName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  driverRating: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray600,
    marginRight: SPACING.sm,
  },
  driverCar: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
  },
  breakdownCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  breakdownTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  breakdownLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
  },
  breakdownValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  totalLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.gray800,
  },
  totalValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.primary,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primarySoft,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  paymentText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  supportText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray600,
  },
});
