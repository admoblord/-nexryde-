import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://nexryde-rebrand.preview.emergentagent.com';

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
  const { user } = useAppStore();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscriptions/${user?.id}`);
      const data = await response.json();
      setSubscription(data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    }
    setLoading(false);
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
        Alert.alert('Success! 🎉', data.message);
        fetchSubscription();
      } else {
        Alert.alert('Error', data.detail || 'Failed to start trial');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
    setLoading(false);
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
        Alert.alert('Submitted! ✅', 'Your payment is being verified. This usually takes a few seconds.');
        setShowPaymentModal(false);
        setPaymentScreenshot(null);
        setPaymentReference('');
        
        // Poll for verification
        setTimeout(() => fetchSubscription(), 3000);
      } else {
        Alert.alert('Error', data.detail || 'Failed to submit payment');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    }
    setSubmitting(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#22C55E';
      case 'trial': return '#3B82F6';
      case 'pending_verification': return '#F59E0B';
      case 'expired':
      case 'pending_payment': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'trial': return 'Free Trial';
      case 'pending_verification': return 'Verifying Payment...';
      case 'expired': return 'Expired';
      case 'pending_payment': return 'Payment Required';
      default: return status;
    }
  };

  const formatCurrency = (amount: number) => {
    return `₦${amount.toLocaleString()}`;
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
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Status Card */}
          <View style={styles.statusCard}>
            <LinearGradient
              colors={subscription?.status === 'active' ? ['#22C55E', '#16A34A'] : 
                      subscription?.status === 'trial' ? ['#3B82F6', '#2563EB'] :
                      ['#EF4444', '#DC2626']}
              style={styles.statusBadge}
            >
              <Ionicons 
                name={subscription?.status === 'active' || subscription?.status === 'trial' ? 'checkmark-circle' : 'alert-circle'} 
                size={24} 
                color="#FFFFFF" 
              />
              <Text style={styles.statusText}>{getStatusText(subscription?.status || 'none')}</Text>
            </LinearGradient>

            {subscription && (
              <View style={styles.statusDetails}>
                {subscription.days_remaining !== undefined && (
                  <View style={styles.daysRemaining}>
                    <Text style={styles.daysNumber}>{subscription.days_remaining}</Text>
                    <Text style={styles.daysLabel}>Days Remaining</Text>
                  </View>
                )}
                
                {subscription.end_date && (
                  <Text style={styles.expiryText}>
                    {subscription.status === 'trial' ? 'Trial ends' : 'Expires'}: {formatDate(subscription.end_date)}
                  </Text>
                )}
              </View>
            )}

            {!subscription && (
              <View style={styles.noSubscription}>
                <Ionicons name="gift" size={48} color="#3B82F6" />
                <Text style={styles.noSubTitle}>Start Your Free Trial!</Text>
                <Text style={styles.noSubText}>Get 7 days free to experience NEXRYDE</Text>
                <TouchableOpacity style={styles.trialButton} onPress={startTrial}>
                  <Text style={styles.trialButtonText}>Start 7-Day Free Trial</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Price Card */}
          <View style={styles.priceCard}>
            <View style={styles.priceHeader}>
              <Text style={styles.priceTitle}>Monthly Subscription</Text>
              <View style={styles.priceAmount}>
                <Text style={styles.currency}>₦</Text>
                <Text style={styles.price}>25,000</Text>
                <Text style={styles.period}>/month</Text>
              </View>
            </View>
            
            <View style={styles.benefitsList}>
              <BenefitItem icon="checkmark-circle" text="Unlimited ride requests" />
              <BenefitItem icon="checkmark-circle" text="Priority customer support" />
              <BenefitItem icon="checkmark-circle" text="100% earnings - no commission" />
              <BenefitItem icon="checkmark-circle" text="Real-time ride matching" />
              <BenefitItem icon="checkmark-circle" text="Insurance coverage" />
            </View>
          </View>

          {/* Bank Details Card */}
          <View style={styles.bankCard}>
            <View style={styles.bankHeader}>
              <Ionicons name="card" size={24} color="#22C55E" />
              <Text style={styles.bankTitle}>Payment Details</Text>
            </View>
            
            <View style={styles.bankDetails}>
              <DetailRow label="Bank Name" value={subscription?.bank_details?.bank_name || 'Access Bank'} />
              <DetailRow label="Account Name" value={subscription?.bank_details?.account_name || 'NEXRYDE Technologies Ltd'} />
              <DetailRow 
                label="Account Number" 
                value={subscription?.bank_details?.account_number || '0123456789'} 
                copyable 
              />
            </View>

            <View style={styles.instructions}>
              <Text style={styles.instructionsTitle}>How to Pay:</Text>
              <Text style={styles.instructionsText}>
                1. Transfer ₦25,000 to the account above{'\n'}
                2. Take a screenshot of your payment receipt{'\n'}
                3. Upload the screenshot below{'\n'}
                4. Your subscription will be activated within minutes
              </Text>
            </View>
          </View>

          {/* Payment Button */}
          {(subscription?.status === 'trial' || 
            subscription?.status === 'expired' || 
            subscription?.status === 'pending_payment' ||
            !subscription) && (
            <TouchableOpacity 
              style={styles.payButton} 
              onPress={() => setShowPaymentModal(true)}
            >
              <LinearGradient
                colors={['#22C55E', '#16A34A']}
                style={styles.payButtonGradient}
              >
                <Ionicons name="cloud-upload" size={24} color="#FFFFFF" />
                <Text style={styles.payButtonText}>Upload Payment Proof</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {subscription?.status === 'pending_verification' && (
            <View style={styles.verifyingCard}>
              <ActivityIndicator size="small" color="#F59E0B" />
              <Text style={styles.verifyingText}>Your payment is being verified...</Text>
            </View>
          )}
        </ScrollView>

        {/* Payment Modal */}
        <Modal visible={showPaymentModal} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Submit Payment</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalContent}>
              {/* Screenshot Upload */}
              <Text style={styles.uploadLabel}>Payment Screenshot</Text>
              
              {paymentScreenshot ? (
                <View style={styles.screenshotContainer}>
                  <Image source={{ uri: paymentScreenshot }} style={styles.screenshot} />
                  <TouchableOpacity 
                    style={styles.removeScreenshot}
                    onPress={() => setPaymentScreenshot(null)}
                  >
                    <Ionicons name="close-circle" size={28} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadOptions}>
                  <TouchableOpacity style={styles.uploadButton} onPress={takePhoto}>
                    <Ionicons name="camera" size={32} color="#3B82F6" />
                    <Text style={styles.uploadButtonText}>Take Photo</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
                    <Ionicons name="images" size={32} color="#8B5CF6" />
                    <Text style={styles.uploadButtonText}>From Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Payment Reference */}
              <Text style={styles.inputLabel}>Payment Reference (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter transaction reference"
                placeholderTextColor="#9CA3AF"
                value={paymentReference}
                onChangeText={setPaymentReference}
              />

              {/* Submit Button */}
              <TouchableOpacity 
                style={[styles.submitButton, !paymentScreenshot && styles.submitButtonDisabled]}
                onPress={submitPayment}
                disabled={!paymentScreenshot || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={20} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Submit for Verification</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const BenefitItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.benefitItem}>
    <Ionicons name={icon as any} size={20} color="#22C55E" />
    <Text style={styles.benefitText}>{text}</Text>
  </View>
);

const DetailRow = ({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <View style={styles.detailValueContainer}>
      <Text style={styles.detailValue}>{value}</Text>
      {copyable && (
        <TouchableOpacity style={styles.copyButton}>
          <Ionicons name="copy-outline" size={18} color="#3B82F6" />
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scrollContent: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusDetails: {
    marginTop: 16,
    alignItems: 'center',
  },
  daysRemaining: {
    alignItems: 'center',
    marginBottom: 8,
  },
  daysNumber: {
    fontSize: 48,
    fontWeight: '800',
    color: '#111827',
  },
  daysLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  expiryText: {
    fontSize: 13,
    color: '#6B7280',
  },
  noSubscription: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noSubTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
  },
  noSubText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 16,
  },
  trialButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  trialButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  priceHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 16,
    marginBottom: 16,
  },
  priceTitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 8,
  },
  priceAmount: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currency: {
    fontSize: 24,
    fontWeight: '700',
    color: '#22C55E',
  },
  price: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111827',
  },
  period: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 4,
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  bankCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  bankTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  bankDetails: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  detailLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  detailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  copyButton: {
    padding: 4,
  },
  instructions: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },
  payButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  payButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  verifyingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  verifyingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  uploadOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
  },
  screenshotContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  screenshot: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  removeScreenshot: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    marginBottom: 24,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
