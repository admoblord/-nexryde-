import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const { width } = Dimensions.get('window');

interface RouteStop {
  id: string;
  type: 'pickup' | 'stop' | 'dropoff';
  address: string;
  isEditing: boolean;
}

export default function BookScreen() {
  const router = useRouter();
  const [stops, setStops] = useState<RouteStop[]>([
    { id: '1', type: 'pickup', address: '', isEditing: false },
    { id: '2', type: 'dropoff', address: '', isEditing: false },
  ]);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Sample saved locations
  const savedLocations = [
    { id: 'home', name: 'Home', address: '123 Victoria Island, Lagos', icon: 'home' },
    { id: 'work', name: 'Work', address: '456 Lekki Phase 1, Lagos', icon: 'briefcase' },
  ];

  // Sample recent locations
  const recentLocations = [
    { id: 'recent1', name: 'Shoprite Mall', address: 'Lekki, Lagos' },
    { id: 'recent2', name: 'Murtala Mohammed Airport', address: 'Ikeja, Lagos' },
    { id: 'recent3', name: 'Palms Shopping Mall', address: 'Victoria Island, Lagos' },
  ];

  const addStop = () => {
    const newStop: RouteStop = {
      id: Date.now().toString(),
      type: 'stop',
      address: '',
      isEditing: true,
    };
    // Insert before dropoff
    const newStops = [...stops];
    newStops.splice(stops.length - 1, 0, newStop);
    setStops(newStops);
    setActiveStopId(newStop.id);
  };

  const removeStop = (id: string) => {
    if (stops.length <= 2) return; // Must have at least pickup and dropoff
    setStops(stops.filter(stop => stop.id !== id));
  };

  const updateStopAddress = (id: string, address: string) => {
    setStops(stops.map(stop => 
      stop.id === id ? { ...stop, address } : stop
    ));
  };

  const selectLocation = (address: string) => {
    if (activeStopId) {
      updateStopAddress(activeStopId, address);
      setActiveStopId(null);
      setSearchQuery('');
    }
  };

  const canContinue = stops.every(stop => stop.address.length > 0);

  const handleContinue = () => {
    if (canContinue) {
      router.push('/rider/tracking');
    }
  };

  const getStopIcon = (type: string, index: number) => {
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
        <Ionicons name="search" size={16} color={COLORS.lightTextMuted} />
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
              {/* Connection Line */}
              {index > 0 && (
                <View style={styles.connectionLine}>
                  <View style={styles.dashedLine} />
                </View>
              )}
              
              <View style={styles.stopRow}>
                {/* Stop Indicator */}
                {getStopIcon(stop.type, index)}

                {/* Input Container */}
                <TouchableOpacity 
                  style={[
                    styles.stopInputContainer,
                    activeStopId === stop.id && styles.stopInputActive
                  ]}
                  onPress={() => setActiveStopId(stop.id)}
                  activeOpacity={0.8}
                >
                  <TextInput
                    style={styles.stopInput}
                    placeholder={getPlaceholder(stop.type)}
                    placeholderTextColor={COLORS.lightTextMuted}
                    value={stop.address}
                    onChangeText={(text) => updateStopAddress(stop.id, text)}
                    onFocus={() => setActiveStopId(stop.id)}
                  />
                  
                  {stop.type === 'stop' && (
                    <TouchableOpacity 
                      style={styles.mapButton}
                      onPress={() => setShowMapPicker(true)}
                    >
                      <Text style={styles.mapButtonText}>Map</Text>
                      <View style={styles.mapIconContainer}>
                        <Ionicons name="location" size={14} color={COLORS.accentGreen} />
                      </View>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity style={styles.dragHandle}>
                    <Ionicons name="reorder-three" size={20} color={COLORS.lightTextMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Action Button */}
                {stop.type === 'pickup' ? (
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={addStop}
                  >
                    <Ionicons name="add" size={22} color={COLORS.lightTextPrimary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => removeStop(stop.id)}
                  >
                    <Ionicons name="close" size={22} color={COLORS.error} />
                  </TouchableOpacity>
                )}
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
                onPress={() => selectLocation(location.address)}
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
                onPress={() => selectLocation(location.address)}
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
            onPress={() => selectLocation('Current Location')}
          >
            <View style={[styles.locationIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
              <Ionicons name="navigate" size={18} color={COLORS.accentBlue} />
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

        {/* Map Picker Modal */}
        <Modal
          visible={showMapPicker}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowMapPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.lightTextPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Select on Map</Text>
              <View style={{ width: 24 }} />
            </View>
            
            {/* Placeholder for Map */}
            <View style={styles.mapPlaceholder}>
              <Ionicons name="map" size={64} color={COLORS.lightTextMuted} />
              <Text style={styles.mapPlaceholderText}>Map view coming soon</Text>
              <Text style={styles.mapPlaceholderSubtext}>
                Tap to select a location on the map
              </Text>
            </View>

            <TouchableOpacity 
              style={styles.selectOnMapButton}
              onPress={() => {
                selectLocation('Selected Location from Map');
                setShowMapPicker(false);
              }}
            >
              <Text style={styles.selectOnMapText}>Confirm Location</Text>
            </TouchableOpacity>
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
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stopInputActive: {
    borderColor: COLORS.accentGreen,
  },
  stopInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    paddingVertical: SPACING.xs,
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
    width: 36,
    height: 36,
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
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  modalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lightSurface,
  },
  mapPlaceholderText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginTop: SPACING.md,
  },
  mapPlaceholderSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextMuted,
    marginTop: SPACING.xs,
  },
  selectOnMapButton: {
    margin: SPACING.lg,
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  selectOnMapText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
