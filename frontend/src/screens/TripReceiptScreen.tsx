import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
import {
  getTrip,
  addFavoriteDriver,
  removeFavoriteDriver,
  checkFavoriteDriver,
  confirmTripPayment,
  getTripBlackBox,
} from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

export default function TripReceiptScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  interface TripData {
    id: string;
    rider_id: string;
    driver_id?: string;
    driver_name?: string;
    pickup_location: string | { lat: number; lng: number; address: string };
    dropoff_location: string | { lat: number; lng: number; address: string };
    distance_km?: number;
    duration_mins?: number;
    base_fare?: number;
    distance_fee?: number;
    time_fee?: number;
    traffic_fee?: number;
    fare?: number;
    driver_rating?: number;
    vehicle_type?: string;
    service_type?: string;
    vehicle_plate?: string;
    payment_method?: string;
    payment_status?: string;
    driver_bank_name?: string;
    driver_account_number?: string;
    driver_account_name?: string;
    completed_at?: string;
    created_at?: string;
  }
  const [trip, setTrip] = useState<TripData | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [blackBox, setBlackBox] = useState<any>(null);
  const [loadingBlackBox, setLoadingBlackBox] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!params.tripId) {
        setLoading(false);
        return;
      }
      try {
        const res = await getTrip(params.tripId);
        const tripData = res.data || null;
        setTrip(tripData);
        if (params.tripId) {
          setLoadingBlackBox(true);
          try {
            const blackBoxRes = await getTripBlackBox(params.tripId);
            setBlackBox(blackBoxRes.data?.black_box || null);
          } catch (e) {
            console.log('Failed to load black box:', e);
          } finally {
            setLoadingBlackBox(false);
          }
        }
        if (tripData?.driver_id && user?.id) {
          try {
            const favRes = await checkFavoriteDriver(user.id, tripData.driver_id);
            setIsFavorite(favRes.data?.is_favorite === true);
          } catch {}
        }
      } catch (e) {
        console.log('Failed to load receipt trip:', e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [params.tripId, user?.id]);

  const view = useMemo(() => {
    if (!trip) return null;
    const pickup = typeof trip.pickup_location === 'string' ? trip.pickup_location : trip.pickup_location?.address || 'Pickup';
    const dropoff = typeof trip.dropoff_location === 'string' ? trip.dropoff_location : trip.dropoff_location?.address || 'Dropoff';
    const createdAt = trip.completed_at || trip.created_at;
    const dt = createdAt ? new Date(createdAt) : null;
    return {
      id: trip.id,
      date: dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString() : 'N/A',
      time: dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleTimeString() : '',
      pickup,
      dropoff,
      distance: `${Number(trip.distance_km || 0).toFixed(1)} km`,
      duration: `${Math.round(Number(trip.duration_mins || 0))} mins`,
      driverName: trip.driver_name || trip.driver_id || 'Driver',
      driverRating: Number(trip.driver_rating || 0),
      vehicle: trip.vehicle_type || trip.service_type || 'Vehicle',
      plate: trip.vehicle_plate || '',
      baseFare: Number(trip.base_fare || 0),
      distanceFare: Number(trip.distance_fee || 0),
      timeFare: Number(trip.time_fee || 0),
      trafficFare: Number(trip.traffic_fee || 0),
      total: Number(trip.fare || 0),
      paymentMethod:
        trip.payment_method === 'wallet'
          ? 'Wallet'
          : trip.payment_method === 'cash'
            ? 'Cash'
            : trip.payment_method || 'Cash',
      paymentStatus: trip.payment_status || 'pending',
      bankName: trip.driver_bank_name || '',
      accountNumber: trip.driver_account_number || '',
      accountName: trip.driver_account_name || '',
    };
  }, [trip]);

  const handleSaveDriver = async () => {
    if (!user?.id || !trip?.driver_id || savingFavorite) return;
    setSavingFavorite(true);
    try {
      await addFavoriteDriver(user.id, trip.driver_id);
      setIsFavorite(true);
      Alert.alert('Driver Saved!', `${view?.driverName || 'Driver'} has been added to your favorites. You can request them directly from your Favorite Drivers list!`);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not save driver. Please try again.');
    } finally {
      setSavingFavorite(false);
    }
  };

  const handleRemoveFavorite = () => {
    if (!user?.id || !trip?.driver_id || savingFavorite) return;
    Alert.alert(
      'Remove favorite?',
      `Stop showing ${view?.driverName || 'this driver'} in My Drivers?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSavingFavorite(true);
            try {
              await removeFavoriteDriver(user.id, trip.driver_id!);
              setIsFavorite(false);
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.detail || 'Could not update favorites.');
            } finally {
              setSavingFavorite(false);
            }
          },
        },
      ]
    );
  };

  const handleFavoritePress = () => {
    if (isFavorite) handleRemoveFavorite();
    else void handleSaveDriver();
  };

  const handleShare = async () => {
    if (!view) return;
    try {
      await Share.share({
        message: `NEXRYDE Trip Receipt\n\nTrip ID: ${view.id}\nDate: ${view.date} ${view.time}\nFrom: ${view.pickup}\nTo: ${view.dropoff}\nTotal: ${CURRENCY}${view.total}\n\nThank you for riding with NEXRYDE!`,
      });
    } catch {
      Alert.alert('Error', 'Could not share receipt');
    }
  };

  const handleConfirmPayment = async () => {
    if (!trip?.id || confirmingPayment) return;
    setConfirmingPayment(true);
    try {
      const res = await confirmTripPayment(trip.id);
      if (res?.data?.success) {
        setTrip((prev) => (prev ? { ...prev, payment_status: 'completed' } : prev));
        Alert.alert('Payment Confirmed', 'Thanks. Your payment has been confirmed.');
      }
    } catch (e: any) {
      Alert.alert('Unable to confirm', e?.response?.data?.detail || 'Could not confirm payment now.');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const handleShareBlackBox = async () => {
    if (!blackBox) return;
    try {
      await Share.share({
        message:
          `NEXRYDE Trip Forensics Report\n\n` +
          `Trip ID: ${blackBox.trip_id}\n` +
          `Issuer: ${blackBox.certification?.issuer}\n` +
          `Jurisdiction: ${blackBox.certification?.jurisdiction}\n` +
          `Record Hash: ${blackBox.certification?.record_hash}\n` +
          `Signature: ${blackBox.certification?.record_signature}\n` +
          `Driver: ${blackBox.driver_identity?.name || 'Driver'}\n` +
          `Vehicle: ${blackBox.driver_identity?.vehicle_model || 'Vehicle'} ${blackBox.driver_identity?.vehicle_plate || ''}\n` +
          `Route points captured: ${blackBox.route_summary?.recorded_route_points || 0}\n` +
          `30-second forensic points: ${blackBox.route_summary?.forensic_route_points || 0}\n` +
          `Timeline events: ${Array.isArray(blackBox.timeline) ? blackBox.timeline.length : 0}\n\n` +
          `This record is tamper-evident and intended for police, insurance, and legal review.`,
      });
    } catch {
      Alert.alert('Error', 'Could not share the Black Box record');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading receipt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!view) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Receipt not available</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
        <View style={styles.receiptHeader}>
          <View style={styles.logoContainer}><Text style={styles.logoText}>NEXRYDE</Text></View>
          <Text style={styles.receiptId}>Receipt #{view.id}</Text>
          <Text style={styles.receiptDate}>{view.date} at {view.time}</Text>
        </View>

        <View style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.accentGreen }]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Pickup</Text>
              <Text style={styles.routeAddress}>{view.pickup}</Text>
            </View>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Dropoff</Text>
              <Text style={styles.routeAddress}>{view.dropoff}</Text>
            </View>
          </View>
        </View>

        <View style={styles.blackBoxCard}>
          <View style={styles.blackBoxHeader}>
            <View style={styles.blackBoxIcon}>
              <Ionicons name="shield-checkmark" size={22} color={COLORS.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.blackBoxTitle}>Nexryde Black Shield</Text>
              <Text style={styles.blackBoxText}>
                Official tamper-evident forensics report with GPS points every 30 seconds, speed trail, timestamps, route history, and driver identity confirmation.
              </Text>
            </View>
          </View>
          {loadingBlackBox ? (
            <ActivityIndicator size="small" color={COLORS.info} />
          ) : blackBox ? (
            <>
              <View style={styles.blackBoxGrid}>
                <View style={styles.blackBoxMetric}>
                  <Text style={styles.blackBoxMetricLabel}>Record hash</Text>
                  <Text style={styles.blackBoxMetricValue}>{String(blackBox.certification?.record_hash || '').slice(0, 14)}...</Text>
                </View>
                <View style={styles.blackBoxMetric}>
                  <Text style={styles.blackBoxMetricLabel}>GPS points</Text>
                  <Text style={styles.blackBoxMetricValue}>{Number(blackBox.route_summary?.recorded_route_points || 0)}</Text>
                </View>
                <View style={styles.blackBoxMetric}>
                  <Text style={styles.blackBoxMetricLabel}>30s forensic points</Text>
                  <Text style={styles.blackBoxMetricValue}>{Number(blackBox.route_summary?.forensic_route_points || 0)}</Text>
                </View>
                <View style={styles.blackBoxMetric}>
                  <Text style={styles.blackBoxMetricLabel}>Timeline events</Text>
                  <Text style={styles.blackBoxMetricValue}>{Array.isArray(blackBox.timeline) ? blackBox.timeline.length : 0}</Text>
                </View>
                <View style={styles.blackBoxMetric}>
                  <Text style={styles.blackBoxMetricLabel}>Comms digest</Text>
                  <Text style={styles.blackBoxMetricValue}>
                    {String(blackBox.communications_integrity?.communication_digest || '').slice(0, 12) || 'n/a'}
                  </Text>
                </View>
                <View style={styles.blackBoxMetric}>
                  <Text style={styles.blackBoxMetricLabel}>Face match</Text>
                  <Text style={styles.blackBoxMetricValue}>
                    {blackBox.driver_identity?.face_verified_at_start ? 'Verified' : 'Pending'}
                  </Text>
                </View>
              </View>
              <Text style={styles.blackBoxFootnote}>
                Black Shield is tamper-evident and immutable. Third-party legal access requires a court-order token.
              </Text>
              <TouchableOpacity style={styles.blackBoxBtn} onPress={handleShareBlackBox}>
                <Ionicons name="document-text-outline" size={18} color={COLORS.white} />
                <Text style={styles.blackBoxBtnText}>Share Forensics Summary</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.blackBoxText}>Official record not available yet for this trip.</Text>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="navigate" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{view.distance}</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{view.duration}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
        </View>

        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}><Text style={styles.driverInitial}>{view.driverName.charAt(0)}</Text></View>
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>{view.driverName}</Text>
            <View style={styles.driverMeta}>
              <Ionicons name="star" size={14} color={COLORS.accent} />
              <Text style={styles.driverRating}>
                {view.driverRating != null ? Number(view.driverRating).toFixed(1) : 'N/A'}
              </Text>
              <Text style={styles.driverCar}>{view.vehicle}{view.plate ? ` • ${view.plate}` : ''}</Text>
            </View>
          </View>
          {trip?.driver_id && (
            <TouchableOpacity
              style={styles.favoriteBtn}
              onPress={handleFavoritePress}
              disabled={savingFavorite}
              accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              accessibilityRole="button"
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite ? COLORS.error : COLORS.gray400}
              />
            </TouchableOpacity>
          )}
        </View>

        {trip?.driver_id && !isFavorite && (
          <TouchableOpacity style={styles.saveDriverBanner} onPress={handleSaveDriver} disabled={savingFavorite}>
            <View style={styles.saveDriverIcon}>
              <Ionicons name="heart-outline" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.saveDriverInfo}>
              <Text style={styles.saveDriverTitle}>Enjoyed your ride?</Text>
              <Text style={styles.saveDriverSub}>Save {view.driverName} to request them again!</Text>
            </View>
            <Ionicons name="add-circle" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        {isFavorite && (
          <TouchableOpacity style={styles.savedBanner} onPress={handleRemoveFavorite} disabled={savingFavorite}>
            <Ionicons name="heart" size={18} color={COLORS.error} />
            <Text style={styles.savedBannerText}>{view.driverName} is in your favorites — tap to remove</Text>
          </TouchableOpacity>
        )}

        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Fare Breakdown</Text>
          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Base Fare</Text><Text style={styles.breakdownValue}>{CURRENCY}{view.baseFare}</Text></View>
          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Distance ({view.distance})</Text><Text style={styles.breakdownValue}>{CURRENCY}{view.distanceFare}</Text></View>
          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Time ({view.duration})</Text><Text style={styles.breakdownValue}>{CURRENCY}{view.timeFare}</Text></View>
          {view.trafficFare > 0 ? (
            <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Traffic</Text><Text style={styles.breakdownValue}>{CURRENCY}{view.trafficFare}</Text></View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{CURRENCY}{view.total}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Ionicons name="wallet" size={16} color={COLORS.primary} />
            <Text style={styles.paymentText}>
              {view.paymentStatus === 'pending'
                ? `Payment pending via ${view.paymentMethod}`
                : `Paid via ${view.paymentMethod}`}
            </Text>
          </View>
        </View>

        {view.paymentStatus === 'pending' && view.accountNumber ? (
          <View style={styles.paymentInstructionCard}>
            <Text style={styles.paymentInstructionTitle}>Pay Driver Directly</Text>
            <Text style={styles.paymentInstructionText}>Complete payment using the driver account below:</Text>
            <Text style={styles.paymentInstructionBank}>{view.bankName}</Text>
            <Text style={styles.paymentInstructionAcct}>{view.accountNumber}</Text>
            <Text style={styles.paymentInstructionName}>{view.accountName}</Text>
            {user?.id === trip?.rider_id && (
              <TouchableOpacity style={styles.confirmPaymentBtn} onPress={handleConfirmPayment} disabled={confirmingPayment}>
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
                <Text style={styles.confirmPaymentBtnText}>
                  {confirmingPayment ? 'Confirming...' : 'I Have Paid'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.supportButton}
          onPress={() => router.push({ pathname: '/support', params: { tripId: view.id } })}
        >
          <Ionicons name="help-circle-outline" size={20} color={COLORS.gray600} />
          <Text style={styles.supportText}>Need help with this trip?</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  loadingText: { marginTop: SPACING.sm, color: COLORS.gray500, fontWeight: '600' },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray700, marginBottom: SPACING.md },
  primaryBtn: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.lg },
  primaryBtnText: { color: COLORS.white, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  backButton: { padding: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray800 },
  content: { padding: SPACING.lg },
  receiptHeader: { alignItems: 'center', marginBottom: SPACING.lg },
  logoContainer: { backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.md },
  logoText: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.accent },
  receiptId: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray600 },
  receiptDate: { fontSize: FONT_SIZE.sm, color: COLORS.gray500, marginTop: 2 },
  routeCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  blackBoxCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  blackBoxHeader: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  blackBoxIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.infoSoft,
  },
  blackBoxTitle: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.gray800, marginBottom: 4 },
  blackBoxText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray600, lineHeight: 20 },
  blackBoxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  blackBoxMetric: { width: '48%', backgroundColor: COLORS.gray50, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md },
  blackBoxMetricLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.gray500, textTransform: 'uppercase' },
  blackBoxMetricValue: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: COLORS.gray800, marginTop: SPACING.xs },
  blackBoxFootnote: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray600, lineHeight: 20, marginBottom: SPACING.md },
  blackBoxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.info,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
  },
  blackBoxBtnText: { color: COLORS.white, fontWeight: '800', fontSize: FONT_SIZE.sm },
  routePoint: { flexDirection: 'row', alignItems: 'flex-start' },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  routeInfo: { marginLeft: SPACING.md, flex: 1 },
  routeLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.gray500 },
  routeAddress: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.gray800 },
  routeLine: { width: 2, height: 30, backgroundColor: COLORS.gray200, marginLeft: 5, marginVertical: SPACING.xs },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  statItem: { flex: 1, backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, alignItems: 'center' },
  statValue: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.gray800, marginTop: SPACING.xs },
  statLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.gray500 },
  driverCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm },
  favoriteBtn: { padding: SPACING.sm },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  driverInitial: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.accent },
  driverInfo: { marginLeft: SPACING.md, flex: 1 },
  driverName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray800 },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  driverRating: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray600, marginRight: SPACING.sm },
  driverCar: { fontSize: FONT_SIZE.sm, color: COLORS.gray500 },
  breakdownCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  breakdownTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray800, marginBottom: SPACING.md },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  breakdownLabel: { fontSize: FONT_SIZE.sm, color: COLORS.gray600 },
  breakdownValue: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray800 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.md, marginTop: SPACING.sm },
  totalLabel: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.gray800 },
  totalValue: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.primary },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.primarySoft, padding: SPACING.sm, borderRadius: BORDER_RADIUS.md },
  paymentText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.primary },
  paymentInstructionCard: { backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.primary + '30' },
  paymentInstructionTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.primary, marginBottom: SPACING.xs },
  paymentInstructionText: { fontSize: FONT_SIZE.sm, color: COLORS.gray600, marginBottom: SPACING.sm },
  paymentInstructionBank: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.gray800 },
  paymentInstructionAcct: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.primary, marginTop: 2 },
  paymentInstructionName: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray700, marginTop: 4 },
  confirmPaymentBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  confirmPaymentBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
  },
  saveDriverBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1.5, borderColor: COLORS.primary + '30', borderStyle: 'dashed' },
  saveDriverIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primarySoft || '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  saveDriverInfo: { flex: 1, marginLeft: SPACING.md },
  saveDriverTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: COLORS.gray800 },
  saveDriverSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.gray500, marginTop: 2 },
  savedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#FEF2F2', borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.sm, marginBottom: SPACING.md },
  savedBannerText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.error },
  supportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.md },
  supportText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.gray600 },
});
