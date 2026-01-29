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
import { BlurView } from 'expo-blur';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SubscriptionData {
  status: string;
  days_remaining: number;
  trial_end_date?: string;
  end_date?: string;
  start_date?: string;
  monthly_fee: number;
  bank_details: {
    bank_name: string;
    account_name: string;
    account_number: string;
  };
}

export default function SubscriptionScreen() {
  const router = useRouter();
  // On web, user store might fail due to import.meta - use null safely
  let user = null;
  try {
    const store = useAppStore();
    user = store?.user;
  } catch (e) {
    console.log('Store not available on web');
  }
  const [loading, setLoading] = useState(false); // Start with false for web compatibility
  const [subscription, setSubscription] = useState<any>({
    status: 'none',
    days_remaining: 0,
    monthly_fee: 25000,
    bank_details: {
      bank_name: 'United Bank for Africa (UBA)',
      account_name: 'ADMOBLORDGROUP LIMITED',
      account_number: '1028400669',
    },
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Immediately try to fetch or set default data
    const initSubscription = async () => {
      try {
        await fetchSubscription();
      } catch (e) {
        console.error('Init error:', e);
        // Ensure loading stops even on error
        setSubscription({
          status: 'none',
          days_remaining: 0,
          monthly_fee: 25000,
          bank_details: {
            bank_name: 'United Bank for Africa (UBA)',
            account_name: 'ADMOBLORDGROUP LIMITED',
            account_number: '1028400669',
          },
        });
        setLoading(false);
      }
    };
    
    initSubscription();
    
    // Fallback timeout - ensure loading stops after 5 seconds
    const timeout = setTimeout(() => {
      if (loading) {
        setSubscription({
          status: 'none',
          days_remaining: 0,
          monthly_fee: 25000,
          bank_details: {
            bank_name: 'United Bank for Africa (UBA)',
            account_name: 'ADMOBLORDGROUP LIMITED',
            account_number: '1028400669',
          },
        });
        setLoading(false);
      }
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
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation for active status
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    
    return () => {
      pulse.stop();
      clearTimeout(timeout);
    };
  }, []);

  const fetchSubscription = async () => {
    console.log('fetchSubscription called, user:', user?.id);
    if (!user?.id) {
      console.log('No user, setting default subscription');
      // Set default subscription data for demo/testing when no user is logged in
      setSubscription({
        status: 'none',
        days_remaining: 0,
        monthly_fee: 25000,
        bank_details: {
          bank_name: 'United Bank for Africa (UBA)',
          account_name: 'ADMOBLORDGROUP LIMITED',
          account_number: '1028400669',
        },
      });
      setLoading(false);
      return;
    }
    try {
      console.log('Fetching subscription for user:', user?.id);
      const response = await fetch(`${BACKEND_URL}/api/subscriptions/${user?.id}`);
      const data = await response.json();
      console.log('Subscription data:', data);
      setSubscription(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      // Set default data on error
      setSubscription({
        status: 'none',
        days_remaining: 0,
        monthly_fee: 25000,
        bank_details: {
          bank_name: 'United Bank for Africa (UBA)',
          account_name: 'ADMOBLORDGROUP LIMITED',
          account_number: '1028400669',
        },
      });
      setLoading(false);
    }
  };

  const startTrial = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscriptions/${user?.id}/start-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      
      if (response.ok) {
        Alert.alert('Welcome to NEXRYDE!', data.message);
        fetchSubscription();
      } else {
        Alert.alert('Error', data.detail || 'Failed to start trial');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
    setLoading(false);
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
    if (!paymentScreenshot) {
      Alert.alert('Error', 'Please upload a payment screenshot');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscriptions/${user?.id}/submit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: user?.id,
          screenshot: paymentScreenshot,
          amount: subscription?.monthly_fee || 25000,
          payment_reference: paymentReference,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        Alert.alert('Payment Submitted!', 'Your payment is being verified. This usually takes a few seconds.');
        setShowPaymentModal(false);
        setPaymentScreenshot(null);
        setPaymentReference('');
        
        setTimeout(() => fetchSubscription(), 3000);
      } else {
        Alert.alert('Error', data.detail || 'Failed to submit payment');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
    setSubmitting(false);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active':
        return {
          gradient: ['#00C853', '#00E676'] as const,
          icon: 'checkmark-shield',
          label: 'ACTIVE',
          bgColor: 'rgba(0, 200, 83, 0.1)',
        };
      case 'trial':
        return {
          gradient: ['#6366F1', '#8B5CF6'] as const,
          icon: 'gift',
          label: 'FREE TRIAL',
          bgColor: 'rgba(99, 102, 241, 0.1)',
        };
      case 'pending_verification':
        return {
          gradient: ['#F59E0B', '#FBBF24'] as const,
          icon: 'time',
          label: 'VERIFYING',
          bgColor: 'rgba(245, 158, 11, 0.1)',
        };
      default:
        return {
          gradient: ['#EF4444', '#F87171'] as const,
          icon: 'alert-circle',
          label: 'EXPIRED',
          bgColor: 'rgba(239, 68, 68, 0.1)',
        };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#0F172A', '#1E293B']}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.loadingText}>Loading subscription...</Text>
      </View>
    );
  }

  const statusConfig = getStatusConfig(subscription?.status || 'expired');

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#0F172A', '#1E293B', '#0F172A']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Decorative Circles */}
      <View style={styles.decorCircle1} />
      <View style={styles.decorCircle2} />
      <View style={styles.decorCircle3} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription</Text>
          <TouchableOpacity style={styles.helpButton}>
            <Ionicons name="help-circle-outline" size={24} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {/* Status Card - Hero Section */}
          <Animated.View 
            style={[
              styles.heroCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              }
            ]}
          >
            <LinearGradient
              colors={statusConfig.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              {/* Floating particles effect */}
              <View style={styles.particle1} />
              <View style={styles.particle2} />
              <View style={styles.particle3} />
              
              <Animated.View style={[
                styles.statusIconContainer,
                subscription?.status === 'active' && { transform: [{ scale: pulseAnim }] }
              ]}>
                <Ionicons name={statusConfig.icon as any} size={40} color="#FFFFFF" />
              </Animated.View>
              
              <Text style={styles.statusLabel}>{statusConfig.label}</Text>
              
              {subscription && subscription.days_remaining !== undefined && (
                <View style={styles.daysContainer}>
                  <Text style={styles.daysNumber}>{subscription.days_remaining}</Text>
                  <Text style={styles.daysText}>days remaining</Text>
                </View>
              )}
              
              {subscription?.end_date && (
                <Text style={styles.expiryText}>
                  {subscription.status === 'trial' ? 'Trial ends' : 'Renews'}: {formatDate(subscription.end_date)}
                </Text>
              )}
            </LinearGradient>
          </Animated.View>

          {/* No Subscription - Start Trial */}
          {!subscription && (
            <Animated.View style={[styles.trialCard, { opacity: fadeAnim }]}>
              <LinearGradient
                colors={['rgba(99, 102, 241, 0.2)', 'rgba(139, 92, 246, 0.1)']}
                style={styles.trialGradient}
              >
                <Ionicons name="sparkles" size={48} color="#8B5CF6" />
                <Text style={styles.trialTitle}>Start Your Journey!</Text>
                <Text style={styles.trialSubtitle}>Get 7 days free to experience premium features</Text>
                
                <TouchableOpacity style={styles.trialButton} onPress={startTrial}>
                  <LinearGradient
                    colors={['#6366F1', '#8B5CF6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.trialButtonGradient}
                  >
                    <Ionicons name="rocket" size={20} color="#FFFFFF" />
                    <Text style={styles.trialButtonText}>Start Free Trial</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          )}

          {/* Price Card */}
          <Animated.View 
            style={[
              styles.glassCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.priceHeader}>
              <View style={styles.priceBadge}>
                <Text style={styles.priceBadgeText}>MONTHLY</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.currencySymbol}>₦</Text>
                <Text style={styles.priceValue}>25,000</Text>
              </View>
              <Text style={styles.priceSubtext}>per month • No commission fees</Text>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.benefitsContainer}>
              <Text style={styles.benefitsTitle}>What's Included</Text>
              {[
                { icon: 'infinite', text: 'Unlimited ride requests', color: '#00E676' },
                { icon: 'cash', text: '100% earnings - Zero commission', color: '#FFD700' },
                { icon: 'shield-checkmark', text: 'Full insurance coverage', color: '#00B0FF' },
                { icon: 'headset', text: 'Priority customer support', color: '#FF6B6B' },
                { icon: 'flash', text: 'Real-time ride matching', color: '#8B5CF6' },
              ].map((benefit, index) => (
                <View key={index} style={styles.benefitRow}>
                  <View style={[styles.benefitIcon, { backgroundColor: `${benefit.color}20` }]}>
                    <Ionicons name={benefit.icon as any} size={18} color={benefit.color} />
                  </View>
                  <Text style={styles.benefitText}>{benefit.text}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Bank Details Card */}
          <Animated.View 
            style={[
              styles.bankCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
            ]}
          >
            <View style={styles.bankHeader}>
              <LinearGradient
                colors={['#00E676', '#00C853']}
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
              <Text style={styles.stepsTitle}>Quick Steps</Text>
              {[
                'Transfer ₦25,000 to the account above',
                'Screenshot your payment receipt',
                'Upload & submit for verification',
                'Get activated within minutes!',
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

          {/* Action Button */}
          {(subscription?.status === 'trial' || 
            subscription?.status === 'expired' || 
            subscription?.status === 'pending_payment' ||
            !subscription) && (
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => setShowPaymentModal(true)}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#00E676', '#00C853']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionButtonGradient}
              >
                <Ionicons name="cloud-upload" size={22} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Upload Payment Proof</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {subscription?.status === 'pending_verification' && (
            <View style={styles.verifyingContainer}>
              <ActivityIndicator size="small" color="#F59E0B" />
              <Text style={styles.verifyingText}>Verifying your payment...</Text>
            </View>
          )}
          
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
                      colors={paymentScreenshot ? ['#00E676', '#00C853'] : ['#475569', '#475569']}
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
        color={copied ? "#00E676" : "#94A3B8"} 
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
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 14,
  },
  
  // Decorative elements
  decorCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: 100,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
  },
  decorCircle3: {
    position: 'absolute',
    top: '40%',
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  
  // Header
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
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
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
  
  // Hero Card
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
  },
  heroGradient: {
    padding: 28,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  particle1: {
    position: 'absolute',
    top: 20,
    left: 30,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  particle2: {
    position: 'absolute',
    top: 60,
    right: 40,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  particle3: {
    position: 'absolute',
    bottom: 30,
    left: 60,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  statusIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 8,
  },
  daysContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  daysNumber: {
    fontSize: 56,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 60,
  },
  daysText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  expiryText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 12,
  },
  
  // Trial Card
  trialCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
  },
  trialGradient: {
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: 24,
  },
  trialTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
  },
  trialSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
  },
  trialButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  trialButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    gap: 10,
  },
  trialButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  // Glass Card (Price)
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  priceHeader: {
    alignItems: 'center',
  },
  priceBadge: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  priceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00E676',
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00E676',
    marginTop: 8,
  },
  priceValue: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  priceSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 20,
  },
  benefitsContainer: {
    gap: 14,
  },
  benefitsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1,
  },
  
  // Bank Card
  bankCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
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
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bankDetailsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  bankDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  bankDetailRowHighlight: {
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
  },
  bankDetailLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  bankDetailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bankDetailValueHighlight: {
    color: '#00E676',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  copyButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Steps
  stepsContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
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
    fontWeight: '700',
    color: '#000000',
  },
  stepText: {
    fontSize: 13,
    color: '#FCD34D',
    flex: 1,
  },
  
  // Action Button
  actionButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  
  // Verifying
  verifyingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginTop: 4,
  },
  verifyingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  
  // Modal
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
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 12,
    marginTop: 8,
  },
  
  // Upload Options
  uploadOptionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  uploadOption: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  uploadOptionGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  uploadOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 10,
  },
  
  // Screenshot Preview
  screenshotPreview: {
    position: 'relative',
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  screenshotImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#1E293B',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#0F172A',
    borderRadius: 16,
  },
  
  // Reference Input
  referenceInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  
  // Submit Button
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
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
