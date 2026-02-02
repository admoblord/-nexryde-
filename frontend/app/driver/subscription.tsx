import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Animated,
  Dimensions,
  Clipboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
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
  status: 'trial' | 'active' | 'expired' | 'pending_verification';
  monthly_price: number;
  trial_active: boolean;
  trial_hours_remaining?: number;
  trial_trips_remaining?: number;
  days_remaining?: number;
  can_upgrade: boolean;
  upgrade_requirements?: {
    rating_met: boolean;
    trips_met: boolean;
    current_rating: number;
    current_trips: number;
  };
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'city_rider' | 'road_warrior' | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 50)).current;

  useEffect(() => {
    initializeData();
    
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
  }, []);

  const initializeData = async () => {
    try {
      await Promise.all([fetchPricing(), fetchSubscriptionStatus()]);
    } catch (error) {
      console.error('Error initializing:', error);
      Alert.alert('Error', 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscription/pricing`);
      const data = await response.json();
      setPricing(data);
    } catch (error) {
      console.error('Error fetching pricing:', error);
      // Set default pricing
      setPricing({
        city_rider: { current_price: 18000, current_phase: 'early', launch_slots_remaining: 450 },
        road_warrior: { current_price: 30000, current_phase: 'early', launch_slots_remaining: 180 },
      });
    }
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
      const response = await fetch(`${BACKEND_URL}/api/subscription/status/${user.id}`);
      const data = await response.json();
      
      // Map API response to expected format
      setSubscription({
        tier: data.tier || (data.status === 'active' ? 'city_rider' : 'none'),
        status: data.status || 'expired',
        monthly_price: data.monthly_price || pricing?.city_rider?.current_price || 18000,
        trial_active: data.trial_active || data.status === 'trial',
        trial_hours_remaining: data.trial_hours_remaining,
        trial_trips_remaining: data.trial_trips_remaining,
        days_remaining: data.days_remaining,
        can_upgrade: data.can_upgrade ?? (data.status === 'active'),
        upgrade_requirements: data.upgrade_requirements,
      });
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setSubscription({
        tier: 'none',
        status: 'expired',
        monthly_price: 0,
        trial_active: false,
        can_upgrade: false,
      });
    }
  };

  const startTrial = async (tier: 'city_rider' | 'road_warrior') => {
    if (!user?.id) {
      Alert.alert('Error', 'Please login first');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscription/subscribe/${tier}?driver_id=${user.id}`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        Alert.alert(
          'Trial Started! 🎉',
          `You now have 24 hours OR 3 trips (whichever comes first) to try ${tier === 'city_rider' ? 'City Rider' : 'Road Warrior'} features for FREE!`,
          [{ text: 'Start Driving!', onPress: () => fetchSubscriptionStatus() }]
        );
      } else {
        Alert.alert('Error', data.detail || 'Failed to start trial');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
    setSubmitting(false);
  };

  const upgradeToRoadWarrior = async () => {
    if (!user?.id) return;

    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscription/upgrade-to-road-warrior/${user.id}`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (response.ok) {
        Alert.alert(
          'Upgraded! 🚀',
          'You are now a Road Warrior! Enjoy unlimited inter-city trips and advanced AI features.',
          [{ text: 'Awesome!', onPress: () => {
            setShowUpgradeModal(false);
            fetchSubscriptionStatus();
          }}]
        );
      } else {
        Alert.alert('Cannot Upgrade', data.detail || 'Requirements not met');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to upgrade');
    }
    setSubmitting(false);
  };

  const openPaymentModal = (tier: 'city_rider' | 'road_warrior') => {
    setSelectedTier(tier);
    setShowPaymentModal(true);
  };

  const copyToClipboard = (text: string, field: string) => {
    Clipboard.setString(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPaymentScreenshot(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setPaymentScreenshot(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const submitPayment = async () => {
    if (!paymentScreenshot || !selectedTier) {
      Alert.alert('Error', 'Please upload a payment screenshot');
      return;
    }

    setSubmitting(true);
    try {
      const tierPrice = selectedTier === 'city_rider' 
        ? pricing?.city_rider.current_price 
        : pricing?.road_warrior.current_price;

      const response = await fetch(`${BACKEND_URL}/api/subscriptions/${user?.id}/submit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: user?.id,
          screenshot: paymentScreenshot,
          amount: tierPrice,
          payment_reference: paymentReference,
          tier: selectedTier,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        Alert.alert('Payment Submitted!', 'Your payment is being verified. This usually takes a few seconds.');
        setShowPaymentModal(false);
        setPaymentScreenshot(null);
        setPaymentReference('');
        setSelectedTier(null);
        
        setTimeout(() => fetchSubscriptionStatus(), 3000);
      } else {
        Alert.alert('Error', data.detail || 'Failed to submit payment');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
    setSubmitting(false);
  };

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

  const tierConfig = getTierBadgeConfig(subscription?.tier || 'none');

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
          <TouchableOpacity style={styles.helpButton}>
            <Ionicons name="help-circle-outline" size={24} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {/* Current Subscription Badge */}
          {subscription && subscription.tier !== 'none' && (
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
                    <View style={styles.trialBadge}>
                      <Ionicons name="gift" size={14} color="#FFFFFF" />
                      <Text style={styles.trialBadgeText}>
                        Trial: {subscription.trial_hours_remaining}h or {subscription.trial_trips_remaining} trips left
                      </Text>
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
                    {pricing && getPhaseLabel(pricing.city_rider.current_phase)}
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

                {subscription?.tier === 'city_rider' ? (
                  <View style={styles.currentTierButton}>
                    <Ionicons name="checkmark-circle" size={20} color="#00D084" />
                    <Text style={styles.currentTierButtonText}>Current Tier</Text>
                  </View>
                ) : subscription?.tier === 'none' || !subscription ? (
                  <TouchableOpacity 
                    style={styles.selectButton}
                    onPress={() => startTrial('city_rider')}
                    disabled={submitting}
                  >
                    <LinearGradient
                      colors={['#00D084', '#00C853']}
                      style={styles.selectButtonGradient}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="gift" size={20} color="#FFFFFF" />
                          <Text style={styles.selectButtonText}>Start 24h FREE Trial</Text>
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
                    {pricing && getPhaseLabel(pricing.road_warrior.current_phase)}
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

                {subscription?.tier === 'road_warrior' ? (
                  <View style={[styles.currentTierButton, { backgroundColor: '#FFD70020', borderColor: '#FFD700' }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                    <Text style={[styles.currentTierButtonText, { color: '#FFD700' }]}>Current Tier</Text>
                  </View>
                ) : subscription?.tier === 'city_rider' && subscription?.can_upgrade ? (
                  <TouchableOpacity 
                    style={styles.selectButton}
                    onPress={() => setShowUpgradeModal(true)}
                  >
                    <LinearGradient
                      colors={['#FFD700', '#FFA500']}
                      style={styles.selectButtonGradient}
                    >
                      <Ionicons name="arrow-up-circle" size={20} color="#FFFFFF" />
                      <Text style={styles.selectButtonText}>Upgrade Now</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : subscription?.tier === 'city_rider' && !subscription?.can_upgrade ? (
                  <View style={styles.lockedButton}>
                    <Ionicons name="lock-closed" size={18} color="#94A3B8" />
                    <Text style={styles.lockedButtonText}>
                      Requires: 4.5★ + 50 trips
                    </Text>
                  </View>
                ) : subscription?.tier === 'none' || !subscription ? (
                  <TouchableOpacity 
                    style={styles.selectButton}
                    onPress={() => startTrial('road_warrior')}
                    disabled={submitting}
                  >
                    <LinearGradient
                      colors={['#FFD700', '#FFA500']}
                      style={styles.selectButtonGradient}
                    >
                      {submitting ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="gift" size={20} color="#FFFFFF" />
                          <Text style={styles.selectButtonText}>Start 24h FREE Trial</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : null}
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Bank Details Card */}
          <Animated.View style={[styles.bankCard, { opacity: fadeAnim }]}>
            <View style={styles.bankHeader}>
              <LinearGradient
                colors={['#00D084', '#00C853']}
                style={styles.bankIconBg}
              >
                <Ionicons name="card" size={20} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.bankTitle}>Payment Details</Text>
            </View>
            
            <View style={styles.bankDetailsContainer}>
              <BankDetailRow 
                label="Bank Name" 
                value="UBA"
                copied={copiedField === 'bank'}
                onCopy={() => copyToClipboard('UBA', 'bank')}
              />
              <BankDetailRow 
                label="Account Name" 
                value="ADMOBLORDGROUP LIMITED"
                copied={copiedField === 'name'}
                onCopy={() => copyToClipboard('ADMOBLORDGROUP LIMITED', 'name')}
              />
              <BankDetailRow 
                label="Account Number" 
                value="1028400669"
                copied={copiedField === 'number'}
                onCopy={() => copyToClipboard('1028400669', 'number')}
                highlight
              />
            </View>

            <View style={styles.stepsContainer}>
              <Text style={styles.stepsTitle}>How to Subscribe</Text>
              {[
                'Choose your tier above',
                'Transfer the amount to account above',
                'Screenshot your payment',
                'Upload screenshot for instant verification',
              ].map((step, index) => (
                <View key={index} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Payment Modal */}
        <Modal visible={showPaymentModal} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={['#0F172A', '#1E293B']}
              style={StyleSheet.absoluteFill}
            />
            
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.modalHeader}>
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={() => setShowPaymentModal(false)}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Submit Payment</Text>
                <View style={{ width: 40 }} />
              </View>

              <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalSectionTitle}>Payment Screenshot</Text>
                
                {paymentScreenshot ? (
                  <View style={styles.screenshotPreview}>
                    <Image source={{ uri: paymentScreenshot }} style={styles.screenshotImage} />
                    <TouchableOpacity 
                      style={styles.removeImageButton}
                      onPress={() => setPaymentScreenshot(null)}
                    >
                      <Ionicons name="close-circle" size={32} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.uploadOptionsContainer}>
                    <TouchableOpacity style={styles.uploadOption} onPress={takePhoto}>
                      <LinearGradient
                        colors={['rgba(99, 102, 241, 0.2)', 'rgba(99, 102, 241, 0.05)']}
                        style={styles.uploadOptionGradient}
                      >
                        <Ionicons name="camera" size={36} color="#6366F1" />
                        <Text style={styles.uploadOptionText}>Take Photo</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.uploadOption} onPress={pickImage}>
                      <LinearGradient
                        colors={['rgba(139, 92, 246, 0.2)', 'rgba(139, 92, 246, 0.05)']}
                        style={styles.uploadOptionGradient}
                      >
                        <Ionicons name="images" size={36} color="#8B5CF6" />
                        <Text style={styles.uploadOptionText}>From Gallery</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.modalSectionTitle}>Reference (Optional)</Text>
                <TextInput
                  style={styles.referenceInput}
                  placeholder="Transaction reference..."
                  placeholderTextColor="#64748B"
                  value={paymentReference}
                  onChangeText={setPaymentReference}
                />

                <TouchableOpacity 
                  style={[
                    styles.submitButton,
                    !paymentScreenshot && styles.submitButtonDisabled
                  ]}
                  onPress={submitPayment}
                  disabled={!paymentScreenshot || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <LinearGradient
                      colors={paymentScreenshot ? ['#00D084', '#00C853'] : ['#475569', '#475569']}
                      style={styles.submitButtonGradient}
                    >
                      <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
                      <Text style={styles.submitButtonText}>Submit for Verification</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>

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
                        Rating: {subscription.upgrade_requirements.current_rating.toFixed(1)}/4.5 ⭐
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
                    onPress={upgradeToRoadWarrior}
                    disabled={submitting || !subscription?.can_upgrade}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.upgradeConfirmText}>
                        Upgrade - ₦{pricing?.road_warrior.current_price.toLocaleString()}
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

const BankDetailRow = ({ 
  label, 
  value, 
  copied, 
  onCopy,
  highlight 
}: { 
  label: string; 
  value: string; 
  copied: boolean;
  onCopy: () => void;
  highlight?: boolean;
}) => (
  <View style={[styles.bankDetailRow, highlight && styles.bankDetailRowHighlight]}>
    <View>
      <Text style={styles.bankDetailLabel}>{label}</Text>
      <Text style={[styles.bankDetailValue, highlight && styles.bankDetailValueHighlight]}>
        {value}
      </Text>
    </View>
    <TouchableOpacity style={styles.copyButton} onPress={onCopy}>
      <Ionicons 
        name={copied ? "checkmark" : "copy-outline"} 
        size={20} 
        color={copied ? "#00D084" : "#94A3B8"} 
      />
    </TouchableOpacity>
  </View>
);

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
  daysRemainingText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 6,
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
  bankCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  bankIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bankDetailsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  bankDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  bankDetailRowHighlight: {
    backgroundColor: 'rgba(0, 208, 132, 0.1)',
  },
  bankDetailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bankDetailValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  bankDetailValueHighlight: {
    color: '#00D084',
    fontSize: 18,
    letterSpacing: 1.5,
  },
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F59E0B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
  },
  stepText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FDE68A',
    flex: 1,
  },

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
});
