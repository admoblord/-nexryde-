import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { useEmergencyContacts } from '@/src/hooks/useEmergencyContacts';

export default function ShareTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, currentTrip } = useAppStore();
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const { contacts: emergencyContacts, loading: loadingContacts, refresh: refreshEmergencyContacts } = useEmergencyContacts(user?.id);
  const [shareLink, setShareLink] = useState('');
  const [tracking, setTracking] = useState(false);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const locationSubscription = React.useRef<Location.LocationSubscription | null>(null);
  const tripMeta = currentTrip as (typeof currentTrip & {
    driver?: { name?: string };
    vehicle?: { plate?: string };
  }) | null;

  useEffect(() => {
    void refreshEmergencyContacts();
    generateShareLink();
    void startLocationTracking();
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, [refreshEmergencyContacts]);

  const generateShareLink = () => {
    const tripId = currentTrip?.id || params.tripId;
    if (!tripId) {
      setShareLink('');
      return;
    }
    setShareLink(`https://nexryde.com/track/${tripId}`);
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location access is needed to share your trip.');
        return;
      }

      setTracking(true);
      
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCurrentLocation(location.coords);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 50,
        },
        (newLocation) => {
          setCurrentLocation(newLocation.coords);
        }
      );
      locationSubscription.current = sub;
    } catch (error) {
      Alert.alert('Error', 'Failed to access location');
    }
  };

  const handleShareViaSMS = async (contact: { name: string; phone: string; relationship: string }) => {
    const message = `Track my NEXRYDE trip: ${shareLink}\nDriver: ${tripMeta?.driver?.name || 'Unknown'}\nVehicle: ${tripMeta?.vehicle?.plate || 'Unknown'}`;
    
    try {
      const smsUrl = Platform.OS === 'ios'
        ? `sms:${contact.phone}&body=${encodeURIComponent(message)}`
        : `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
      
      await Linking.openURL(smsUrl);
      setSharedWith((prev) => (prev.includes(contact.name) ? prev : [...prev, contact.name]));
      Alert.alert('Success', `Opening SMS to ${contact.name}...`);
    } catch (error) {
      Alert.alert('Error', 'Failed to open SMS');
    }
  };

  const handleShareToAll = async () => {
    const message = `🚨 I'm taking a ride with NEXRYDE. Track me live: ${shareLink}

🚗 Driver: ${tripMeta?.driver?.name || 'Unknown'}
🚙 Vehicle: ${tripMeta?.vehicle?.plate || 'Unknown'}
📞 My Phone: ${user?.phone || 'N/A'}

⏰ ${new Date().toLocaleString()}`;

    try {
      await Share.share({
        message,
        title: 'Track My NEXRYDE Trip',
      });
      Alert.alert('Success', 'Trip shared successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to share trip');
    }
  };

  const handleCopyLink = () => {
    if (!shareLink) {
      Alert.alert('No Active Trip', 'Start a trip to generate a real tracking link.');
      return;
    }
    void Clipboard.setStringAsync(shareLink);
    Alert.alert('Link Copied!', 'Trip tracking link copied to clipboard');
  };

  const handleStopSharing = () => {
    Alert.alert(
      'Stop Sharing?',
      'Your contacts will no longer be able to track your trip in real-time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop Sharing',
          style: 'destructive',
          onPress: () => {
            setTracking(false);
            setSharedWith([]);
            router.back();
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share Trip</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Live Tracking Status */}
        <View style={styles.statusCard}>
          <LinearGradient
            colors={tracking ? [COLORS.success, COLORS.accentGreen] : [COLORS.gray400, COLORS.gray500]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statusGradient}
          >
            <View style={styles.statusContent}>
              <View style={styles.statusIcon}>
                {tracking ? (
                  <Ionicons name="radio-outline" size={32} color={COLORS.white} />
                ) : (
                  <Ionicons name="radio-button-off-outline" size={32} color={COLORS.white} />
                )}
              </View>
              <View style={styles.statusInfo}>
                <Text style={styles.statusTitle}>
                  {tracking ? '🟢 Live Tracking Active' : '⚪ Tracking Paused'}
                </Text>
                <Text style={styles.statusSubtitle}>
                  {tracking 
                    ? 'Your location is being shared in real-time' 
                    : 'Start sharing to enable live tracking'}
                </Text>
              </View>
            </View>
            {tracking && currentLocation && (
              <View style={styles.locationInfo}>
                <Ionicons name="location" size={16} color={COLORS.white} />
                <Text style={styles.locationText}>
                  Last updated: {new Date().toLocaleTimeString()}
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* Shared With Counter */}
        {sharedWith.length > 0 && (
          <View style={styles.sharedBanner}>
            <Ionicons name="people" size={20} color={COLORS.accentBlue} />
            <Text style={styles.sharedText}>
              Shared with {sharedWith.length} contact{sharedWith.length > 1 ? 's' : ''}: {sharedWith.join(', ')}
            </Text>
          </View>
        )}

        {/* Trip Details */}
        {currentTrip && (
          <View style={styles.tripCard}>
            <Text style={styles.cardTitle}>📍 Current Trip</Text>
            <View style={styles.tripDetail}>
              <Ionicons name="person" size={18} color={COLORS.lightTextMuted} />
              <Text style={styles.tripDetailText}>Driver: {tripMeta?.driver?.name || 'Unknown'}</Text>
            </View>
            <View style={styles.tripDetail}>
              <Ionicons name="car" size={18} color={COLORS.lightTextMuted} />
              <Text style={styles.tripDetailText}>Vehicle: {tripMeta?.vehicle?.plate || 'Unknown'}</Text>
            </View>
            <View style={styles.tripDetail}>
              <Ionicons name="time" size={18} color={COLORS.lightTextMuted} />
              <Text style={styles.tripDetailText}>Started: {new Date().toLocaleTimeString()}</Text>
            </View>
          </View>
        )}

        {/* Share Link */}
        <View style={styles.linkCard}>
          <Text style={styles.cardTitle}>📎 Share Link</Text>
          <View style={styles.linkContainer}>
            <Text style={styles.linkText} numberOfLines={1}>{shareLink}</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
              <Ionicons name="copy-outline" size={20} color={COLORS.accentBlue} />
            </TouchableOpacity>
          </View>
          <Text style={styles.linkHint}>Anyone with this link can track your trip in real-time</Text>
        </View>

        {/* Quick Share Buttons */}
        <View style={styles.quickShare}>
          <Text style={styles.sectionTitle}>⚡ Quick Share</Text>
          <TouchableOpacity style={styles.shareAllButton} onPress={handleShareToAll}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shareAllGradient}
            >
              <Ionicons name="share-social" size={24} color={COLORS.white} />
              <Text style={styles.shareAllText}>Share to All Contacts</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Emergency Contacts */}
        <View style={styles.contactsSection}>
          <Text style={styles.sectionTitle}>👥 Emergency Contacts</Text>
          {emergencyContacts.length > 0 ? (
            emergencyContacts.map((contact, index) => (
              <View key={index} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactInitial}>
                      {contact.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactDetails}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactRelation}>{contact.relationship}</Text>
                  </View>
                  {sharedWith.includes(contact.name) && (
                    <View style={styles.sharedBadge}>
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                    </View>
                  )}
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={() => handleShareViaSMS(contact)}
                  >
                    <Ionicons name="share-social" size={24} color={COLORS.accentBlue} />
                    <Text style={styles.actionBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyContacts}>
              <Ionicons name="person-add-outline" size={48} color={COLORS.gray400} />
              <Text style={styles.emptyText}>{loadingContacts ? 'Loading contacts...' : 'No emergency contacts'}</Text>
              <TouchableOpacity 
                style={styles.addContactBtn}
                onPress={() => router.push('/(rider-tabs)/rider-safety')}
              >
                <Text style={styles.addContactBtnText}>Add Contacts</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Safety Notice */}
        <View style={styles.noticeCard}>
          <Ionicons name="shield-checkmark" size={24} color={COLORS.accentBlue} />
          <Text style={styles.noticeText}>
            Your location is encrypted and only visible to people you share with. 
            Tracking ends automatically when your trip is complete.
          </Text>
        </View>

        {/* Stop Sharing Button */}
        {tracking && (
          <TouchableOpacity style={styles.stopButton} onPress={handleStopSharing}>
            <Text style={styles.stopButtonText}>Stop Sharing</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 44,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  statusCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  statusGradient: {
    padding: SPACING.lg,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  statusIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  locationText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  sharedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.accentBlueSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
  },
  sharedText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentBlue,
  },
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  cardTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  tripDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  tripDetailText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  linkCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  linkText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentBlue,
  },
  copyButton: {
    padding: SPACING.xs,
  },
  linkHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  quickShare: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  shareAllButton: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  shareAllGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md + 4,
  },
  shareAllText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  contactsSection: {
    marginBottom: SPACING.lg,
  },
  contactCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
  contactDetails: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  contactName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs / 2,
  },
  contactRelation: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  sharedBadge: {
    marginLeft: SPACING.sm,
  },
  contactActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  actionBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  emptyContacts: {
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  addContactBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.lg,
  },
  addContactBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.white,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.accentBlueSoft,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accentBlue + '30',
  },
  noticeText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentBlue,
    lineHeight: 20,
  },
  stopButton: {
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.error + '15',
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.error,
  },
  stopButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.error,
  },
});
