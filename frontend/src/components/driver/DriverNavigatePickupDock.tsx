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
import { DOCK_BLUR_INTENSITY, DOCK_TOP_RADIUS, HANDLE_GRADIENT_DEFAULT } from '@/src/components/driver/driverDockTheme';

export type DriverNavigatePickupDockProps = {
  riderName: string;
  riderPhoto: string | null;
  ratingAvg: number | null;
  ratingTrips: number | null;
  isNewRider: boolean;
  /** Straight-line or API distance to pickup in km */
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
  const distLabel =
    distanceKm != null && Number.isFinite(distanceKm)
      ? `${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}`
      : '—';

  return (
    <View style={s.shell}>
      {Platform.OS === 'ios' || Platform.OS === 'android' ? (
        <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(2,6,18,0.97)' }]} />
      )}
      <LinearGradient
        colors={['rgba(15,23,42,0.22)', 'rgba(2,6,23,0.94)', '#020617']}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(52,245,184,0.11)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
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
          <View style={s.avatarPh}>
            <Text style={s.avatarPhTxt}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.riderName} numberOfLines={1}>
            {firstName(riderName)}
          </Text>
          {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={15} color="#FBBF24" />
              <Text style={s.ratingVal}>
                {ratingAvg.toFixed(1)}
                {typeof ratingTrips === 'number' && ratingTrips > 0
                  ? ` (${ratingTrips.toLocaleString()} ${ratingTrips === 1 ? 'trip' : 'trips'})`
                  : ''}
              </Text>
            </View>
          ) : isNewRider ? (
            <View style={s.ratingRow}>
              <Ionicons name="sparkles" size={14} color="#94A3B8" />
              <Text style={s.ratingNew}>New rider</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={s.metricsRow}>
        <View style={s.metricCard}>
          <LinearGradient
            colors={['rgba(59,130,246,0.35)', 'rgba(15,23,42,0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={s.metricInner}>
            <Ionicons name="git-merge-outline" size={18} color="#93C5FD" style={s.metricIcon} />
            <Text style={s.metricLabel}>DISTANCE</Text>
            <Text style={s.metricValue} numberOfLines={1}>
              {distLabel}
            </Text>
          </View>
        </View>
        <View style={s.metricCard}>
          <LinearGradient
            colors={['rgba(59,130,246,0.35)', 'rgba(15,23,42,0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={s.metricInner}>
            <Ionicons name="time-outline" size={18} color="#93C5FD" style={s.metricIcon} />
            <Text style={s.metricLabel}>ETA</Text>
            <Text style={s.metricValue}>{etaMin != null ? `~${etaMin} min` : '—'}</Text>
          </View>
        </View>
        <View style={[s.metricCard, s.metricCardAccent]}>
          <LinearGradient
            colors={['rgba(52,245,184,0.35)', 'rgba(15,23,42,0.88)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={s.metricInner}>
            <Ionicons name="location" size={18} color="#4ADE80" style={s.metricIcon} />
            <Text style={[s.metricLabel, s.metricLabelAccent]}>PICKUP</Text>
            <Text style={[s.metricValue, s.metricValueAccent]} numberOfLines={2}>
              {pickupLineShort || 'Pickup'}
            </Text>
          </View>
        </View>
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
          <Text style={s.navPrimaryTxt}>NAVIGATE TO PICKUP</Text>
        </LinearGradient>
      </TouchableOpacity>

      <View style={s.commsRow}>
        <TouchableOpacity
          style={[s.commBtn, !riderPhone && s.commBtnMuted]}
          onPress={onCall}
          disabled={!riderPhone || !!tripActionBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Call rider"
        >
          <LinearGradient
            colors={riderPhone ? ['#3B82F6', '#1D4ED8'] : ['rgba(51,65,85,0.6)', 'rgba(30,41,59,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.commBtnInner}
          >
            <Ionicons name="call" size={20} color={riderPhone ? '#F8FAFC' : '#64748B'} />
            <Text style={[s.commBtnTxt, !riderPhone && s.commBtnTxtMuted]}>CALL RIDER</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.commBtn, !canMessage && s.commBtnMuted]}
          onPress={onMessage}
          disabled={!canMessage || !!tripActionBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Message rider"
        >
          <LinearGradient
            colors={canMessage ? ['#2563EB', '#1E40AF'] : ['rgba(51,65,85,0.6)', 'rgba(30,41,59,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.commBtnInner}
          >
            <Ionicons name="chatbubble-ellipses" size={19} color={canMessage ? '#E0F2FE' : '#64748B'} />
            <Text style={[s.commBtnTxt, !canMessage && s.commBtnTxtMuted]} numberOfLines={2}>
              MESSAGE RIDER
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

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
          <ActivityIndicator color="#22E5A0" />
        ) : (
          <>
            <Ionicons
              name={arrivalEligible ? 'checkmark-circle' : 'location-outline'}
              size={20}
              color={arrivalEligible ? '#022C22' : '#FBBF24'}
            />
            <Text style={[s.arrivedTxt, arrivalEligible && s.arrivedTxtOn]}>{"I've arrived at pickup"}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  shell: {
    borderTopLeftRadius: DOCK_TOP_RADIUS,
    borderTopRightRadius: DOCK_TOP_RADIUS,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -18 },
    shadowOpacity: 0.58,
    shadowRadius: 32,
    elevation: 36,
  },
  sheenTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  handleRail: { alignItems: 'center', marginBottom: 14 },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 100,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(52,245,184,0.42)',
    backgroundColor: '#1E293B',
  },
  avatarPh: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(96,165,250,0.38)',
    backgroundColor: '#1E3A5F',
  },
  avatarPhTxt: { fontSize: 22, fontWeight: '900', color: '#BFDBFE' },
  riderName: { fontSize: 22, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  ratingVal: { fontSize: 14, fontWeight: '800', color: '#E2E8F0' },
  ratingNew: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    minHeight: 100,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.22)',
  },
  metricInner: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    zIndex: 1,
  },
  metricCardAccent: {
    borderColor: 'rgba(52,245,184,0.28)',
  },
  metricIcon: { marginBottom: 6 },
  metricLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  metricLabelAccent: { color: 'rgba(52,245,184,0.85)' },
  metricValue: { fontSize: 13, fontWeight: '900', color: '#F1F5F9', letterSpacing: -0.2 },
  metricValueAccent: { color: '#D1FAE5', lineHeight: 17 },
  navPrimaryOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.45)',
    shadowColor: '#34F5B8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  navPrimaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  navPrimaryTxt: { fontSize: 14, fontWeight: '900', color: '#022C22', letterSpacing: 0.6 },
  commsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  commBtnMuted: { opacity: 0.55 },
  commBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  commBtnTxt: { fontSize: 10, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.25, textAlign: 'center' },
  commBtnTxtMuted: { color: '#94A3B8' },
  arrivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  arrivedBtnReady: {
    backgroundColor: 'rgba(52,245,184,0.22)',
    borderColor: 'rgba(52,245,184,0.5)',
    shadowColor: '#34F5B8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  arrivedBtnFar: {
    backgroundColor: 'rgba(30,41,59,0.75)',
    borderColor: 'rgba(251,191,36,0.35)',
  },
  arrivedTxt: { fontSize: 13, fontWeight: '800', color: '#FBBF24' },
  arrivedTxtOn: { color: '#022C22' },
});
