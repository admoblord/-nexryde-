import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, triggerSOS, getAuthHeaders } from '@/src/services/api';

export default function RiderSafetyScreen() {
  const { user, currentTrip } = useAppStore();
  const [activeTripId, setActiveTripId] = useState<string | null>(currentTrip?.id || null);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);

  const effectiveTripId = useMemo(() => currentTrip?.id || activeTripId || null, [currentTrip?.id, activeTripId]);

  useEffect(() => {
    const fetchActiveTrip = async () => {
      if (!user?.id || !BACKEND_URL) return;
      setLoadingTrip(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/trips/active/${user.id}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data?.active && data?.trip?.id) {
          setActiveTripId(String(data.trip.id));
        } else {
          setActiveTripId(null);
        }
      } catch {
        // Keep existing trip state.
      } finally {
        setLoadingTrip(false);
      }
    };

    fetchActiveTrip();
    const interval = setInterval(fetchActiveTrip, 10000);
    return () => clearInterval(interval);
  }, [user?.id, BACKEND_URL]);

  const handleConfirmSOS = async () => {
    if (!effectiveTripId) {
      Alert.alert('No Active Trip', 'SOS works only during an active trip.');
      return;
    }

    setSendingSos(true);
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 400, 200, 400]);
    }

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location permission to send SOS with your live location.');
        setSendingSos(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      await triggerSOS({
        trip_id: effectiveTripId,
        location_lat: location.coords.latitude,
        location_lng: location.coords.longitude,
      });

      setSosModalVisible(false);
      Alert.alert(
        'SOS Sent',
        'Emergency alert has been sent to your contacts and NEXRYDE support.',
      );
    } catch (error: any) {
      Alert.alert('SOS Failed', error?.response?.data?.detail || 'Could not send SOS right now.');
    } finally {
      setSendingSos(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Safety Center</Text>
        <Text style={styles.headerSubtext}>Your safety is our priority</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* SOS Button */}
        <TouchableOpacity
          style={[styles.sosButton, !effectiveTripId && styles.sosDisabled]}
          activeOpacity={0.85}
          onLongPress={() => setSosModalVisible(true)}
          delayLongPress={500}
          disabled={!effectiveTripId || sendingSos}
        >
          <Ionicons name="alert-circle" size={32} color={COLORS.white} />
          <Text style={styles.sosText}>{sendingSos ? 'Sending SOS...' : 'Emergency SOS'}</Text>
          <Text style={styles.sosSubtext}>
            {effectiveTripId ? 'Press and hold to trigger SOS' : 'SOS available only in active trip'}
          </Text>
        </TouchableOpacity>
        {loadingTrip && <ActivityIndicator size="small" color={COLORS.accentGreen} style={{ marginTop: 10 }} />}

        {/* Safety Features */}
        <Text style={styles.sectionTitle}>Safety Features</Text>
        <View style={styles.featuresList}>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Driver Checks</Text>
              <Text style={styles.featureDesc}>Look for approved driver badges and trip safety checks</Text>
            </View>
          </View>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="location" size={24} color={COLORS.info} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Live Trip Tracking</Text>
              <Text style={styles.featureDesc}>Share your ride in real-time</Text>
            </View>
          </View>
          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="call" size={24} color={COLORS.accent} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>24/7 Support</Text>
              <Text style={styles.featureDesc}>Always here to help you</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={sosModalVisible} transparent animationType="fade" onRequestClose={() => setSosModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="warning" size={52} color={COLORS.error} />
            <Text style={styles.modalTitle}>Confirm Emergency SOS</Text>
            <Text style={styles.modalText}>
              This sends your live location and trip details to emergency contacts and NEXRYDE support.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnAlt]} onPress={() => setSosModalVisible(false)}>
                <Text style={styles.modalBtnAltText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnDanger]} onPress={handleConfirmSOS} disabled={sendingSos}>
                <Text style={styles.modalBtnDangerText}>{sendingSos ? 'Sending...' : 'Send SOS'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerSubtext: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#FDE68A',
    marginTop: SPACING.xs,
  },
  content: {
    padding: SPACING.lg,
  },
  sosButton: {
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
  },
  sosDisabled: {
    backgroundColor: COLORS.gray400,
  },
  sosText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.sm,
    letterSpacing: -0.5,
  },
  sosSubtext: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#FEE2E2',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.md,
    letterSpacing: -0.3,
  },
  featuresList: {
    gap: SPACING.md,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    ...SHADOWS.sm,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  featureTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: '#0F172A',
  },
  featureDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  modalTitle: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.error,
  },
  modalText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    textAlign: 'center',
  },
  modalActions: {
    marginTop: SPACING.lg,
    width: '100%',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modalBtn: {
    flex: 1,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  modalBtnAlt: {
    backgroundColor: COLORS.gray100,
  },
  modalBtnDanger: {
    backgroundColor: COLORS.error,
  },
  modalBtnAltText: {
    color: COLORS.gray700,
    fontWeight: '700',
  },
  modalBtnDangerText: {
    color: COLORS.white,
    fontWeight: '700',
  },
});
