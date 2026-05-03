import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  getTrip,
  addFavoriteDriver,
  removeFavoriteDriver,
  checkFavoriteDriver,
  confirmTripPayment,
  getTripBlackBox,
  BACKEND_URL,
  getAuthHeaders,
} from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';
import { CURRENCY, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

// ── Colour palette ─────────────────────────────────────────────────────────
const C = {
  bg:        '#020617',
  bgMid:     '#0B1223',
  card:      '#0F172A',
  cardLight: '#1E293B',
  border:    '#1E293B',
  green:     '#22C55E',
  greenDim:  '#15803D',
  amber:     '#F59E0B',
  amberDim:  '#78350F',
  red:       '#EF4444',
  blue:      '#3B82F6',
  white:     '#FFFFFF',
  muted:     '#94A3B8',
  dim:       '#334155',
};

// ── Quick reaction options ─────────────────────────────────────────────────
const QUICK_REACTIONS = [
  { id: 'smooth',  emoji: '🤙', label: 'Smooth ride'  },
  { id: 'clean',   emoji: '🧼', label: 'Very clean'   },
  { id: 'great',   emoji: '⭐', label: 'Great driver' },
  { id: 'ontime',  emoji: '⏰', label: 'On time'      },
  { id: 'friendly',emoji: '😊', label: 'Friendly'     },
  { id: 'safe',    emoji: '🛡️', label: 'Felt safe'    },
];

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

export default function TripReceiptScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ tripId?: string }>();
  const { user } = useAppStore();

  // ── Data state ──────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [trip,    setTrip]                  = useState<TripData | null>(null);
  const [blackBox, setBlackBox]             = useState<any>(null);
  const [loadingBlackBox, setLoadingBlackBox] = useState(false);

  // ── Interaction state ────────────────────────────────────────────────────
  const [isFavorite,      setIsFavorite]      = useState(false);
  const [savingFavorite,  setSavingFavorite]  = useState(false);
  const [myRating,        setMyRating]        = useState(0);
  const [hoveredStar,     setHoveredStar]     = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [submittingRating,setSubmittingRating]= useState(false);
  const [selectedReacts,  setSelectedReacts]  = useState<string[]>([]);
  const [ratingComment,   setRatingComment]   = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  // ── Post-trip feedback modal (auto-shows on mount) ────────────────────
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackStep, setFeedbackStep]           = useState<'rating' | 'done'>('rating');

  // ── Animations ───────────────────────────────────────────────────────────
  const checkScale   = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const headerFade   = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(30)).current;
  const heartScale   = useRef(new Animated.Value(1)).current;
  const starScales   = useRef([1,2,3,4,5].map(() => new Animated.Value(1))).current;
  const modalSlide   = useRef(new Animated.Value(600)).current;

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      if (!params.tripId) { setLoading(false); return; }
      try {
        const res = await getTrip(params.tripId);
        const tripData = res.data || null;
        setTrip(tripData);
        if (params.tripId) {
          setLoadingBlackBox(true);
          try {
            const bbRes = await getTripBlackBox(params.tripId);
            setBlackBox(bbRes.data?.black_box || null);
          } catch {}
          finally { setLoadingBlackBox(false); }
        }
        if (tripData?.driver_id && user?.id) {
          try {
            const favRes = await checkFavoriteDriver(user.id, tripData.driver_id);
            setIsFavorite(favRes.data?.is_favorite === true);
          } catch {}
        }
      } catch {}
      finally { setLoading(false); }
    };
    run();
  }, [params.tripId, user?.id]);

  // ── Entry animations ─────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(checkScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentSlide, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Show feedback modal after a short pause — feels natural, not abrupt
    if (trip?.driver_id && !ratingSubmitted) {
      const t = setTimeout(() => {
        setShowFeedbackModal(true);
        Animated.spring(modalSlide, { toValue: 0, tension: 55, friction: 9, useNativeDriver: true }).start();
      }, 900);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // ── Computed view ────────────────────────────────────────────────────────
  const view = useMemo(() => {
    if (!trip) return null;
    const pickup  = typeof trip.pickup_location  === 'string' ? trip.pickup_location  : trip.pickup_location?.address  || 'Pickup';
    const dropoff = typeof trip.dropoff_location === 'string' ? trip.dropoff_location : trip.dropoff_location?.address || 'Dropoff';
    const createdAt = trip.completed_at || trip.created_at;
    const dt = createdAt ? new Date(createdAt) : null;
    const valid = dt && !Number.isNaN(dt.getTime());
    return {
      id:            trip.id,
      date:          valid ? dt!.toLocaleDateString() : 'N/A',
      time:          valid ? dt!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      pickup,
      dropoff,
      distance:      `${Number(trip.distance_km || 0).toFixed(1)} km`,
      duration:      `${Math.round(Number(trip.duration_mins || 0))} mins`,
      driverName:    trip.driver_name || trip.driver_id || 'Driver',
      driverInitial: (trip.driver_name || 'D')[0].toUpperCase(),
      driverRating:  Number(trip.driver_rating || 0),
      vehicle:       trip.vehicle_type || trip.service_type || 'Vehicle',
      plate:         trip.vehicle_plate || '',
      baseFare:      Number(trip.base_fare     || 0),
      distanceFare:  Number(trip.distance_fee  || 0),
      timeFare:      Number(trip.time_fee      || 0),
      trafficFare:   Number(trip.traffic_fee   || 0),
      total:         Number(trip.fare          || 0),
      paymentMethod: trip.payment_method === 'wallet' ? 'Wallet' : trip.payment_method === 'cash' ? 'Cash' : trip.payment_method || 'Cash',
      paymentStatus: trip.payment_status || 'pending',
      bankName:      trip.driver_bank_name      || '',
      accountNumber: trip.driver_account_number || '',
      accountName:   trip.driver_account_name   || '',
    };
  }, [trip]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleStarPress = async (star: number) => {
    if (ratingSubmitted || submittingRating) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(starScales[star - 1], { toValue: 1.4, tension: 200, friction: 5, useNativeDriver: true }),
      Animated.spring(starScales[star - 1], { toValue: 1,   tension: 200, friction: 5, useNativeDriver: true }),
    ]).start();
    setMyRating(star);
    setSubmittingRating(true);
    try {
      await fetch(`${BACKEND_URL}/api/trips/${trip!.id}/rate?rater_id=${user!.id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comfort_ratings: Object.fromEntries(selectedReacts.map((r) => [r, true])),
          overall_rating:  star,
          comment:         ratingComment.trim() || '',
        }),
      });
      setRatingSubmitted(true);
      setFeedbackStep('done');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not save rating', 'Please try again.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const dismissFeedbackModal = useCallback(() => {
    Animated.timing(modalSlide, { toValue: 600, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setShowFeedbackModal(false);
    });
  }, []);

  const toggleReaction = (id: string) => {
    void Haptics.selectionAsync();
    setSelectedReacts((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleAddFavorite = async () => {
    if (!user?.id || !trip?.driver_id || savingFavorite) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.5, tension: 180, friction: 4, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1,   tension: 180, friction: 4, useNativeDriver: true }),
    ]).start();
    setSavingFavorite(true);
    try {
      await addFavoriteDriver(user.id, trip.driver_id);
      setIsFavorite(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not save driver.');
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
          text: 'Remove', style: 'destructive',
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

  const handleShare = async () => {
    if (!view) return;
    try {
      await Share.share({
        message: `NEXRYDE Trip Receipt\n\nTrip ID: ${view.id}\nDate: ${view.date} ${view.time}\nFrom: ${view.pickup}\nTo: ${view.dropoff}\nTotal: ${CURRENCY}${view.total}\n\nThank you for riding with NEXRYDE!`,
      });
    } catch {}
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
          `Trip ID: ${blackBox.trip_id}\nIssuer: ${blackBox.certification?.issuer}\n` +
          `Record Hash: ${String(blackBox.certification?.record_hash || '').slice(0, 14)}...\n` +
          `Driver: ${blackBox.driver_identity?.name || 'Driver'}\n` +
          `Vehicle: ${blackBox.driver_identity?.vehicle_model || 'Vehicle'} ${blackBox.driver_identity?.vehicle_plate || ''}\n` +
          `GPS points: ${blackBox.route_summary?.recorded_route_points || 0}\n` +
          `This record is tamper-evident and intended for police, insurance, and legal review.`,
      });
    } catch {}
  };

  // ── Loading / empty guards ────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.green} />
          <Text style={s.loadingText}>Loading receipt...</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!view) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <Ionicons name="receipt-outline" size={56} color={C.dim} />
          <Text style={s.emptyTitle}>Receipt not available</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Post-trip feedback modal ──────────────────────────────────────────────
  const FeedbackModal = (
    <Modal transparent visible={showFeedbackModal} animationType="none" onRequestClose={dismissFeedbackModal}>
      <View style={s.modalOverlay}>
        <Animated.View style={[s.feedbackSheet, { transform: [{ translateY: modalSlide }] }]}>
          {feedbackStep === 'done' ? (
            /* ── Done step ── */
            <View style={s.feedbackDone}>
              <View style={s.feedbackDoneIcon}>
                <Ionicons name="checkmark-circle" size={56} color={C.green} />
              </View>
              <Text style={s.feedbackDoneTitle}>Thanks for your feedback!</Text>
              <Text style={s.feedbackDoneSub}>
                Your rating helps make Nexryde better for everyone.
              </Text>
              {/* Favorite prompt — shown after rating */}
              {trip?.driver_id && !isFavorite && (
                <View style={s.favPromptCard}>
                  <Text style={s.favPromptTitle}>Want to ride with {view.driverName} again?</Text>
                  <Text style={s.favPromptSub}>Save them to your favourites for instant re-booking.</Text>
                  <TouchableOpacity
                    style={s.favPromptBtn}
                    onPress={async () => { await handleAddFavorite(); }}
                    disabled={savingFavorite}
                    accessibilityRole="button"
                    accessibilityLabel="Add driver to favourites"
                  >
                    <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                      <Ionicons name="heart" size={20} color={C.white} />
                    </Animated.View>
                    <Text style={s.favPromptBtnText}>
                      {savingFavorite ? 'Saving...' : `Add ${view.driverName}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {isFavorite && (
                <View style={s.favSavedPill}>
                  <Ionicons name="heart" size={16} color={C.red} />
                  <Text style={s.favSavedPillText}>{view.driverName} is in your favourites</Text>
                </View>
              )}
              <TouchableOpacity style={s.feedbackDoneBtn} onPress={dismissFeedbackModal}>
                <Text style={s.feedbackDoneBtnText}>View Receipt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Rating step ── */
            <>
              {/* Handle bar */}
              <View style={s.sheetHandle} />

              {/* Driver */}
              <View style={s.feedbackDriverRow}>
                <LinearGradient colors={['#1D4ED8', '#2563EB']} style={s.feedbackAvatar}>
                  <Text style={s.feedbackAvatarText}>{view.driverInitial}</Text>
                </LinearGradient>
                <View>
                  <Text style={s.feedbackDriverLabel}>Your driver</Text>
                  <Text style={s.feedbackDriverName}>{view.driverName}</Text>
                  {view.plate ? <Text style={s.feedbackDriverPlate}>{view.vehicle} · {view.plate}</Text> : null}
                </View>
              </View>

              <Text style={s.feedbackTitle}>How was your ride?</Text>

              {/* Quick reactions */}
              <View style={s.reactionGrid}>
                {QUICK_REACTIONS.map((r) => {
                  const active = selectedReacts.includes(r.id);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[s.reactionChip, active && s.reactionChipOn]}
                      onPress={() => toggleReaction(r.id)}
                      accessibilityRole="button"
                      accessibilityLabel={r.label}
                    >
                      <Text style={s.reactionEmoji}>{r.emoji}</Text>
                      <Text style={[s.reactionLabel, active && s.reactionLabelOn]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Stars */}
              <View style={s.starsRow}>
                {[1,2,3,4,5].map((star) => {
                  const filled = star <= (hoveredStar || myRating);
                  return (
                    <Animated.View key={star} style={{ transform: [{ scale: starScales[star - 1] }] }}>
                      <TouchableOpacity
                        onPress={() => void handleStarPress(star)}
                        onPressIn={() => setHoveredStar(star)}
                        onPressOut={() => setHoveredStar(0)}
                        disabled={submittingRating || ratingSubmitted}
                        style={{ padding: 6 }}
                      >
                        <Ionicons
                          name={filled ? 'star' : 'star-outline'}
                          size={42}
                          color={filled ? C.amber : C.dim}
                        />
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
              {submittingRating && <ActivityIndicator size="small" color={C.green} style={{ marginTop: 6 }} />}
              <Text style={s.starHint}>
                {myRating === 0 ? 'Tap a star to rate' : myRating === 5 ? 'Excellent! 🌟' : myRating >= 4 ? 'Great ride! 😊' : myRating >= 3 ? 'Not bad 👍' : 'We\'ll do better 🙏'}
              </Text>

              {/* Optional comment */}
              <TextInput
                style={s.commentInput}
                placeholder="Any extra feedback? (optional)"
                placeholderTextColor={C.muted}
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
                maxLength={200}
              />

              <TouchableOpacity style={s.skipBtn} onPress={dismissFeedbackModal}>
                <Text style={s.skipBtnText}>Skip for now</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );

  // ── Main receipt ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      {FeedbackModal}

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.topBackBtn}>
          <Ionicons name="arrow-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Trip Receipt</Text>
        <TouchableOpacity onPress={handleShare} style={s.topShareBtn}>
          <Ionicons name="share-outline" size={20} color={C.green} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero: ride complete ─────────────────────────────────────── */}
        <Animated.View style={[s.hero, { opacity: headerFade }]}>
          <LinearGradient colors={['#052E16', '#0F172A']} style={s.heroGrad}>
            <Animated.View style={[s.heroCheck, { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}>
              <LinearGradient colors={[C.green, '#16A34A']} style={s.heroCheckCircle}>
                <Ionicons name="checkmark" size={32} color={C.white} />
              </LinearGradient>
            </Animated.View>
            <Text style={s.heroTitle}>Ride Complete</Text>
            <Text style={s.heroFare}>{CURRENCY}{view.total.toLocaleString()}</Text>
            <View style={s.heroStats}>
              <View style={s.heroStatItem}>
                <Ionicons name="navigate" size={14} color={C.muted} />
                <Text style={s.heroStatText}>{view.distance}</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStatItem}>
                <Ionicons name="time-outline" size={14} color={C.muted} />
                <Text style={s.heroStatText}>{view.duration}</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStatItem}>
                <Ionicons name="calendar-outline" size={14} color={C.muted} />
                <Text style={s.heroStatText}>{view.date}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <Animated.View style={{ opacity: headerFade, transform: [{ translateY: contentSlide }] }}>

          {/* ── Driver card ──────────────────────────────────────────── */}
          <View style={s.driverCard}>
            <LinearGradient colors={['#1D4ED8', '#2563EB']} style={s.driverAvatar}>
              <Text style={s.driverInitial}>{view.driverInitial}</Text>
            </LinearGradient>
            <View style={s.driverMeta}>
              <Text style={s.driverName}>{view.driverName}</Text>
              <View style={s.driverSub}>
                {view.driverRating > 0 && (
                  <>
                    <Ionicons name="star" size={13} color={C.amber} />
                    <Text style={s.driverRating}>{view.driverRating.toFixed(1)}</Text>
                  </>
                )}
                <Text style={s.driverVehicle}>{view.vehicle}{view.plate ? ` · ${view.plate}` : ''}</Text>
              </View>
            </View>
            {/* Favourite heart */}
            {trip?.driver_id && (
              <TouchableOpacity
                onPress={isFavorite ? handleRemoveFavorite : () => void handleAddFavorite()}
                disabled={savingFavorite}
                style={s.heartBtn}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              >
                <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                  <Ionicons
                    name={isFavorite ? 'heart' : 'heart-outline'}
                    size={26}
                    color={isFavorite ? C.red : C.muted}
                  />
                </Animated.View>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Favourite prompt banner (if not yet saved) ───────────── */}
          {trip?.driver_id && !isFavorite && ratingSubmitted && (
            <TouchableOpacity
              style={s.favBanner}
              onPress={() => void handleAddFavorite()}
              disabled={savingFavorite}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#3B0764', '#4C1D95']} style={s.favBannerGrad}>
                <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                  <Ionicons name="heart" size={22} color="#E879F9" />
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Text style={s.favBannerTitle}>Enjoyed riding with {view.driverName}?</Text>
                  <Text style={s.favBannerSub}>Save them to request directly next time</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#A78BFA" />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Already saved */}
          {isFavorite && (
            <TouchableOpacity style={s.favSavedBanner} onPress={handleRemoveFavorite} disabled={savingFavorite}>
              <Ionicons name="heart" size={16} color={C.red} />
              <Text style={s.favSavedBannerText}>{view.driverName} is in your favourites</Text>
              <Text style={s.favSavedBannerRemove}>Remove</Text>
            </TouchableOpacity>
          )}

          {/* ── Rating card (inline, if modal was skipped) ───────────── */}
          {trip?.driver_id && !ratingSubmitted && !showFeedbackModal && (
            <View style={s.ratingCard}>
              <Text style={s.ratingTitle}>Rate your ride</Text>
              <Text style={s.ratingSub}>How was your experience with {view.driverName}?</Text>
              <View style={s.starsRowInline}>
                {[1,2,3,4,5].map((star) => (
                  <Animated.View key={star} style={{ transform: [{ scale: starScales[star - 1] }] }}>
                    <TouchableOpacity
                      onPress={() => void handleStarPress(star)}
                      disabled={submittingRating}
                      style={{ padding: 5 }}
                    >
                      <Ionicons
                        name={star <= myRating ? 'star' : 'star-outline'}
                        size={36}
                        color={star <= myRating ? C.amber : C.dim}
                      />
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </View>
              {submittingRating && <ActivityIndicator size="small" color={C.green} style={{ marginTop: 4 }} />}
            </View>
          )}

          {ratingSubmitted && !showFeedbackModal && (
            <View style={s.ratingDoneCard}>
              <Ionicons name="checkmark-circle" size={20} color={C.green} />
              <Text style={s.ratingDoneText}>
                You gave {myRating} ★ — thank you!
              </Text>
            </View>
          )}

          {/* ── Route card ───────────────────────────────────────────── */}
          <View style={s.routeCard}>
            <View style={s.routePoint}>
              <View style={[s.routeDot, { backgroundColor: C.green }]} />
              <View style={s.routeInfo}>
                <Text style={s.routeLabel}>Pickup</Text>
                <Text style={s.routeAddress} numberOfLines={2}>{view.pickup}</Text>
              </View>
            </View>
            <View style={s.routeLine} />
            <View style={s.routePoint}>
              <View style={[s.routeDot, { backgroundColor: C.red }]} />
              <View style={s.routeInfo}>
                <Text style={s.routeLabel}>Dropoff</Text>
                <Text style={s.routeAddress} numberOfLines={2}>{view.dropoff}</Text>
              </View>
            </View>
          </View>

          {/* ── Fare breakdown ───────────────────────────────────────── */}
          <View style={s.fareCard}>
            <Text style={s.fareTitle}>Fare Breakdown</Text>
            {[
              { label: 'Base Fare',              val: view.baseFare     },
              { label: `Distance (${view.distance})`, val: view.distanceFare },
              { label: `Time (${view.duration})`,     val: view.timeFare     },
              ...(view.trafficFare > 0 ? [{ label: 'Traffic',  val: view.trafficFare }] : []),
            ].map(({ label, val }) => (
              <View key={label} style={s.fareRow}>
                <Text style={s.fareLabel}>{label}</Text>
                <Text style={s.fareVal}>{CURRENCY}{val}</Text>
              </View>
            ))}
            <View style={s.fareTotalRow}>
              <Text style={s.fareTotalLabel}>Total</Text>
              <Text style={s.fareTotalVal}>{CURRENCY}{view.total.toLocaleString()}</Text>
            </View>
            <View style={s.payMethodRow}>
              <Ionicons name="wallet-outline" size={15} color={C.green} />
              <Text style={s.payMethodText}>
                {view.paymentStatus === 'pending' ? `Pending · ${view.paymentMethod}` : `Paid via ${view.paymentMethod}`}
              </Text>
            </View>
          </View>

          {/* ── Cash payment instructions ────────────────────────────── */}
          {view.paymentStatus === 'pending' && view.accountNumber ? (
            <View style={s.payInstructCard}>
              <Text style={s.payInstructTitle}>Pay Driver Directly</Text>
              <Text style={s.payInstructSub}>Transfer to the account below:</Text>
              <Text style={s.payInstructBank}>{view.bankName}</Text>
              <Text style={s.payInstructAcct}>{view.accountNumber}</Text>
              <Text style={s.payInstructName}>{view.accountName}</Text>
              {user?.id === trip?.rider_id && (
                <TouchableOpacity style={s.confirmPayBtn} onPress={handleConfirmPayment} disabled={confirmingPayment}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={C.white} />
                  <Text style={s.confirmPayBtnText}>{confirmingPayment ? 'Confirming...' : 'I Have Paid'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* ── Black Shield ─────────────────────────────────────────── */}
          <View style={s.blackCard}>
            <View style={s.blackCardHeader}>
              <View style={s.blackCardIcon}>
                <Ionicons name="shield-checkmark" size={20} color="#60A5FA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.blackCardTitle}>Nexryde Black Shield</Text>
                <Text style={s.blackCardSub}>
                  Tamper-evident forensics: GPS every 30 s, speed trail, driver identity.
                </Text>
              </View>
            </View>
            {loadingBlackBox ? (
              <ActivityIndicator size="small" color="#60A5FA" />
            ) : blackBox ? (
              <>
                <View style={s.blackGrid}>
                  {[
                    { label: 'Record hash',      val: `${String(blackBox.certification?.record_hash || '').slice(0, 12)}…` },
                    { label: 'GPS points',        val: String(blackBox.route_summary?.recorded_route_points || 0) },
                    { label: 'Forensic points',   val: String(blackBox.route_summary?.forensic_route_points  || 0) },
                    { label: 'Timeline events',   val: String(Array.isArray(blackBox.timeline) ? blackBox.timeline.length : 0) },
                    { label: 'Face match',         val: blackBox.driver_identity?.face_verified_at_start ? 'Verified' : 'Pending' },
                    { label: 'Comms digest',       val: `${String(blackBox.communications_integrity?.communication_digest || '').slice(0, 10) || 'n/a'}…` },
                  ].map(({ label, val }) => (
                    <View key={label} style={s.blackMetric}>
                      <Text style={s.blackMetricLabel}>{label}</Text>
                      <Text style={s.blackMetricVal}>{val}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.blackFootnote}>
                  Black Shield is immutable. Third-party legal access requires a court-order token.
                </Text>
                <TouchableOpacity style={s.blackShareBtn} onPress={handleShareBlackBox}>
                  <Ionicons name="document-text-outline" size={16} color={C.white} />
                  <Text style={s.blackShareBtnText}>Share Forensics Summary</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.blackCardSub}>Official record not yet available for this trip.</Text>
            )}
          </View>

          {/* ── Receipt ID ───────────────────────────────────────────── */}
          <View style={s.receiptIdRow}>
            <Text style={s.receiptIdLabel}>Receipt</Text>
            <Text style={s.receiptIdVal}>#{view.id.slice(0, 16).toUpperCase()}</Text>
          </View>

          {/* ── Support link ─────────────────────────────────────────── */}
          <TouchableOpacity
            style={s.supportRow}
            onPress={() => router.push({ pathname: '/support', params: { tripId: view.id } })}
          >
            <Ionicons name="help-circle-outline" size={18} color={C.muted} />
            <Text style={s.supportText}>Need help with this trip?</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  loadingText:  { color: C.muted, fontWeight: '600', fontSize: FONT_SIZE.sm },
  emptyTitle:   { fontSize: FONT_SIZE.lg, fontWeight: '800', color: C.white, textAlign: 'center' },
  primaryBtn:   { backgroundColor: C.green, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  primaryBtnText: { color: C.white, fontWeight: '800' },

  /* Top bar */
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.bgMid, borderBottomWidth: 1, borderBottomColor: C.border },
  topBackBtn:   { padding: 6 },
  topBarTitle:  { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white },
  topShareBtn:  { padding: 6 },

  /* Hero */
  hero:         { marginHorizontal: 0, marginBottom: 0 },
  heroGrad:     { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroCheck:    { marginBottom: 14 },
  heroCheckCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  heroTitle:    { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#86EFAC', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  heroFare:     { fontSize: 44, fontWeight: '900', color: C.white, marginBottom: 12 },
  heroStats:    { flexDirection: 'row', alignItems: 'center', gap: 0 },
  heroStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  heroStatText: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted },
  heroStatDivider: { width: 1, height: 14, backgroundColor: C.dim },

  scroll: { paddingTop: 0 },

  /* Driver card */
  driverCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 14, gap: 12 },
  driverAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  driverInitial:{ fontSize: 22, fontWeight: '900', color: C.white },
  driverMeta:   { flex: 1 },
  driverName:   { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white },
  driverSub:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  driverRating: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.amber },
  driverVehicle:{ fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted },
  heartBtn:     { padding: 8 },

  /* Favourite banners */
  favBanner:    { marginHorizontal: 16, marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  favBannerGrad:{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  favBannerTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white },
  favBannerSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#C4B5FD', marginTop: 2 },
  favSavedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, backgroundColor: '#1A0A0A', borderRadius: 12, padding: 12 },
  favSavedBannerText: { flex: 1, fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.red },
  favSavedBannerRemove: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted },

  /* Rating inline */
  ratingCard:   { backgroundColor: C.card, marginHorizontal: 16, marginTop: 10, borderRadius: 16, padding: 18, alignItems: 'center' },
  ratingTitle:  { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white, marginBottom: 4 },
  ratingSub:    { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, marginBottom: 14, textAlign: 'center' },
  starsRowInline:{ flexDirection: 'row', gap: 2 },
  ratingDoneCard:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(34,197,94,0.1)', marginHorizontal: 16, marginTop: 10, borderRadius: 12, padding: 12 },
  ratingDoneText:{ fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.green },

  /* Route */
  routeCard:    { backgroundColor: C.card, marginHorizontal: 16, marginTop: 10, borderRadius: 16, padding: 16 },
  routePoint:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot:     { width: 11, height: 11, borderRadius: 6, marginTop: 5 },
  routeInfo:    { flex: 1 },
  routeLabel:   { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  routeAddress: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.white, marginTop: 2 },
  routeLine:    { width: 1, height: 24, backgroundColor: C.dim, marginLeft: 5, marginVertical: 4 },

  /* Fare */
  fareCard:     { backgroundColor: C.card, marginHorizontal: 16, marginTop: 10, borderRadius: 16, padding: 16 },
  fareTitle:    { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white, marginBottom: 12 },
  fareRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  fareLabel:    { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted },
  fareVal:      { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.white },
  fareTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  fareTotalLabel:{ fontSize: FONT_SIZE.md, fontWeight: '900', color: C.white },
  fareTotalVal: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: C.green },
  payMethodRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(34,197,94,0.08)', padding: 8, borderRadius: 8, marginTop: 4 },
  payMethodText:{ fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.green },

  /* Pay instructions */
  payInstructCard: { backgroundColor: C.card, marginHorizontal: 16, marginTop: 10, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.green + '30' },
  payInstructTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.green, marginBottom: 4 },
  payInstructSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, marginBottom: 10 },
  payInstructBank: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white },
  payInstructAcct: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: C.green, marginTop: 2 },
  payInstructName: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted, marginTop: 4 },
  confirmPayBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, backgroundColor: C.green, borderRadius: 10, paddingVertical: 11 },
  confirmPayBtnText: { color: C.white, fontWeight: '800', fontSize: FONT_SIZE.sm },

  /* Black Shield */
  blackCard:    { backgroundColor: '#0A1628', borderWidth: 1, borderColor: '#1D4ED8' + '50', marginHorizontal: 16, marginTop: 10, borderRadius: 16, padding: 16 },
  blackCardHeader: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  blackCardIcon:{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(96,165,250,0.12)', alignItems: 'center', justifyContent: 'center' },
  blackCardTitle:{ fontSize: FONT_SIZE.sm, fontWeight: '900', color: '#93C5FD', marginBottom: 2 },
  blackCardSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#64748B', lineHeight: 18 },
  blackGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  blackMetric:  { width: '48%', backgroundColor: '#0F172A', borderRadius: 10, padding: 10 },
  blackMetricLabel:{ fontSize: FONT_SIZE.xs - 1, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.3 },
  blackMetricVal:{ fontSize: FONT_SIZE.sm, fontWeight: '900', color: C.white, marginTop: 3 },
  blackFootnote:{ fontSize: FONT_SIZE.xs, color: '#475569', lineHeight: 18, marginBottom: 10 },
  blackShareBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1D4ED8', borderRadius: 10, paddingVertical: 10 },
  blackShareBtnText: { color: C.white, fontWeight: '800', fontSize: FONT_SIZE.xs },

  /* Receipt ID */
  receiptIdRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  receiptIdLabel:{ fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted },
  receiptIdVal: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.dim, fontVariant: ['tabular-nums'] },

  /* Support */
  supportRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 4 },
  supportText:  { fontSize: FONT_SIZE.sm, fontWeight: '600', color: C.muted },

  /* ── Post-trip feedback modal ────────────────────────────────────── */
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  feedbackSheet:{ backgroundColor: C.bgMid, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 8, gap: 12 },
  sheetHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: C.dim, alignSelf: 'center', marginBottom: 8 },

  feedbackDriverRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  feedbackAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  feedbackAvatarText: { fontSize: 22, fontWeight: '900', color: C.white },
  feedbackDriverLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted },
  feedbackDriverName: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: C.white },
  feedbackDriverPlate: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, marginTop: 2 },

  feedbackTitle:{ fontSize: FONT_SIZE.xl, fontWeight: '900', color: C.white, textAlign: 'center' },

  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  reactionChipOn:{ backgroundColor: 'rgba(34,197,94,0.12)', borderColor: C.green },
  reactionEmoji:{ fontSize: 16 },
  reactionLabel:{ fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted },
  reactionLabelOn: { color: C.white },

  starsRow:     { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  starHint:     { textAlign: 'center', fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.muted },

  commentInput: { backgroundColor: C.card, borderRadius: 12, padding: 12, color: C.white, fontSize: FONT_SIZE.sm, fontWeight: '600', minHeight: 60, textAlignVertical: 'top' },

  skipBtn:      { alignItems: 'center', paddingVertical: 8 },
  skipBtnText:  { fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.muted },

  /* Done step */
  feedbackDone: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  feedbackDoneIcon: { marginBottom: 4 },
  feedbackDoneTitle: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: C.white, textAlign: 'center' },
  feedbackDoneSub: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: C.muted, textAlign: 'center', lineHeight: 20 },
  feedbackDoneBtn: { backgroundColor: C.green, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 13, marginTop: 6 },
  feedbackDoneBtnText: { fontSize: FONT_SIZE.md, fontWeight: '900', color: C.white },

  favPromptCard:{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, gap: 8, width: '100%', alignItems: 'center' },
  favPromptTitle:{ fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white, textAlign: 'center' },
  favPromptSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, textAlign: 'center' },
  favPromptBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
  favPromptBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: C.white },
  favSavedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  favSavedPillText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.red },
});
