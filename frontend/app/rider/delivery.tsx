import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  primary: '#0F172A',
  green: '#22C55E',
  greenLight: '#4ADE80',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  orange: '#F59E0B',
  cyan: '#06B6D4',
  red: '#EF4444',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

const PACKAGE_SIZES = [
  { id: 'small', label: 'Small', icon: 'cube-outline', desc: 'Fits in a bag', price: 500 },
  { id: 'medium', label: 'Medium', icon: 'cube', desc: 'Fits in a box', price: 800 },
  { id: 'large', label: 'Large', icon: 'archive', desc: 'Large items', price: 1200 },
];

export default function DeliveryScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [packageDesc, setPackageDesc] = useState('');
  const [selectedSize, setSelectedSize] = useState('small');
  const [pickup, setPickup] = useState({ address: 'Select Pickup Location', lat: 0, lng: 0 });
  const [dropoff, setDropoff] = useState({ address: 'Select Drop-off Location', lat: 0, lng: 0 });
  const [loading, setLoading] = useState(false);
  const [fareEstimate, setFareEstimate] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const [deliveryId, setDeliveryId] = useState<string | null>(null);

  useEffect(() => {
    if (pickup.lat && dropoff.lat) {
      estimateFare();
    }
  }, [pickup, dropoff, selectedSize]);

  const estimateFare = async () => {
    try {
      const basePrice = PACKAGE_SIZES.find(s => s.id === selectedSize)?.price || 500;
      // Simulated distance-based calculation
      const distance = Math.random() * 10 + 2; // 2-12km
      const distancePrice = distance * 150;
      setFareEstimate(Math.round(basePrice + distancePrice));
    } catch (e) {
      console.error('Estimate fare error:', e);
    }
  };

  const requestDelivery = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Please login first');
      return;
    }

    if (!recipientName.trim() || !recipientPhone.trim()) {
      Alert.alert('Missing Information', 'Please fill in recipient details');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/delivery/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: user.id,
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          package_description: packageDesc,
          package_size: selectedSize,
          pickup_lat: pickup.lat || 6.4281,
          pickup_lng: pickup.lng || 3.4219,
          pickup_address: pickup.address,
          dropoff_lat: dropoff.lat || 6.4355,
          dropoff_lng: dropoff.lng || 3.4567,
          dropoff_address: dropoff.address,
        }),
      });
      const data = await res.json();
      if (data.delivery_id) {
        setDeliveryId(data.delivery_id);
        setSuccess(true);
      }
    } catch (e) {
      console.error('Request delivery error:', e);
      Alert.alert('Error', 'Failed to request delivery');
    }
    setLoading(false);
  };

  if (success) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <LinearGradient
                colors={[COLORS.cyan, COLORS.blue]}
                style={styles.successGradient}
              >
                <Ionicons name="checkmark" size={48} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text style={styles.successTitle}>Delivery Requested! 📦</Text>
            <Text style={styles.successDesc}>
              We're finding a driver to pick up your package
            </Text>
            
            <View style={styles.successCard}>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Tracking ID</Text>
                <Text style={styles.successValue}>{deliveryId?.slice(0, 8).toUpperCase()}</Text>
              </View>
              <View style={styles.successDivider} />
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Recipient</Text>
                <Text style={styles.successValue}>{recipientName}</Text>
              </View>
              <View style={styles.successDivider} />
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Estimated Fare</Text>
                <Text style={[styles.successValue, { color: COLORS.cyan }]}>
                  ₦{fareEstimate?.toLocaleString()}
                </Text>
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.homeButton}
              onPress={() => router.replace('/(rider-tabs)/rider-home')}
            >
              <LinearGradient
                colors={[COLORS.cyan, COLORS.blue]}
                style={styles.homeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.homeText}>Back to Home</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Send Package</Text>
            <Text style={styles.headerSubtitle}>Fast & Secure Delivery</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Route Card */}
          <View style={styles.routeCard}>
            <View style={styles.routeHeader}>
              <LinearGradient
                colors={[COLORS.cyan, COLORS.blue]}
                style={styles.routeIcon}
              >
                <Ionicons name="cube" size={24} color="#FFFFFF" />
              </LinearGradient>
              <View>
                <Text style={styles.routeTitle}>Delivery Route</Text>
                <Text style={styles.routeDesc}>Where should we pick up & deliver?</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.locationInput}
              onPress={() => router.push('/rider/book')}
            >
              <View style={styles.locationLeft}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.cyan }]} />
                <View>
                  <Text style={styles.locationLabel}>PICKUP</Text>
                  <Text style={styles.locationValue} numberOfLines={1}>{pickup.address}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>

            <View style={styles.routeLine}>
              <View style={styles.routeDash} />
              <View style={styles.routeDash} />
              <View style={styles.routeDash} />
            </View>

            <TouchableOpacity 
              style={styles.locationInput}
              onPress={() => router.push('/rider/book')}
            >
              <View style={styles.locationLeft}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.orange }]} />
                <View>
                  <Text style={styles.locationLabel}>DELIVER TO</Text>
                  <Text style={styles.locationValue} numberOfLines={1}>{dropoff.address}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Package Size Selection */}
          <View style={styles.sizeSection}>
            <Text style={styles.sectionTitle}>Package Size</Text>
            <View style={styles.sizeGrid}>
              {PACKAGE_SIZES.map((size) => (
                <TouchableOpacity
                  key={size.id}
                  style={[
                    styles.sizeCard,
                    selectedSize === size.id && styles.sizeCardActive
                  ]}
                  onPress={() => setSelectedSize(size.id)}
                >
                  <View style={[
                    styles.sizeIcon,
                    selectedSize === size.id && styles.sizeIconActive
                  ]}>
                    <Ionicons 
                      name={size.icon as any} 
                      size={28} 
                      color={selectedSize === size.id ? '#FFFFFF' : COLORS.cyan} 
                    />
                  </View>
                  <Text style={[
                    styles.sizeLabel,
                    selectedSize === size.id && styles.sizeLabelActive
                  ]}>{size.label}</Text>
                  <Text style={styles.sizeDesc}>{size.desc}</Text>
                  <Text style={[
                    styles.sizePrice,
                    selectedSize === size.id && styles.sizePriceActive
                  ]}>+₦{size.price}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Recipient Details */}
          <View style={styles.recipientSection}>
            <Text style={styles.sectionTitle}>Recipient Details</Text>
            <View style={styles.inputCard}>
              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: COLORS.blue + '15' }]}>
                  <Ionicons name="person" size={20} color={COLORS.blue} />
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="Recipient Name"
                  placeholderTextColor={COLORS.textMuted}
                  value={recipientName}
                  onChangeText={setRecipientName}
                />
              </View>
              <View style={styles.inputDivider} />
              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: COLORS.green + '15' }]}>
                  <Ionicons name="call" size={20} color={COLORS.green} />
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="Recipient Phone"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                  value={recipientPhone}
                  onChangeText={setRecipientPhone}
                />
              </View>
              <View style={styles.inputDivider} />
              <View style={styles.inputRow}>
                <View style={[styles.inputIcon, { backgroundColor: COLORS.purple + '15' }]}>
                  <Ionicons name="document-text" size={20} color={COLORS.purple} />
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="Package Description (optional)"
                  placeholderTextColor={COLORS.textMuted}
                  value={packageDesc}
                  onChangeText={setPackageDesc}
                />
              </View>
            </View>
          </View>

          {/* Fare Estimate Card */}
          {fareEstimate && (
            <View style={styles.fareCard}>
              <View style={styles.fareLeft}>
                <Ionicons name="pricetag" size={24} color={COLORS.cyan} />
                <View>
                  <Text style={styles.fareLabel}>Estimated Fare</Text>
                  <Text style={styles.fareNote}>Final price may vary</Text>
                </View>
              </View>
              <Text style={styles.fareValue}>₦{fareEstimate.toLocaleString()}</Text>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={requestDelivery}
            disabled={loading}
          >
            <LinearGradient
              colors={[COLORS.cyan, COLORS.blue]}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="send" size={22} color="#FFFFFF" />
                  <Text style={styles.submitText}>Request Delivery</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark" size={24} color={COLORS.cyan} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Safe & Insured</Text>
              <Text style={styles.infoDesc}>All packages are insured up to ₦50,000</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.cyan,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
  },
  routeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  routeIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  routeDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 14,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  routeLine: {
    marginLeft: 7,
    paddingVertical: 4,
    gap: 4,
  },
  routeDash: {
    width: 2,
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 1,
  },
  sizeSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 14,
  },
  sizeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  sizeCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  sizeCardActive: {
    borderColor: COLORS.cyan,
    backgroundColor: COLORS.cyan + '08',
  },
  sizeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.cyan + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sizeIconActive: {
    backgroundColor: COLORS.cyan,
  },
  sizeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  sizeLabelActive: {
    color: COLORS.cyan,
  },
  sizeDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  sizePrice: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  sizePriceActive: {
    color: COLORS.cyan,
  },
  recipientSection: {
    marginBottom: 20,
  },
  inputCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  inputIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.primary,
  },
  inputDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 70,
  },
  fareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cyan + '10',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.cyan + '30',
  },
  fareLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fareLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  fareNote: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  fareValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.cyan,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  submitText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  infoDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successIcon: {
    marginBottom: 24,
  },
  successGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 8,
  },
  successDesc: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  successCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  successRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  successDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  successLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  successValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  homeButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
  },
  homeGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  homeText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
