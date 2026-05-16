import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  DOCK_BLUR_INTENSITY,
  DOCK_TOP_RADIUS,
  DOCK_METRIC_CHIP,
  HANDLE_GRADIENT_DEFAULT,
} from '@/src/components/driver/driverDockTheme';

export type DriverNavigatePickupDockProps = {
  riderName: string;
  riderPhoto: string | null;
  ratingAvg: number | null;
  ratingTrips: number | null;
  isNewRider: boolean;
  distanceKm: number | null;
  etaMin: number | null;
  pickupLineShort: string;
  arrivalEligible: boolean;
  tripActionBusy: boolean;
  riderPhone: string | null;
  canMessage: boolean;
  onNavigate: () => void;
  onCall: () => void;
  onMessage: () => void;
  onMarkArrived: () => void;
};

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return 'Rider';
  return t.split(/\s+/)[0] || t;
}

function formatDist(km: number | null): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function MetricChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={[s.metricChip, accent && s.metricChipAccent]}>
      <Ionicons name={icon} size={14} color={accent ? '#4ADE80' : '#93C5FD'} />
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, accent && s.metricValueAccent]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function DriverNavigatePickupDock({
  riderName,
  riderPhoto,
  ratingAvg,
  ratingTrips,
  isNewRider,
  distanceKm,
  etaMin,
  pickupLineShort,
  arrivalEligible,
  tripActionBusy,
  riderPhone,
  canMessage,
  onNavigate,
  onCall,
  onMessage,
  onMarkArrived,
}: DriverNavigatePickupDockProps) {
  const initial = firstName(riderName).charAt(0).toUpperCase() || 'R';

  return (
    <View style={s.shell}>
      {Platform.OS === 'ios' || Platform.OS === 'android' ? (
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(2,6,18,0.97)' }]} />
      )}
      <LinearGradient
        colors={['rgba(15,23,42,0.15)', 'rgba(2,6,23,0.96)', '#020617']}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(52,245,184,0.09)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={s.sheenTop}
        pointerEvents="none"
      />

      <View style={s.handleRail}>
        <LinearGradient
          colors={[...HANDLE_GRADIENT_DEFAULT]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={s.handle}
        />
      </View>

      <View style={s.profileRow}>
        {riderPhoto ? (
          <Image source={{ uri: riderPhoto }} style={s.avatar} />
        ) : (
          <LinearGradient colors={['#1E40AF', '#2563EB']} style={s.avatarPh}>
            <Text style={s.avatarPhTxt}>{initial}</Text>
          </LinearGradient>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.eyebrow}>Your rider</Text>
          <Text style={s.riderName} numberOfLines={1}>
            {firstName(riderName)}
          </Text>
          {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={13} color="#FBBF24" />
              <Text style={s.ratingVal}>
                {ratingAvg.toFixed(1)}
                {typeof ratingTrips === 'number' && ratingTrips > 0
                  ? ` · ${ratingTrips.toLocaleString()} trips`
                  : ''}
              </Text>
            </View>
          ) : isNewRider ? (
            <Text style={s.ratingNew}>New rider</Text>
          ) : null}
        </View>
      </View>

      <View style={s.metricsRow}>
        <MetricChip icon="git-merge-outline" label="Distance" value={formatDist(distanceKm)} />
        <MetricChip icon="time-outline" label="ETA" value={etaMin != null ? `~${etaMin} min` : '—'} />
        <MetricChip
          icon="location"
          label="Pickup"
          value={pickupLineShort || 'Pickup'}
          accent
        />
      </View>

      <TouchableOpacity
        style={[s.navPrimaryOuter, tripActionBusy && { opacity: 0.65 }]}
        onPress={onNavigate}
        disabled={!!tripActionBusy}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Navigate to pickup in maps"
      >
        <LinearGradient
          colors={['#5DFFC7', '#34F5B8', '#0D9F6E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.navPrimaryGrad}
        >
          <Ionicons name="navigate" size={22} color="#022C22" />
          <Text style={s.navPrimaryTxt}>Navigate to pickup</Text>
        </LinearGradient>
      </TouchableOpacity>

      <View style={s.commsRow}>
        <TouchableOpacity
          style={[s.commIconBtn, !riderPhone && s.commIconBtnOff]}
          onPress={onCall}
          disabled={!riderPhone || !!tripActionBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Call rider"
        >
          <Ionicons name="call" size={22} color={riderPhone ? '#F8FAFC' : '#64748B'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.commIconBtn, s.commIconBtnChat, !canMessage && s.commIconBtnOff]}
          onPress={onMessage}
          disabled={!canMessage || !!tripActionBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Message rider"
        >
          <Ionicons name="chatbubble-ellipses" size={21} color={canMessage ? '#BFDBFE' : '#64748B'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            s.arrivedBtn,
            arrivalEligible ? s.arrivedBtnReady : s.arrivedBtnFar,
            !!tripActionBusy && { opacity: 0.6 },
          ]}
          onPress={onMarkArrived}
          disabled={!!tripActionBusy}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="I have arrived at pickup"
        >
          {tripActionBusy ? (
            <ActivityIndicator color="#22E5A0" size="small" />
          ) : (
            <>
              <Ionicons
                name={arrivalEligible ? 'checkmark-circle' : 'location-outline'}
                size={18}
                color={arrivalEligible ? '#022C22' : '#FBBF24'}
              />
              <Text style={[s.arrivedTxt, arrivalEligible && s.arrivedTxtOn]}>
                I&apos;ve arrived
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 32,
  },
  sheenTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 88,
  },
  handleRail: { alignItems: 'center', marginBottom: 12 },
  handle: { width: 44, height: 4, borderRadius: 100 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(52,245,184,0.4)',
    backgroundColor: '#1E293B',
  },
  avatarPh: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhTxt: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  eyebrow: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.4 },
  riderName: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.35 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingVal: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  ratingNew: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginTop: 4 },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metricChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: DOCK_METRIC_CHIP.bg,
    borderWidth: 1,
    borderColor: DOCK_METRIC_CHIP.border,
    gap: 4,
  },
  metricChipAccent: {
    borderColor: DOCK_METRIC_CHIP.accentBorder,
    backgroundColor: 'rgba(6,78,59,0.35)',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: DOCK_METRIC_CHIP.label,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '900',
    color: DOCK_METRIC_CHIP.value,
    letterSpacing: -0.2,
  },
  metricValueAccent: { color: DOCK_METRIC_CHIP.accentValue, fontSize: 12 },
  navPrimaryOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.4)',
  },
  navPrimaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
  },
  navPrimaryTxt: { fontSize: 15, fontWeight: '900', color: '#022C22', letterSpacing: 0.2 },
  commsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,58,138,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.35)',
  },
  commIconBtnChat: {
    backgroundColor: 'rgba(30,64,175,0.5)',
    borderColor: 'rgba(96,165,250,0.35)',
  },
  commIconBtnOff: { opacity: 0.45 },
  arrivedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  arrivedBtnReady: {
    backgroundColor: 'rgba(52,245,184,0.2)',
    borderColor: 'rgba(52,245,184,0.45)',
  },
  arrivedBtnFar: {
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  arrivedTxt: { fontSize: 13, fontWeight: '800', color: '#FBBF24' },
  arrivedTxtOn: { color: '#022C22' },
});
