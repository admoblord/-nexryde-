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
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const { width, height } = Dimensions.get('window');
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

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

// Lagos, Nigeria default location
const DEFAULT_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function BookScreen() {
  const router = useRouter();
  
  const [stops, setStops] = useState<RouteStop[]>([
    { id: '1', type: 'pickup', address: '', isEditing: false },
    { id: '2', type: 'stop', address: '', isEditing: false },
    { id: '3', type: 'dropoff', address: '', isEditing: false },
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

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setCurrentLocation(coords);
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  // Search places using Google Places API
  const searchPlaces = async (query: string) => {
    if (query.length < 2) {
      setPredictions([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          query
        )}&components=country:ng&key=${GOOGLE_MAPS_API_KEY}`
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

  // Get place details (coordinates) from place_id
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

  // Reverse geocode coordinates to address
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

  // Handle place selection from search
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

  // Use current location
  const useCurrentLocation = async () => {
    if (!currentLocation) {
      await getCurrentLocation();
    }
    
    if (currentLocation) {
      setIsLoadingLocation(true);
      const address = await reverseGeocode(currentLocation.latitude, currentLocation.longitude);
      
      if (activeStopId) {
        setStops(stops.map(stop =>
          stop.id === activeStopId
            ? {
                ...stop,
                address: address,
                coordinates: currentLocation,
              }
            : stop
        ));
        setActiveStopId(null);
      }
      setIsLoadingLocation(false);
    }
  };

  // Open location picker for a specific stop
  const openLocationPicker = (stopId: string) => {
    console.log('Opening location picker for stop:', stopId);
    setActiveStopId(stopId);
    setShowMapPicker(true);
  };

  // Add a new stop
  const addStop = () => {
    const newStop: RouteStop = {
      id: Date.now().toString(),
      type: 'stop',
      address: '',
      isEditing: true,
    };
    const newStops = [...stops];
    newStops.splice(stops.length - 1, 0, newStop);
    setStops(newStops);
  };

  // Remove a stop
  const removeStop = (id: string) => {
    const stop = stops.find(s => s.id === id);
    if (stop?.type === 'pickup' || stop?.type === 'dropoff') return;
    setStops(stops.filter(stop => stop.id !== id));
  };

  // Select from saved/recent locations
  const selectSavedLocation = async (address: string, name: string) => {
    if (!activeStopId) {
      const emptyStop = stops.find(s => !s.address);
      if (emptyStop) {
        setActiveStopId(emptyStop.id);
      } else {
        return;
      }
    }
    
    const mockCoords: { [key: string]: { latitude: number; longitude: number } } = {
      'Home': { latitude: 6.4281, longitude: 3.4219 },
      'Work': { latitude: 6.4355, longitude: 3.4567 },
      'Shoprite Mall': { latitude: 6.4298, longitude: 3.4736 },
      'Murtala Mohammed Airport': { latitude: 6.5774, longitude: 3.3212 },
      'Palms Shopping Mall': { latitude: 6.4315, longitude: 3.4234 },
    };
    
    const coords = mockCoords[name] || { latitude: 6.5244, longitude: 3.3792 };
    
    const targetStopId = activeStopId || stops.find(s => !s.address)?.id;
    if (targetStopId) {
      setStops(stops.map(stop =>
        stop.id === targetStopId
          ? { ...stop, address, coordinates: coords }
          : stop
      ));
    }
    setActiveStopId(null);
  };

  const savedLocations = [
    { id: 'home', name: 'Home', address: '123 Victoria Island, Lagos', icon: 'home' },
    { id: 'work', name: 'Work', address: '456 Lekki Phase 1, Lagos', icon: 'briefcase' },
  ];

  const recentLocations = [
    { id: 'recent1', name: 'Shoprite Mall', address: 'Lekki, Lagos' },
    { id: 'recent2', name: 'Murtala Mohammed Airport', address: 'Ikeja, Lagos' },
    { id: 'recent3', name: 'Palms Shopping Mall', address: 'Victoria Island, Lagos' },
  ];

  const canContinue = 
    stops.find(s => s.type === 'pickup')?.address && 
    stops.find(s => s.type === 'dropoff')?.address;

  const handleContinue = () => {
    if (canContinue) {
      router.push('/rider/tracking');
    }
  };

  const getStopIcon = (type: string) => {
    if (type === 'pickup') {
      return (
        <View style={[styles.stopIndicator, styles.pickupIndicator]}>
          <View style={styles.pickupDot} />
        </View>
      );
    }
    if (type === 'dropoff') {
      return (
        <View style={[styles.stopIndicator, styles.dropoffIndicator]}>
          <View style={styles.dropoffDot} />
        </View>
      );
    }
    return (
      <View style={[styles.stopIndicator, styles.middleIndicator]}>
        <Ionicons name="search" size={16} color={COLORS.accentGreen} />
      </View>
    );
  };

  const getPlaceholder = (type: string) => {
    switch (type) {
      case 'pickup': return 'Pickup location';
      case 'dropoff': return 'Dropoff location';
      default: return 'Add stop';
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your route</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Route Card */}
        <View style={styles.routeCard}>
          {stops.map((stop, index) => (
            <View key={stop.id}>
              {index > 0 && (
                <View style={styles.connectionLine}>
                  <View style={styles.dashedLine} />
                </View>
              )}
              
              <View style={styles.stopRow}>
                {getStopIcon(stop.type)}

                <TouchableOpacity 
                  style={[
                    styles.stopInputContainer,
                    activeStopId === stop.id && styles.stopInputActive
                  ]}
                  onPress={() => openLocationPicker(stop.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.stopInputContent}>
                    <Text style={styles.stopLabel}>
                      {stop.type === 'pickup' ? 'PICKUP' : stop.type === 'dropoff' ? 'DROP-OFF' : 'STOP'}
                    </Text>
                    <Text 
                      style={[
                        styles.stopInputText,
                        !stop.address && styles.stopInputPlaceholder
                      ]}
                      numberOfLines={1}
                    >
                      {stop.address || getPlaceholder(stop.type)}
                    </Text>
                  </View>
                  <View style={styles.stopInputIcon}>
                    <Ionicons name="search" size={18} color={COLORS.lightTextMuted} />
                  </View>
                </TouchableOpacity>

                {stop.type === 'pickup' ? (
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={addStop}
                  >
                    <View style={styles.addButtonInner}>
                      <Ionicons name="add" size={20} color={COLORS.accentGreen} />
                    </View>
                  </TouchableOpacity>
                ) : stop.type === 'stop' ? (
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => removeStop(stop.id)}
                  >
                    <View style={styles.removeButtonInner}>
                      <Ionicons name="close" size={18} color={COLORS.error} />
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        {/* Location Suggestions */}
        <ScrollView 
          style={styles.suggestionsContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Saved Places */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Saved Places</Text>
            {savedLocations.map((location) => (
              <TouchableOpacity 
                key={location.id}
                style={styles.locationItem}
                onPress={() => selectSavedLocation(location.address, location.name)}
              >
                <View style={[styles.locationIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                  <Ionicons name={location.icon as any} size={18} color={COLORS.accentGreen} />
                </View>
                <View style={styles.locationContent}>
                  <Text style={styles.locationName}>{location.name}</Text>
                  <Text style={styles.locationAddress}>{location.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.lightTextMuted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Recent Locations */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Recent</Text>
            {recentLocations.map((location) => (
              <TouchableOpacity 
                key={location.id}
                style={styles.locationItem}
                onPress={() => selectSavedLocation(location.address, location.name)}
              >
                <View style={[styles.locationIcon, { backgroundColor: COLORS.lightSurface }]}>
                  <Ionicons name="time-outline" size={18} color={COLORS.lightTextSecondary} />
                </View>
                <View style={styles.locationContent}>
                  <Text style={styles.locationName}>{location.name}</Text>
                  <Text style={styles.locationAddress}>{location.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Use Current Location */}
          <TouchableOpacity 
            style={styles.currentLocationButton}
            onPress={useCurrentLocation}
            disabled={isLoadingLocation}
          >
            <View style={[styles.locationIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
              {isLoadingLocation ? (
                <ActivityIndicator size="small" color={COLORS.accentBlue} />
              ) : (
                <Ionicons name="navigate" size={18} color={COLORS.accentBlue} />
              )}
            </View>
            <Text style={styles.currentLocationText}>Use current location</Text>
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Bottom Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity 
            style={[
              styles.continueButton,
              !canContinue && styles.continueButtonDisabled
            ]}
            onPress={handleContinue}
            disabled={!canContinue}
          >
            <Text style={[
              styles.continueText,
              !canContinue && styles.continueTextDisabled
            ]}>
              Continue
            </Text>
            <Ionicons 
              name="arrow-forward" 
              size={20} 
              color={canContinue ? COLORS.white : COLORS.lightTextMuted} 
            />
          </TouchableOpacity>
        </View>

        {/* Location Search Modal */}
        <Modal
          visible={showMapPicker}
          animationType="slide"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
          transparent={false}
        >
          <SafeAreaView style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowMapPicker(false);
                  setSearchQuery('');
                  setPredictions([]);
                }}
              >
                <Ionicons name="close" size={24} color={COLORS.lightTextPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Search Location</Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={20} color={COLORS.lightTextMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search for a place"
                  placeholderTextColor={COLORS.lightTextMuted}
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    searchPlaces(text);
                  }}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity 
                    onPress={() => {
                      setSearchQuery('');
                      setPredictions([]);
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.lightTextMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Loading */}
            {isSearching && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={COLORS.accentGreen} />
              </View>
            )}

            {/* Search Results */}
            <ScrollView 
              style={styles.resultsList}
              keyboardShouldPersistTaps="handled"
            >
              {predictions.map((prediction) => (
                <TouchableOpacity
                  key={prediction.place_id}
                  style={styles.resultItem}
                  onPress={() => handleSelectPrediction(prediction)}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons name="location-outline" size={20} color={COLORS.lightTextSecondary} />
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

              {/* Quick Actions */}
              {predictions.length === 0 && !isSearching && (
                <View style={styles.quickActions}>
                  <TouchableOpacity 
                    style={styles.quickActionItem}
                    onPress={() => {
                      useCurrentLocation();
                      setShowMapPicker(false);
                    }}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
                      <Ionicons name="navigate" size={20} color={COLORS.accentBlue} />
                    </View>
                    <Text style={styles.quickActionText}>Use current location</Text>
                  </TouchableOpacity>

                  {savedLocations.map((location) => (
                    <TouchableOpacity 
                      key={location.id}
                      style={styles.quickActionItem}
                      onPress={() => {
                        selectSavedLocation(location.address, location.name);
                        setShowMapPicker(false);
                      }}
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                        <Ionicons name={location.icon as any} size={20} color={COLORS.accentGreen} />
                      </View>
                      <View>
                        <Text style={styles.quickActionText}>{location.name}</Text>
                        <Text style={styles.quickActionSubtext}>{location.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
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
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  headerRight: {
    width: 40,
  },
  routeCard: {
    backgroundColor: COLORS.lightSurface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stopIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  pickupIndicator: {
    borderColor: COLORS.lightTextMuted,
    backgroundColor: COLORS.white,
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.lightTextMuted,
  },
  dropoffIndicator: {
    borderColor: COLORS.lightTextMuted,
    backgroundColor: COLORS.white,
  },
  dropoffDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.lightTextMuted,
  },
  middleIndicator: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.white,
  },
  connectionLine: {
    marginLeft: 13,
    height: 24,
    justifyContent: 'center',
  },
  dashedLine: {
    width: 2,
    height: '100%',
    backgroundColor: COLORS.lightBorder,
  },
  stopInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    minHeight: 60,
  },
  stopInputActive: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.white,
  },
  stopInputContent: {
    flex: 1,
  },
  stopLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accentGreen,
    letterSpacing: 1,
    marginBottom: 2,
  },
  stopInputText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  stopInputPlaceholder: {
    color: COLORS.lightTextMuted,
    fontWeight: '400',
  },
  stopInputIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBlueSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    gap: 4,
  },
  mapButtonText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentBlue,
  },
  mapIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    paddingLeft: SPACING.sm,
  },
  actionButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  addButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionsContainer: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionContainer: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  locationContent: {
    flex: 1,
  },
  locationName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    marginBottom: SPACING.lg,
  },
  currentLocationText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.accentBlue,
  },
  bottomSpacer: {
    height: 100,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.lightBackground,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  continueButtonDisabled: {
    backgroundColor: COLORS.lightBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
  continueText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  continueTextDisabled: {
    color: COLORS.lightTextMuted,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
    backgroundColor: COLORS.white,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    paddingVertical: SPACING.xs,
  },
  loadingContainer: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
    backgroundColor: COLORS.white,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lightSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  resultContent: {
    flex: 1,
  },
  resultMain: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  resultSecondary: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginTop: 2,
  },
  quickActions: {
    padding: SPACING.lg,
  },
  quickActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  quickActionText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  quickActionSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginTop: 2,
  },
});
