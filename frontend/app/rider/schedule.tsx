import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ScheduleRideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAppStore();
  
  const [selectedDate, setSelectedDate] = useState(new Date(Date.now() + 3600000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scheduledRides, setScheduledRides] = useState<any[]>([]);
  
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
    loadScheduledRides();
  }, []);

  const loadScheduledRides = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/scheduled/${user.id}`);
      const data = await res.json();
      setScheduledRides(data.scheduled_rides || []);
    } catch (e) {
      console.error('Load scheduled rides error:', e);
    }
  };

  const scheduleRide = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Please login first');
      return;
    }
    
    const minTime = new Date(Date.now() + 30 * 60000);
    if (selectedDate < minTime) {
      Alert.alert('Invalid Time', 'Please schedule at least 30 minutes ahead');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/rides/schedule?rider_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          pickup_address: pickup.address,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          dropoff_address: dropoff.address,
          scheduled_time: selectedDate.toISOString(),
          ride_type: 'economy'
        })
      });
      
      const data = await res.json();
      if (data.scheduled_ride_id) {
        Alert.alert(
          'Ride Scheduled! 🎉',
          `Your ride is scheduled for ${selectedDate.toLocaleString()}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
        loadScheduledRides();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to schedule ride');
    }
    setLoading(false);
  };

  const onDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const onTimeChange = (event: any, date?: Date) => {
    setShowTimePicker(false);
    if (date) {
      const newDate = new Date(selectedDate);
      newDate.setHours(date.getHours(), date.getMinutes());
      setSelectedDate(newDate);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Schedule Ride</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Route Card */}
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

          {/* Date & Time Selection */}
          <View style={styles.dateTimeCard}>
            <Text style={styles.sectionTitle}>When do you need the ride?</Text>
            
            <TouchableOpacity 
              style={styles.dateTimeButton}
              onPress={() => setShowDatePicker(true)}
            >
              <View style={styles.dateTimeIcon}>
                <Ionicons name="calendar" size={24} color="#6366F1" />
              </View>
              <View style={styles.dateTimeInfo}>
                <Text style={styles.dateTimeLabel}>Date</Text>
                <Text style={styles.dateTimeValue}>
                  {selectedDate.toLocaleDateString('en-NG', { weekday: 'long', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.dateTimeButton}
              onPress={() => setShowTimePicker(true)}
            >
              <View style={styles.dateTimeIcon}>
                <Ionicons name="time" size={24} color="#8B5CF6" />
              </View>
              <View style={styles.dateTimeInfo}>
                <Text style={styles.dateTimeLabel}>Time</Text>
                <Text style={styles.dateTimeValue}>
                  {selectedDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Quick Time Options */}
          <View style={styles.quickTimes}>
            <Text style={styles.quickTimesLabel}>Quick select:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[
                { label: 'In 1 hour', hours: 1 },
                { label: 'In 2 hours', hours: 2 },
                { label: 'Tomorrow 8 AM', hours: 24, setTo: 8 },
                { label: 'Tomorrow 6 PM', hours: 24, setTo: 18 },
              ].map((option, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.quickTimeBtn}
                  onPress={() => {
                    const date = new Date(Date.now() + option.hours * 3600000);
                    if (option.setTo) {
                      date.setHours(option.setTo, 0, 0, 0);
                    }
                    setSelectedDate(date);
                  }}
                >
                  <Text style={styles.quickTimeText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Schedule Button */}
          <TouchableOpacity 
            style={styles.scheduleButton} 
            onPress={scheduleRide}
            disabled={loading}
          >
            <LinearGradient
              colors={['#6366F1', '#8B5CF6']}
              style={styles.scheduleGradient}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="calendar-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.scheduleText}>Schedule Ride</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Upcoming Scheduled Rides */}
          {scheduledRides.length > 0 && (
            <View style={styles.upcomingSection}>
              <Text style={styles.sectionTitle}>Upcoming Scheduled Rides</Text>
              {scheduledRides.map((ride, idx) => (
                <View key={idx} style={styles.scheduledCard}>
                  <View style={styles.scheduledIcon}>
                    <Ionicons name="time" size={20} color="#6366F1" />
                  </View>
                  <View style={styles.scheduledInfo}>
                    <Text style={styles.scheduledAddress} numberOfLines={1}>
                      {ride.pickup_address} → {ride.dropoff_address}
                    </Text>
                    <Text style={styles.scheduledTime}>
                      {new Date(ride.scheduled_time).toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={onDateChange}
            minimumDate={new Date()}
          />
        )}
        
        {showTimePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="time"
            display="default"
            onChange={onTimeChange}
          />
        )}
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
    marginBottom: 20,
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
  dateTimeCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  dateTimeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  dateTimeInfo: { flex: 1 },
  dateTimeLabel: { fontSize: 12, color: '#94A3B8' },
  dateTimeValue: { fontSize: 16, fontWeight: '600', color: '#FFFFFF', marginTop: 2 },
  quickTimes: { marginBottom: 24 },
  quickTimesLabel: { color: '#94A3B8', fontSize: 13, marginBottom: 10 },
  quickTimeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickTimeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  scheduleButton: { borderRadius: 16, overflow: 'hidden', marginBottom: 24 },
  scheduleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  scheduleText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  upcomingSection: { marginTop: 8 },
  scheduledCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  scheduledIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  scheduledInfo: { flex: 1 },
  scheduledAddress: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  scheduledTime: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
});
