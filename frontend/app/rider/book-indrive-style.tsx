import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  Switch,
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import RideMap from '@/src/components/RideMap';
import * as Location from 'expo-location';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  background: '#0B1120',
  cardBg: '#1A2332',
  cardBgLight: '#232F42',
  brandGreen: '#00D46A',
  brandBlue: '#0EA5E9',
  limeGreen: '#B8F11B',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  yellow: '#FFB800',
  red: '#EF4444',
  purple: '#9333EA',
};

const VEHICLE_TYPES = [
  { id: 'economy', name: 'Standard', icon: 'car', time: '4-5 min', desc: 'Affordable fares', color: '#00D46A' },
  { id: 'comfort', name: 'Comfort', icon: 'car-sport', time: '5-7 min', desc: 'More space', color: '#0EA5E9' },
  { id: 'xl', name: 'XL', icon: 'bus', time: '6-8 min', desc: '6 seats', color: '#FFB800' },
  { id: 'premium', name: 'Premium', icon: 'rocket', time: '5-6 min', desc: 'Luxury rides', color: '#9333EA' },
];

export default function BookInDriveStyle() {
  const router = useRouter();
  const mapRef = useRef<any>(null);
  const sheetAnimation = useRef(new Animated.Value(0)).current;

  // Location states
  const [selectedCity, setSelectedCity] = useState('');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{lat: number, lng: number} | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{lat: number, lng: number} | null>(null);
  const [routePolyline, setRoutePolyline] = useState<any[]>([]);
  const [currentLocation, setCurrentLocation] = useState<any>(null);

  // Booking states
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [currentFare, setCurrentFare] = useState(0);
  const [fareDetails, setFareDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoAccept, setAutoAccept] = useState(false);

  // Modal states
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingField, setEditingField] = useState<'pickup' | 'destination' | 'city'>('pickup');
  const [showVehicleModal, setShowVehicleModal] = useState(false);

  // Get current location on mount and AUTO-SET pickup
  useEffect(() => {
    getCurrentLocationProactive();
  }, []);

  const getCurrentLocationProactive = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'GPS Required',
          'Please enable location services to automatically detect your pickup location and prevent fraud.'
        );
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const { latitude, longitude } = location.coords;
      const address = await reverseGeocode(latitude, longitude);
      
      setCurrentLocation({ lat: latitude, lng: longitude, address });
      
      // AUTO-SET pickup location with GPS (PREVENTS THEFT/FRAUD)
      setPickup(address);
      setPickupCoords({ lat: latitude, lng: longitude });
      
      // Auto-detect city and state
      const detectedState = detectStateFromLocation(address);
      if (address.toLowerCase().includes('lagos')) {
        setSelectedCity('Lagos, Nigeria');
      } else if (address.toLowerCase().includes('abuja')) {
        setSelectedCity('Abuja, Nigeria');
      } else if (detectedState) {
        setSelectedCity(`${detectedState}, Nigeria`);
      }
      
      // Show confirmation to user
      Alert.alert(
        '📍 GPS Location Detected',
        `Your current location: ${address}\n\nThis helps prevent theft and fraud.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('GPS Error:', error);
      Alert.alert('GPS Error', 'Could not detect your location. Please enter manually.');
    }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
      return `${lat}, ${lng}`;
    } catch (error) {
      return `${lat}, ${lng}`;
    }
  };

  // Nigerian States Mapping for Inter-City Detection
  const NIGERIAN_STATES_MAP: { [key: string]: string } = {
    // Lagos State
    'lagos': 'Lagos',
    'ikeja': 'Lagos',
    'lekki': 'Lagos',
    'ikorodu': 'Lagos',
    'epe': 'Lagos',
    'badagry': 'Lagos',
    'ajah': 'Lagos',
    'victoria island': 'Lagos',
    'island': 'Lagos',
    'surulere': 'Lagos',
    'yaba': 'Lagos',
    'apapa': 'Lagos',
    
    // FCT Abuja
    'abuja': 'FCT',
    'gwagwalada': 'FCT',
    'kuje': 'FCT',
    'bwari': 'FCT',
    'kubwa': 'FCT',
    'nyanya': 'FCT',
    'maitama': 'FCT',
    'wuse': 'FCT',
    'garki': 'FCT',
    'asokoro': 'FCT',
    
    // Ogun State
    'abeokuta': 'Ogun',
    'ijebu': 'Ogun',
    'ota': 'Ogun',
    'sagamu': 'Ogun',
    'ilaro': 'Ogun',
    
    // Oyo State
    'ibadan': 'Oyo',
    'ogbomoso': 'Oyo',
    'oyo': 'Oyo',
    
    // Rivers State
    'port harcourt': 'Rivers',
    'portharcourt': 'Rivers',
    'ph': 'Rivers',
    
    // Kano State
    'kano': 'Kano',
    
    // Kaduna State
    'kaduna': 'Kaduna',
    'zaria': 'Kaduna',
    
    // Enugu State
    'enugu': 'Enugu',
    'nsukka': 'Enugu',
    
    // Anambra State
    'awka': 'Anambra',
    'onitsha': 'Anambra',
    'nnewi': 'Anambra',
    
    // Delta State
    'asaba': 'Delta',
    'warri': 'Delta',
    
    // Edo State
    'benin': 'Edo',
    'benin city': 'Edo',
    
    // Imo State
    'owerri': 'Imo',
    
    // Abia State
    'aba': 'Abia',
    'umuahia': 'Abia',
    
    // Akwa Ibom State
    'uyo': 'Akwa Ibom',
    
    // Cross River State
    'calabar': 'Cross River',
    
    // Bayelsa State
    'yenagoa': 'Bayelsa',
    
    // Plateau State
    'jos': 'Plateau',
    
    // Kwara State
    'ilorin': 'Kwara',
    
    // Osun State
    'osogbo': 'Osun',
    'ile-ife': 'Osun',
    
    // Ondo State
    'akure': 'Ondo',
    
    // Ekiti State
    'ado-ekiti': 'Ekiti',
    
    // Niger State
    'minna': 'Niger',
    'suleja': 'Niger',
    
    // Katsina State
    'katsina': 'Katsina',
    
    // Sokoto State
    'sokoto': 'Sokoto',
    
    // Kebbi State
    'birnin kebbi': 'Kebbi',
    
    // Zamfara State
    'gusau': 'Zamfara',
    
    // Borno State
    'maiduguri': 'Borno',
    
    // Yobe State
    'damaturu': 'Yobe',
    
    // Adamawa State
    'yola': 'Adamawa',
    
    // Taraba State
    'jalingo': 'Taraba',
    
    // Gombe State
    'gombe': 'Gombe',
    
    // Bauchi State
    'bauchi': 'Bauchi',
    
    // Benue State
    'makurdi': 'Benue',
    
    // Nassarawa State
    'lafia': 'Nassarawa',
    'nassarawa': 'Nassarawa',
    
    // Kogi State
    'lokoja': 'Kogi',
  };

  const detectStateFromLocation = (location: string): string | null => {
    const locationLower = location.toLowerCase();
    
    // Check each state mapping
    for (const [keyword, state] of Object.entries(NIGERIAN_STATES_MAP)) {
      if (locationLower.includes(keyword)) {
        return state;
      }
    }
    
    return null; // Unknown state
  };

  const detectTripType = () => {
    if (!pickup || !destination) return 'intra';
    
    const pickupState = detectStateFromLocation(pickup);
    const destState = detectStateFromLocation(destination);
    
    // If we can't detect states, assume intra-city (same state)
    if (!pickupState || !destState) return 'intra';
    
    // If both locations are in the same state = INTRA-CITY
    if (pickupState === destState) {
      return 'intra';
    }
    
    // If different states = INTER-CITY (needs Warrior Pack)
    return 'inter';
  };

  const decodePolyline = (encoded: string) => {
    const points: any[] = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }
    return points;
  };

  const handleCalculateFare = async () => {
    if (!pickup || !destination) {
      Alert.alert('Missing Locations', 'Please select pickup and destination');
      return;
    }

    setIsLoading(true);
    try {
      const tripType = detectTripType();
      
      const response = await fetch(`${BACKEND_URL}/api/fares/estimate-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup: pickup,
          destination: destination,
          vehicle_type: selectedVehicle,
          trip_type: tripType,
        }),
      });

      const fareData = await response.json();
      
      if (response.ok && fareData.total_fare) {
        setCurrentFare(fareData.total_fare);
        setFareDetails(fareData);
        
        // Decode polyline and set map coords
        if (Platform.OS !== 'web' && fareData.polyline) {
          const decodedRoute = decodePolyline(fareData.polyline);
          setRoutePolyline(decodedRoute);
          
          if (decodedRoute.length > 0) {
            setPickupCoords({
              lat: decodedRoute[0].latitude,
              lng: decodedRoute[0].longitude
            });
            setDestinationCoords({
              lat: decodedRoute[decodedRoute.length - 1].latitude,
              lng: decodedRoute[decodedRoute.length - 1].longitude
            });
            
            if (mapRef.current && decodedRoute.length > 1) {
              setTimeout(() => {
                mapRef.current?.fitToCoordinates(decodedRoute, {
                  edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                  animated: true,
                });
              }, 500);
            }
          }
        }
        
        setIsLoading(false);
      } else {
        setIsLoading(false);
        Alert.alert('Error', fareData.detail || 'Could not calculate fare');
      }
    } catch (error) {
      console.error('Fare calculation error:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Could not calculate fare. Please check your connection.');
    }
  };

  const increaseFare = () => {
    setCurrentFare(prev => prev + 100);
  };

  const decreaseFare = () => {
    setCurrentFare(prev => Math.max(100, prev - 100));
  };

  const [searchingForDriver, setSearchingForDriver] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);
  const [driverFound, setDriverFound] = useState<any>(null);

  const findOffers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/trips/create-with-custom-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rider_id: 'user_123',
          pickup: pickup,
          destination: destination,
          offered_fare: currentFare,
          vehicle_type: selectedVehicle,
          trip_type: detectTripType(),
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setIsLoading(false);
        setTripId(result.trip?.id || null);
        setSearchingForDriver(true);
        // Start polling for driver acceptance
        pollForDriver(result.trip?.id);
      } else {
        setIsLoading(false);
        Alert.alert('Error', 'Could not send offer. Please try again.');
      }
    } catch (error) {
      console.error('Find offers error:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Could not send offer to drivers.');
    }
  };

  const pollForDriver = (id: string | null) => {
    if (!id) return;
    let attempts = 0;
    const maxAttempts = 30; // 30 * 3s = 90 seconds max
    
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${BACKEND_URL}/api/trips/${id}/status`);
        const data = await res.json();
        
        if (data.success && data.status === 'accepted' && data.driver_info) {
          clearInterval(interval);
          setDriverFound(data.driver_info);
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setSearchingForDriver(false);
        Alert.alert(
          'No Drivers Available',
          'No drivers accepted your request. Try increasing your fare or try again later.',
          [{ text: 'OK' }]
        );
      }
    }, 3000);
  };

  const cancelSearch = () => {
    setSearchingForDriver(false);
    setDriverFound(null);
    setTripId(null);
  };

  const openLocationEditor = (field: 'pickup' | 'destination' | 'city') => {
    setEditingField(field);
    setShowLocationModal(true);
  };

  const selectedVehicleData = VEHICLE_TYPES.find(v => v.id === selectedVehicle);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* FULL-SCREEN MAP */}
      <View style={styles.mapSection}>
        {pickupCoords && destinationCoords ? (
          <RideMap
            mapRef={mapRef}
            pickupCoords={pickupCoords}
            destinationCoords={destinationCoords}
            routePolyline={routePolyline}
            pickup={pickup}
            destination={destination}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map" size={64} color={COLORS.textMuted} />
            <Text style={styles.mapPlaceholderText}>Select locations to view route</Text>
          </View>
        )}

        {/* Back Button Overlay */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        {/* Location Bar Overlay */}
        <View style={styles.locationBar}>
          <TouchableOpacity 
            style={styles.locationItem}
            onPress={() => openLocationEditor('pickup')}
          >
            <View style={[styles.locationDot, { backgroundColor: COLORS.brandGreen }]} />
            <Text style={styles.locationText} numberOfLines={1}>
              {pickup || 'Select pickup location'}
            </Text>
            {currentLocation && (
              <Ionicons name="navigate" size={16} color={COLORS.brandGreen} style={{ marginLeft: 4 }} />
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.locationItem}
            onPress={() => openLocationEditor('destination')}
          >
            <View style={[styles.locationDot, { backgroundColor: COLORS.red }]} />
            <Text style={styles.locationText} numberOfLines={1}>
              {destination || 'Select destination'}
            </Text>
            <TouchableOpacity style={styles.addStopButton}>
              <Ionicons name="add" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </TouchableOpacity>
          
          {/* GPS Tracking Indicator */}
          {currentLocation && (
            <View style={styles.gpsIndicator}>
              <Ionicons name="location" size={14} color={COLORS.brandGreen} />
              <Text style={styles.gpsText}>GPS Tracking Active</Text>
            </View>
          )}
        </View>

        {/* Route Info Card (shows after calculation) */}
        {fareDetails && (
          <View style={styles.routeInfoCard}>
            <Text style={styles.routeInfoText}>
              {fareDetails.distance_km?.toFixed(1)} km • {fareDetails.duration_min} min
            </Text>
          </View>
        )}
      </View>

      {/* BOTTOM SHEET */}
      <View style={styles.bottomSheet}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Promo Code */}
          <TouchableOpacity style={styles.promoRow}>
            <Ionicons name="pricetag" size={20} color={COLORS.yellow} />
            <Text style={styles.promoText}>Got promo code? Use it here</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {/* Vehicle Selection Card */}
          <TouchableOpacity 
            style={styles.vehicleCard}
            onPress={() => setShowVehicleModal(true)}
          >
            <View style={styles.vehicleIcon}>
              <Ionicons name={selectedVehicleData?.icon as any} size={24} color={COLORS.white} />
            </View>
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleName}>{selectedVehicleData?.name}</Text>
              <Text style={styles.vehicleDesc}>
                {selectedVehicleData?.time} • {selectedVehicleData?.desc}
              </Text>
            </View>
            <Ionicons name="pencil" size={20} color={COLORS.brandGreen} />
          </TouchableOpacity>

          {/* Price Section */}
          {currentFare > 0 ? (
            <View style={styles.priceSection}>
              <View style={styles.priceRow}>
                <TouchableOpacity style={styles.priceButton} onPress={decreaseFare}>
                  <Text style={styles.priceButtonText}>−</Text>
                </TouchableOpacity>

                <View style={styles.priceCenter}>
                  <Text style={styles.priceAmount}>₦{currentFare.toLocaleString()}</Text>
                </View>

                <TouchableOpacity style={styles.priceButton} onPress={increaseFare}>
                  <Text style={styles.priceButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Auto-accept */}
              <View style={styles.autoAcceptRow}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="flash" size={20} color={COLORS.yellow} />
                  <Text style={styles.autoAcceptText}>
                    Auto-accept offer of ₦{currentFare.toLocaleString()}
                  </Text>
                </View>
                <Switch
                  value={autoAccept}
                  onValueChange={setAutoAccept}
                  trackColor={{ false: '#334155', true: COLORS.brandGreen + '60' }}
                  thumbColor={autoAccept ? COLORS.brandGreen : '#64748B'}
                />
              </View>

              {/* Find Offers Button */}
              <TouchableOpacity
                style={styles.findOffersButton}
                onPress={findOffers}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={[COLORS.limeGreen, '#9CD900']}
                  style={styles.findOffersGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.background} size="large" />
                  ) : (
                    <Text style={styles.findOffersText}>Find offers</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            /* Calculate Button */
            <TouchableOpacity
              style={styles.calculateButton}
              onPress={handleCalculateFare}
              disabled={isLoading || !pickup || !destination}
            >
              <LinearGradient
                colors={[COLORS.brandGreen, '#00B455']}
                style={styles.calculateGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} size="large" />
                ) : (
                  <Text style={styles.calculateText}>Calculate Fare</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Location Editor Modal */}
      <Modal
        visible={showLocationModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingField === 'pickup' ? 'Pickup Location' : 'Destination'}
            </Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={styles.modalContent}>
            <LocationAutocomplete
              placeholder={editingField === 'pickup' ? 'Enter pickup...' : 'Enter destination...'}
              value={editingField === 'pickup' ? pickup : destination}
              onChangeText={(text) => {
                if (editingField === 'pickup') setPickup(text);
                else setDestination(text);
              }}
              onPlaceSelected={(location) => {
                if (editingField === 'pickup') setPickup(location.description);
                else setDestination(location.description);
                setShowLocationModal(false);
              }}
              apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
              placeholderTextColor="#64748B"
            />

            {currentLocation && (
              <TouchableOpacity 
                style={styles.currentLocationButton}
                onPress={() => {
                  if (editingField === 'pickup') setPickup(currentLocation.address);
                  else setDestination(currentLocation.address);
                  setShowLocationModal(false);
                }}
              >
                <Ionicons name="navigate" size={20} color={COLORS.brandGreen} />
                <Text style={styles.currentLocationText}>Use current location</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Vehicle Selection Modal */}
      <Modal
        visible={showVehicleModal}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent
      >
        <View style={styles.vehicleModalContainer}>
          <View style={styles.vehicleModalContent}>
            <Text style={styles.vehicleModalTitle}>Select Vehicle</Text>
            {VEHICLE_TYPES.map((vehicle) => (
              <TouchableOpacity
                key={vehicle.id}
                style={[
                  styles.vehicleOption,
                  selectedVehicle === vehicle.id && styles.vehicleOptionSelected
                ]}
                onPress={() => {
                  setSelectedVehicle(vehicle.id);
                  setShowVehicleModal(false);
                  if (pickup && destination) {
                    handleCalculateFare();
                  }
                }}
              >
                <View style={[styles.vehicleOptionIcon, { backgroundColor: vehicle.color + '20' }]}>
                  <Ionicons name={vehicle.icon as any} size={28} color={vehicle.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleOptionName}>{vehicle.name}</Text>
                  <Text style={styles.vehicleOptionDesc}>{vehicle.time} • {vehicle.desc}</Text>
                </View>
                {selectedVehicle === vehicle.id && (
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.brandGreen} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity 
              style={styles.vehicleModalClose}
              onPress={() => setShowVehicleModal(false)}
            >
              <Text style={styles.vehicleModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SEARCHING FOR DRIVER MODAL */}
      <Modal visible={searchingForDriver} animationType="fade" transparent>
        <View style={styles.searchOverlay}>
          <View style={styles.searchPopup}>
            {!driverFound ? (
              <>
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 20 }} />
                <Text style={styles.searchTitle}>Finding Your Driver...</Text>
                <Text style={styles.searchSubtext}>
                  Your offer of {'\u20A6'}{currentFare.toLocaleString()} sent to nearby drivers
                </Text>
                <View style={styles.searchRoute}>
                  <View style={styles.searchRouteItem}>
                    <View style={[styles.searchDot, { backgroundColor: COLORS.accentGreen }]} />
                    <Text style={styles.searchRouteText} numberOfLines={1}>{pickup || 'Pickup'}</Text>
                  </View>
                  <View style={styles.searchRouteItem}>
                    <View style={[styles.searchDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.searchRouteText} numberOfLines={1}>{destination || 'Destination'}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.searchCancelBtn} onPress={cancelSearch}>
                  <Text style={styles.searchCancelText}>Cancel Request</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={64} color={COLORS.accentGreen} />
                <Text style={styles.searchTitle}>Driver Found!</Text>
                <View style={styles.driverInfoCard}>
                  <View style={styles.driverAvatar}>
                    <Ionicons name="person" size={32} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverInfoName}>{driverFound.name}</Text>
                    <Text style={styles.driverInfoVehicle}>{driverFound.vehicle}</Text>
                    <Text style={styles.driverInfoPlate}>{driverFound.plate} - {driverFound.color}</Text>
                  </View>
                  <View style={styles.driverRating}>
                    <Ionicons name="star" size={16} color="#F59E0B" />
                    <Text style={styles.driverRatingText}>{driverFound.rating?.toFixed(1)}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.searchDoneBtn} onPress={() => { cancelSearch(); router.back(); }}>
                  <Text style={styles.searchDoneText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  mapSection: {
    height: '60%',
    position: 'relative',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 12,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(26, 35, 50, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBar: {
    position: 'absolute',
    top: 16,
    left: 70,
    right: 16,
    backgroundColor: 'rgba(26, 35, 50, 0.95)',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  addStopButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cardBgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 212, 106, 0.2)',
    borderRadius: 8,
    marginTop: 4,
    gap: 4,
  },
  gpsText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.brandGreen,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeInfoCard: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(26, 35, 50, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 40,
  },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  promoText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.cardBgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 4,
  },
  vehicleDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  priceSection: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  priceButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.cardBgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceButtonText: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.white,
  },
  priceCenter: {
    flex: 1,
    alignItems: 'center',
  },
  priceAmount: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.white,
  },
  autoAcceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  autoAcceptText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: 8,
  },
  findOffersButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  findOffersGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  findOffersText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.background,
  },
  calculateButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  calculateGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  calculateText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.white,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.white,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  currentLocationText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  vehicleModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  vehicleModalContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  vehicleModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 20,
  },
  vehicleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleOptionSelected: {
    borderColor: COLORS.brandGreen,
  },
  vehicleOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleOptionName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 4,
  },
  vehicleOptionDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  vehicleModalClose: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  vehicleModalCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
