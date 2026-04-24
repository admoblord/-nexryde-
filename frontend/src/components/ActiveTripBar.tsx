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
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { DRIVER_TRIPS_TAB_HREF } from '@/src/constants/driverNavigation';
import { isActiveTripStatus, normalizeTripStatus } from '@/src/utils/tripStatus';

interface ActiveTrip {
  id: string;
  status: string;
  payment_status?: string;
  rider_id?: string;
  driver_id?: string;
  pickup_location?: any;
  destination?: any;
  fare?: number;
  offered_fare?: number;
}

export default function ActiveTripBar() {
  const router = useRouter();
  const { user, currentTrip, setCurrentTrip } = useAppStore();
  const [calling, setCalling] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current;

  const activeTrip = (currentTrip || null) as ActiveTrip | null;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeTrip ? 0 : 100,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [activeTrip]);

  const handleCall = async () => {
    if (!activeTrip?.id || !user?.id) return;
    setCalling(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/call/session`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          tripId: activeTrip.id,
          role: user.role || 'rider',
        }),
      });
      const data = await res.json();
      const dialNumber = data?.dialNumber;
      if (res.ok && dialNumber) {
        const targetLabel = user?.role === 'driver' ? 'Rider' : 'Driver';
        Alert.alert(
          `Call ${targetLabel}`,
          'NEXRYDE secure call via masked relay number.\nYour real number is hidden.',
          [
            {
              text: 'Call via Phone',
              onPress: async () => {
                const phoneUrl = `tel:${dialNumber}`;
                try {
                  await Linking.openURL(phoneUrl);
                } catch {
                  Alert.alert('Call', `Dial ${dialNumber} to reach your ${targetLabel.toLowerCase()}`);
                }
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

  const openActiveTrip = () => {
    if (!activeTrip?.id) return;
    if (user?.role === 'rider') {
      router.push({ pathname: '/rider/tracking', params: { tripId: activeTrip.id } } as any);
    } else {
      router.push(DRIVER_TRIPS_TAB_HREF);
    }
  };

  const handleCancelPending = async () => {
    if (!activeTrip?.id || !user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/${activeTrip.id}/cancel`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ cancelled_by: user.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentTrip(null);
        return;
      }
      Alert.alert('Cannot cancel', data?.detail || 'Unable to cancel request.');
    } catch {
      Alert.alert('Error', 'Could not cancel this request.');
    }
  };

  if (!activeTrip || !isActiveTripStatus(activeTrip.status, activeTrip.payment_status)) return null;

  const isRider = user?.role === 'rider';
  const otherParty = isRider ? 'Driver' : 'Rider';
  const effectiveStatus = normalizeTripStatus(activeTrip.status, activeTrip.payment_status);

  const statusLabel =
    effectiveStatus === 'pending' || effectiveStatus === 'pending_driver_offers'
      ? 'Finding nearby drivers'
      : effectiveStatus === 'accepted'
        ? `${otherParty} is on the way`
        : effectiveStatus === 'arrived'
          ? `${otherParty} arrived`
          : effectiveStatus === 'ongoing'
            ? 'Trip in progress'
            : effectiveStatus === 'pending_payment'
              ? 'Payment pending'
              : 'Active trip';

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.bar} activeOpacity={0.9} onPress={openActiveTrip}>
        <View style={styles.info}>
          <View style={styles.statusDot} />
          <View style={styles.textGroup}>
            <Text style={styles.statusText}>{statusLabel}</Text>
            <Text style={styles.tripId} numberOfLines={1}>
              Trip #{activeTrip.id?.slice(-6)?.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          {(effectiveStatus === 'pending' || effectiveStatus === 'pending_driver_offers') ? (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelPending}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.chatBtn} onPress={handleChat}>
              <Ionicons name="chatbubble" size={20} color="#FFF" />
            </TouchableOpacity>
          )}
          {effectiveStatus !== 'pending' &&
            effectiveStatus !== 'pending_driver_offers' &&
            effectiveStatus !== 'pending_payment' && (
            <TouchableOpacity style={styles.callBtn} onPress={handleCall} disabled={calling}>
              {calling ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="call" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
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
    paddingVertical: 16,
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
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  tripId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
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
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
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
