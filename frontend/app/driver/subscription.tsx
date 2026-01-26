import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY, SUBSCRIPTION_PRICE } from '@/src/constants/theme';
import { Card, Badge, Button } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { getSubscription, getSubscriptionHistory, createSubscription } from '@/src/services/api';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user, setSubscription } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [currentSub, setCurrentSub] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string>('bank_transfer');

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    if (!user?.id) return;
    try {
      const [subRes, historyRes] = await Promise.all([
        getSubscription(user.id),
        getSubscriptionHistory(user.id)
      ]);
      setCurrentSub(subRes.data);
      setHistory(historyRes.data || []);
      if (subRes.data) {
        setSubscription(subRes.data);
      }
    } catch (error) {
      console.log('Error loading subscription:', error);
    }
  };

  const handleSubscribe = async () => {
    if (!user?.id) return;
    
    Alert.alert(
      'Confirm Subscription',
      `Subscribe to KODA for ${CURRENCY}${SUBSCRIPTION_PRICE.toLocaleString()}/month?\n\nPayment will be via ${selectedPayment.replace('_', ' ')}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Subscribe',
          onPress: async () => {
            setLoading(true);
            try {
              const response = await createSubscription(user.id, selectedPayment);
              setCurrentSub(response.data.subscription);
              setSubscription(response.data.subscription);
              await loadSubscriptionData();
              Alert.alert('Success', 'Subscription activated! You can now go online and accept rides.');
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to subscribe');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const getDaysRemaining = () => {
    if (!currentSub?.end_date) return 0;
    const end = new Date(currentSub.end_date);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Subscription</Text>
        </View>

        {/* Current Subscription Status */}
        <Card style={[
          styles.statusCard,
          currentSub?.status === 'active' && styles.activeCard
        ]}>
          <View style={styles.statusHeader}>
            <Ionicons 
              name={currentSub?.status === 'active' ? 'checkmark-circle' : 'alert-circle'} 
              size={32} 
              color={currentSub?.status === 'active' ? COLORS.white : COLORS.warning} 
            />
            <View style={styles.statusInfo}>
              <Text style={[
                styles.statusTitle,
                currentSub?.status === 'active' && styles.statusTitleActive
              ]}>
                {currentSub?.status === 'active' ? 'Active Subscription' : 'No Active Subscription'}
              </Text>
              {currentSub?.status === 'active' && (
                <Text style={styles.statusSubtitle}>
                  {getDaysRemaining()} days remaining
                </Text>
              )}
            </View>
          </View>
          {currentSub?.status === 'active' && (
            <View style={styles.expiryInfo}>
              <Text style={styles.expiryText}>
                Expires on {formatDate(currentSub.end_date)}
              </Text>
            </View>
          )}
        </Card>

        {/* Subscription Plan */}
        <Card style={styles.planCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planTitle}>KODA Driver Plan</Text>
            <Badge text="Monthly" variant="info" />
          </View>
          
          <View style={styles.priceContainer}>
            <Text style={styles.priceCurrency}>{CURRENCY}</Text>
            <Text style={styles.priceAmount}>{SUBSCRIPTION_PRICE.toLocaleString()}</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.featureText}>Unlimited ride requests</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.featureText}>No commission on rides</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.featureText}>Keep 100% of your earnings</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.featureText}>Priority ride matching</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.featureText}>Driver support access</Text>
            </View>
          </View>
        </Card>

        {/* Payment Methods */}
        {(!currentSub || currentSub.status !== 'active') && (
          <View style={styles.paymentSection}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            
            <TouchableOpacity 
              style={[
                styles.paymentOption,
                selectedPayment === 'bank_transfer' && styles.paymentOptionSelected
              ]}
              onPress={() => setSelectedPayment('bank_transfer')}
            >
              <View style={styles.paymentIcon}>
                <Ionicons name="business" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>Bank Transfer</Text>
                <Text style={styles.paymentSubtitle}>Transfer to KODA account</Text>
              </View>
              <View style={[
                styles.radioOuter,
                selectedPayment === 'bank_transfer' && styles.radioOuterSelected
              ]}>
                {selectedPayment === 'bank_transfer' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.paymentOption,
                selectedPayment === 'card' && styles.paymentOptionSelected
              ]}
              onPress={() => setSelectedPayment('card')}
            >
              <View style={styles.paymentIcon}>
                <Ionicons name="card" size={24} color={COLORS.info} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>Debit Card</Text>
                <Text style={styles.paymentSubtitle}>Pay with your card</Text>
              </View>
              <View style={[
                styles.radioOuter,
                selectedPayment === 'card' && styles.radioOuterSelected
              ]}>
                {selectedPayment === 'card' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.paymentOption,
                selectedPayment === 'ussd' && styles.paymentOptionSelected
              ]}
              onPress={() => setSelectedPayment('ussd')}
            >
              <View style={styles.paymentIcon}>
                <Ionicons name="phone-portrait" size={24} color={COLORS.warning} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentTitle}>USSD</Text>
                <Text style={styles.paymentSubtitle}>Pay via bank USSD code</Text>
              </View>
              <View style={[
                styles.radioOuter,
                selectedPayment === 'ussd' && styles.radioOuterSelected
              ]}>
                {selectedPayment === 'ussd' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            <Button
              title={loading ? 'Processing...' : `Subscribe for ${CURRENCY}${SUBSCRIPTION_PRICE.toLocaleString()}`}
              onPress={handleSubscribe}
              loading={loading}
              style={styles.subscribeButton}
            />
          </View>
        )}

        {/* Subscription History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Subscription History</Text>
            {history.map((sub, index) => (
              <Card key={sub.id || index} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Badge 
                    text={sub.status.toUpperCase()} 
                    variant={sub.status === 'active' ? 'success' : 'default'} 
                  />
                  <Text style={styles.historyAmount}>
                    {CURRENCY}{sub.amount?.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.historyDates}>
                  <Text style={styles.historyDate}>
                    {formatDate(sub.start_date)} - {formatDate(sub.end_date)}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusCard: {
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },
  activeCard: {
    backgroundColor: COLORS.primary,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusInfo: {
    marginLeft: SPACING.md,
  },
  statusTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusTitleActive: {
    color: COLORS.white,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.md,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  expiryInfo: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  expiryText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: FONT_SIZE.sm,
  },
  planCard: {
    marginBottom: SPACING.lg,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  planTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.lg,
  },
  priceCurrency: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: COLORS.primary,
  },
  priceAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.primary,
  },
  pricePeriod: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  features: {
    gap: SPACING.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  paymentSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.gray200,
  },
  paymentOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  paymentTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  paymentSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  subscribeButton: {
    marginTop: SPACING.md,
  },
  historySection: {
    marginTop: SPACING.md,
  },
  historyCard: {
    marginBottom: SPACING.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  historyAmount: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  historyDates: {
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  historyDate: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});
