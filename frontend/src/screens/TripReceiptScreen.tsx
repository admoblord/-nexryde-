import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
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
import { RiderBrandHeaderRow } from '@/src/components/rider/RiderBrandChrome';
import { RiderFavoriteIcon } from '@/src/components/rider/RiderFavoriteIcon';
import { AddFavoriteDriverModal } from '@/src/components/rider/AddFavoriteDriverModal';
import { useFlowLayout } from '@/src/constants/flowLayout';
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
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { CURRENCY, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { summarizeTripReceiptFare } from '@/src/utils/tripReceiptFare';

const TIP_PRESETS = [0, 50, 100, 200] as const;

function parseIsoMs(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : null;
}

function formatReceiptElapsed(started?: string, completed?: string, durationMins?: number): string {
  const a = parseIsoMs(started);
  const b = parseIsoMs(completed);
  if (a != null && b != null && b >= a) {
    const ms = b - a;
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m} min ${String(s).padStart(2, '0')} sec`;
    return `${m} min ${String(s).padStart(2, '0')} sec`;
  }
  const dm = Math.round(Number(durationMins || 0));
  if (dm > 0) return `${dm} min 00 sec`;
  return '—';
}

// ── Colour palette ─────────────────────────────────────────────────────────
const C = {
  bg:         '#020617',
  bgElevated: '#0A0F1A',
  bgMid:      '#0B1223',
  card:       '#0F172A',
  cardLight:  '#1E293B',
  border:     '#1E293B',
  green:      '#22C55E',
  greenBright: '#32D74B',
  greenDim:   '#15803D',
  amber:      '#F59E0B',
  amberDim:   '#78350F',
  red:        '#EF4444',
  blue:       '#3B82F6',
  white:      '#FFFFFF',
  muted:      '#94A3B8',
  dim:        '#334155',
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
  favorite_driver_discount_pct?: number;
  favorite_driver_discount_ngn?: number;
  mystery_bonus_ngn?: number;
  mystery_bonus_expires_at?: string;
  surge_multiplier?: number;
  quoted_subtotal?: number;
  first_ride_discount_ngn?: number;
  first_ride_discount_pct?: number;
  started_at?: string;
}

export default function TripReceiptScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const flow    = useFlowLayout();
  const params  = useLocalSearchParams<{ tripId?: string }>();
  const { user } = useAppStore();
  const { userId, canCallAuthedApi } = useAuthedUserId();

  // ── Data state ──────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [trip,    setTrip]                  = useState<TripData | null>(null);
  const [blackBox, setBlackBox]             = useState<any>(null);
  const [loadingBlackBox, setLoadingBlackBox] = useState(false);

  // ── Interaction state ────────────────────────────────────────────────────
  const [isFavorite,      setIsFavorite]      = useState(false);
  const [savingFavorite,  setSavingFavorite]  = useState(false);
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [myRating,        setMyRating]        = useState(0);
  const [hoveredStar,     setHoveredStar]     = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [submittingRating,setSubmittingRating]= useState(false);
  const [selectedReacts,  setSelectedReacts]  = useState<string[]>([]);
  const [ratingComment,   setRatingComment]   = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const [tipNgn, setTipNgn] = useState(0);
  const [tipPickerOpen, setTipPickerOpen] = useState(false);
  const [customTipOpen, setCustomTipOpen] = useState(false);
  const [customTipDraft, setCustomTipDraft] = useState('');
  const [receiptExpanded, setReceiptExpanded] = useState(true);

  // ── Post-trip feedback (inline on this screen) ────────────────────

  // ── Animations ───────────────────────────────────────────────────────────
  const checkScale   = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const headerFade   = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(30)).current;
  const heartScale   = useRef(new Animated.Value(1)).current;
  const starScales   = useRef([1,2,3,4,5].map(() => new Animated.Value(1))).current;
  const scrollRef = useRef<ScrollView>(null);

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
        if (tripData?.driver_id && userId && canCallAuthedApi) {
          try {
            const favRes = await checkFavoriteDriver(userId, tripData.driver_id);
            setIsFavorite(favRes.data?.is_favorite === true);
          } catch {}
        }
      } catch {}
      finally { setLoading(false); }
    };
    run();
  }, [params.tripId, userId, canCallAuthedApi]);

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
  }, [loading]);

  // ── Computed view ────────────────────────────────────────────────────────
  const view = useMemo(() => {
    if (!trip) return null;
    const pickup  = typeof trip.pickup_location  === 'string' ? trip.pickup_location  : trip.pickup_location?.address  || 'Pickup';
    const dropoff = typeof trip.dropoff_location === 'string' ? trip.dropoff_location : trip.dropoff_location?.address || 'Dropoff';
    const createdAt = trip.completed_at || trip.created_at;
    const dt = createdAt ? new Date(createdAt) : null;
    const valid = dt && !Number.isNaN(dt.getTime());
    const firstDisc = Math.round(Number(trip.first_ride_discount_ngn || 0));
    const favDisc = Math.round(Number(trip.favorite_driver_discount_ngn || 0));
    const discountLabel =
      firstDisc > 0 && favDisc > 0
        ? 'Discount'
        : firstDisc > 0
          ? 'First ride discount'
          : favDisc > 0
            ? 'Favourite perk'
            : 'Discount';

    const fareSummary = summarizeTripReceiptFare({
      fare: trip.fare,
      base_fare: trip.base_fare,
      distance_fee: trip.distance_fee,
      time_fee: trip.time_fee,
      traffic_fee: trip.traffic_fee,
      quoted_subtotal: trip.quoted_subtotal,
      surge_multiplier: trip.surge_multiplier,
      first_ride_discount_ngn: trip.first_ride_discount_ngn,
      favorite_driver_discount_ngn: trip.favorite_driver_discount_ngn,
    });

    const durationElapsed = formatReceiptElapsed(
      trip.started_at,
      trip.completed_at,
      trip.duration_mins,
    );

    return {
      id:            trip.id,
      date:          valid ? dt!.toLocaleDateString() : 'N/A',
      time:          valid ? dt!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      pickup,
      dropoff,
      distance:      `${Number(trip.distance_km || 0).toFixed(1)} km`,
      duration:      `${Math.round(Number(trip.duration_mins || 0))} mins`,
      durationElapsed,
      fareSummary,
      discountLabel,
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
      favoriteDriverDiscount:    Number(trip.favorite_driver_discount_ngn || 0),
      favoriteDriverDiscountPct: Number(trip.favorite_driver_discount_pct || 0),
      mysteryBonusNgn: Number(trip.mystery_bonus_ngn || 0),
      mysteryBonusExpiryLabel: (() => {
        const raw = trip.mystery_bonus_expires_at;
        if (!raw) return '';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '';
        return `Use by ${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
      })(),
    };
  }, [trip]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectStar = useCallback(
    (star: number) => {
      if (ratingSubmitted || submittingRating) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setMyRating(star);
    },
    [ratingSubmitted, submittingRating],
  );

  const submitRating = useCallback(async () => {
    if (!trip?.id || !userId || !canCallAuthedApi || ratingSubmitted || submittingRating || myRating < 1) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.spring(starScales[myRating - 1], { toValue: 1.35, tension: 200, friction: 5, useNativeDriver: true }),
      Animated.spring(starScales[myRating - 1], { toValue: 1, tension: 200, friction: 5, useNativeDriver: true }),
    ]).start();
    setSubmittingRating(true);
    try {
      const tipLine =
        tipNgn > 0
          ? `Rider tip intent: ${CURRENCY}${tipNgn.toLocaleString()} (settle with driver in cash or follow in-app wallet tips when available).`
          : '';
      const commentJoined = [ratingComment.trim(), tipLine].filter(Boolean).join('\n\n');
      const body = {
        overall_rating: myRating,
        comment: commentJoined || undefined,
        smoothness:
          selectedReacts.includes('smooth') || selectedReacts.includes('great') || selectedReacts.includes('ontime')
            ? 5
            : undefined,
        politeness: selectedReacts.includes('friendly') ? 5 : undefined,
        cleanliness: selectedReacts.includes('clean') ? 5 : undefined,
        safety: selectedReacts.includes('safe') ? 5 : undefined,
      };
      await fetch(`${BACKEND_URL}/api/trips/${trip.id}/rate?rater_id=${userId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setRatingSubmitted(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not save rating', 'Please try again.');
    } finally {
      setSubmittingRating(false);
    }
  }, [
    trip?.id,
    userId,
    canCallAuthedApi,
    myRating,
    selectedReacts,
    ratingComment,
    tipNgn,
    ratingSubmitted,
    submittingRating,
  ]);

  const openTipSheet = useCallback(() => {
    void Haptics.selectionAsync();
    setTipPickerOpen(true);
  }, []);

  const toggleReceiptDetails = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReceiptExpanded((prev) => {
      const next = !prev;
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (next) scrollRef.current?.scrollToEnd({ animated: true });
          else scrollRef.current?.scrollTo({ y: 0, animated: true });
        }, next ? 120 : 80);
      });
      return next;
    });
  }, []);

  const requestAnotherRide = useCallback(() => {
    router.replace('/rider/book' as any);
  }, [router]);

  const toggleReaction = (id: string) => {
    void Haptics.selectionAsync();
    setSelectedReacts((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleAddFavorite = async () => {
    if (!userId || !canCallAuthedApi || !trip?.driver_id || savingFavorite) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.5, tension: 180, friction: 4, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1,   tension: 180, friction: 4, useNativeDriver: true }),
    ]).start();
    setSavingFavorite(true);
    try {
      await addFavoriteDriver(userId, trip.driver_id);
      setIsFavorite(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not save driver.');
    } finally {
      setSavingFavorite(false);
    }
  };

  const handleFavoritePress = () => {
    if (!trip?.driver_id || savingFavorite) return;
    if (isFavorite) {
      handleRemoveFavorite();
      return;
    }
    void Haptics.selectionAsync();
    setShowFavoriteModal(true);
  };

  const handleRemoveFavorite = () => {
    if (!userId || !canCallAuthedApi || !trip?.driver_id || savingFavorite) return;
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
              await removeFavoriteDriver(userId, trip.driver_id!);
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
    const missingTripId = !params.tripId;
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centered}>
          <Ionicons name={missingTripId ? 'alert-circle-outline' : 'receipt-outline'} size={56} color={C.dim} />
          <Text style={s.emptyTitle}>{missingTripId ? 'No trip selected' : 'Receipt not available'}</Text>
          <Text style={s.emptySub}>
            {missingTripId
              ? 'Open a completed trip from Trips to view a receipt, or go back and try again.'
              : 'This trip could not be loaded. It may have been removed or you may not have access.'}
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main receipt ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bgElevated} />

      <Modal
        transparent
        visible={tipPickerOpen}
        animationType="fade"
        onRequestClose={() => setTipPickerOpen(false)}
      >
        <Pressable style={s.tipModalOverlay} onPress={() => setTipPickerOpen(false)}>
          <Pressable style={[s.tipModalCard, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.tipModalHandle} />
            <Text style={s.tipModalTitle}>Add tip</Text>
            <Text style={s.tipModalSub}>Tips are recorded with your rating. Settle in cash with your driver unless in-app tipping is enabled for your city.</Text>
            {[...TIP_PRESETS, 'custom' as const].map((opt) => (
              <TouchableOpacity
                key={String(opt)}
                style={[s.tipModalRow, typeof opt === 'number' && opt === tipNgn && s.tipModalRowOn]}
                onPress={() => {
                  if (opt === 'custom') {
                    setCustomTipDraft(tipNgn > 0 && !(TIP_PRESETS as readonly number[]).includes(tipNgn) ? String(tipNgn) : '');
                    setTipPickerOpen(false);
                    setCustomTipOpen(true);
                  } else {
                    setTipNgn(opt);
                    setTipPickerOpen(false);
                  }
                }}
              >
                <Text style={s.tipModalRowText}>{opt === 'custom' ? 'Custom amount…' : `${CURRENCY}${opt}`}</Text>
                {typeof opt === 'number' && opt === tipNgn ? <Ionicons name="checkmark-circle" size={22} color={C.green} /> : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.tipModalClose} onPress={() => setTipPickerOpen(false)}>
              <Text style={s.tipModalCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={customTipOpen} animationType="fade" onRequestClose={() => setCustomTipOpen(false)}>
        <Pressable style={s.tipModalOverlay} onPress={() => setCustomTipOpen(false)}>
          <Pressable style={[s.tipModalCard, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.tipModalHandle} />
            <Text style={s.tipModalTitle}>Custom tip</Text>
            <TextInput
              style={s.customTipInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={C.muted}
              value={customTipDraft}
              onChangeText={setCustomTipDraft}
            />
            <TouchableOpacity
              style={s.submitRatingBtn}
              onPress={() => {
                const n = Math.max(0, Math.round(Number(String(customTipDraft).replace(/[^\d]/g, '')) || 0));
                setTipNgn(n);
                setCustomTipOpen(false);
              }}
            >
              <Text style={s.submitRatingBtnText}>Save tip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.tipModalClose} onPress={() => setCustomTipOpen(false)}>
              <Text style={s.tipModalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <RiderBrandHeaderRow topInset={0} />
      <View style={[s.subNav, { paddingHorizontal: flow.padH, maxWidth: flow.maxContentWidth, alignSelf: 'center', width: '100%' }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.subNavBtn}
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={C.white} />
        </TouchableOpacity>
        <Text style={s.subNavTitle}>Trip completed</Text>
        <TouchableOpacity
          onPress={handleShare}
          style={s.subNavBtn}
          accessibilityLabel="Share receipt"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="share-outline" size={22} color={C.greenBright} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        contentContainerStyle={[
          s.scroll,
          {
            paddingBottom: insets.bottom + SPACING.xl,
            paddingHorizontal: flow.padH,
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Trip completed hero ─────────────────────────────────────── */}
        <Animated.View style={[s.completeHero, { opacity: headerFade }]}>
          <View style={s.completeHeroConfetti} pointerEvents="none">
            {[...Array(14)].map((_, i) => (
              <View
                key={i}
                style={[
                  s.confettiPiece,
                  {
                    left: `${(i * 17) % 92}%`,
                    top: `${(i * 5) % 20}%`,
                    opacity: 0.12 + (i % 5) * 0.07,
                    backgroundColor: i % 3 === 0 ? '#32D74B' : i % 3 === 1 ? '#22C55E' : '#4ADE80',
                  },
                ]}
              />
            ))}
          </View>
          <Animated.View style={[s.heroCheckWrap, { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}>
            <LinearGradient colors={['#32D74B', '#16A34A']} style={s.heroCheckCircleLg}>
              <Ionicons name="checkmark" size={34} color="#022C22" />
            </LinearGradient>
          </Animated.View>
          <Text style={s.completeHeroTitle}>Trip Completed!</Text>
          <Text style={s.completeHeroSub}>Safe travels!</Text>
        </Animated.View>

        <Animated.View style={{ opacity: headerFade, transform: [{ translateY: contentSlide }] }}>
          {/* ── Trip summary (fare) ───────────────────────────────────── */}
          <View style={s.summaryCard}>
            <Text style={s.summaryCardTitle}>Trip Summary</Text>
            <View style={s.summaryStatRow}>
              <View style={s.summaryStatCell}>
                <Ionicons name="location-outline" size={18} color="#3B82F6" />
                <Text style={s.summaryStatLabel}>Distance</Text>
                <Text style={s.summaryStatVal}>{view.distance}</Text>
              </View>
              <View style={s.summaryStatCell}>
                <Ionicons name="time-outline" size={18} color="#3B82F6" />
                <Text style={s.summaryStatLabel}>Duration</Text>
                <Text style={s.summaryStatVal}>{view.durationElapsed}</Text>
              </View>
            </View>
            <View style={s.summaryRule} />
            <View style={s.summaryLineRow}>
              <View style={s.summaryLineLeft}>
                <Ionicons name="car-sport-outline" size={17} color={C.muted} />
                <Text style={s.summaryLineLabel}>Base Fare</Text>
              </View>
              <Text style={s.summaryLineVal}>{CURRENCY}{view.fareSummary.baseBlock.toLocaleString()}</Text>
            </View>
            {view.fareSummary.showSurge ? (
              <View style={s.summaryLineRow}>
                <View style={s.summaryLineLeft}>
                  <Ionicons name="trending-up-outline" size={17} color={C.muted} />
                  <Text style={s.summaryLineLabel}>
                    Surge (
                    {view.fareSummary.surgeMultiplier >= 10
                      ? Math.round(view.fareSummary.surgeMultiplier)
                      : Number(view.fareSummary.surgeMultiplier.toFixed(1))}
                    ×)
                  </Text>
                </View>
                <Text style={s.summaryLineVal}>{CURRENCY}{view.fareSummary.surgeAmount.toLocaleString()}</Text>
              </View>
            ) : null}
            {view.fareSummary.showDiscount ? (
              <View style={s.summaryLineRow}>
                <View style={s.summaryLineLeft}>
                  <Ionicons name="pricetag-outline" size={17} color={C.muted} />
                  <Text style={s.summaryLineLabel}>{view.discountLabel}</Text>
                </View>
                <Text style={[s.summaryLineVal, s.summaryDiscountVal]}>
                  −{CURRENCY}{view.fareSummary.discountAmount.toLocaleString()}
                </Text>
              </View>
            ) : null}
            <View style={s.summaryRule} />
            <View style={s.summaryTotalRow}>
              <Text style={s.summaryTotalLabel}>TOTAL</Text>
              <Text style={s.summaryTotalVal}>{CURRENCY}{view.total.toLocaleString()}</Text>
            </View>
            <View style={s.summaryPayRow}>
              <Ionicons name="wallet-outline" size={15} color={C.muted} />
              <Text style={s.summaryPayText}>
                {view.paymentStatus === 'pending' ? `Pending · ${view.paymentMethod}` : `Paid via ${view.paymentMethod}`}
              </Text>
            </View>
          </View>

          {view.paymentStatus === 'pending' && view.accountNumber ? (
            <View style={s.payInstructCard}>
              <Text style={s.payInstructTitle}>Pay Driver Directly</Text>
              <Text style={s.payInstructSub}>Transfer to the account below:</Text>
              <Text style={s.payInstructBank}>{view.bankName}</Text>
              <Text style={s.payInstructAcct}>{view.accountNumber}</Text>
              <Text style={s.payInstructName}>{view.accountName}</Text>
              {userId === trip?.rider_id && (
                <TouchableOpacity style={s.confirmPayBtn} onPress={handleConfirmPayment} disabled={confirmingPayment}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={C.white} />
                  <Text style={s.confirmPayBtnText}>{confirmingPayment ? 'Confirming...' : 'I Have Paid'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
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
            {trip?.driver_id ? (
              <RiderFavoriteIcon
                size={48}
                filled={isFavorite}
                onPress={handleFavoritePress}
                disabled={savingFavorite}
                style={s.heartBtn}
              />
            ) : null}
          </View>

          {view.mysteryBonusNgn > 0 ? (
            <LinearGradient colors={['#422006', '#713F12', '#1E293B']} style={s.mysteryBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={s.mysteryIconWrap}>
                <Ionicons name="gift" size={22} color="#FBBF24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.mysteryTitle}>Mystery bonus</Text>
                <Text style={s.mysteryAmount}>
                  {CURRENCY}
                  {Math.round(view.mysteryBonusNgn).toLocaleString()} promo credit
                </Text>
                <Text style={s.mysterySub}>
                  A little surprise from Nexryde — auto-applied toward eligible rides from your promo balance.
                  {view.mysteryBonusExpiryLabel ? ` ${view.mysteryBonusExpiryLabel}.` : ''}
                </Text>
              </View>
              <Ionicons name="sparkles" size={20} color="#FDE68A" />
            </LinearGradient>
          ) : null}

          {trip?.driver_id ? (
            <TouchableOpacity
              style={s.sameDriverCta}
              onPress={() =>
                router.push({
                  pathname: '/rider/book',
                  params: {
                    requestedDriverId: trip.driver_id!,
                    driverName: String(trip.driver_name || view.driverName || '').trim(),
                  },
                } as any)
              }
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Book again with same driver"
            >
              <Ionicons name="repeat" size={18} color={C.green} />
              <View style={{ flex: 1 }}>
                <Text style={s.sameDriverTitle}>Ride with same driver next time</Text>
                <Text style={s.sameDriverSub}>Opens booking with priority matching · add favourites for fare perks.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </TouchableOpacity>
          ) : null}

          {/* ── Favourite prompt banner (if not yet saved) ───────────── */}
          {trip?.driver_id && !isFavorite && ratingSubmitted && (
            <TouchableOpacity
              style={s.favBanner}
              onPress={() => {
                void Haptics.selectionAsync();
                setShowFavoriteModal(true);
              }}
              disabled={savingFavorite}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#3B0764', '#4C1D95']} style={s.favBannerGrad}>
                <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                  <Ionicons name="heart" size={22} color="#E879F9" />
                </Animated.View>
                <View style={{ flex: 1 }}>
                  <Text style={s.favBannerTitle}>Enjoyed riding with {view.driverName}?</Text>
                  <Text style={s.favBannerSub}>Save to favourites · request them faster · about 5% off when they accept</Text>
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

          {/* ── Rate driver, tip, primary actions ────────────────────── */}
          {trip?.driver_id && !ratingSubmitted ? (
            <View style={s.rateSection}>
              <Text style={s.rateSectionTitle}>Rate Your Driver</Text>
              <View style={s.starsRowReceipt}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = star <= (hoveredStar || myRating);
                  return (
                    <Animated.View key={star} style={{ transform: [{ scale: starScales[star - 1] }] }}>
                      <TouchableOpacity
                        onPress={() => handleSelectStar(star)}
                        onPressIn={() => setHoveredStar(star)}
                        onPressOut={() => setHoveredStar(0)}
                        disabled={submittingRating || ratingSubmitted}
                        style={{ padding: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={`${star} stars`}
                      >
                        <Ionicons
                          name={filled ? 'star' : 'star-outline'}
                          size={44}
                          color={filled ? '#FBBF24' : '#475569'}
                        />
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}
              </View>
              <Text style={s.starHintReceipt} numberOfLines={2}>
                {myRating === 0
                  ? 'Tap a star to rate — tags and tip are optional.'
                  : 'Optional: add quick tags, a short note, or a tip intent for your driver.'}
              </Text>
              <TextInput
                style={s.rateCommentInput}
                placeholder="Add a comment..."
                placeholderTextColor="#64748B"
                value={ratingComment}
                onChangeText={setRatingComment}
                multiline
                maxLength={240}
              />
              <View style={[s.reactionGrid, s.reactionGridCompact]}>
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
              <Text style={s.tipSectionTitle}>Add Tip</Text>
              <TouchableOpacity style={s.tipSelectorRow} onPress={openTipSheet} accessibilityRole="button">
                <Text style={s.tipSelectorValue}>
                  {CURRENCY}
                  {tipNgn.toLocaleString()}
                </Text>
                <Ionicons name="chevron-down" size={20} color={C.muted} />
              </TouchableOpacity>
              <View style={s.tipChipWrap}>
                {TIP_PRESETS.map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[s.tipChip, tipNgn === n && s.tipChipOn]}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setTipNgn(n);
                    }}
                  >
                    <Text style={[s.tipChipTxt, tipNgn === n && s.tipChipTxtOn]}>
                      {n === 0 ? `${CURRENCY}0` : `${CURRENCY}${n}`}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    s.tipChip,
                    tipNgn > 0 && !(TIP_PRESETS as readonly number[]).includes(tipNgn) ? s.tipChipOn : null,
                  ]}
                  onPress={() => {
                    setCustomTipDraft(tipNgn > 0 ? String(tipNgn) : '');
                    setCustomTipOpen(true);
                  }}
                >
                  <Text
                    style={[
                      s.tipChipTxt,
                      tipNgn > 0 && !(TIP_PRESETS as readonly number[]).includes(tipNgn) ? s.tipChipTxtOn : null,
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[s.submitRatingBtn, (myRating < 1 || submittingRating) && s.submitRatingBtnOff]}
                onPress={() => void submitRating()}
                disabled={myRating < 1 || submittingRating || ratingSubmitted}
                accessibilityRole="button"
                accessibilityLabel="Submit rating and tip"
              >
                <Text style={s.submitRatingBtnText}>
                  {submittingRating ? 'Submitting…' : 'Submit rating'}
                </Text>
              </TouchableOpacity>
              {submittingRating ? <ActivityIndicator size="small" color={C.green} style={{ marginTop: 8 }} /> : null}
            </View>
          ) : null}

          {trip?.driver_id && ratingSubmitted ? (
            <View style={s.ratingDoneCard}>
              <Ionicons name="checkmark-circle" size={22} color={C.greenBright} />
              <Text style={s.ratingDoneText}>You rated {myRating}★ — thank you!</Text>
            </View>
          ) : null}

          <View style={s.actionStack}>
              <TouchableOpacity
              style={[s.btnViewReceipt, receiptExpanded && s.btnViewReceiptActive]}
              onPress={toggleReceiptDetails}
              accessibilityRole="button"
              accessibilityLabel={receiptExpanded ? 'Hide receipt details' : 'View full receipt'}
            >
              <View style={s.btnViewReceiptRow}>
                <View style={s.btnViewReceiptIcon}>
                  <Ionicons name="receipt-outline" size={20} color={C.blue} />
                </View>
                <Text style={s.btnViewReceiptText}>
                  {receiptExpanded ? 'Hide receipt details' : 'View Receipt'}
                </Text>
                <View style={s.btnViewReceiptIcon}>
                  <Ionicons name={receiptExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.blue} />
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.btnRequestRide}
              onPress={requestAnotherRide}
              accessibilityRole="button"
              activeOpacity={0.88}
            >
              <Text style={s.btnRequestRideText}>REQUEST ANOTHER RIDE</Text>
            </TouchableOpacity>
          </View>

          {receiptExpanded ? (
            <View style={s.receiptExpandedBlock}>
              <Text style={s.sectionHeading}>Route & details</Text>

              <View style={s.routeCard}>
                <View style={s.routePoint}>
                  <View style={[s.routeDot, { backgroundColor: C.greenBright }]} />
                  <View style={s.routeInfo}>
                    <Text style={s.routeLabel}>Pickup</Text>
                    <Text style={s.routeAddress} numberOfLines={2}>
                      {view.pickup}
                    </Text>
                  </View>
                </View>
                <View style={s.routeLine} />
                <View style={s.routePoint}>
                  <View style={[s.routeDot, { backgroundColor: C.red }]} />
                  <View style={s.routeInfo}>
                    <Text style={s.routeLabel}>Dropoff</Text>
                    <Text style={s.routeAddress} numberOfLines={2}>
                      {view.dropoff}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={s.detailFareCard}>
                <Text style={s.detailFareTitle}>Fare detail</Text>
                {[
                  { label: 'Base fare', val: view.baseFare },
                  { label: `Distance (${view.distance})`, val: view.distanceFare },
                  { label: `Time (${view.duration})`, val: view.timeFare },
                  ...(view.trafficFare > 0 ? [{ label: 'Traffic', val: view.trafficFare }] : []),
                ].map(({ label, val }) => (
                  <View key={label} style={s.fareRow}>
                    <Text style={s.fareLabel}>{label}</Text>
                    <Text style={s.fareVal}>
                      {CURRENCY}
                      {Number(val).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>

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
                        {
                          label: 'Record hash',
                          val: `${String(blackBox.certification?.record_hash || '').slice(0, 12)}…`,
                        },
                        {
                          label: 'GPS points',
                          val: String(blackBox.route_summary?.recorded_route_points || 0),
                        },
                        {
                          label: 'Forensic points',
                          val: String(blackBox.route_summary?.forensic_route_points || 0),
                        },
                        {
                          label: 'Timeline events',
                          val: String(Array.isArray(blackBox.timeline) ? blackBox.timeline.length : 0),
                        },
                        {
                          label: 'Face match',
                          val: blackBox.driver_identity?.face_verified_at_start ? 'Verified' : 'Pending',
                        },
                        {
                          label: 'Comms digest',
                          val: `${String(blackBox.communications_integrity?.communication_digest || '').slice(0, 10) || 'n/a'}…`,
                        },
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

              <View style={s.receiptIdRow}>
                <Text style={s.receiptIdLabel}>Receipt</Text>
                <Text style={s.receiptIdVal}>#{view.id.slice(0, 16).toUpperCase()}</Text>
              </View>

              <TouchableOpacity
                style={s.supportRow}
                onPress={() => router.push({ pathname: '/support', params: { tripId: view.id } })}
              >
                <Ionicons name="help-circle-outline" size={18} color={C.muted} />
                <Text style={s.supportText}>Need help with this trip?</Text>
              </TouchableOpacity>
            </View>
          ) : null}

        </Animated.View>
      </ScrollView>

      <AddFavoriteDriverModal
        visible={showFavoriteModal}
        driverName={view?.driverName}
        driverVehicle={view?.vehicle}
        driverPlate={view?.plate}
        saving={savingFavorite}
        onDismiss={() => setShowFavoriteModal(false)}
        onAdd={() => void handleAddFavorite().then(() => setShowFavoriteModal(false))}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bgElevated },
  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  loadingText:  { color: C.muted, fontWeight: '600', fontSize: FONT_SIZE.sm },
  emptyTitle:   { fontSize: FONT_SIZE.lg, fontWeight: '800', color: C.white, textAlign: 'center' },
  emptySub:     { fontSize: FONT_SIZE.sm, color: C.muted, textAlign: 'center', marginTop: SPACING.sm, marginBottom: SPACING.lg, paddingHorizontal: SPACING.xl, lineHeight: 20 },
  primaryBtn:   { backgroundColor: C.greenBright, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  primaryBtnText: { color: '#022C22', fontWeight: '800' },

  subNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.2)',
    backgroundColor: C.bgElevated,
  },
  subNavBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  subNavTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white },

  completeHero: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 12,
    paddingHorizontal: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  completeHeroConfetti: { ...StyleSheet.absoluteFillObject },
  confettiPiece: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  heroCheckWrap: { marginBottom: 8 },
  heroCheckCircleLg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeHeroTitle: { fontSize: 22, fontWeight: '900', color: C.greenBright, marginTop: 2 },
  completeHeroSub: { fontSize: 16, fontWeight: '700', color: '#4ADE80', marginTop: 4 },

  summaryCard: {
    backgroundColor: '#141C2B',
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  summaryCardTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white, marginBottom: 14 },
  summaryStatRow: { flexDirection: 'row', gap: 10 },
  summaryStatCell: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
    gap: 6,
  },
  summaryStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryStatVal: { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white },
  summaryRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148,163,184,0.25)',
    marginVertical: 14,
  },
  summaryLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLineLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  summaryLineLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: C.muted },
  summaryLineVal: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white },
  summaryDiscountVal: { color: '#F87171' },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  summaryTotalLabel: { fontSize: 13, fontWeight: '900', color: C.white, letterSpacing: 1 },
  summaryTotalVal: { fontSize: 26, fontWeight: '900', color: '#32D74B' },
  summaryPayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  summaryPayText: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted },

  rateSection: {
    backgroundColor: '#141C2B',
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  rateSectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white, marginBottom: 12 },
  starsRowReceipt: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 8 },
  starHintReceipt: {
    textAlign: 'center',
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: C.muted,
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  rateCommentInput: {
    backgroundColor: '#0B1120',
    borderRadius: 14,
    padding: 14,
    color: C.white,
    fontSize: FONT_SIZE.sm,
    minHeight: 72,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.6)',
    textAlignVertical: 'top',
  },
  reactionGridCompact: { marginTop: 10, marginBottom: 4 },

  tipSectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white, marginTop: 12, marginBottom: 8 },
  tipSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B1120',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.6)',
  },
  tipSelectorValue: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: C.white },
  tipChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tipChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#0B1120',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.6)',
  },
  tipChipOn: { borderColor: '#32D74B', backgroundColor: 'rgba(50,215,75,0.12)' },
  tipChipTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.muted },
  tipChipTxtOn: { color: '#32D74B' },

  actionStack: { gap: 12, marginTop: 16 },
  btnViewReceipt: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.blue,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  btnViewReceiptActive: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: '#60A5FA',
  },
  btnViewReceiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  btnViewReceiptIcon: { width: 32, alignItems: 'center', justifyContent: 'center' },
  btnViewReceiptText: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: C.blue,
  },
  btnRequestRide: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: C.greenBright,
    alignItems: 'center',
    shadowColor: C.greenBright,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  btnRequestRideText: { fontSize: 13, fontWeight: '900', color: '#022C22', letterSpacing: 0.8 },

  receiptExpandedBlock: { marginTop: 8, gap: 12 },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  detailFareCard: {
    backgroundColor: C.card,
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  detailFareTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white, marginBottom: 10 },

  tipModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  tipModalCard: {
    backgroundColor: C.bgMid,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(59,130,246,0.35)',
  },
  tipModalTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: C.white, marginBottom: 6 },
  tipModalSub: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: C.muted,
    marginBottom: 12,
    lineHeight: 18,
  },
  tipModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tipModalRowOn: { backgroundColor: 'rgba(34,197,94,0.08)' },
  tipModalRowText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: C.white },
  tipModalClose: { alignItems: 'center', paddingTop: 12 },
  tipModalCloseText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.muted },
  customTipInput: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    color: C.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  tipModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.dim,
    alignSelf: 'center',
    marginBottom: 14,
  },

  scroll: { paddingTop: 4 },

  /* Driver card */
  driverCard:   {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 0,
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
  },
  driverAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  driverInitial:{ fontSize: 22, fontWeight: '900', color: C.white },
  driverMeta:   { flex: 1 },
  driverName:   { fontSize: FONT_SIZE.md, fontWeight: '800', color: C.white },
  driverSub:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  driverRating: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.amber },
  driverVehicle:{ fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted },
  heartBtn:     { padding: 8 },

  sameDriverCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 0,
    marginTop: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  sameDriverTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white },
  sameDriverSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, marginTop: 3 },

  mysteryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 0,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  mysteryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(251,191,36,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mysteryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  mysteryAmount: { fontSize: 20, fontWeight: '900', color: C.white, marginTop: 2 },
  mysterySub: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginTop: 6, lineHeight: 16 },

  /* Favourite banners */
  favBanner:    { marginHorizontal: 0, marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  favBannerGrad:{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  favBannerTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white },
  favBannerSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: '#C4B5FD', marginTop: 2 },
  favSavedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 0, marginTop: 10, backgroundColor: '#1A0A0A', borderRadius: 12, padding: 12 },
  favSavedBannerText: { flex: 1, fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.red },
  favSavedBannerRemove: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted },

  ratingDoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(50,215,75,0.1)',
    marginHorizontal: 0,
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(50,215,75,0.25)',
  },
  ratingDoneText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.greenBright },

  /* Route */
  routeCard:    {
    backgroundColor: C.card,
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.1)',
  },
  routePoint:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot:     { width: 11, height: 11, borderRadius: 6, marginTop: 5 },
  routeInfo:    { flex: 1 },
  routeLabel:   { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  routeAddress: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: C.white, marginTop: 2 },
  routeLine:    { width: 1, height: 24, backgroundColor: C.dim, marginLeft: 5, marginVertical: 4 },

  /* Fare rows (detail card) */
  fareRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  fareLabel:    { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted },
  fareVal:      { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.white },

  /* Pay instructions */
  payInstructCard: { backgroundColor: C.card, marginHorizontal: 0, marginTop: 10, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.green + '30' },
  payInstructTitle: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.green, marginBottom: 4 },
  payInstructSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: C.muted, marginBottom: 10 },
  payInstructBank: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: C.white },
  payInstructAcct: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: C.green, marginTop: 2 },
  payInstructName: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted, marginTop: 4 },
  confirmPayBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, backgroundColor: C.green, borderRadius: 10, paddingVertical: 11 },
  confirmPayBtnText: { color: C.white, fontWeight: '800', fontSize: FONT_SIZE.sm },

  /* Black Shield */
  blackCard:    {
    backgroundColor: '#0A1628',
    borderWidth: 1,
    borderColor: '#1D4ED8' + '50',
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
  },
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
  receiptIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 0,
    marginTop: 4,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  receiptIdLabel:{ fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted },
  receiptIdVal: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.dim, fontVariant: ['tabular-nums'] },

  /* Support */
  supportRow:   {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 0,
    marginBottom: 8,
  },
  supportText:  { fontSize: FONT_SIZE.sm, fontWeight: '600', color: C.muted },

  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reactionChipOn: { backgroundColor: 'rgba(50,215,75,0.12)', borderColor: C.greenBright },
  reactionEmoji: { fontSize: 16 },
  reactionLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: C.muted },
  reactionLabelOn: { color: C.white },

  submitRatingBtn: {
    backgroundColor: C.greenBright,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  submitRatingBtnOff: { opacity: 0.42 },
  submitRatingBtnText: { fontSize: FONT_SIZE.md, fontWeight: '900', color: '#022C22' },
});
