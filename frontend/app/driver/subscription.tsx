import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import {
  getSubscriptionConfig,
  getDriverSubscriptionStatus,
  initiateSubscriptionCheckout,
  verifyPendingSubscriptionCheckout,
  formatApiDetail,
  messageFromAxiosError,
} from '@/src/services/api';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { openSquadCheckoutUrl } from '@/src/services/squadCheckoutOpen';
import axios from 'axios';

/** AsyncStorage key for persisting the pending checkout reference across app restarts. */
const PENDING_SUB_REF_KEY = '@nexryde_pending_sub_checkout_ref';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PricingData {
  city_rider: {
    current_price: number;
    current_phase: string;
    launch_slots_remaining: number;
  };
  road_warrior: {
    current_price: number;
    current_phase: string;
    launch_slots_remaining: number;
  };
}

interface SubscriptionStatus {
  tier: 'city_rider' | 'road_warrior' | 'none';
  status: 'none' | 'trial' | 'active' | 'expired' | 'pending_verification' | 'pending_payment' | 'grace_period';
  monthly_price: number;
  trial_active: boolean;
  trial_trips_completed?: number;
  trial_trips_remaining?: number;
  trial_trips_target?: number;
  trial_extended?: boolean;
  trial_completed?: boolean;
  days_remaining?: number;
  can_upgrade: boolean;
  upgrade_requirements?: {
    rating_met: boolean;
    trips_met: boolean;
    current_rating: number;
    current_trips: number;
  };
}

