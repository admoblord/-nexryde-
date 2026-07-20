/**
 * Mid-trip destination change / add-stop — calls updateTripRoute.
 */
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { updateTripRoute } from '@/src/services/api';
import { geocodeAddressForRider } from '@/src/services/riderSavedPlaces';
import { LIVE } from '@/src/components/tracking/live/liveTrackingTheme';

type Props = {
  visible: boolean;
  tripId: string;
  mode: 'destination' | 'stop';
  driverLat?: number | null;
  driverLng?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export function ChangeTripRouteModal({
  visible,
  tripId,
  mode,
  driverLat,
  driverLng,
  onClose,
  onSuccess,
}: Props) {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === 'stop' ? 'Add a stop' : 'Change destination';
  const sub =
    mode === 'stop'
      ? 'We’ll recalculate your fare with the new stop. Your driver will be notified.'
      : 'We’ll recalculate your fare for the new destination. Your driver will be notified.';

  const submit = async () => {
    const q = address.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const geo = await geocodeAddressForRider(q);
      if (!geo) {
        setError('Could not find that place. Try a clearer address.');
        return;
      }
      await updateTripRoute(tripId, {
        update_type: mode,
        lat: geo.lat,
        lng: geo.lng,
        address: geo.address,
        ...(driverLat != null && driverLng != null
          ? { driver_lat: driverLat, driver_lng: driverLng }
          : {}),
      });
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setAddress('');
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update route. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder={mode === 'stop' ? 'Stop address' : 'New destination'}
            placeholderTextColor="#64748B"
            editable={!busy}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          {error ? (
            <View style={styles.err}>
              <Ionicons name="alert-circle" size={14} color="#FCA5A5" />
              <Text style={styles.errTxt}>{error}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity style={styles.keepBtn} onPress={onClose} disabled={busy}>
              <Text style={styles.keepTxt}>Keep current</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.goBtn, (busy || address.trim().length < 3) && styles.goBtnOff]}
              onPress={() => void submit()}
              disabled={busy || address.trim().length < 3}
            >
              {busy ? (
                <ActivityIndicator color="#041016" />
              ) : (
                <Text style={styles.goTxt}>Update route</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.72)' },
  card: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.45)',
    marginBottom: 12,
  },
  title: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  sub: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginBottom: 14 },
  input: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  err: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  errTxt: { color: '#FCA5A5', fontSize: 12, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  keepBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  keepTxt: { color: '#E2E8F0', fontWeight: '800', fontSize: 14 },
  goBtn: {
    flex: 1.2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: LIVE.green,
  },
  goBtnOff: { opacity: 0.45 },
  goTxt: { color: '#041016', fontWeight: '900', fontSize: 14 },
});
