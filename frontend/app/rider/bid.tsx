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
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
  red: '#EF4444',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

interface DriverOffer {
  offer_id: string;
  driver_id: string;
  driver_name: string;
  driver_rating: number;
  counter_price: number;
  message?: string;
  vehicle_type?: string;
}

export default function RideBidScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAppStore();
  
  const [offeredPrice, setOfferedPrice] = useState(params.suggestedFare?.toString() || '2500');
  const [bidId, setBidId] = useState<string | null>(null);
  const [driverOffers, setDriverOffers] = useState<DriverOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [waitingForOffers, setWaitingForOffers] = useState(false);
  const [surge, setSurge] = useState<any>(null);
  
  const pickup = {
    lat: parseFloat(params.pickupLat as string) || 6.4281,
    lng: parseFloat(params.pickupLng as string) || 3.4219,
    address: params.pickupAddress as string || 'Current Location'
  };
  
  const dropoff = {
    lat: parseFloat(params.dropoffLat as string) || 6.4355,
    lng: parseFloat(params.dropoffLng as string) || 3.4567,
    address: params.dropoffAddress as string || 'Enter Destination'
  };

  useEffect(() => {
    checkSurge();
  }, []);

  useEffect(() => {
    if (bidId) {
      const interval = setInterval(fetchOffers, 3000);
      return () => clearInterval(interval);
    }
  }, [bidId]);

  const checkSurge = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/surge/check?lat=${pickup.lat}&lng=${pickup.lng}`);
      const data = await res.json();
      setSurge(data);
    } catch (e) {
      console.error('Surge check error:', e);
    }
  };

  const createBid = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Please login first');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/bid/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          pickup_address: pickup.address,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          dropoff_address: dropoff.address,
          offered_price: parseFloat(offeredPrice),
        }),
      });
      const data = await res.json();
      if (data.bid_id) {
        setBidId(data.bid_id);
        setWaitingForOffers(true);
      }
    } catch (e) {
      console.error('Create bid error:', e);
      Alert.alert('Error', 'Failed to create bid request');
    }
    setLoading(false);
  };

  const fetchOffers = async () => {
    if (!bidId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/bid/${bidId}/offers`);
      const data = await res.json();
      if (data.offers) {
        setDriverOffers(data.offers);
      }
    } catch (e) {
      console.error('Fetch offers error:', e);
    }
  };

  const acceptOffer = async (offerId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/bid/${bidId}/accept/${offerId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Ride Confirmed!', 'Your driver is on the way', [
          { text: 'OK', onPress: () => router.replace('/(rider-tabs)/rider-home') }
        ]);
      }
    } catch (e) {
      console.error('Accept offer error:', e);
      Alert.alert('Error', 'Failed to accept offer');
    }
    setLoading(false);
  };

  const adjustPrice = (amount: number) => {
    const current = parseInt(offeredPrice) || 0;
    const newPrice = Math.max(500, current + amount);
    setOfferedPrice(newPrice.toString());
  };

  const renderOffer = ({ item }: { item: DriverOffer }) => (
    <View style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <View style={styles.driverInfo}>
          <LinearGradient
            colors={[COLORS.green, COLORS.blue]}
            style={styles.driverAvatar}
          >
            <Text style={styles.driverInitial}>{item.driver_name?.charAt(0) || 'D'}</Text>
          </LinearGradient>
          <View>
            <Text style={styles.driverName}>{item.driver_name}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={COLORS.orange} />
              <Text style={styles.rating}>{item.driver_rating?.toFixed(1) || '4.8'}</Text>
              {item.vehicle_type && (
                <Text style={styles.vehicleType}> • {item.vehicle_type}</Text>
              )}
            </View>
          </View>
        </View>
        <View style={styles.offerPrice}>
          <Text style={styles.offerPriceLabel}>Offer</Text>
          <Text style={styles.offerPriceValue}>₦{item.counter_price?.toLocaleString()}</Text>
        </View>
      </View>
      
      {item.message && (
        <View style={styles.messageBox}>
          <Ionicons name="chatbubble-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.messageText}>"{item.message}"</Text>
        </View>
      )}
      
      <TouchableOpacity
        style={styles.acceptButton}
        onPress={() => acceptOffer(item.offer_id)}
      >
        <LinearGradient
          colors={[COLORS.green, COLORS.greenLight]}
          style={styles.acceptGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
          <Text style={styles.acceptText}>Accept Offer</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Name Your Price</Text>
            <Text style={styles.headerSubtitle}>inDrive Style</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Route Card */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={styles.routeDot}>
                <View style={[styles.dot, { backgroundColor: COLORS.green }]} />
              </View>
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>PICKUP</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>{pickup.address}</Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={styles.routeDot}>
                <View style={[styles.dot, { backgroundColor: COLORS.red }]} />
              </View>
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>DROP-OFF</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>{dropoff.address}</Text>
              </View>
            </View>
          </View>

          {/* Surge Indicator */}
          {surge && surge.multiplier > 1 && (
            <View style={styles.surgeCard}>
              <LinearGradient
                colors={[COLORS.orange + '20', COLORS.orange + '10']}
                style={styles.surgeGradient}
              >
                <Ionicons name="flash" size={20} color={COLORS.orange} />
                <View style={styles.surgeInfo}>
                  <Text style={styles.surgeTitle}>High Demand Area</Text>
                  <Text style={styles.surgeText}>{surge.multiplier}x surge pricing active</Text>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Price Input Section */}
          {!waitingForOffers ? (
            <View style={styles.priceSection}>
              <Text style={styles.priceSectionTitle}>Your Offer</Text>
              <Text style={styles.priceSectionDesc}>Set your price and drivers will respond</Text>
              
              <View style={styles.priceInputCard}>
                <TouchableOpacity 
                  style={styles.priceAdjustBtn}
                  onPress={() => adjustPrice(-100)}
                >
                  <Ionicons name="remove" size={28} color={COLORS.primary} />
                </TouchableOpacity>
                
                <View style={styles.priceInputContainer}>
                  <Text style={styles.currencySymbol}>₦</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={offeredPrice}
                    onChangeText={setOfferedPrice}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                
                <TouchableOpacity 
                  style={styles.priceAdjustBtn}
                  onPress={() => adjustPrice(100)}
                >
                  <Ionicons name="add" size={28} color={COLORS.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.quickPrices}>
                {[1500, 2000, 2500, 3000, 4000].map((price) => (
                  <TouchableOpacity
                    key={price}
                    style={[
                      styles.quickPriceBtn,
                      parseInt(offeredPrice) === price && styles.quickPriceBtnActive
                    ]}
                    onPress={() => setOfferedPrice(price.toString())}
                  >
                    <Text style={[
                      styles.quickPriceText,
                      parseInt(offeredPrice) === price && styles.quickPriceTextActive
                    ]}>₦{price.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={createBid}
                disabled={loading}
              >
                <LinearGradient
                  colors={[COLORS.green, COLORS.blue]}
                  style={styles.submitGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.submitText}>Request Bids from Drivers</Text>
                      <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            /* Waiting for Offers */
            <View style={styles.waitingSection}>
              <View style={styles.waitingHeader}>
                <View style={styles.pulseOuter}>
                  <View style={styles.pulseInner}>
                    <Ionicons name="radio" size={32} color={COLORS.green} />
                  </View>
                </View>
                <Text style={styles.waitingTitle}>Finding Drivers...</Text>
                <Text style={styles.waitingDesc}>Your offer: ₦{parseInt(offeredPrice).toLocaleString()}</Text>
              </View>
              
              {driverOffers.length > 0 ? (
                <View style={styles.offersSection}>
                  <Text style={styles.offersTitle}>{driverOffers.length} Driver{driverOffers.length > 1 ? 's' : ''} Responded</Text>
                  <FlatList
                    data={driverOffers}
                    renderItem={renderOffer}
                    keyExtractor={(item) => item.offer_id}
                    scrollEnabled={false}
                  />
                </View>
              ) : (
                <View style={styles.noOffersCard}>
                  <ActivityIndicator size="large" color={COLORS.green} />
                  <Text style={styles.noOffersText}>Waiting for driver responses...</Text>
                  <Text style={styles.noOffersHint}>This usually takes 30-60 seconds</Text>
                </View>
              )}
              
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setBidId(null);
                  setWaitingForOffers(false);
                  setDriverOffers([]);
                }}
              >
                <Text style={styles.cancelText}>Cancel & Edit Price</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* How It Works */}
          <View style={styles.howItWorks}>
            <Text style={styles.howTitle}>How Bid Rides Work</Text>
            <View style={styles.howStep}>
              <View style={[styles.howIcon, { backgroundColor: COLORS.green + '20' }]}>
                <Text style={styles.howNumber}>1</Text>
              </View>
              <Text style={styles.howText}>Set your own price for the trip</Text>
            </View>
            <View style={styles.howStep}>
              <View style={[styles.howIcon, { backgroundColor: COLORS.blue + '20' }]}>
                <Text style={[styles.howNumber, { color: COLORS.blue }]}>2</Text>
              </View>
              <Text style={styles.howText}>Nearby drivers respond with offers</Text>
            </View>
            <View style={styles.howStep}>
              <View style={[styles.howIcon, { backgroundColor: COLORS.purple + '20' }]}>
                <Text style={[styles.howNumber, { color: COLORS.purple }]}>3</Text>
              </View>
              <Text style={styles.howText}>Choose the best offer and ride!</Text>
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
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.orange,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 16,
  },
  routeCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.border,
    marginLeft: 11,
    marginVertical: 4,
  },
  routeInfo: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  routeAddress: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  surgeCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  surgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.orange + '30',
  },
  surgeInfo: {
    flex: 1,
  },
  surgeTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.orange,
  },
  surgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  priceSection: {
    marginBottom: 24,
  },
  priceSectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  priceSectionDesc: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  priceInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  priceAdjustBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.green,
    marginRight: 4,
  },
  priceInput: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.primary,
    minWidth: 120,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  quickPrices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  quickPriceBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  quickPriceBtnActive: {
    backgroundColor: COLORS.green + '15',
    borderColor: COLORS.green,
  },
  quickPriceText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  quickPriceTextActive: {
    color: COLORS.green,
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.green,
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
    fontWeight: '900',
    color: '#FFFFFF',
  },
  waitingSection: {
    marginBottom: 24,
  },
  waitingHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  pulseOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.green + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pulseInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.green + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  waitingDesc: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  offersSection: {
    marginBottom: 16,
  },
  offersTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
    marginBottom: 12,
  },
  offerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInitial: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  driverName: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  rating: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  vehicleType: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  offerPrice: {
    alignItems: 'flex-end',
  },
  offerPriceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offerPriceValue: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.green,
    textShadowColor: 'rgba(34, 197, 94, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  messageText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },
  acceptButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  acceptGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  acceptText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  noOffersCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginBottom: 16,
  },
  noOffersText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 16,
  },
  noOffersHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.red,
  },
  howItWorks: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  howTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  howStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  howIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.green,
  },
  howText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    flex: 1,
  },
});
