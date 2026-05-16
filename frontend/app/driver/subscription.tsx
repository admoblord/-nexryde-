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
  Platform,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
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
import { useFlowLayout } from '@/src/constants/flowLayout';

/** AsyncStorage key for persisting the pending checkout reference across app restarts. */
const PENDING_SUB_REF_KEY = '@nexryde_pending_sub_checkout_ref';

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
  trial_progress_pct?: number;
  trial_extended?: boolean;
  trial_extension_count?: number;
  trial_completed?: boolean;
  trial_urgency?: 'normal' | 'warning' | 'critical';
  trial_message?: string;
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
  const { user, userId: driverId, canCallAuthedApi } = useAuthedUserId();
  const flow = useFlowLayout();
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payingTier, setPayingTier] = useState<'city_rider' | 'road_warrior' | null>(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
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
    if (!canCallAuthedApi) return;
    void initializeData();
    
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
  }, [canCallAuthedApi]);

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
    if (!driverId || !user) return true;
    const response = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/onboarding-status`, {
      headers: getAuthHeaders(),
    });
    const status = await response.json();
    const step = status?.step;
    if (step === 'dashboard_limited' || step === 'documents_review') {
      Alert.alert(
        'Verification in review',
        'Your documents are saved. Subscription and payment activation unlock after approval.',
        [{ text: 'OK', onPress: () => router.replace('/(driver-tabs)/driver-home') }],
      );
      return false;
    }
    if (step === 'documents_rejected') {
      router.replace({
        pathname: '/(auth)/driver-verification-status',
        params: {
          driver_id: driverId,
          phone: user?.phone ?? '',
          name: user?.name ?? '',
          email: user?.email ?? '',
        },
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
    if (!driverId) {
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
        trial_progress_pct: data.trial_progress_pct ?? 0,
        trial_extended: data.trial_extended ?? false,
        trial_extension_count: data.trial_extension_count ?? 0,
        trial_completed: data.trial_completed ?? false,
        trial_urgency: data.trial_urgency ?? 'normal',
        trial_message: data.trial_message ?? '',
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
    if (!driverId || !user) {
      Alert.alert('Error', 'Please login first');
      return;
    }
    setSubmitting(true);
    setPayingTier(tier);
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

        // Browser closed — silently verify with Squad backend and show a brief indicator
        setVerifyingPayment(true);
        await confirmPendingCheckoutRef.current({ silent: true });
        setVerifyingPayment(false);
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
    } finally {
      setSubmitting(false);
      setPayingTier(null);
      setVerifyingPayment(false);
    }
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
        const reasonCode = (data.reason as string | undefined) || '';
        const txStatus = (data.transaction_status as string | undefined) || '';
        let reason: string;
        if (data.detail === 'amount_mismatch') {
          reason = 'Amount mismatch detected. If Squad shows a deduction, contact support with your reference.';
        } else if (reasonCode === 'payment_pending' || txStatus === 'pending' || txStatus === 'processing') {
          reason = 'Payment pending. Please complete your bank OTP or card authentication and try again.';
        } else if (reasonCode === 'payment_failed' || txStatus === 'failed' || txStatus === 'declined') {
          reason = 'Payment was declined. Please try a different card or payment method.';
        } else if (reasonCode === 'network_timeout') {
          reason = 'Network timeout. Check your internet connection and try again.';
        } else {
          reason = 'Payment not confirmed yet. Please try again in a moment.';
        }
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

  // AppState: auto-verify on foreground return (e.g. user finished payment in external browser)
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

  // Deep link: handle nexryde://subscription/return?reference=xxx (Squad callback)
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (!url.includes('subscription/return')) return;
      // Extract reference from the deep link query string
      const match = url.match(/[?&]reference=([^&]+)/);
      const ref = match ? decodeURIComponent(match[1]) : null;
      if (ref && ref !== pendingSubCheckoutRef.current) {
        pendingSubCheckoutRef.current = ref;
        AsyncStorage.setItem(PENDING_SUB_REF_KEY, ref).catch(() => {});
      }
      // Trigger verification after a short delay (browser dismiss animation)
      setTimeout(() => {
        setVerifyingPayment(true);
        confirmPendingCheckoutRef.current({ silent: true }).finally(() => {
          setVerifyingPayment(false);
          fetchSubscriptionStatus();
        });
      }, 600);
    };

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
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
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal: flow.padH,
              paddingTop: Math.round(flow.sectionGap * 0.35),
              paddingBottom: 40,
              gap: Math.round(flow.sectionGap * 0.3),
            },
          ]}
        >
          {subscriptionIsPending && (
            <View style={[styles.flowBanner, styles.pendingFlowBanner]}>
              <Ionicons name="time" size={18} color="#FBBF24" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.flowBannerText}>
                  {pendingTierLabel} payment is processing. Your plan activates once confirmed.
                </Text>
                <TouchableOpacity
                  style={styles.inlineVerifyBtn}
                  onPress={() => void confirmPendingCheckout()}
                  disabled={submitting || verifyingPayment}
                  activeOpacity={0.8}
                >
                  {verifyingPayment ? (
                    <ActivityIndicator size="small" color="#FBBF24" />
                  ) : (
                    <Text style={styles.inlineVerifyBtnText}>Tap to verify now</Text>
                  )}
                </TouchableOpacity>
              </View>
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
                  {subscription.trial_active && (() => {
                    const completed = subscription.trial_trips_completed ?? 0;
                    const target = subscription.trial_trips_target ?? 20;
                    const remaining = Math.max(0, target - completed);
                    const pct = Math.min(100, target > 0 ? (completed / target) * 100 : 0);
                    const urgency = (subscription as any).trial_urgency ?? 'normal';
                    const barColor = urgency === 'critical' ? '#EF4444' : urgency === 'warning' ? '#F59E0B' : '#22C55E';
                    const extCount = (subscription as any).trial_extension_count ?? 0;
                    const maxExt = 2;

                    // Milestone markers: 25%, 50%, 75%, 100%
                    const milestones = [5, 10, 15, target];

                    return (
                      <View style={styles.trialProgressContainer}>
                        {/* Badge row */}
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          <View style={styles.trialBadge}>
                            <Ionicons name="flash" size={13} color="#FFFFFF" />
                            <Text style={styles.trialBadgeText}>
                              {subscription.trial_extended ? `Extended ×${extCount}` : 'Free Trial'}
                            </Text>
                          </View>
                          {remaining <= 5 && remaining > 0 && (
                            <View style={[styles.trialBadge, { backgroundColor: '#EF4444' }]}>
                              <Ionicons name="alert-circle" size={13} color="#FFF" />
                              <Text style={styles.trialBadgeText}>Almost done!</Text>
                            </View>
                          )}
                          {subscription.trial_extended && extCount < maxExt && (
                            <View style={[styles.trialBadge, { backgroundColor: 'rgba(245,158,11,0.8)' }]}>
                              <Ionicons name="time-outline" size={13} color="#FFF" />
                              <Text style={styles.trialBadgeText}>{maxExt - extCount} ext. left</Text>
                            </View>
                          )}
                        </View>

                        {/* Progress numbers */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={styles.trialProgressLabel}>{completed} trips completed</Text>
                          <Text style={[styles.trialProgressLabel, { fontWeight: '800' }]}>{remaining} left</Text>
                        </View>

                        {/* Progress bar with milestone ticks */}
                        <View style={{ position: 'relative', marginBottom: 14 }}>
                          <View style={styles.trialProgressBarBg}>
                            <View style={[styles.trialProgressBarFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                          </View>
                          {/* Milestone tick marks */}
                          {milestones.filter(m => m < target).map((m) => {
                            const tickPct = (m / target) * 100;
                            return (
                              <View
                                key={m}
                                style={{
                                  position: 'absolute',
                                  left: `${tickPct}%` as any,
                                  top: -3,
                                  width: 1,
                                  height: 10,
                                  backgroundColor: 'rgba(255,255,255,0.4)',
                                }}
                              />
                            );
                          })}
                        </View>

                        {/* Context message */}
                        {(subscription as any).trial_message ? (
                          <Text style={[styles.trialExtendedNote, { color: urgency === 'critical' ? '#FCA5A5' : 'rgba(255,255,255,0.75)' }]}>
                            {(subscription as any).trial_message}
                          </Text>
                        ) : null}

                        {/* What happens next */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <Ionicons name="information-circle-outline" size={13} color="rgba(255,255,255,0.55)" />
                          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', flex: 1 }}>
                            After {target} trips, subscribe for ₦18,000/month to keep earning.
                            {extCount < maxExt ? ` Low activity auto-extends trial (up to ${maxExt}×).` : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
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

            {/* ── CITY RIDER CARD ──────────────────────────────────────────── */}
            <Animated.View style={[styles.tierCard, { opacity: fadeAnim }]}>
              <LinearGradient
                colors={['#0F2A1E', '#0F172A']}
                style={styles.tierCardGradient}
              >
                {/* Header */}
                <View style={styles.tierHeader}>
                  <LinearGradient colors={['#00D084', '#00C853']} style={styles.tierIconBg}>
                    <Ionicons name="car-sport" size={26} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={styles.tierHeaderText}>
                    <Text style={styles.tierTitle}>CITY RIDER</Text>
                    <Text style={styles.tierSubtitle}>Perfect for intra-city trips</Text>
                  </View>
                </View>

                {/* Divider */}
                <View style={styles.tierDivider} />

                {/* Pricing block */}
                <View style={styles.tierPricingBlock}>
                  <View style={styles.tierPhasePill}>
                    <Text style={styles.tierPhasePillText}>
                      {pricing && pricing.city_rider ? getPhaseLabel(pricing.city_rider.current_phase) : '⭐ EARLY ADOPTER'}
                    </Text>
                  </View>
                  <View style={styles.tierPriceRow}>
                    <Text style={styles.tierCurrency}>₦</Text>
                    <Text style={styles.tierPrice}>
                      {pricing?.city_rider.current_price.toLocaleString() || '18,000'}
                    </Text>
                    <Text style={styles.tierPeriod}>/month</Text>
                  </View>
                  {pricing && pricing.city_rider.launch_slots_remaining > 0 && (
                    <View style={styles.slotsPill}>
                      <Ionicons name="flame" size={12} color="#F59E0B" />
                      <Text style={styles.slotsText}>
                        {pricing.city_rider.launch_slots_remaining} slots left at this price
                      </Text>
                    </View>
                  )}
                </View>

                {/* Features */}
                <Text style={styles.featuresTitle}>WHAT YOU GET</Text>
                {[
                  { icon: 'location', text: 'Unlimited intra-city trips (max 50 km)', color: '#00D084' },
                  { icon: 'cash', text: 'Keep 100% of your earnings', color: '#FFD700' },
                  { icon: 'shield-checkmark', text: 'Basic insurance coverage', color: '#38BDF8' },
                  { icon: 'headset', text: 'Standard customer support', color: '#F87171' },
                  { icon: 'flash', text: 'Real-time ride matching', color: '#A78BFA' },
                ].map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <View style={[styles.featureIcon, { backgroundColor: feature.color + '1A' }]}>
                      <Ionicons name={feature.icon as any} size={15} color={feature.color} />
                    </View>
                    <Text style={styles.featureText}>{feature.text}</Text>
                  </View>
                ))}

                {/* CTA */}
                <View style={styles.tierCtaWrap}>
                  {subscriptionIsActive && subscription?.tier === 'city_rider' ? (
                    <View style={[styles.activeBadgeBtn, { borderColor: '#00D084' }]}>
                      <Ionicons name="checkmark-circle" size={18} color="#00D084" />
                      <Text style={[styles.activeBadgeBtnText, { color: '#00D084' }]}>Active — Your Current Tier</Text>
                    </View>
                  ) : subscriptionIsPending && subscription?.tier === 'city_rider' ? (
                    <View style={styles.pendingTierButton}>
                      <Ionicons name="time" size={16} color="#FBBF24" />
                      <Text style={styles.pendingTierButtonText}>Processing payment…</Text>
                    </View>
                  ) : (subscription?.tier === 'none' || !subscription) ? (
                    <TouchableOpacity
                      style={[styles.selectButton, submitting ? styles.selectButtonDisabled : null]}
                      onPress={() => payWithSquadCheckout('city_rider')}
                      disabled={submitting}
                      activeOpacity={0.85}
                    >
                      <LinearGradient colors={['#00D084', '#00C853']} style={styles.selectButtonGradient}>
                        {payingTier === 'city_rider' ? (
                          <ActivityIndicator color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="card" size={18} color="#FFF" />
                            <Text style={styles.selectButtonText}>Subscribe — City Rider</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </LinearGradient>
            </Animated.View>

            {/* ── ROAD WARRIOR CARD ────────────────────────────────────────── */}
            <Animated.View style={[styles.tierCard, styles.featuredTier, { opacity: fadeAnim }]}>
              {/* ★ RECOMMENDED banner — sits ABOVE the content, never overlaps */}
              <LinearGradient
                colors={['#FFD700', '#F59E0B']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.recommendedBanner}
              >
                <Ionicons name="star" size={13} color="#000" />
                <Text style={styles.recommendedBannerText}>RECOMMENDED</Text>
                <Ionicons name="star" size={13} color="#000" />
              </LinearGradient>

              <LinearGradient
                colors={['#1A1500', '#0F172A']}
                style={styles.tierCardGradient}
              >
                {/* Header */}
                <View style={styles.tierHeader}>
                  <LinearGradient colors={['#FFD700', '#F59E0B']} style={styles.tierIconBg}>
                    <Ionicons name="navigate" size={26} color="#000" />
                  </LinearGradient>
                  <View style={styles.tierHeaderText}>
                    <Text style={[styles.tierTitle, { color: '#FFD700' }]}>ROAD WARRIOR</Text>
                    <Text style={styles.tierSubtitle}>Unlimited nationwide trips</Text>
                  </View>
                </View>

                {/* Divider */}
                <View style={[styles.tierDivider, { backgroundColor: 'rgba(255,215,0,0.15)' }]} />

                {/* Pricing block */}
                <View style={[styles.tierPricingBlock, { backgroundColor: 'rgba(255,215,0,0.07)', borderColor: 'rgba(255,215,0,0.18)' }]}>
                  <View style={[styles.tierPhasePill, { backgroundColor: 'rgba(255,215,0,0.15)', borderColor: 'rgba(255,215,0,0.3)' }]}>
                    <Text style={[styles.tierPhasePillText, { color: '#FFD700' }]}>
                      {pricing && pricing.road_warrior ? getPhaseLabel(pricing.road_warrior.current_phase) : '⭐ EARLY ADOPTER'}
                    </Text>
                  </View>
                  <View style={styles.tierPriceRow}>
                    <Text style={[styles.tierCurrency, { color: '#FFD700' }]}>₦</Text>
                    <Text style={styles.tierPrice}>
                      {pricing?.road_warrior.current_price.toLocaleString() || '30,000'}
                    </Text>
                    <Text style={styles.tierPeriod}>/month</Text>
                  </View>
                  {pricing && pricing.road_warrior.launch_slots_remaining > 0 && (
                    <View style={styles.slotsPill}>
                      <Ionicons name="flame" size={12} color="#F59E0B" />
                      <Text style={styles.slotsText}>
                        {pricing.road_warrior.launch_slots_remaining} slots left at this price
                      </Text>
                    </View>
                  )}
                </View>

                {/* Features */}
                <Text style={[styles.featuresTitle, { color: 'rgba(255,215,0,0.7)' }]}>EVERYTHING IN CITY RIDER, PLUS</Text>
                {[
                  { icon: 'navigate-circle', text: 'Unlimited inter-city / interstate trips', color: '#FFD700' },
                  { icon: 'map', text: 'Smart Route Planner (AI-powered)', color: '#00D084' },
                  { icon: 'repeat', text: 'Auto return trip matching', color: '#F87171' },
                  { icon: 'cash-outline', text: 'Route discovery bonuses (₦5,000)', color: '#38BDF8' },
                  { icon: 'flash', text: '3× API call limits', color: '#A78BFA' },
                  { icon: 'shield', text: 'Premium insurance coverage', color: '#34D399' },
                  { icon: 'headset', text: 'Priority 24/7 driver support', color: '#FB923C' },
                ].map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <View style={[styles.featureIcon, { backgroundColor: feature.color + '1A' }]}>
                      <Ionicons name={feature.icon as any} size={15} color={feature.color} />
                    </View>
                    <Text style={styles.featureText}>{feature.text}</Text>
                  </View>
                ))}

                {/* CTA */}
                <View style={styles.tierCtaWrap}>
                  {subscriptionIsActive && subscription?.tier === 'road_warrior' ? (
                    <View style={[styles.activeBadgeBtn, { borderColor: '#FFD700' }]}>
                      <Ionicons name="checkmark-circle" size={18} color="#FFD700" />
                      <Text style={[styles.activeBadgeBtnText, { color: '#FFD700' }]}>Active — Your Current Tier</Text>
                    </View>
                  ) : subscriptionIsPending && subscription?.tier === 'road_warrior' ? (
                    <View style={styles.pendingTierButton}>
                      <Ionicons name="time" size={16} color="#FBBF24" />
                      <Text style={styles.pendingTierButtonText}>Processing payment…</Text>
                    </View>
                  ) : subscriptionIsActive && subscription?.tier === 'city_rider' && subscription?.can_upgrade ? (
                    <TouchableOpacity
                      style={styles.selectButton}
                      onPress={() => setShowUpgradeModal(true)}
                      activeOpacity={0.85}
                    >
                      <LinearGradient colors={['#FFD700', '#F59E0B']} style={styles.selectButtonGradient}>
                        <Ionicons name="arrow-up-circle" size={18} color="#000" />
                        <Text style={[styles.selectButtonText, { color: '#000' }]}>Upgrade to Road Warrior</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : subscriptionIsActive && subscription?.tier === 'city_rider' && !subscription?.can_upgrade ? (
                    <View style={styles.lockedButton}>
                      <Ionicons name="lock-closed" size={16} color="#64748B" />
                      <Text style={styles.lockedButtonText}>Unlocks after 4.5★ rating + 50 trips</Text>
                    </View>
                  ) : (subscription?.tier === 'none' || !subscription) ? (
                    <TouchableOpacity
                      style={[styles.selectButton, submitting ? styles.selectButtonDisabled : null]}
                      onPress={() => payWithSquadCheckout('road_warrior')}
                      disabled={submitting}
                      activeOpacity={0.85}
                    >
                      <LinearGradient colors={['#FFD700', '#F59E0B']} style={styles.selectButtonGradient}>
                        {payingTier === 'road_warrior' ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <>
                            <Ionicons name="card" size={18} color="#000" />
                            <Text style={[styles.selectButtonText, { color: '#000' }]}>Subscribe — Road Warrior</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Verify Payment Card — only shown when payment is pending or in-progress */}
          {!subscriptionIsActive && (
            <Animated.View style={[styles.verifyCard, { opacity: fadeAnim }]}>
              {verifyingPayment && (
                <View style={styles.verifyingBanner}>
                  <ActivityIndicator size="small" color="#00D084" />
                  <Text style={styles.verifyingBannerText}>Verifying your payment with Squad…</Text>
                </View>
              )}
              <View style={styles.verifyCardRow}>
                <View style={styles.verifyCardLeft}>
                  <Ionicons name="shield-checkmark-outline" size={22} color="#00D084" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.verifyCardTitle}>Already paid?</Text>
                    <Text style={styles.verifyCardSub}>
                      Tap to confirm payment with Squad and activate your plan instantly.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.verifyCardBtn, (submitting || verifyingPayment) ? styles.verifyCardBtnDisabled : null]}
                  onPress={() => void confirmPendingCheckout()}
                  disabled={submitting || verifyingPayment}
                  activeOpacity={0.8}
                >
                  {submitting || verifyingPayment ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.verifyCardBtnText}>Verify</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

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
    flexGrow: 1,
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
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 208, 132, 0.22)',
  },
  featuredTier: {
    borderColor: '#FFD700',
    borderWidth: 1.5,
  },
  // RECOMMENDED banner — full-width strip above card content
  recommendedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  recommendedBannerText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1.5,
  },
  tierCardGradient: {
    padding: 20,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 14,
  },
  tierIconBg: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tierHeaderText: {
    flex: 1,
  },
  tierTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#00D084',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  tierSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tierDivider: {
    height: 1,
    backgroundColor: 'rgba(0,208,132,0.12)',
    marginBottom: 16,
  },
  tierPricingBlock: {
    backgroundColor: 'rgba(0,208,132,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.15)',
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  tierPhasePill: {
    backgroundColor: 'rgba(0,208,132,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,208,132,0.3)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },
  tierPhasePillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#00D084',
    letterSpacing: 1,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tierCurrency: {
    fontSize: 22,
    fontWeight: '900',
    color: '#00D084',
    marginTop: 6,
    marginRight: 2,
  },
  tierPrice: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -2,
  },
  tierPeriod: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 24,
    marginLeft: 4,
  },
  slotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  slotsText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F59E0B',
  },
  featuresTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(0,208,132,0.55)',
    marginBottom: 12,
    letterSpacing: 1.5,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
    gap: 10,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#CBD5E1',
    flex: 1,
    lineHeight: 19,
  },
  tierCtaWrap: {
    marginTop: 18,
  },
  activeBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,208,132,0.1)',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#00D084',
  },
  activeBadgeBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#00D084',
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
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1.5,
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
    paddingVertical: 15,
    gap: 10,
  },
  selectButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  lockedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(100,116,139,0.1)',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(100,116,139,0.25)',
  },
  lockedButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
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
  verifyCardBtnDisabled: {
    opacity: 0.55,
  },
  verifyCardBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  verifyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 208, 132, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  verifyingBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00D084',
  },
  inlineVerifyBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251, 191, 36, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  inlineVerifyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
  },
  selectButtonDisabled: {
    opacity: 0.6,
  },
});
