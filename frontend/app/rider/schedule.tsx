import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
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

interface ScheduledRide {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  scheduled_time: string;
  status: string;
  fare_estimate?: number;
}

export default function ScheduleScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [date, setDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000)); // Tomorrow
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduledRides, setScheduledRides] = useState<ScheduledRide[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickup, setPickup] = useState('Select Pickup Location');
  const [dropoff, setDropoff] = useState('Select Drop-off Location');

  useEffect(() => {
    if (user?.id) {
      loadScheduledRides();
    }
  }, [user?.id]);

  const loadScheduledRides = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/scheduled/${user.id}`);
      const data = await res.json();
      if (data.scheduled_rides) {
        setScheduledRides(data.scheduled_rides);
      }
    } catch (e) {
      console.error('Load scheduled rides error:', e);
    }
  };

  const scheduleRide = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Please login first');
      return;
    }
    
    if (pickup === 'Select Pickup Location' || dropoff === 'Select Drop-off Location') {
      Alert.alert('Missing Information', 'Please select pickup and drop-off locations');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          pickup_lat: 6.4281,
          pickup_lng: 3.4219,
          pickup_address: pickup,
          dropoff_lat: 6.4355,
          dropoff_lng: 3.4567,
          dropoff_address: dropoff,
          scheduled_time: date.toISOString(),
        }),
      });
      const data = await res.json();
      if (data.scheduled_ride_id) {
        Alert.alert('Success! 🎉', 'Your ride has been scheduled', [
          { text: 'OK', onPress: () => loadScheduledRides() }
        ]);
        setPickup('Select Pickup Location');
        setDropoff('Select Drop-off Location');
      }
    } catch (e) {
      console.error('Schedule ride error:', e);
      Alert.alert('Error', 'Failed to schedule ride');
    }
    setLoading(false);
  };

  const cancelScheduledRide = async (rideId: string) => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this scheduled ride?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${BACKEND_URL}/api/rides/scheduled/${rideId}/cancel`, {
                method: 'DELETE',
              });
              loadScheduledRides();
            } catch (e) {
              Alert.alert('Error', 'Failed to cancel ride');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(date);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      setDate(newDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(date);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setDate(newDate);
    }
  };

  const renderScheduledRide = ({ item }: { item: ScheduledRide }) => (
    <View style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <View style={styles.rideDateBadge}>
          <Ionicons name="calendar" size={16} color={COLORS.purple} />
          <Text style={styles.rideDateText}>{formatDate(item.scheduled_time)}</Text>
        </View>
        <View style={styles.rideTimeBadge}>
          <Ionicons name="time" size={14} color={COLORS.blue} />
          <Text style={styles.rideTimeText}>{formatTime(item.scheduled_time)}</Text>
        </View>
      </View>
      
      <View style={styles.rideRoute}>
        <View style={styles.rideRouteRow}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.green }]} />
          <Text style={styles.rideAddress} numberOfLines={1}>{item.pickup_address}</Text>
        </View>
        <View style={styles.rideRouteLine} />
        <View style={styles.rideRouteRow}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.red }]} />
          <Text style={styles.rideAddress} numberOfLines={1}>{item.dropoff_address}</Text>
        </View>
      </View>
      
      <View style={styles.rideFooter}>
        {item.fare_estimate && (
          <Text style={styles.fareEstimate}>Est. ₦{item.fare_estimate.toLocaleString()}</Text>
        )}
        <TouchableOpacity 
          style={styles.cancelRideBtn}
          onPress={() => cancelScheduledRide(item.id)}
        >
          <Text style={styles.cancelRideText}>Cancel</Text>
        </TouchableOpacity>
      </View>
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
            <Text style={styles.headerTitle}>Schedule Ride</Text>
            <Text style={styles.headerSubtitle}>Book in advance</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Schedule Form Card */}
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <LinearGradient
                colors={[COLORS.purple, COLORS.blue]}
                style={styles.formIcon}
              >
                <Ionicons name="calendar" size={24} color="#FFFFFF" />
              </LinearGradient>
              <View>
                <Text style={styles.formTitle}>Plan Your Trip</Text>
                <Text style={styles.formDesc}>Set your pickup time up to 7 days ahead</Text>
              </View>
            </View>

            {/* Location Inputs */}
            <TouchableOpacity 
              style={styles.locationInput}
              onPress={() => router.push({ pathname: '/rider/book', params: { returnTo: 'schedule' } })}
            >
              <View style={[styles.locationDot, { backgroundColor: COLORS.green }]} />
              <View style={styles.locationTextContainer}>
                <Text style={styles.locationLabel}>PICKUP</Text>
                <Text style={styles.locationValue} numberOfLines={1}>{pickup}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.locationInput}
              onPress={() => router.push({ pathname: '/rider/book', params: { returnTo: 'schedule' } })}
            >
              <View style={[styles.locationDot, { backgroundColor: COLORS.red }]} />
              <View style={styles.locationTextContainer}>
                <Text style={styles.locationLabel}>DROP-OFF</Text>
                <Text style={styles.locationValue} numberOfLines={1}>{dropoff}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>

            {/* Date & Time Pickers */}
            <View style={styles.dateTimeRow}>
              <TouchableOpacity 
                style={styles.dateTimeBtn}
                onPress={() => setShowDatePicker(true)}
              >
                <View style={[styles.dateTimeIcon, { backgroundColor: COLORS.purple + '20' }]}>
                  <Ionicons name="calendar-outline" size={22} color={COLORS.purple} />
                </View>
                <View>
                  <Text style={styles.dateTimeLabel}>Date</Text>
                  <Text style={styles.dateTimeValue}>
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dateTimeBtn}
                onPress={() => setShowTimePicker(true)}
              >
                <View style={[styles.dateTimeIcon, { backgroundColor: COLORS.blue + '20' }]}>
                  <Ionicons name="time-outline" size={22} color={COLORS.blue} />
                </View>
                <View>
                  <Text style={styles.dateTimeLabel}>Time</Text>
                  <Text style={styles.dateTimeValue}>
                    {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Schedule Button */}
            <TouchableOpacity
              style={styles.scheduleButton}
              onPress={scheduleRide}
              disabled={loading}
            >
              <LinearGradient
                colors={[COLORS.purple, COLORS.blue]}
                style={styles.scheduleGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                    <Text style={styles.scheduleText}>Schedule This Ride</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Scheduled Rides List */}
          {scheduledRides.length > 0 && (
            <View style={styles.scheduledSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Upcoming Rides</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{scheduledRides.length}</Text>
                </View>
              </View>
              <FlatList
                data={scheduledRides}
                renderItem={renderScheduledRide}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* Benefits Card */}
          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>Why Schedule?</Text>
            <View style={styles.benefit}>
              <View style={[styles.benefitIcon, { backgroundColor: COLORS.green + '20' }]}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>Guaranteed Pickup</Text>
                <Text style={styles.benefitDesc}>Driver assigned 30 mins before</Text>
              </View>
            </View>
            <View style={styles.benefit}>
              <View style={[styles.benefitIcon, { backgroundColor: COLORS.blue + '20' }]}>
                <Ionicons name="pricetag" size={20} color={COLORS.blue} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>Fixed Price</Text>
                <Text style={styles.benefitDesc}>No surge pricing surprises</Text>
              </View>
            </View>
            <View style={styles.benefit}>
              <View style={[styles.benefitIcon, { backgroundColor: COLORS.purple + '20' }]}>
                <Ionicons name="notifications" size={20} color={COLORS.purple} />
              </View>
              <View style={styles.benefitText}>
                <Text style={styles.benefitTitle}>Reminders</Text>
                <Text style={styles.benefitDesc}>Get notified before pickup</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Date Picker Modal */}
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            minimumDate={new Date()}
            maximumDate={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)}
          />
        )}

        {/* Time Picker Modal */}
        {showTimePicker && (
          <DateTimePicker
            value={date}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
          />
        )}
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
    color: COLORS.purple,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
  },
  formCard: {
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
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  formIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  formDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  locationDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  dateTimeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  dateTimeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTimeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  dateTimeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  scheduleButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  scheduleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  scheduleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scheduledSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  countBadge: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rideCard: {
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
  rideHeader: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  rideDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.purple + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  rideDateText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.purple,
  },
  rideTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.blue + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  rideTimeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.blue,
  },
  rideRoute: {
    marginBottom: 14,
  },
  rideRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rideRouteLine: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.border,
    marginLeft: 4,
    marginVertical: 4,
  },
  rideAddress: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  fareEstimate: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.green,
  },
  cancelRideBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.red + '15',
  },
  cancelRideText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.red,
  },
  benefitsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 16,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  benefitDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
