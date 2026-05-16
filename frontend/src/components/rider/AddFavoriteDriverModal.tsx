import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RIDER_FAV_GRADIENT, RIDER_FAV_PERK_SHORT } from '@/src/constants/riderFavorites';
import { RiderFavoriteIcon } from '@/src/components/rider/RiderFavoriteIcon';
import { BORDER_RADIUS, FONT_SIZE, SPACING } from '@/src/constants/theme';

export type AddFavoriteDriverModalProps = {
  visible: boolean;
  driverName?: string;
  driverVehicle?: string;
  driverPlate?: string;
  profileImage?: string | null;
  saving?: boolean;
  onAdd: () => void;
  onDismiss: () => void;
};

export function AddFavoriteDriverModal({
  visible,
  driverName,
  driverVehicle,
  driverPlate,
  profileImage,
  saving,
  onAdd,
  onDismiss,
}: AddFavoriteDriverModalProps) {
  const name = driverName || 'Your driver';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        <View style={styles.card}>
          <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={['rgba(236,72,153,0.14)', 'transparent']}
            style={styles.sheen}
            pointerEvents="none"
          />

          <View style={styles.iconRow}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPh}>
                <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <RiderFavoriteIcon size={52} filled />
          </View>

          <Text style={styles.title}>Save {name}?</Text>
          <Text style={styles.body}>
            Book them again in one tap from home. {RIDER_FAV_PERK_SHORT}.
          </Text>

          {(driverVehicle || driverPlate) ? (
            <View style={styles.vehiclePill}>
              <Ionicons name="car-sport" size={16} color="#F9A8D4" />
              <Text style={styles.vehicleTxt} numberOfLines={1}>
                {[driverVehicle, driverPlate].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}

          <View style={styles.perks}>
            <Perk icon="flash" text="Priority when they're online" />
            <Perk icon="pricetag" text={RIDER_FAV_PERK_SHORT} />
            <Perk icon="call" text="Call after future rides" />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onDismiss} activeOpacity={0.88}>
              <Text style={styles.btnGhostTxt}>Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnPrimaryWrap}
              onPress={onAdd}
              disabled={saving}
              activeOpacity={0.9}
            >
              <LinearGradient colors={[...RIDER_FAV_GRADIENT]} style={styles.btnPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="heart" size={18} color="#FFF" />
                    <Text style={styles.btnPrimaryTxt}>Add favourite</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Perk({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.perkRow}>
      <Ionicons name={icon} size={16} color="#F472B6" />
      <Text style={styles.perkTxt}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(236,72,153,0.35)',
    padding: SPACING.lg,
    backgroundColor: 'rgba(15,23,42,0.92)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: SPACING.md,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(236,72,153,0.5)' },
  avatarPh: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 22, fontWeight: '900', color: '#F8FAFC' },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: SPACING.md,
  },
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(236,72,153,0.12)',
    marginBottom: SPACING.md,
    maxWidth: '100%',
  },
  vehicleTxt: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#FBCFE8', flexShrink: 1 },
  perks: { gap: 10, marginBottom: SPACING.lg },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkTxt: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#CBD5E1' },
  actions: { flexDirection: 'row', gap: 10 },
  btnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  btnGhostTxt: { fontSize: FONT_SIZE.sm, fontWeight: '800', color: '#94A3B8' },
  btnPrimaryWrap: { flex: 1.4, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  btnPrimaryTxt: { fontSize: FONT_SIZE.sm, fontWeight: '900', color: '#FFF' },
});
