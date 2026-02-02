import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Modal,
  Platform,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type RideType = 'intra_city' | 'inter_city';

interface RouteStop {
  id: string;
  type: 'pickup' | 'stop' | 'dropoff';
  address: string;
  coordinates?: { latitude: number; longitude: number };
  isEditing: boolean;
}

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface SubscriptionStatus {
  tier: 'city_rider' | 'road_warrior' | 'none';
  status: 'trial' | 'active' | 'expired';
  can_access_intercity: boolean;
}

export default function BookScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [rideType, setRideType] = useState<RideType>('intra_city');
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  
  const [stops, setStops] = useState<RouteStop[]>([
    { id: '1', type: 'pickup', address: '', isEditing: false },
    { id: '2', type: 'dropoff', address: '', isEditing: false },
  ]);
  
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);

  // Fetch driver subscription status
  useEffect(() => {
    if (user?.id) {
      fetchSubscriptionStatus();
    }
    getCurrentLocation();
  }, [user?.id]);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/subscription/status/${user?.id}`);
      const data = await response.json();
      setSubscription({
        tier: data.tier || 'none',
        status: data.status || 'expired',
        can_access_intercity: data.tier === 'road_warrior' && (data.status === 'trial' || data.status === 'active'),
      });
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setSubscription({
        tier: 'none',
        status: 'expired',
        can_access_intercity: false,
      });
    }
    setLoadingSubscription(false);
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  // Calculate distance between two points
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Update estimated distance when both pickup and dropoff are set
  useEffect(() => {
    const pickup = stops.find(s => s.type === 'pickup');
    const dropoff = stops.find(s => s.type === 'dropoff');
    
    if (pickup?.coordinates && dropoff?.coordinates) {
      const distance = calculateDistance(
        pickup.coordinates.latitude,
        pickup.coordinates.longitude,
        dropoff.coordinates.latitude,
        dropoff.coordinates.longitude
      );
      setEstimatedDistance(distance);
      
      // Auto-switch to inter-city if distance > 50km
      if (distance > 50 && subscription?.can_access_intercity) {
        setRideType('inter_city');
      } else if (distance <= 50) {
        setRideType('intra_city');
      }
    }
  }, [stops, subscription]);

  const searchPlaces = async (query: string) => {
    if (query.length < 2) {
      setPredictions([]);
      return;
    }

    setIsSearching(true);
    try {
      // Add bias for intra-city or inter-city search
      const locationBias = rideType === 'intra_city' 
        ? `&radius=50000&location=${currentLocation?.latitude || 6.5244},${currentLocation?.longitude || 3.3792}`
        : '&components=country:ng';
        
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          query
        )}${locationBias}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.predictions) {
        setPredictions(data.predictions);
      }
    } catch (error) {
      console.error('Error searching places:', error);
    }
    setIsSearching(false);
  };

  const getPlaceDetails = async (placeId: string): Promise<{
    latitude: number;
    longitude: number;
    address: string;
  } | null> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.result) {
        return {
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
          address: data.result.formatted_address,
        };
      }
    } catch (error) {
      console.error('Error getting place details:', error);
    }
    return null;
  };

  const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    }
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  };

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setIsLoadingLocation(true);
    
    const details = await getPlaceDetails(prediction.place_id);
    if (details && activeStopId) {
      setStops(stops.map(stop =>
        stop.id === activeStopId
          ? {
              ...stop,
              address: details.address,
              coordinates: {
                latitude: details.latitude,
                longitude: details.longitude,
              },
            }
          : stop
      ));
    }
    
    setSearchQuery('');
    setPredictions([]);
    setShowMapPicker(false);
    setActiveStopId(null);
    setIsLoadingLocation(false);
  };

  const useCurrentLocation = async () => {
    if (!currentLocation) await getCurrentLocation();
    
    if (currentLocation) {
      setIsLoadingLocation(true);
      const address = await reverseGeocode(currentLocation.latitude, currentLocation.longitude);
      
      if (activeStopId) {
        setStops(stops.map(stop =>
          stop.id === activeStopId
            ? { ...stop, address, coordinates: currentLocation }
            : stop
        ));
        setActiveStopId(null);
      }
      setIsLoadingLocation(false);
    }
  };

  const openLocationPicker = (stopId: string) => {
    setActiveStopId(stopId);
    setShowMapPicker(true);
  };

  const handleRideTypeChange = (type: RideType) => {
    if (type === 'inter_city' && !subscription?.can_access_intercity) {
      Alert.alert(
        '🏆 Upgrade to Road Warrior',
        'Inter-city trips are exclusively for Road Warrior subscribers. Upgrade now to unlock unlimited city-to-city rides!',
        [
          { text: 'Maybe Later', style: 'cancel' },
          { 
            text: 'Upgrade Now', 
            onPress: () => router.push('/driver/subscription')
          }
        ]
      );
      return;
    }
    setRideType(type);
  };

  const canContinue = 
    stops.find(s => s.type === 'pickup')?.address && 
    stops.find(s => s.type === 'dropoff')?.address &&
    (rideType === 'intra_city' || subscription?.can_access_intercity);

  const handleContinue = () => {
    if (canContinue) {
      // Check if distance matches ride type
      if (estimatedDistance) {
        if (rideType === 'intra_city' && estimatedDistance > 50) {
          Alert.alert(
            'Distance Too Far',
            'This trip is over 50km. Please switch to Inter-City mode or choose a closer destination.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      router.push('/rider/tracking');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F8FAFC', '#EFF6FF', '#F8FAFC']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book a Ride</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Ride Type Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, rideType === 'intra_city' && styles.tabActive]}
            onPress={() => handleRideTypeChange('intra_city')}
          >
            <LinearGradient
              colors={rideType === 'intra_city' ? ['#22C55E', '#16A34A'] : ['transparent', 'transparent']}
              style={styles.tabGradient}
            >
              <View style={styles.tabContent}>
                <Ionicons 
                  name="business" 
                  size={22} 
                  color={rideType === 'intra_city' ? '#FFFFFF' : '#64748B'} 
                />
                <Text style={[styles.tabText, rideType === 'intra_city' && styles.tabTextActive]}>
                  Intra-City
                </Text>
                <Text style={[styles.tabSubtext, rideType === 'intra_city' && styles.tabSubtextActive]}>
                  Within City
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab, 
              rideType === 'inter_city' && styles.tabActive,
              !subscription?.can_access_intercity && styles.tabLocked
            ]}
            onPress={() => handleRideTypeChange('inter_city')}
          >
            <LinearGradient
              colors={rideType === 'inter_city' ? ['#FFD700', '#FFA500'] : ['transparent', 'transparent']}
              style={styles.tabGradient}
            >
              {!subscription?.can_access_intercity && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
                </View>
              )}
              <View style={styles.tabContent}>
                <Ionicons 
                  name="navigate" 
                  size={22} 
                  color={rideType === 'inter_city' ? '#FFFFFF' : !subscription?.can_access_intercity ? '#94A3B8' : '#64748B'} 
                />
                <Text style={[
                  styles.tabText, 
                  rideType === 'inter_city' && styles.tabTextActive,
                  !subscription?.can_access_intercity && styles.tabTextLocked
                ]}>
                  Inter-City
                </Text>
                <Text style={[
                  styles.tabSubtext, 
                  rideType === 'inter_city' && styles.tabSubtextActive,
                  !subscription?.can_access_intercity && styles.tabSubtextLocked
                ]}>
                  City to City
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <LinearGradient
            colors={rideType === 'intra_city' ? ['#DCFCE7', '#BBF7D0'] : ['#FEF3C7', '#FDE68A']}
            style={styles.infoBannerGradient}
          >
            <Ionicons 
              name={rideType === 'intra_city' ? 'information-circle' : 'star'} 
              size={20} 
              color={rideType === 'intra_city' ? '#16A34A' : '#F59E0B'} 
            />
            <Text style={[
              styles.infoBannerText,
              { color: rideType === 'intra_city' ? '#166534' : '#92400E' }
            ]}>
              {rideType === 'intra_city' 
                ? 'Perfect for trips within your city (up to 50km)'
                : subscription?.can_access_intercity
                  ? 'Road Warrior: Unlimited city-to-city trips across Nigeria!'
                  : 'Upgrade to Road Warrior to unlock inter-city rides'}
            </Text>
          </LinearGradient>
        </View>

        {/* Route Card */}
        <View style={styles.routeCard}>
          <LinearGradient
            colors={['#FFFFFF', '#FAFAFA']}
            style={styles.routeCardGradient}
          >
            {stops.map((stop, index) => (
              <View key={stop.id}>
                {index > 0 && (
                  <View style={styles.connectionLine}>
                    <View style={styles.dashedLine} />
                  </View>
                )}
                
                <View style={styles.stopRow}>
                  <View style={[
                    styles.stopIndicator,
                    stop.type === 'pickup' && styles.pickupIndicator,
                    stop.type === 'dropoff' && styles.dropoffIndicator,
                  ]}>
                    <Ionicons 
                      name={stop.type === 'pickup' ? 'location' : 'flag'} 
                      size={18} 
                      color="#FFFFFF" 
                    />
                  </View>

                  <TouchableOpacity 
                    style={[
                      styles.stopInputContainer,
                      activeStopId === stop.id && styles.stopInputActive
                    ]}
                    onPress={() => openLocationPicker(stop.id)}
                  >
                    <View style={styles.stopInputContent}>
                      <Text style={styles.stopLabel}>
                        {stop.type === 'pickup' ? 'PICKUP LOCATION' : 'DROP-OFF LOCATION'}
                      </Text>
                      <Text 
                        style={[
                          styles.stopInputText,
                          !stop.address && styles.stopInputPlaceholder
                        ]}
                        numberOfLines={2}
                      >
                        {stop.address || (stop.type === 'pickup' ? 'Where from?' : 'Where to?')}
                      </Text>
                    </View>
                    <View style={styles.stopInputIcon}>
                      <Ionicons name="search" size={18} color="#94A3B8" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Distance Display */}
            {estimatedDistance && (
              <View style={styles.distanceCard}>
                <Ionicons name="speedometer" size={18} color="#3B82F6" />
                <Text style={styles.distanceText}>
                  Estimated Distance: <Text style={styles.distanceBold}>{estimatedDistance.toFixed(1)} km</Text>
                </Text>
                {estimatedDistance > 50 && rideType === 'intra_city' && (
                  <View style={styles.warningBadge}>
                    <Ionicons name="alert-circle" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>Switch to Inter-City</Text>
                  </View>
                )}
              </View>
            )}
          </LinearGradient>
        </View>

        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Use Current Location */}
          <TouchableOpacity 
            style={styles.currentLocationCard}
            onPress={useCurrentLocation}
            disabled={isLoadingLocation}
          >
            <LinearGradient
              colors={['#3B82F6', '#2563EB']}
              style={styles.currentLocationGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoadingLocation ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="navigate-circle" size={24} color="#FFFFFF" />
              )}
              <Text style={styles.currentLocationText}>Use My Current Location</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Subscription Prompt for City Riders */}
          {subscription?.tier === 'city_rider' && rideType === 'inter_city' && (
            <View style={styles.upgradeCard}>
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                style={styles.upgradeGradient}
              >
                <View style={styles.upgradeIcon}>
                  <Ionicons name="rocket" size={32} color="#FFFFFF" />
                </View>
                <View style={styles.upgradeContent}>
                  <Text style={styles.upgradeTitle}>🏆 Upgrade to Road Warrior</Text>
                  <Text style={styles.upgradeDesc}>
                    Unlock unlimited inter-city trips across Nigeria! Lagos-Abuja, Lagos-Ibadan, and more.
                  </Text>
                  <TouchableOpacity 
                    style={styles.upgradeButton}
                    onPress={() => router.push('/driver/subscription')}
                  >
                    <Text style={styles.upgradeButtonText}>Upgrade Now →</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Popular Routes */}
          {rideType === 'inter_city' && subscription?.can_access_intercity && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔥 Popular Inter-City Routes</Text>
              {[
                { from: 'Lagos', to: 'Ibadan', distance: '128 km', duration: '1.5 hrs' },
                { from: 'Lagos', to: 'Abuja', distance: '750 km', duration: '8 hrs' },
                { from: 'Lagos', to: 'Port Harcourt', distance: '450 km', duration: '5 hrs' },
                { from: 'Abuja', to: 'Kaduna', distance: '170 km', duration: '2 hrs' },
              ].map((route, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.popularRouteCard}
                  onPress={() => Alert.alert('Coming Soon', 'Quick route selection will be available soon!')}
                >
                  <View style={styles.routeInfo}>
                    <View style={styles.routeFromTo}>
                      <Text style={styles.routeCity}>{route.from}</Text>
                      <Ionicons name="arrow-forward" size={16} color="#64748B" />
                      <Text style={styles.routeCity}>{route.to}</Text>
                    </View>
                    <Text style={styles.routeDetails}>{route.distance} • {route.duration}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Continue Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity 
            style={[
              styles.continueButton,
              !canContinue && styles.continueButtonDisabled
            ]}
            onPress={handleContinue}
            disabled={!canContinue}
          >
            <LinearGradient
              colors={canContinue 
                ? (rideType === 'intra_city' ? ['#22C55E', '#16A34A'] : ['#FFD700', '#FFA500'])
                : ['#E2E8F0', '#E2E8F0']
              }
              style={styles.continueGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={[
                styles.continueText,
                !canContinue && styles.continueTextDisabled
              ]}>
                {rideType === 'intra_city' ? 'Find Nearby Drivers' : 'Find Road Warriors'}
              </Text>
              <Ionicons 
                name="arrow-forward-circle" 
                size={24} 
                color={canContinue ? '#FFFFFF' : '#94A3B8'} 
              />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Location Search Modal */}
        <Modal
          visible={showMapPicker}
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowMapPicker(false);
                  setSearchQuery('');
                  setPredictions([]);
                }}
              >
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {rideType === 'intra_city' ? 'Search Location' : 'Search City'}
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.searchContainer}>
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={20} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={rideType === 'intra_city' ? 'Search for a place...' : 'Search for a city...'}
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    searchPlaces(text);
                  }}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => {
                    setSearchQuery('');
                    setPredictions([]);
                  }}>
                    <Ionicons name="close-circle" size={20} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isSearching && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#22C55E" />
              </View>
            )}

            <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
              {predictions.map((prediction) => (
                <TouchableOpacity
                  key={prediction.place_id}
                  style={styles.resultItem}
                  onPress={() => handleSelectPrediction(prediction)}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons 
                      name={rideType === 'inter_city' ? 'navigate' : 'location-outline'} 
                      size={20} 
                      color="#64748B" 
                    />
                  </View>
                  <View style={styles.resultContent}>
                    <Text style={styles.resultMain}>
                      {prediction.structured_formatting.main_text}
                    </Text>
                    <Text style={styles.resultSecondary}>
                      {prediction.structured_formatting.secondary_text}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {predictions.length === 0 && !isSearching && (
                <View style={styles.quickActions}>
                  <TouchableOpacity 
                    style={styles.quickActionItem}
                    onPress={() => {
                      useCurrentLocation();
                      setShowMapPicker(false);
                    }}
                  >
                    <View style={styles.quickActionIcon}>
                      <Ionicons name="navigate" size={20} color="#3B82F6" />
                    </View>
                    <Text style={styles.quickActionText}>Use current location</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headerRight: {
    width: 40,
  },
  
  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  tabActive: {
    borderColor: 'transparent',
  },
  tabLocked: {
    opacity: 0.6,
  },
  tabGradient: {
    padding: 16,
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#64748B',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tabContent: {
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  tabTextLocked: {
    color: '#94A3B8',
  },
  tabSubtext: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  tabSubtextActive: {
    color: 'rgba(255,255,255,0.9)',
  },
  tabSubtextLocked: {
    color: '#CBD5E1',
  },
  
  // Info Banner
  infoBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  
  // Route Card
  routeCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  routeCardGradient: {
    padding: 20,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stopIndicator: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupIndicator: {
    backgroundColor: '#22C55E',
  },
  dropoffIndicator: {
    backgroundColor: '#EF4444',
  },
  connectionLine: {
    marginLeft: 22,
    height: 24,
    justifyContent: 'center',
  },
  dashedLine: {
    width: 3,
    height: '100%',
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
  },
  stopInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    minHeight: 70,
  },
  stopInputActive: {
    borderColor: '#22C55E',
    backgroundColor: '#FFFFFF',
  },
  stopInputContent: {
    flex: 1,
  },
  stopLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 4,
  },
  stopInputText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  stopInputPlaceholder: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  stopInputIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  distanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  distanceText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
  },
  distanceBold: {
    fontWeight: '900',
    fontSize: 14,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  
  // Content
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  currentLocationCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  currentLocationGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  currentLocationText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  
  // Upgrade Card
  upgradeCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  upgradeGradient: {
    padding: 20,
    flexDirection: 'row',
    gap: 16,
  },
  upgradeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeContent: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  upgradeDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
    marginBottom: 12,
  },
  upgradeButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F59E0B',
  },
  
  // Popular Routes
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
  },
  popularRouteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  routeInfo: {
    flex: 1,
  },
  routeFromTo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  routeCity: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  routeDetails: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  
  // Bottom
  bottomSpacer: {
    height: 100,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  continueButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  continueText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  continueTextDisabled: {
    color: '#94A3B8',
  },
  
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  resultContent: {
    flex: 1,
  },
  resultMain: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  resultSecondary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  quickActions: {
    padding: 20,
  },
  quickActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  quickActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
});
