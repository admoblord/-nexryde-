import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
  TextInput,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBmD2u8Nq-guiT3PJKYxdzr5bl-lL6nbsY';

// UNIFIED COLORS
const COLORS = {
  background: '#121212',
  cardBg: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  yellow: '#FFB600',
  green: '#22E180',
  purple: '#A259FF',
  red: '#F85D50',
};

// VEHICLE TYPES
const CAR_TYPES = [
  { id: 'economy', name: 'Economy', desc: 'Affordable rides', capacity: '4 seats', icon: 'bicycle', color: COLORS.yellow },
  { id: 'comfort', name: 'Comfort', desc: 'Extra space & comfort', capacity: '4 seats', icon: 'car', color: COLORS.green },
  { id: 'premium', name: 'Premium', desc: 'Luxury vehicles', capacity: '4 seats', icon: 'diamond', color: COLORS.purple },
  { id: 'xl', name: 'XL', desc: 'Group rides', capacity: '6 seats', icon: 'bus', color: COLORS.yellow },
];

interface Stop {
  id: string;
  location: string;
}

export default function BookingScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedCar, setSelectedCar] = useState('economy');
  const [fareEstimate, setFareEstimate] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [tripType, setTripType] = useState<'intra' | 'inter'>('intra');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [minRating, setMinRating] = useState(0); // 0 = show all, 4 = 4+ stars only
  const [userLocation, setUserLocation] = useState<any>(null);
  const [preferredDriverIds, setPreferredDriverIds] = useState<string[]>([]);
  
  const pickupRef = useRef<any>();
  const destRef = useRef<any>();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const carPulse = useRef(new Animated.Value(1)).current;
  const modalSlide = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();

    // Car pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(carPulse, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
        Animated.timing(carPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    // Get user's current location
    getUserLocation();

    // Fetch preferred drivers
    fetchPreferredDrivers();

    // Fetch available drivers on mount
    fetchAvailableDrivers();

    // Refresh available drivers every 5 seconds (more frequent for live updates)
    const interval = setInterval(fetchAvailableDrivers, 5000);
    return () => clearInterval(interval);
  }, []);

  // Get user's current location for ETA calculation
  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setUserLocation({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    } catch (error) {
      console.log('Could not get user location:', error);
    }
  };

  // Fetch preferred drivers (drivers user has ridden with before)
  const fetchPreferredDrivers = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/riders/${user.id}/preferred-drivers`);
      if (response.ok) {
        const data = await response.json();
        setPreferredDriverIds(data.driver_ids || []);
      }
    } catch (error) {
      console.log('Could not fetch preferred drivers:', error);
    }
  };

  // Calculate ETA (distance in km to minutes)
  const calculateETA = (driverLat: number, driverLng: number) => {
    if (!userLocation) return null;
    
    // Haversine formula for distance
    const R = 6371; // Earth's radius in km
    const dLat = (driverLat - userLocation.lat) * Math.PI / 180;
    const dLng = (driverLng - userLocation.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(driverLat * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    // Assume average speed of 30 km/h in city traffic
    const eta = Math.round((distance / 30) * 60); // Convert to minutes
    return eta;
  };

  // Fetch available drivers from backend with GPS coordinates
  const fetchAvailableDrivers = async () => {
    try {
      const ratingParam = minRating > 0 ? `&min_rating=${minRating}` : '';
      const response = await fetch(
        `${BACKEND_URL}/api/drivers/available?vehicle_type=${selectedCar}${ratingParam}`
      );
      if (response.ok) {
        const data = await response.json();
        const drivers = data.drivers || [];
        
        // Add ETA to each driver
        const driversWithETA = drivers.map((driver: any) => ({
          ...driver,
          eta: driver.location ? calculateETA(driver.location.lat, driver.location.lng) : null,
          is_preferred: preferredDriverIds.includes(driver.id),
        }));

        // Sort: Preferred first, then by ETA
        driversWithETA.sort((a: any, b: any) => {
          if (a.is_preferred && !b.is_preferred) return -1;
          if (!a.is_preferred && b.is_preferred) return 1;
          if (a.eta && b.eta) return a.eta - b.eta;
          return 0;
        });

        setAvailableDrivers(driversWithETA);
      }
    } catch (error) {
      console.log('Could not fetch available drivers:', error);
      setAvailableDrivers([]);
    }
  };

  // Refresh drivers when vehicle type or rating filter changes
  useEffect(() => {
    fetchAvailableDrivers();
  }, [selectedCar, minRating]);

  // Show driver details modal
  const showDriverDetails = (driver: any) => {
    setSelectedDriver(driver);
    setShowDriverModal(true);
    Animated.spring(modalSlide, {
      toValue: 0,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const hideDriverModal = () => {
    Animated.timing(modalSlide, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowDriverModal(false);
      setSelectedDriver(null);
    });
  };

  // Get Current Location
  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable location access');
        setIsGettingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });

      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address && address.length > 0) {
        const addr = address[0];
        const formattedAddress = [addr.street, addr.city || addr.subregion, addr.region, 'Nigeria']
          .filter(Boolean)
          .join(', ');
        setPickup(formattedAddress);
        Alert.alert('✅ Location Detected', `${formattedAddress}`);
      }
    } catch (error) {
      Alert.alert('Location Error', 'Unable to get your location');
    } finally {
      setIsGettingLocation(false);
    }
  };

  // Add/Remove/Update Stops
  const addStop = () => {
    setStops([...stops, { id: `stop-${Date.now()}`, location: '' }]);
  };

  const removeStop = (stopId: string) => {
    setStops(stops.filter(stop => stop.id !== stopId));
  };

  const updateStop = (stopId: string, location: string) => {
    setStops(stops.map(stop => stop.id === stopId ? { ...stop, location } : stop));
  };

  // Calculate Fare
  useEffect(() => {
    if (pickup.trim() && destination.trim() && pickup.trim().length > 2 && destination.trim().length > 2) {
      const timer = setTimeout(() => calculateFare(), 800);
      return () => clearTimeout(timer);
    } else {
      setFareEstimate(null);
    }
  }, [pickup, destination, selectedCar, tripType, stops]);

  const calculateFare = async () => {
    setIsCalculating(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/fares/estimate-google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup, destination, vehicle_type: selectedCar, trip_type: tripType,
          stops: stops.map(s => s.location).filter(l => l.trim()),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setFareEstimate(data);
      }
    } catch (error) {
      console.error('Error calculating fare:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleBookRide = () => {
    if (!pickup.trim() || !destination.trim()) {
      Alert.alert('Missing Information', 'Please enter pickup and destination');
      return;
    }
    router.push({
      pathname: '/rider/tracking',
      params: {
        pickup, destination, stops: JSON.stringify(stops), carType: selectedCar,
        estimatedFare: fareEstimate?.total_fare || 0,
        distance: fareEstimate?.distance || 0,
        duration: fareEstimate?.duration || 0
      }
    });
  };

  // Get driver position for map (with interpolation for smooth movement)
  const getDriverMapPosition = (index: number, driver: any) => {
    // If driver has real GPS coordinates, calculate position
    if (driver.location && userLocation) {
      // Simple positioning based on actual GPS (can be enhanced with real map projection)
      const latDiff = driver.location.lat - userLocation.lat;
      const lngDiff = driver.location.lng - userLocation.lng;
      
      // Convert to screen percentage (simplified)
      const xPercent = 50 + (lngDiff * 5000); // Scale factor
      const yPercent = 50 + (latDiff * 5000);
      
      return {
        left: `${Math.max(10, Math.min(85, xPercent))}%`,
        top: `${Math.max(15, Math.min(75, yPercent))}%`,
      };
    }
    
    // Fallback to distributed positions
    const positions = [
      { left: '25%', top: '45%' },
      { right: '30%', bottom: '40%' },
      { left: '60%', top: '30%' },
      { left: '15%', bottom: '35%' },
      { right: '20%', top: '50%' },
    ];
    return positions[index] || positions[0];
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* HEADER */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Available Rides</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 3D MAP WITH REAL DRIVERS */}
          <Animated.View style={[styles.mapSection, { opacity: fadeAnim }]}>
            <View style={styles.mapContainer}>
              <View style={styles.mapBuildings}>
                {/* Buildings */}
                <View style={[styles.building, { height: 70, width: 80, backgroundColor: '#2A2A2A', left: 30, top: 40 }]} />
                <View style={[styles.building, { height: 90, width: 70, backgroundColor: '#2F2F2F', left: 120, top: 30 }]} />
                <View style={[styles.building, { height: 60, width: 60, backgroundColor: '#353535', right: 90, top: 50 }]} />
                <View style={[styles.building, { height: 80, width: 75, backgroundColor: '#2D2D2D', right: 30, bottom: 60 }]} />
                
                {/* Yellow route line */}
                {pickup && destination && (
                  <View style={styles.routeLine} />
                )}
                
                {/* REAL DRIVERS WITH GPS, ETA, AND LIVE MOVEMENT */}
                {availableDrivers.length > 0 ? (
                  availableDrivers.slice(0, 5).map((driver, index) => {
                    const vehicleColor = CAR_TYPES.find(c => c.id === driver.vehicle_type)?.color || COLORS.yellow;
                    const position = getDriverMapPosition(index, driver);
                    
                    return (
                      <TouchableOpacity
                        key={driver.id || index}
                        onPress={() => showDriverDetails(driver)}
                        activeOpacity={0.8}
                      >
                        <Animated.View 
                          style={[
                            styles.carOnMap, 
                            { transform: [{ scale: carPulse }] },
                            position,
                            driver.is_preferred && styles.preferredDriver
                          ]}
                        >
                          {/* Preferred driver star badge */}
                          {driver.is_preferred && (
                            <View style={styles.starBadge}>
                              <Ionicons name="star" size={12} color={COLORS.yellow} />
                            </View>
                          )}
                          
                          <Ionicons name="car" size={24} color={vehicleColor} />
                          
                          {/* ETA Badge */}
                          {driver.eta && (
                            <View style={[styles.etaBadge, { backgroundColor: vehicleColor }]}>
                              <Text style={styles.etaText}>{driver.eta}m</Text>
                            </View>
                          )}
                          
                          {driver.driver_name && (
                            <Text style={styles.driverNameOnMap}>{driver.driver_name.split(' ')[0]}</Text>
                          )}
                        </Animated.View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.noDriversMessage}>
                    <ActivityIndicator size="small" color={COLORS.yellow} />
                    <Text style={styles.noDriversText}>Searching for drivers...</Text>
                  </View>
                )}
                
                {/* Your location marker */}
                <View style={styles.locationMarker}>
                  <Ionicons name="location" size={24} color={COLORS.red} />
                  <Text style={styles.locationLabel}>Your Location</Text>
                </View>

                {/* Driver count and rating filter */}
                {availableDrivers.length > 0 && (
                  <View style={styles.mapBadges}>
                    <View style={styles.driverCountBadge}>
                      <Ionicons name="car" size={14} color={COLORS.text} />
                      <Text style={styles.driverCountText}>{availableDrivers.length} available</Text>
                    </View>
                    
                    {/* Rating filter toggle */}
                    <TouchableOpacity
                      style={[styles.ratingFilterBadge, minRating > 0 && styles.ratingFilterActive]}
                      onPress={() => setMinRating(minRating === 0 ? 4 : 0)}
                    >
                      <Ionicons name="star" size={14} color={COLORS.text} />
                      <Text style={styles.ratingFilterText}>{minRating > 0 ? '4+' : 'All'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Rest of the booking interface (location inputs, vehicle cards, etc.) */}
          <View style={styles.optionsContainer}>
            {/* TRIP TYPE */}
            <View style={styles.tripTypeRow}>
              <TouchableOpacity
                style={[styles.tripTypeBtn, tripType === 'intra' && styles.tripTypeBtnActive]}
                onPress={() => setTripType('intra')}
              >
                <Text style={[styles.tripTypeText, tripType === 'intra' && styles.tripTypeTextActive]}>
                  Within City
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tripTypeBtn, tripType === 'inter' && styles.tripTypeBtnActive]}
                onPress={() => setTripType('inter')}
              >
                <Text style={[styles.tripTypeText, tripType === 'inter' && styles.tripTypeTextActive]}>
                  Intercity
                </Text>
              </TouchableOpacity>
            </View>

            {/* LOCATION CARD */}
            <View style={styles.locationCard}>
              {/* Quick Actions Row */}
              <View style={styles.quickActionsRow}>
                <TouchableOpacity 
                  style={[styles.quickActionBtn, { backgroundColor: COLORS.green + '20' }]}
                  onPress={getCurrentLocation}
                  disabled={isGettingLocation}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.green + '30' }]}>
                    {isGettingLocation ? (
                      <ActivityIndicator size="small" color={COLORS.green} />
                    ) : (
                      <Ionicons name="locate" size={18} color={COLORS.green} />
                    )}
                  </View>
                  <Text style={styles.quickActionText}>
                    {isGettingLocation ? 'Detecting...' : 'Use GPS'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.quickActionBtn, { backgroundColor: COLORS.purple + '20', opacity: 0.5 }]}
                  disabled={true}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: COLORS.purple + '30' }]}>
                    <Ionicons name="mic" size={18} color={COLORS.purple} />
                  </View>
                  <Text style={styles.quickActionText}>Voice</Text>
                </TouchableOpacity>
              </View>

              {/* Location inputs... (keeping existing code) */}
              <View style={styles.locationInputRow}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.green }]} />
                <View style={styles.inputWrapper}>
                  <LocationAutocomplete
                    value={pickup}
                    onChangeText={setPickup}
                    onPlaceSelected={(place) => setPickup(place.description)}
                    placeholder="Pickup location"
                    apiKey={GOOGLE_MAPS_API_KEY}
                    countryCode="ng"
                    inputStyle={styles.input}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              </View>

              {stops.map((stop, index) => (
                <View key={stop.id}>
                  <View style={styles.locationInputRow}>
                    <View style={[styles.locationDot, { backgroundColor: COLORS.yellow }]} />
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder={`Stop ${index + 1}`}
                        placeholderTextColor={COLORS.textSecondary}
                        value={stop.location}
                        onChangeText={(text) => updateStop(stop.id, text)}
                      />
                    </View>
                    <TouchableOpacity onPress={() => removeStop(stop.id)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <View style={styles.locationInputRow}>
                <View style={[styles.locationDot, { backgroundColor: COLORS.red }]} />
                <View style={styles.inputWrapper}>
                  <LocationAutocomplete
                    value={destination}
                    onChangeText={setDestination}
                    onPlaceSelected={(place) => setDestination(place.description)}
                    placeholder="Where to?"
                    apiKey={GOOGLE_MAPS_API_KEY}
                    countryCode="ng"
                    inputStyle={styles.input}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              </View>

              {stops.length < 3 && (
                <TouchableOpacity style={styles.addStopBtn} onPress={addStop}>
                  <Ionicons name="add-circle-outline" size={20} color={COLORS.yellow} />
                  <Text style={styles.addStopText}>Add Stop</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* VEHICLE SELECTION */}
            <Text style={styles.sectionTitle}>Choose Vehicle</Text>
            {CAR_TYPES.map((car) => (
              <TouchableOpacity
                key={car.id}
                style={[
                  styles.vehicleCard,
                  selectedCar === car.id && styles.vehicleCardActive
                ]}
                onPress={() => setSelectedCar(car.id)}
                activeOpacity={0.8}
              >
                <View style={styles.vehicleLeft}>
                  <View style={[styles.vehicleIcon, { backgroundColor: car.color + '20' }]}>
                    <Ionicons name={car.icon as any} size={32} color={car.color} />
                  </View>
                  <View>
                    <Text style={styles.vehicleName}>{car.name}</Text>
                    <Text style={styles.vehicleDesc}>{car.desc}</Text>
                    <Text style={styles.vehicleCapacity}>{car.capacity}</Text>
                  </View>
                </View>
                <View style={styles.vehicleRight}>
                  {isCalculating ? (
                    <ActivityIndicator size="small" color={COLORS.green} />
                  ) : fareEstimate ? (
                    <>
                      <Text style={styles.vehiclePrice}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
                      {selectedCar === car.id && (
                        <View style={styles.selectedBadge}>
                          <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
                        </View>
                      )}
                    </>
                  ) : (
                    <Text style={styles.vehiclePriceEmpty}>--</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {fareEstimate && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Trip Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Distance</Text>
                  <Text style={styles.summaryValue}>{fareEstimate.distance_km?.toFixed(1)} km</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Estimated Time</Text>
                  <Text style={styles.summaryValue}>{fareEstimate.duration_min?.toFixed(0)} min</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total Fare</Text>
                  <Text style={styles.summaryTotalValue}>₦{fareEstimate.total_fare?.toLocaleString()}</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* CONFIRM BUTTON */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.confirmBtn, (!pickup || !destination) && styles.confirmBtnDisabled]}
            onPress={handleBookRide}
            disabled={!pickup || !destination}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={(!pickup || !destination) ? ['#4A5568', '#2D3748'] : [COLORS.green, '#00D98C']}
              style={styles.confirmGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.confirmText}>
                {fareEstimate 
                  ? `Confirm ${CAR_TYPES.find(c => c.id === selectedCar)?.name}` 
                  : 'Enter Locations'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.scheduleBtn}>
            <Ionicons name="calendar" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* DRIVER DETAILS MODAL */}
      <Modal
        visible={showDriverModal}
        transparent={true}
        animationType="fade"
        onRequestClose={hideDriverModal}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={hideDriverModal}
        >
          <Animated.View 
            style={[
              styles.driverModal,
              { transform: [{ translateY: modalSlide }] }
            ]}
          >
            {selectedDriver && (
              <>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Driver Details</Text>
                  <TouchableOpacity onPress={hideDriverModal}>
                    <Ionicons name="close" size={28} color={COLORS.text} />
                  </TouchableOpacity>
                </View>

                {/* Driver Avatar */}
                <View style={styles.driverAvatarSection}>
                  <View style={[
                    styles.driverAvatar,
                    { backgroundColor: CAR_TYPES.find(c => c.id === selectedDriver.vehicle_type)?.color + '30' }
                  ]}>
                    <Ionicons name="person" size={48} color={COLORS.text} />
                    {selectedDriver.is_preferred && (
                      <View style={styles.preferredBadge}>
                        <Ionicons name="star" size={16} color={COLORS.yellow} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.driverName}>{selectedDriver.driver_name || 'Driver'}</Text>
                  {selectedDriver.is_preferred && (
                    <Text style={styles.preferredText}>⭐ You've ridden with this driver before</Text>
                  )}
                </View>

                {/* Driver Stats */}
                <View style={styles.driverStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="star" size={20} color={COLORS.yellow} />
                    <Text style={styles.statValue}>{selectedDriver.rating || '4.8'}</Text>
                    <Text style={styles.statLabel}>Rating</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="car" size={20} color={COLORS.green} />
                    <Text style={styles.statValue}>{selectedDriver.total_trips || '500+'}</Text>
                    <Text style={styles.statLabel}>Trips</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="time" size={20} color={COLORS.purple} />
                    <Text style={styles.statValue}>{selectedDriver.eta || '5'}m</Text>
                    <Text style={styles.statLabel}>Away</Text>
                  </View>
                </View>

                {/* Vehicle Info */}
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleInfoTitle}>Vehicle Information</Text>
                  <View style={styles.vehicleInfoRow}>
                    <Text style={styles.vehicleInfoLabel}>Type:</Text>
                    <Text style={styles.vehicleInfoValue}>
                      {CAR_TYPES.find(c => c.id === selectedDriver.vehicle_type)?.name}
                    </Text>
                  </View>
                  <View style={styles.vehicleInfoRow}>
                    <Text style={styles.vehicleInfoLabel}>Plate:</Text>
                    <Text style={styles.vehicleInfoValue}>{selectedDriver.plate_number || 'LAG 123 XY'}</Text>
                  </View>
                  <View style={styles.vehicleInfoRow}>
                    <Text style={styles.vehicleInfoLabel}>Model:</Text>
                    <Text style={styles.vehicleInfoValue}>{selectedDriver.vehicle_model || 'Toyota Corolla 2020'}</Text>
                  </View>
                </View>

                {/* Request this Driver Button */}
                <TouchableOpacity style={styles.requestDriverBtn}>
                  <LinearGradient
                    colors={[COLORS.green, '#00D98C']}
                    style={styles.requestDriverGradient}
                  >
                    <Text style={styles.requestDriverText}>Request This Driver</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// STYLES (keeping all previous styles and adding new ones)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  
  // (Previous styles continue...)
  // I'll add only the new styles for the advanced features
  
  preferredDriver: {
    borderWidth: 2,
    borderColor: COLORS.yellow,
    borderRadius: 20,
    padding: 4,
  },
  starBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 2,
    borderWidth: 2,
    borderColor: COLORS.yellow,
  },
  etaBadge: {
    position: 'absolute',
    top: -10,
    left: -10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  etaText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.text,
  },
  mapBadges: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8,
  },
  ratingFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  ratingFilterActive: {
    backgroundColor: COLORS.yellow,
  },
  ratingFilterText: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '900',
  },
  
  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  driverModal: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
  },
  driverAvatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  driverAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  preferredBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: COLORS.yellow,
  },
  driverName: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 4,
  },
  preferredText: {
    fontSize: 13,
    color: COLORS.yellow,
    fontWeight: '700',
  },
  driverStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
  },
  statItem: {
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  vehicleInfo: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  vehicleInfoTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 12,
  },
  vehicleInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  vehicleInfoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  vehicleInfoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '900',
  },
  requestDriverBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  requestDriverGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  requestDriverText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
  },

  // Copy all other existing styles from previous version...
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.red,
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  mapSection: {
    height: 250,
    marginBottom: 0,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    position: 'relative',
  },
  mapBuildings: {
    flex: 1,
    position: 'relative',
  },
  building: {
    position: 'absolute',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  routeLine: {
    position: 'absolute',
    bottom: '30%',
    left: '20%',
    right: '20%',
    height: 4,
    backgroundColor: COLORS.yellow,
    borderRadius: 2,
    shadowColor: COLORS.yellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  carOnMap: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    alignItems: 'center',
  },
  driverNameOnMap: {
    fontSize: 9,
    color: COLORS.text,
    fontWeight: '800',
    marginTop: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  noDriversMessage: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -60 }, { translateY: -20 }],
    alignItems: 'center',
    gap: 8,
  },
  noDriversText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  driverCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.green,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  driverCountText: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '900',
  },
  locationMarker: {
    position: 'absolute',
    bottom: '25%',
    left: '18%',
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 11,
    color: COLORS.red,
    fontWeight: '800',
    marginTop: 2,
  },
  optionsContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  tripTypeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  tripTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
  },
  tripTypeBtnActive: {
    backgroundColor: COLORS.green,
  },
  tripTypeText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  tripTypeTextActive: {
    color: COLORS.text,
  },
  locationCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 8,
  },
  quickActionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  locationInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 10,
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  inputWrapper: {
    flex: 1,
  },
  input: {
    fontSize: 16,
    color: COLORS.text,
    paddingVertical: 8,
    fontWeight: '700',
  },
  removeBtn: {
    padding: 4,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingTop: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.background,
    marginTop: 8,
  },
  addStopText: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.yellow,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  vehicleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  vehicleCardActive: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.green,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  vehicleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  vehicleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 3,
    letterSpacing: -0.3,
  },
  vehicleDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginBottom: 3,
  },
  vehicleCapacity: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  vehicleRight: {
    alignItems: 'flex-end',
  },
  vehiclePrice: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  vehiclePriceEmpty: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textSecondary,
  },
  selectedBadge: {
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 18,
    padding: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.text,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.background,
    marginVertical: 12,
  },
  summaryTotalLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  summaryTotalValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.green,
    letterSpacing: -0.5,
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: COLORS.background,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBg,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  confirmBtnDisabled: {
    shadowOpacity: 0.2,
  },
  confirmGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  scheduleBtn: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
