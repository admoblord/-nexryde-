import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface ActiveTrip {
  id: string;
  status: string;
  rider_id?: string;
  driver_id?: string;
  pickup_location?: any;
  destination?: any;
  fare?: number;
  offered_fare?: number;
}

export default function ActiveTripBar() {
  const router = useRouter();
  const { user } = useAppStore();
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [calling, setCalling] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    if (!user?.id) return;
    fetchActiveTrip();
    const interval = setInterval(fetchActiveTrip, 8000);
    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTrip ? 0 : 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [activeTrip]);

  const fetchActiveTrip = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/active/${user.id}`);
      const data = await res.json();
      if (data.active && data.trip) {
        setActiveTrip(data.trip);
      } else {
        setActiveTrip(null);
      }
    } catch {
      // Silent fail
    }
  };

  const handleCall = async () => {
    if (!activeTrip?.id || !user?.id) return;
    setCalling(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/trip/${activeTrip.id}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_id: user.id,
          caller_role: user.role || 'rider',
        }),
      });
      const data = await res.json();
      if (data.success && data.phone_number) {
        const masked = data.phone_number.replace(/(\d{4})(\d{3})(\d+)/, '$1***$3');
        const targetLabel = user?.role === 'driver' ? 'Rider' : 'Driver';
        Alert.alert(
          `Call ${data.target_name || targetLabel}`,
          `NEXRYDE secure call\nNumber: ${masked}\n\nYour number is protected.`,
          [
            {
              text: 'Call via Phone',
              onPress: async () => {
                const phoneUrl = `tel:${data.phone_number}`;
                const canOpen = await Linking.canOpenURL(phoneUrl);
                if (canOpen) await Linking.openURL(phoneUrl);
                else Alert.alert('Call', `Dial ${masked} to reach your ${targetLabel.toLowerCase()}`);
              },
            },
            {
              text: 'WhatsApp Call',
              onPress: async () => {
                const waUrl = `https://wa.me/${data.phone_number.replace('+', '')}`;
                const canOpen = await Linking.canOpenURL(waUrl);
                if (canOpen) await Linking.openURL(waUrl);
                else Alert.alert('WhatsApp', 'WhatsApp is not installed on this device');
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Cannot Call', data.detail || 'Phone number not available');
      }
    } catch {
      Alert.alert('Error', 'Could not initiate call. Please try again.');
    } finally {
      setCalling(false);
    }
  };

  const handleChat = () => {
    if (!activeTrip?.id) return;
    router.push({ pathname: '/chat', params: { tripId: activeTrip.id } } as any);
  };

  if (!activeTrip) return null;

  const isRider = user?.role === 'rider';
  const otherParty = isRider ? 'Driver' : 'Rider';
  const statusLabel =
    activeTrip.status === 'pending' ? 'Waiting for driver...' :
    activeTrip.status === 'accepted' ? `${otherParty} is on the way` :
    activeTrip.status === 'ongoing' ? 'Trip in progress' : 'Active trip';

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.bar}>
        <View style={styles.info}>
          <View style={styles.statusDot} />
          <View style={styles.textGroup}>
            <Text style={styles.statusText}>{statusLabel}</Text>
            <Text style={styles.tripId} numberOfLines={1}>
              Trip #{activeTrip.id?.slice(-6)}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.chatBtn} onPress={handleChat}>
            <Ionicons name="chatbubble" size={20} color="#FFF" />
          </TouchableOpacity>
          {activeTrip.status !== 'pending' && (
            <TouchableOpacity style={styles.callBtn} onPress={handleCall} disabled={calling}>
              {calling ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="call" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    zIndex: 999,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    marginRight: 12,
  },
  textGroup: {
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  tripId: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  chatBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
