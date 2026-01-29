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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface DriverOffer {
  offer_id: string;
  driver_id: string;
  driver_name: string;
  driver_rating: number;
  counter_price: number;
  message?: string;
}

export default function RideBidScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAppStore();
  
  const [offeredPrice, setOfferedPrice] = useState(params.suggestedFare?.toString() || '1500');
  const [bidId, setBidId] = useState<string | null>(null);
  const [driverOffers, setDriverOffers] = useState<DriverOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [waitingForOffers, setWaitingForOffers] = useState(false);
  const [surge, setSurge] = useState<any>(null);
  
  const pickup = {
    lat: parseFloat(params.pickupLat as string) || 6.4281,
    lng: parseFloat(params.pickupLng as string) || 3.4219,
    address: params.pickupAddress as string || 'Pickup Location'
  };
  
  const dropoff = {
    lat: parseFloat(params.dropoffLat as string) || 6.4355,
    lng: parseFloat(params.dropoffLng as string) || 3.4567,
    address: params.dropoffAddress as string || 'Dropoff Location'
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
      const res = await fetch(`${BACKEND_URL}/api/rides/bid/create?rider_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rider_offered_price: parseFloat(offeredPrice),
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          pickup_address: pickup.address,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          dropoff_address: dropoff.address,
          ride_type: 'economy'
        })
      });
      
      const data = await res.json();
      if (data.bid_id) {
        setBidId(data.bid_id);
        setWaitingForOffers(true);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create bid');
    }
    setLoading(false);
  };

  const fetchOffers = async () => {
    if (!bidId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/bid/open?lat=${pickup.lat}&lng=${pickup.lng}`);
      const data = await res.json();
      // In real app, we'd get offers for this specific bid
      // For demo, simulate some offers
      if (driverOffers.length < 3 && Math.random() > 0.5) {
        const newOffer: DriverOffer = {
          offer_id: `offer-${Date.now()}`,
          driver_id: `driver-${Math.random().toString(36).substr(2, 9)}`,
          driver_name: ['Chidi', 'Emeka', 'Tunde', 'Bola', 'Kemi'][Math.floor(Math.random() * 5)],
          driver_rating: 4.5 + Math.random() * 0.5,
          counter_price: parseFloat(offeredPrice) + Math.floor(Math.random() * 500) - 200,
          message: ['On my way!', 'I can be there in 5 mins', 'Best price for you!'][Math.floor(Math.random() * 3)]
        };
        setDriverOffers(prev => [...prev, newOffer]);
      }
    } catch (e) {
      console.error('Fetch offers error:', e);
    }
  };

  const acceptOffer = async (offer: DriverOffer) => {
    if (!bidId || !user?.id) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/bid/${bidId}/accept?rider_id=${user.id}&offer_id=${offer.offer_id}`, {
        method: 'POST'
      });
      const data = await res.json();
      
      if (data.success) {
        Alert.alert('Ride Confirmed!', `${offer.driver_name} is on the way. Agreed price: ₦${offer.counter_price.toLocaleString()}`);
        router.replace({
          pathname: '/rider/tracking',
          params: { tripId: data.trip_id }
        });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to accept offer');
    }
    setLoading(false);
  };

  const renderOffer = ({ item }: { item: DriverOffer }) => (
    <View style={styles.offerCard}>
      <View style={styles.offerHeader}>
        <View style={styles.driverInfo}>
          <View style={styles.driverAvatar}>
            <Ionicons name="person" size={24} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.driverName}>{item.driver_name}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.ratingText}>{item.driver_rating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Offers</Text>
          <Text style={styles.priceValue}>₦{item.counter_price.toLocaleString()}</Text>
        </View>
      </View>
      
      {item.message && (
        <Text style={styles.offerMessage}>"{item.message}"</Text>
      )}
      
      <View style={styles.offerActions}>
        <TouchableOpacity style={styles.declineButton}>
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.acceptButton}
          onPress={() => acceptOffer(item)}
        >
          <LinearGradient
            colors={['#00E676', '#00C853']}
            style={styles.acceptGradient}
          >
            <Text style={styles.acceptText}>Accept</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Set Your Price</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Route Info */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#00E676' }]} />
              <Text style={styles.routeText} numberOfLines={1}>{pickup.address}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.routeText} numberOfLines={1}>{dropoff.address}</Text>
            </View>
          </View>

          {/* Surge Info */}
          {surge?.is_surge && (
            <View style={styles.surgeCard}>
              <Ionicons name="flash" size={20} color="#F59E0B" />
              <Text style={styles.surgeText}>
                {surge.multiplier}x surge pricing • {surge.reasons[0]}
              </Text>
            </View>
          )}

          {!waitingForOffers ? (
            <>
              {/* Price Input */}
              <View style={styles.priceInputCard}>
                <Text style={styles.priceInputLabel}>Your Offer</Text>
                <View style={styles.priceInputRow}>
                  <Text style={styles.currencySymbol}>₦</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={offeredPrice}
                    onChangeText={setOfferedPrice}
                    keyboardType="numeric"
                    placeholder="Enter amount"
                    placeholderTextColor="#64748B"
                  />
                </View>
                <Text style={styles.priceHint}>
                  Suggested: ₦{params.suggestedFare || '1,500'} - ₦{parseInt(params.suggestedFare as string || '1500') + 500}
                </Text>
              </View>

              {/* Quick Price Buttons */}
              <View style={styles.quickPrices}>
                {[1000, 1500, 2000, 2500, 3000].map(price => (
                  <TouchableOpacity
                    key={price}
                    style={[
                      styles.quickPriceBtn,
                      offeredPrice === price.toString() && styles.quickPriceBtnActive
                    ]}
                    onPress={() => setOfferedPrice(price.toString())}
                  >
                    <Text style={[
                      styles.quickPriceText,
                      offeredPrice === price.toString() && styles.quickPriceTextActive
                    ]}>₦{price.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Submit Button */}
              <TouchableOpacity 
                style={styles.submitButton} 
                onPress={createBid}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#6366F1', '#8B5CF6']}
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="send" size={20} color="#FFFFFF" />
                      <Text style={styles.submitText}>Send to Drivers</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Waiting for Offers */}
              <View style={styles.waitingCard}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.waitingTitle}>Finding drivers...</Text>
                <Text style={styles.waitingSubtitle}>
                  Your offer: ₦{parseFloat(offeredPrice).toLocaleString()}
                </Text>
              </View>

              {/* Driver Offers */}
              {driverOffers.length > 0 && (
                <View style={styles.offersSection}>
                  <Text style={styles.offersTitle}>
                    {driverOffers.length} Driver{driverOffers.length > 1 ? 's' : ''} Responded
                  </Text>
                  <FlatList
                    data={driverOffers}
                    renderItem={renderOffer}
                    keyExtractor={item => item.offer_id}
                    scrollEnabled={false}
                  />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  content: { flex: 1, padding: 16 },
  routeCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeText: { flex: 1, fontSize: 15, color: '#FFFFFF' },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginLeft: 5,
    marginVertical: 4,
  },
  surgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  surgeText: { color: '#FCD34D', fontSize: 14, fontWeight: '600' },
  priceInputCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  priceInputLabel: { color: '#94A3B8', fontSize: 14, marginBottom: 12 },
  priceInputRow: { flexDirection: 'row', alignItems: 'center' },
  currencySymbol: { fontSize: 32, fontWeight: '700', color: '#00E676', marginRight: 4 },
  priceInput: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    minWidth: 150,
    textAlign: 'center',
  },
  priceHint: { color: '#64748B', fontSize: 13, marginTop: 12 },
  quickPrices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  quickPriceBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickPriceBtnActive: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderColor: '#6366F1',
  },
  quickPriceText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  quickPriceTextActive: { color: '#A5B4FC' },
  submitButton: { borderRadius: 16, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  waitingCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  waitingTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginTop: 16 },
  waitingSubtitle: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  offersSection: { marginTop: 24 },
  offersTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 16 },
  offerCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { fontSize: 13, color: '#FFD700' },
  priceContainer: { alignItems: 'flex-end' },
  priceLabel: { fontSize: 12, color: '#94A3B8' },
  priceValue: { fontSize: 20, fontWeight: '800', color: '#00E676' },
  offerMessage: {
    color: '#94A3B8',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 12,
  },
  offerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
  },
  declineText: { color: '#EF4444', fontWeight: '600' },
  acceptButton: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  acceptGradient: { paddingVertical: 12, alignItems: 'center' },
  acceptText: { color: '#FFFFFF', fontWeight: '700' },
});
