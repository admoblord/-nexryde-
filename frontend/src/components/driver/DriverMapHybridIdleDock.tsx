/**
 * Driver full-map hybrid idle dock — earnings, listening card, GO OFFLINE.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { HYBRID, HYBRID_BTN_PRIMARY_H, HYBRID_PAD } from '@/src/constants/nexrydeHybridBrand';
import {
  DOCK_BLUR_INTENSITY,
  DOCK_TOP_RADIUS,
  HANDLE_GRADIENT_DEFAULT,
} from '@/src/components/driver/driverDockTheme';

type Props = {
  paddingBottom: number;
  paddingHorizontal: number;
  // Legacy props kept for call-site compatibility (no longer rendered in minimal dock)
  todayEarnings?: number;
  earningsLabel?: string;
  mapLoaded?: boolean;
  mapInboxUnread?: number;
  onEarningsPress?: () => void;
  onInboxPress?: () => void;
  sonarAnim?: unknown;
  listenCarouselIndex?: number;
  // Active props
  workZoneActive: boolean;
  workZoneLabel: string;
  onWorkZone?: () => void;
  isFindingRide: boolean;
  onShield: () => void;
  onGoOffline: () => void;
  onMenu: () => void;
  toggling: boolean;
};


export function DriverMapHybridIdleDock({
  paddingBottom,
  paddingHorizontal,
  workZoneActive,
  workZoneLabel,
  onWorkZone,
  isFindingRide,
  onShield,
  onGoOffline,
  onMenu,
  toggling,
}: Props) {
  return (
    <>
      {/* Shorter fade — dock is now minimal height */}
      <LinearGradient
        colors={['rgba(15,20,25,0)', 'rgba(15,20,25,0.65)', 'rgba(15,20,25,0.96)']}
        locations={[0, 0.5, 1]}
        style={[styles.fade, { height: 120 }]}
        pointerEvents="none"
      />
      <View
        style={[styles.root, { paddingBottom, paddingHorizontal }]}
        pointerEvents="box-none"
      >
        <View style={styles.shell}>
          <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.shellBg} />
          <LinearGradient
            colors={['rgba(0,208,132,0.08)', 'transparent']}
            style={styles.sheen}
            pointerEvents="none"
          />

          <View style={styles.handleWrap} pointerEvents="none">
            <LinearGradient
              colors={[...HANDLE_GRADIENT_DEFAULT]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.handle}
            />
          </View>

          {/* Compact one-line status: ONLINE pill + state text */}
          <View style={styles.statusRow}>
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineTxt}>ONLINE</Text>
            </View>

            {workZoneActive && workZoneLabel && onWorkZone ? (
              <TouchableOpacity style={styles.destBannerCompact} onPress={onWorkZone} activeOpacity={0.9}>
                <Ionicons name="map" size={16} color={HYBRID.teal} />
                <Text style={styles.destTxtCompact} numberOfLines={1}>
                  Zone: {workZoneLabel} · ON
                </Text>
                <Ionicons name="chevron-forward" size={14} color={HYBRID.muted} />
              </TouchableOpacity>
            ) : (
              <Text style={styles.listenPill}>
                {isFindingRide ? '📡 Listening for rides' : 'Offers paused'}
              </Text>
            )}
          </View>

          {/* Minimal action row — map gets ~85% screen */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.sideBtn}
              onPress={onShield}
              accessibilityLabel="Safety"
            >
              <Ionicons name="shield-checkmark" size={24} color={HYBRID.blue} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.goOfflineBtn}
              onPress={onGoOffline}
              disabled={toggling}
              activeOpacity={0.9}
              accessibilityLabel="Go offline"
            >
              {toggling ? (
                <ActivityIndicator color={HYBRID.text} />
              ) : (
                <Text style={styles.goOfflineTxt}>Go Offline</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.sideBtn} onPress={onMenu} accessibilityLabel="Menu">
              <Ionicons name="menu" size={24} color={HYBRID.muted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  root: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 14 },
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(45,55,72,0.8)',
    paddingTop: 8,
    paddingHorizontal: HYBRID_PAD,
    paddingBottom: 10,
    gap: 8,
  },
  shellBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,31,46,0.94)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 48 },
  handleWrap: { alignItems: 'center', paddingBottom: 2 },
  handle: { width: 36, height: 3, borderRadius: 2 },
  // Compact one-line status row
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: HYBRID.blue,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: HYBRID.text },
  onlineTxt: { fontSize: 11, fontWeight: '900', color: HYBRID.text, letterSpacing: 0.8 },
  listenPill: { flex: 1, fontSize: 12, fontWeight: '600', color: HYBRID.muted },
  destBannerCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,217,163,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,217,163,0.28)',
  },
  destTxtCompact: { flex: 1, fontSize: 12, fontWeight: '700', color: HYBRID.teal },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sideBtn: {
    width: HYBRID_BTN_PRIMARY_H - 2,
    height: HYBRID_BTN_PRIMARY_H - 2,
    borderRadius: 16,
    backgroundColor: HYBRID.card,
    borderWidth: 1,
    borderColor: HYBRID.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOfflineBtn: {
    flex: 1,
    height: HYBRID_BTN_PRIMARY_H,
    borderRadius: 16,
    backgroundColor: HYBRID.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: HYBRID.red,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  goOfflineTxt: {
    fontSize: 16,
    fontWeight: '900',
    color: HYBRID.text,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