interface VirtualAccountDetails {
  account_number: string;
  bank_name: string;
  account_name: string;
  reference?: string;
  status?: string;
  amount_expected?: number;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountDetails | null>(null);
  /** Latest Squad subscription checkout ref (ref avoids stale interval closures). */
  const pendingSubCheckoutRef = useRef<string | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastKnownStatusRef = useRef<string | null>(null);
  const confirmPendingCheckoutRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(async () => {});
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 50)).current;

  useEffect(() => {
    initializeData();
    
    // Safety timeout for web - stop loading after 5 seconds
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);
    
    // Entry animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
    
    return () => {
      clearTimeout(timeout);
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, []);

  const initializeData = async () => {
    try {
      // Restore any persisted pending ref (survives app restarts)
      const stored = await AsyncStorage.getItem(PENDING_SUB_REF_KEY);
      if (stored) {
        pendingSubCheckoutRef.current = stored;
      }
      const eligible = await ensureDriverEligibleForActivation();
      if (!eligible) return;
      await Promise.all([fetchPricing(), fetchSubscriptionStatus()]);
    } catch (error) {
      if (__DEV__) console.warn('Error initializing subscription', error);
      Alert.alert('Error', 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const ensureDriverEligibleForActivation = async () => {
    if (!user?.id) return true;
    const response = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/onboarding-status`, {
      headers: getAuthHeaders(),
    });
    const status = await response.json();
    const step = status?.step;
    if (step === 'dashboard_limited' || step === 'documents_review') {
      Alert.alert(
        'Verification in review',
        'Your documents are saved. Subscription and payment activation unlock after approval.',
        [{ text: 'Go to driver home', onPress: () => router.replace('/(driver-tabs)/driver-home') }],
      );
      router.replace('/(driver-tabs)/driver-home');
      return false;
    }
    if (step === 'documents_rejected') {
      router.replace({
        pathname: '/(auth)/driver-verification-status',
        params: { driver_id: user.id, phone: user.phone, name: user.name, email: user.email },
      });
      return false;
    }
    return true;
  };

  const fetchPricing = async () => {
    try {
      const response = await getSubscriptionConfig();
      const data = response.data || {};
      setPricing({
        city_rider: {
          current_price: data.monthly_fee || data.current_price || 18000,
          current_phase: data.current_phase || 'early',
          launch_slots_remaining: data.launch_slots_remaining ?? 0,
        },
        road_warrior: {
          current_price: data.road_warrior_price || 30000,
          current_phase: data.current_phase || 'early',
          launch_slots_remaining: data.road_warrior_launch_slots_remaining ?? 0,
        },
      });
    } catch (error) {
      if (__DEV__) console.warn('Error fetching pricing', error);
      // Set default pricing
      setPricing({
        city_rider: { current_price: 18000, current_phase: 'early', launch_slots_remaining: 450 },
        road_warrior: { current_price: 30000, current_phase: 'early', launch_slots_remaining: 180 },
      });
    }
  };

  const stopStatusPolling = () => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  };

  const ensureStatusPolling = () => {
    if (statusPollRef.current) return;
    statusPollRef.current = setInterval(async () => {
      if (lastKnownStatusRef.current === 'pending_payment') {
        try {
          await verifyPendingSubscriptionCheckout(
            pendingSubCheckoutRef.current || undefined,
          );
        } catch {
          /* non-fatal */
        }
      }
      await fetchSubscriptionStatus();
    }, 16000);
  };

  const fetchSubscriptionStatus = async () => {
    if (!user?.id) {
      setSubscription({
        tier: 'none',
        status: 'expired',
        monthly_price: 0,
        trial_active: false,
        can_upgrade: false,
      });
      return;
    }

    try {
      const response = await getDriverSubscriptionStatus();
      const data = response.data || {};
      
      // Map API response to expected format
      const normalizedStatus: SubscriptionStatus['status'] = data.status || 'none';
      const activeOrPending = ['trial', 'active', 'grace_period', 'pending_payment', 'pending_verification'].includes(normalizedStatus);
      const tier = activeOrPending ? (data.tier || 'city_rider') : 'none';
      if (data.virtual_account?.account_number && data.virtual_account?.bank_name) {
        setVirtualAccount({
          account_number: data.virtual_account.account_number,
          bank_name: data.virtual_account.bank_name,
          account_name: data.virtual_account.account_name || user?.name || 'Nexryde Driver',
          reference: data.virtual_account.reference,
          status: data.virtual_account.status,
          amount_expected: data.virtual_account.amount_expected,
        });
      } else {
        setVirtualAccount(null);
      }
      setSubscription({
        tier,
        status: normalizedStatus,
        monthly_price: data.amount_expected || pricing?.city_rider?.current_price || 18000,
        trial_active: data.trial_active || data.status === 'trial',
        trial_trips_completed: data.trial_trips_completed ?? 0,
        trial_trips_remaining: data.trial_trips_remaining,
        trial_trips_target: data.trial_trips_target ?? 20,
        trial_extended: data.trial_extended ?? false,
        trial_completed: data.trial_completed ?? false,
        days_remaining: data.days_remaining,
        can_upgrade: data.can_upgrade ?? (data.status === 'active' || data.status === 'trial'),
        upgrade_requirements: data.upgrade_requirements,
      });

      // Keep checking while verification/payment is pending.
      if (normalizedStatus === 'pending_verification' || normalizedStatus === 'pending_payment') {
        ensureStatusPolling();
      } else {
        stopStatusPolling();
      }

      // Clear persisted ref once subscription is active
      if (['active', 'trial', 'grace_period'].includes(normalizedStatus)) {
        pendingSubCheckoutRef.current = null;
        AsyncStorage.removeItem(PENDING_SUB_REF_KEY).catch(() => {});
      }

      // If status flips from pending to an active state, move driver straight to dashboard.
      const previous = lastKnownStatusRef.current;
      if (
        previous &&
        ['pending_verification', 'pending_payment'].includes(previous) &&
        ['active', 'trial', 'grace_period'].includes(normalizedStatus)
      ) {
        Alert.alert(
          'Subscription Activated',
          'Payment confirmed. You can now continue to your dashboard.',
          [{ text: 'Go to Dashboard', onPress: () => router.replace('/(driver-tabs)/driver-home') }]
        );
      }
      lastKnownStatusRef.current = normalizedStatus;
    } catch (error) {
      if (__DEV__) console.warn('Error fetching subscription', error);
      setSubscription({
        tier: 'none',
        status: 'expired',
        monthly_price: 0,
        trial_active: false,
        can_upgrade: false,
      });
      stopStatusPolling();
    }
  };


  const payWithSquadCheckout = async (tier: 'city_rider' | 'road_warrior') => {
    if (!user?.id) {
      Alert.alert('Error', 'Please login first');
      return;
    }
    setSubmitting(true);
    try {
      const response = await initiateSubscriptionCheckout(tier);
      const data = response.data || {};

      if (data.transaction_ref) {
        const ref = String(data.transaction_ref);
        pendingSubCheckoutRef.current = ref;
        // Persist ref so verification can resume after an app restart
        await AsyncStorage.setItem(PENDING_SUB_REF_KEY, ref);
      }

      ensureStatusPolling();

      if (data.checkout_url && typeof data.checkout_url === 'string') {
        // Open in-app browser (Custom Tabs on Android, SFSafariViewController on iOS).
        // Awaits until the browser is dismissed — no fire-and-forget external browser.
        await openSquadCheckoutUrl(data.checkout_url);

        // Browser closed — immediately verify with Squad backend (silent: no extra alert on success)
        await confirmPendingCheckoutRef.current({ silent: true });
      } else {
        Alert.alert(
          'Checkout started',
          `Reference: ${data.transaction_ref || '—'}\nAmount: ₦${data.amount_ngn?.toLocaleString() ?? '—'}\n\nTap "Verify Payment" below once you complete payment.`,
        );
      }

      await fetchSubscriptionStatus();
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      Alert.alert('Payment Error', detail ? String(detail) : 'Payment not completed. Please try again.');
    }
    setSubmitting(false);
  };

  const confirmPendingCheckout = async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent);
    if (!silent) setSubmitting(true);
    try {
      const response = await verifyPendingSubscriptionCheckout(
        pendingSubCheckoutRef.current || undefined,
      );
      const data = response.data as Record<string, unknown>;
      if (data.verified && (data.activated || data.duplicate || data.subscription_active)) {
        pendingSubCheckoutRef.current = null;
        AsyncStorage.removeItem(PENDING_SUB_REF_KEY).catch(() => {});
        if (!silent) {
          Alert.alert('Success', 'Subscription active. Payment confirmed with Squad.');
        }
        await fetchSubscriptionStatus();
      } else {
        const vr = data.verify_result as Record<string, unknown> | undefined;
        const squadStatus = (vr?.transaction_status as string | undefined) || '';
        const reason =
          data.detail === 'amount_mismatch'
            ? 'Amount mismatch. If Squad shows success, try again in a minute or contact support.'
            : squadStatus === 'pending' || squadStatus === 'processing'
              ? 'Payment pending. Please complete authentication (OTP / bank approval) and try again.'
              : typeof vr?.reason === 'string'
                ? vr.reason
                : 'Payment not confirmed yet. Try again shortly.';
        if (!silent) Alert.alert('Not yet confirmed', reason);
      }
    } catch (e: unknown) {
      if (!silent) {
        const msg = axios.isAxiosError(e)
          ? formatApiDetail(e.response?.data?.detail) || messageFromAxiosError(e, '')
          : '';
        Alert.alert(
          'Verify Payment',
          msg || 'Payment not completed. Please try again.',
        );
      }
    } finally {
      if (!silent) setSubmitting(false);
    }
  };

  confirmPendingCheckoutRef.current = confirmPendingCheckout;

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pendingSubCheckoutRef.current) {
        if (t) clearTimeout(t);
        t = setTimeout(() => void confirmPendingCheckoutRef.current({ silent: true }), 900);
      }
    });
    return () => {
      if (t) clearTimeout(t);
      sub.remove();
    };
  }, []);



  const getTierBadgeConfig = (tier: string) => {
    if (tier === 'city_rider') {
      return {
        gradient: ['#00D084', '#00C853'] as const,
        icon: 'car-sport',
        label: 'CITY RIDER',
        bgColor: 'rgba(0, 208, 132, 0.1)',
      };
    } else if (tier === 'road_warrior') {
      return {
        gradient: ['#FFD700', '#FFA500'] as const,
        icon: 'navigate',
        label: 'ROAD WARRIOR',
        bgColor: 'rgba(255, 215, 0, 0.1)',
      };
    }
    return {
      gradient: ['#64748B', '#475569'] as const,
      icon: 'alert-circle',
      label: 'NO SUBSCRIPTION',
      bgColor: 'rgba(100, 116, 139, 0.1)',
    };
  };

  const getPhaseLabel = (phase: string) => {
    switch (phase) {
      case 'launch': return '🚀 LAUNCH PRICE';
      case 'early': return '⭐ EARLY ADOPTER';
      case 'growth': return '📈 GROWTH PHASE';
      default: return '💎 PREMIUM';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00D084" />
        <Text style={styles.loadingText}>Loading subscription...</Text>
      </View>
    );
  }

  const subscriptionIsActive = subscription ? ['trial', 'active', 'grace_period'].includes(subscription.status) : false;
  const subscriptionIsPending = subscription ? ['pending_payment', 'pending_verification'].includes(subscription.status) : false;
  const pendingTierLabel = subscription?.tier === 'road_warrior' ? 'Road Warrior' : 'City Rider';
  const tierConfig = getTierBadgeConfig(subscriptionIsActive ? (subscription?.tier || 'none') : 'none');

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#0F172A']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription Tiers</Text>
          <TouchableOpacity
            style={styles.helpButton}
            onPress={() => Alert.alert(
              'Subscription Help',
              'City Rider: unlimited city trips (max 50 km) for ₦18,000/month.\n\nRoad Warrior: unlimited nationwide trips for ₦30,000/month. Requires 4.5★ + 50 trips.\n\nPay with card via Squad for instant activation. Contact support if you need help.',
              [{ text: 'OK' }]
            )}
          >
            <Ionicons name="help-circle-outline" size={24} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {subscriptionIsPending && (
            <View style={styles.pendingFlowBanner}>
              <Ionicons name="time" size={18} color="#FBBF24" />
              <Text style={styles.flowBannerText}>
                {pendingTierLabel} payment is being processed. Your plan activates automatically once confirmed.
              </Text>
            </View>
          )}

          {/* Current Subscription Badge */}
          {subscription && subscriptionIsActive && subscription.tier !== 'none' && (
            <Animated.View style={[styles.currentTierCard, { opacity: fadeAnim }]}>
              <LinearGradient
                colors={tierConfig.gradient}
                style={styles.currentTierGradient}
              >
                <View style={styles.currentTierIcon}>
                  <Ionicons name={tierConfig.icon as any} size={32} color="#FFFFFF" />
                </View>
                <View style={styles.currentTierInfo}>
                  <Text style={styles.currentTierLabel}>YOUR CURRENT TIER</Text>
                  <Text style={styles.currentTierName}>{tierConfig.label}</Text>
                  <Text style={styles.currentTierPrice}>
                    ₦{subscription.monthly_price.toLocaleString()}/month
                  </Text>
                  {subscription.trial_active && (
                    <View style={styles.trialProgressContainer}>
                      <View style={styles.trialBadge}>
                        <Ionicons name="flash" size={14} color="#FFFFFF" />
                        <Text style={styles.trialBadgeText}>
                          {subscription.trial_extended
                            ? 'Trial extended — low activity'
                            : 'Free until 20 trips'}
                        </Text>
                      </View>
                      <Text style={styles.trialProgressLabel}>
                        Trips completed: {subscription.trial_trips_completed ?? 0} / {subscription.trial_trips_target ?? 20}
                      </Text>
                      <View style={styles.trialProgressBarBg}>
                        <View
                          style={[
                            styles.trialProgressBarFill,
                            {
                              width: `${Math.min(100, ((subscription.trial_trips_completed ?? 0) / (subscription.trial_trips_target ?? 20)) * 100)}%` as any,
                            },
                          ]}
                        />
                      </View>
                      {subscription.trial_extended && (
                        <Text style={styles.trialExtendedNote}>
                          Trial extended due to low ride activity
                        </Text>
                      )}
                    </View>
                  )}
                  {!subscription.trial_active && subscription.status === 'active' && subscription.days_remaining && (
                    <Text style={styles.daysRemainingText}>
                      {subscription.days_remaining} days remaining
                    </Text>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>
          )}

          {subscription && subscriptionIsPending && subscription.tier !== 'none' && (
            <Animated.View style={[styles.pendingTierCard, { opacity: fadeAnim }]}>
              <View style={styles.pendingTierIcon}>
                <Ionicons name="hourglass-outline" size={24} color="#FBBF24" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingTierTitle}>{pendingTierLabel} payment pending</Text>
                <Text style={styles.pendingTierText}>
                  You selected this tier, but it is not active. Complete payment or tap verify after paying.
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Bank Transfer Fallback — only shown when VA was previously generated */}
          {virtualAccount?.account_number && virtualAccount?.bank_name && (
            <Animated.View style={[styles.vaCard, { opacity: fadeAnim }]}>
              <View style={styles.vaHeader}>
                <Ionicons name="card" size={18} color="#00D084" />
                <Text style={styles.vaTitle}>Bank transfer option</Text>
              </View>
              <View style={styles.vaRow}>
                <Text style={styles.vaLabel}>Bank</Text>
                <Text style={styles.vaValue}>{virtualAccount.bank_name}</Text>
              </View>
              <View style={styles.vaRow}>
                <Text style={styles.vaLabel}>Account Name</Text>
                <Text style={styles.vaValue}>{virtualAccount.account_name || user?.name || 'Driver'}</Text>
              </View>
              <View style={[styles.vaRow, styles.vaRowHighlight]}>
                <Text style={styles.vaLabel}>Account Number</Text>
                <Text style={[styles.vaValue, { color: '#00D084', fontSize: 18, fontWeight: '900' }]}>{virtualAccount.account_number}</Text>
              </View>
              <Text style={styles.vaNote}>Transfer the exact tier amount. Activation is automatic once confirmed by the bank.</Text>
            </Animated.View>
          )}

          {/* Tier Selection Cards */}
          <View style={styles.tiersContainer}>
            {/* CITY RIDER CARD */}
            <Animated.View style={[styles.tierCard, { opacity: fadeAnim }]}>
              <LinearGradient
                colors={['rgba(0, 208, 132, 0.1)', 'rgba(0, 208, 132, 0.05)']}
                style={styles.tierCardGradient}
              >
                <View style={styles.tierHeader}>
                  <View style={[styles.tierIconBg, { backgroundColor: '#00D08420' }]}>
                    <Ionicons name="car-sport" size={28} color="#00D084" />
                  </View>
                  <View style={styles.tierHeaderText}>
                    <Text style={styles.tierTitle}>CITY RIDER</Text>
                    <Text style={styles.tierSubtitle}>Perfect for intra-city trips</Text>
                  </View>
                </View>

                <View style={styles.tierPricing}>
                  <Text style={styles.tierPriceLabel}>
                    {pricing && pricing.city_rider && getPhaseLabel(pricing.city_rider.current_phase)}
                  </Text>
                  <View style={styles.tierPriceRow}>
                    <Text style={styles.tierCurrency}>₦</Text>
                    <Text style={styles.tierPrice}>
                      {pricing?.city_rider.current_price.toLocaleString() || '18,000'}
                    </Text>
                    <Text style={styles.tierPeriod}>/month</Text>
                  </View>
                  {pricing && pricing.city_rider.launch_slots_remaining > 0 && (
                    <Text style={styles.slotsRemaining}>
                      🔥 Only {pricing.city_rider.launch_slots_remaining} slots left at this price!
                    </Text>
                  )}
                </View>

                <View style={styles.tierFeatures}>
                  <Text style={styles.featuresTitle}>WHAT YOU GET:</Text>
                  {[
                    { icon: 'location', text: 'Unlimited intra-city trips (max 50km)', color: '#00D084' },
                    { icon: 'cash', text: 'Keep 100% of your earnings', color: '#FFD700' },
                    { icon: 'shield-checkmark', text: 'Basic insurance coverage', color: '#00B0FF' },
                    { icon: 'headset', text: 'Standard customer support', color: '#FF6B6B' },
                    { icon: 'flash', text: 'Real-time ride matching', color: '#8B5CF6' },
                  ].map((feature, index) => (
                    <View key={index} style={styles.featureRow}>
                      <View style={[styles.featureIcon, { backgroundColor: `${feature.color}20` }]}>
                        <Ionicons name={feature.icon as any} size={16} color={feature.color} />
                      </View>
                      <Text style={styles.featureText}>{feature.text}</Text>
                    </View>
                  ))}
                </View>

                {subscriptionIsActive && subscription?.tier === 'city_rider' ? (
                  <View style={styles.currentTierButton}>
                    <Ionicons name="checkmark-circle" size={20} color="#00D084" />
                    <Text style={styles.currentTierButtonText}>Active — Current Tier</Text>
                  </View>
                ) : subscriptionIsPending && subscription?.tier === 'city_rider' ? (
                  <View style={styles.pendingTierButton}>
                    <Ionicons name="time" size={18} color="#FBBF24" />
                    <Text style={styles.pendingTierButtonText}>Payment processing — not yet active</Text>
                  </View>
                ) : (subscription?.tier === 'none' || !subscription) ? (
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => payWithSquadCheckout('city_rider')}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#00D084', '#00C853']}
                      style={styles.selectButtonGradient}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="card" size={20} color="#FFFFFF" />
                          <Text style={styles.selectButtonText}>Pay Now — City Rider</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : null}
              </LinearGradient>
            </Animated.View>

            {/* ROAD WARRIOR CARD */}
            <Animated.View style={[styles.tierCard, styles.featuredTier, { opacity: fadeAnim }]}>
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>⭐ RECOMMENDED</Text>
              </View>
              <LinearGradient
                colors={['rgba(255, 215, 0, 0.15)', 'rgba(255, 165, 0, 0.05)']}
                style={styles.tierCardGradient}
              >
                <View style={styles.tierHeader}>
                  <View style={[styles.tierIconBg, { backgroundColor: '#FFD70030' }]}>
                    <Ionicons name="navigate" size={28} color="#FFD700" />
                  </View>
                  <View style={styles.tierHeaderText}>
                    <Text style={[styles.tierTitle, { color: '#FFD700' }]}>ROAD WARRIOR</Text>
                    <Text style={styles.tierSubtitle}>Unlimited nationwide trips</Text>
                  </View>
                </View>

                <View style={styles.tierPricing}>
                  <Text style={[styles.tierPriceLabel, { color: '#FFD700' }]}>
                    {pricing && pricing.road_warrior && getPhaseLabel(pricing.road_warrior.current_phase)}
                  </Text>
                  <View style={styles.tierPriceRow}>
                    <Text style={[styles.tierCurrency, { color: '#FFD700' }]}>₦</Text>
                    <Text style={styles.tierPrice}>
                      {pricing?.road_warrior.current_price.toLocaleString() || '30,000'}
                    </Text>
                    <Text style={styles.tierPeriod}>/month</Text>
                  </View>
                  {pricing && pricing.road_warrior.launch_slots_remaining > 0 && (
                    <Text style={styles.slotsRemaining}>
                      🔥 Only {pricing.road_warrior.launch_slots_remaining} slots left!
                    </Text>
                  )}
                </View>

                <View style={styles.tierFeatures}>
                  <Text style={styles.featuresTitle}>EVERYTHING IN CITY RIDER, PLUS:</Text>
                  {[
                    { icon: 'navigate-circle', text: 'Unlimited inter-city/interstate trips', color: '#FFD700' },
                    { icon: 'map', text: 'Smart Route Planner (AI-powered)', color: '#00D084' },
                    { icon: 'repeat', text: 'Auto return trip matching', color: '#FF6B6B' },
                    { icon: 'cash-outline', text: 'Route discovery bonuses (₦5K)', color: '#00B0FF' },
                    { icon: 'flash', text: '3x API call limits', color: '#8B5CF6' },
                    { icon: 'shield', text: 'Premium insurance coverage', color: '#00C853' },
                    { icon: 'headset', text: 'Priority 24/7 support', color: '#FF9800' },
                  ].map((feature, index) => (
                    <View key={index} style={styles.featureRow}>
                      <View style={[styles.featureIcon, { backgroundColor: `${feature.color}20` }]}>
                        <Ionicons name={feature.icon as any} size={16} color={feature.color} />
                      </View>
                      <Text style={styles.featureText}>{feature.text}</Text>
                    </View>
                  ))}
                </View>

                {subscriptionIsActive && subscription?.tier === 'road_warrior' ? (
                  <View style={[styles.currentTierButton, { backgroundColor: '#FFD70020', borderColor: '#FFD700' }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                    <Text style={[styles.currentTierButtonText, { color: '#FFD700' }]}>Active — Current Tier</Text>
                  </View>
                ) : subscriptionIsPending && subscription?.tier === 'road_warrior' ? (
                  <View style={styles.pendingTierButton}>
                    <Ionicons name="time" size={18} color="#FBBF24" />
                    <Text style={styles.pendingTierButtonText}>Payment processing — not yet active</Text>
                  </View>
                ) : subscriptionIsActive && subscription?.tier === 'city_rider' && subscription?.can_upgrade ? (
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => setShowUpgradeModal(true)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#FFD700', '#FFA500']}
                      style={styles.selectButtonGradient}
                    >
                      <Ionicons name="arrow-up-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.selectButtonText}>Upgrade to Road Warrior</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : subscriptionIsActive && subscription?.tier === 'city_rider' && !subscription?.can_upgrade ? (
                  <View style={styles.lockedButton}>
                    <Ionicons name="lock-closed" size={18} color="#94A3B8" />
                    <Text style={styles.lockedButtonText}>Unlocks after 4.5★ rating + 50 trips</Text>
                  </View>
                ) : (subscription?.tier === 'none' || !subscription) ? (
                  <TouchableOpacity
                    style={styles.selectButton}
                    onPress={() => payWithSquadCheckout('road_warrior')}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#FFD700', '#FFA500']}
                      style={styles.selectButtonGradient}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="card" size={20} color="#FFFFFF" />
                          <Text style={styles.selectButtonText}>Pay Now — Road Warrior</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : null}
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Verify Payment Card — slim, always visible */}
          <Animated.View style={[styles.verifyCard, { opacity: fadeAnim }]}>
            <View style={styles.verifyCardRow}>
              <View style={styles.verifyCardLeft}>
                <Ionicons name="shield-checkmark-outline" size={22} color="#00D084" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.verifyCardTitle}>Already paid?</Text>
                  <Text style={styles.verifyCardSub}>Tap to confirm your payment with Squad and activate your plan instantly.</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.verifyCardBtn}
                onPress={() => void confirmPendingCheckout()}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.verifyCardBtnText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Upgrade Modal */}
        <Modal visible={showUpgradeModal} animationType="fade" transparent>
          <View style={styles.upgradeModalOverlay}>
            <View style={styles.upgradeModalContainer}>
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                style={styles.upgradeModalGradient}
              >
                <Ionicons name="rocket" size={64} color="#FFFFFF" />
                <Text style={styles.upgradeModalTitle}>Upgrade to Road Warrior</Text>
                <Text style={styles.upgradeModalSubtitle}>
                  Unlock unlimited inter-city trips and advanced AI features!
                </Text>

                {subscription?.upgrade_requirements && (
                  <View style={styles.upgradeRequirements}>
                    <View style={styles.requirementRow}>
                      <Ionicons 
                        name={subscription.upgrade_requirements.rating_met ? "checkmark-circle" : "close-circle"} 
                        size={20} 
                        color={subscription.upgrade_requirements.rating_met ? "#00C853" : "#EF4444"} 
                      />
                      <Text style={styles.requirementText}>
                        Rating: {Number(subscription.upgrade_requirements.current_rating || 0).toFixed(1)}/4.5 ⭐
                      </Text>
                    </View>
                    <View style={styles.requirementRow}>
                      <Ionicons 
                        name={subscription.upgrade_requirements.trips_met ? "checkmark-circle" : "close-circle"} 
                        size={20} 
                        color={subscription.upgrade_requirements.trips_met ? "#00C853" : "#EF4444"} 
                      />
                      <Text style={styles.requirementText}>
                        Trips: {subscription.upgrade_requirements.current_trips}/50
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.upgradeModalButtons}>
                  <TouchableOpacity 
                    style={styles.upgradeCancelButton}
                    onPress={() => setShowUpgradeModal(false)}
                  >
                    <Text style={styles.upgradeCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.upgradeConfirmButton}
                    onPress={async () => {
                      setShowUpgradeModal(false);
                      await payWithSquadCheckout('road_warrior');
                    }}
                    disabled={submitting || !subscription?.can_upgrade}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.upgradeConfirmText}>
                        Pay Now — ₦{pricing?.road_warrior.current_price.toLocaleString() ?? '30,000'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  helpButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  flowBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 132, 0.25)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  pendingFlowBanner: {
    borderColor: 'rgba(251, 191, 36, 0.35)',
    backgroundColor: 'rgba(69, 26, 3, 0.35)',
  },
  flowBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  
  // Current Tier Card
  currentTierCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  currentTierGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  currentTierIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  currentTierInfo: {
    flex: 1,
  },
  currentTierLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  currentTierName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  currentTierPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 6,
  },
  trialBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  trialProgressContainer: {
    marginTop: 10,
  },
  trialProgressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
    marginBottom: 4,
  },
  trialProgressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  trialProgressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#00FF9D',
  },
  trialExtendedNote: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFD700',
    marginTop: 4,
  },
  daysRemainingText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 6,
  },
  pendingTierCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
  },
  pendingTierIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTierTitle: {
    color: '#FDE68A',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  pendingTierText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },

  // Tiers Container
  tiersContainer: {
    gap: 16,
  },
  tierCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featuredTier: {
    borderColor: '#FFD700',
    borderWidth: 2,
  },
  recommendedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
  },
  recommendedText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
  },
  tierCardGradient: {
    padding: 20,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierIconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tierHeaderText: {
    flex: 1,
  },
  tierTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#00D084',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  tierSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  tierPricing: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  tierPriceLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#00D084',
    marginBottom: 8,
    letterSpacing: 1,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tierCurrency: {
    fontSize: 24,
    fontWeight: '900',
    color: '#00D084',
    marginTop: 4,
  },
  tierPrice: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  tierPeriod: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 20,
  },
  slotsRemaining: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
    marginTop: 8,
  },
  tierFeatures: {
    marginBottom: 16,
  },
  featuresTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#CBD5E1',
    marginBottom: 12,
    letterSpacing: 1,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
    flex: 1,
  },
  currentTierButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 208, 132, 0.15)',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    borderWidth: 2,
    borderColor: '#00D084',
  },
  currentTierButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#00D084',
  },
  pendingTierButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    borderWidth: 2,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  pendingTierButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FDE68A',
  },
  selectButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  selectButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  lockedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  lockedButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },

  // Bank Card

  // Payment Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#CBD5E1',
    marginBottom: 12,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  uploadOptionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  uploadOption: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  uploadOptionGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  uploadOptionText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 8,
  },
  screenshotPreview: {
    position: 'relative',
    marginBottom: 24,
    borderRadius: 14,
    overflow: 'hidden',
  },
  screenshotImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: '#1E293B',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#0F172A',
    borderRadius: 16,
  },
  referenceInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  submitButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // Upgrade Modal
  upgradeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  upgradeModalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
  },
  upgradeModalGradient: {
    padding: 32,
    alignItems: 'center',
  },
  upgradeModalTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  upgradeModalSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 24,
  },
  upgradeRequirements: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requirementText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  upgradeModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  upgradeCancelButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  upgradeCancelText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  upgradeConfirmButton: {
    flex: 2,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  upgradeConfirmText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFD700',
  },

  // Crypto Coming Soon
  vaCard: {
    backgroundColor: 'rgba(0, 208, 132, 0.06)',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 132, 0.2)',
  },
  vaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  vaTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  vaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  vaRowHighlight: {
    backgroundColor: 'rgba(0,208,132,0.08)',
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 0,
  },
  vaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  vaValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  vaNote: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 10,
    lineHeight: 16,
  },
  verifyCard: {
    backgroundColor: 'rgba(0, 208, 132, 0.06)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 132, 0.25)',
  },
  verifyCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  verifyCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verifyCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E2E8F0',
    marginBottom: 2,
  },
  verifyCardSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 16,
  },
  verifyCardBtn: {
    backgroundColor: '#00D084',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  verifyCardBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
