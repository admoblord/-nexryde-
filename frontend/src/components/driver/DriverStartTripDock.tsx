import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { DOCK_BLUR_INTENSITY, DOCK_TOP_RADIUS, HANDLE_GRADIENT_DEFAULT } from '@/src/components/driver/driverDockTheme';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';

export type DriverStartTripDockProps = {
  riderName: string;
  riderPhoto: string | null;
  ratingAvg: number | null;
  ratingTrips: number | null;
  isNewRider: boolean;
  /** One-line route e.g. "Lekki Phase 1 → VI" */
  routeSummaryLine: string;
  distanceLabel: string;
  durationLabel: string;
  fareLabel: string;
  /** Driver vehicle, e.g. "Black Toyota Camry | LND 421 AA" */
  vehicleLine: string | null;
  tripActionBusy: boolean;
  riderPhone: string | null;
  canMessage: boolean;
  onStartTrip: () => void;
  /** Navigate to drop-off before / after start (Uber keeps directions visible). */
  onNavigate?: () => void;
  onCall: () => void;
  onMessage: () => void;
  /** Destructive — parent should confirm then cancel */
  onCancelTrip: () => void;
};

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return 'Rider';
  return t.split(/\s+/)[0] || t;
}

export default function DriverStartTripDock({
  riderName,
  riderPhoto,
  ratingAvg,
  ratingTrips,
  isNewRider,
  routeSummaryLine,
  distanceLabel,
  durationLabel,
  fareLabel,
  vehicleLine,
  tripActionBusy,
  riderPhone,
  canMessage,
  onStartTrip,
  onNavigate,
  onCall,
  onMessage,
  onCancelTrip,
}: DriverStartTripDockProps) {
  const confirmCancel = () => {
    Alert.alert(
      'Cancel this trip?',
      'Only cancel if the rider is not continuing. This may affect your completion rate.',
      [
        { text: 'Keep trip', style: 'cancel' },
        { text: 'Cancel trip', style: 'destructive', onPress: onCancelTrip },
      ],
    );
  };

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
        colors={['rgba(52,245,184,0.1)', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.42 }}
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
        <TripProfileAvatar
          size={56}
          uri={riderPhoto}
          borderColor="rgba(52,245,184,0.45)"
          accessibilityLabel={`Photo of ${firstName(riderName)}`}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.riderName} numberOfLines={1}>
            {firstName(riderName)}
          </Text>
          {typeof ratingAvg === 'number' && ratingAvg > 0 ? (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={15} color="#FBBF24" />
              <Text style={s.ratingTxt}>
                {ratingAvg.toFixed(1)}
                {typeof ratingTrips === 'number' && ratingTrips > 0
                  ? ` (${ratingTrips.toLocaleString()})`
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
        <TouchableOpacity
          style={[s.msgIconBtn, !canMessage && s.msgIconBtnOff]}
          onPress={onMessage}
          disabled={!canMessage || !!tripActionBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Message rider"
        >
          <Ionicons name="chatbubble-ellipses" size={22} color={canMessage ? '#93C5FD' : '#475569'} />
        </TouchableOpacity>
      </View>

      <View style={s.routeBar}>
        <LinearGradient
          colors={['rgba(52,245,184,0.2)', 'rgba(52,245,184,0.04)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={s.routeDot} />
        <Text style={s.routeBarTxt} numberOfLines={1}>
          {routeSummaryLine}
        </Text>
      </View>

      <View style={s.statsRow}>
        <View style={s.statCard}>
          <View style={[s.statIconWrap, s.statIconWrapMint]}>
            <Ionicons name="location-outline" size={17} color="#86EFAC" />
          </View>
          <Text style={s.statLbl}>DISTANCE</Text>
          <Text style={s.statVal} numberOfLines={1}>
            {distanceLabel}
          </Text>
        </View>
        <View style={s.statCard}>
          <View style={[s.statIconWrap, s.statIconWrapSky]}>
            <Ionicons name="time-outline" size={17} color="#7DD3FC" />
          </View>
          <Text style={s.statLbl}>DURATION</Text>
          <Text style={s.statVal} numberOfLines={1}>
            {durationLabel}
          </Text>
        </View>
        <View style={[s.statCard, s.statCardFare]}>
          <View style={[s.statIconWrap, s.statIconWrapFare]}>
            <Ionicons name="cash-outline" size={17} color="#4ADE80" />
          </View>
          <Text style={s.statLbl}>EST. FARE</Text>
          <Text style={[s.statVal, s.statValFare]} numberOfLines={1}>
            {fareLabel}
          </Text>
        </View>
      </View>

      {vehicleLine ? (
        <View style={s.vehicleRow}>
          <View style={s.vehicleThumb}>
            <Ionicons name="car-sport" size={22} color="#94A3B8" />
          </View>
          <Text style={s.vehicleTxt} numberOfLines={2}>
            {vehicleLine}
          </Text>
        </View>
      ) : null}

      {onNavigate ? (
        <TouchableOpacity
          style={[s.navBtn, tripActionBusy && { opacity: 0.65 }]}
          onPress={onNavigate}
          disabled={!!tripActionBusy}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Navigate to destination"
        >
          <Ionicons name="navigate" size={18} color="#7DD3FC" />
          <Text style={s.navBtnTxt}>Navigate to destination</Text>
          <Ionicons name="chevron-forward" size={16} color="#64748B" />
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[s.startOuter, tripActionBusy && { opacity: 0.65 }]}
        onPress={onStartTrip}
        disabled={!!tripActionBusy}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Start trip"
      >
        <LinearGradient
          colors={['#5DFFC7', '#34F5B8', '#0D9F6E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.startGrad}
        >
          {tripActionBusy ? (
            <ActivityIndicator color="#022C22" />
          ) : (
            <>
              <View style={s.startIconCircle}>
                <Ionicons name="play" size={20} color="#022C22" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.startTitle}>START TRIP</Text>
                <Text style={s.startSub} numberOfLines={1}>
                  Fare begins after you start
                </Text>
              </View>
              <View style={s.startChevronCircle}>
                <Ionicons name="chevron-forward" size={18} color="#022C22" />
              </View>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.callBtn, !riderPhone && s.callBtnOff]}
        onPress={onCall}
        disabled={!riderPhone || !!tripActionBusy}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Call rider"
      >
        <LinearGradient
          colors={riderPhone ? ['#3B82F6', '#1D4ED8'] : ['rgba(51,65,85,0.55)', 'rgba(30,41,59,0.92)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.callInner}
        >
          <Ionicons name="call" size={20} color={riderPhone ? '#F8FAFC' : '#64748B'} />
          <Text style={[s.callTxt, !riderPhone && s.callTxtOff]}>CALL RIDER</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.cancelBtn}
        onPress={confirmCancel}
        disabled={!!tripActionBusy}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel="Cancel trip"
      >
        <Ionicons name="close-circle" size={20} color="#F87171" />
        <Text style={s.cancelTxt}>CANCEL TRIP</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    marginBottom: 10,
  },
  navBtnTxt: { flex: 1, fontSize: 14, fontWeight: '800', color: '#E0F2FE' },
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
    height: 110,
  },
  handleRail: { alignItems: 'center', marginBottom: 14 },
  handle: { width: 48, height: 4, borderRadius: 100 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: 'rgba(52,245,184,0.4)' },
  avatarPh: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(30,41,59,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  avatarPhTxt: { fontSize: 22, fontWeight: '900', color: '#94A3B8' },
  riderName: { fontSize: 19, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  ratingTxt: { fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  ratingNew: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  msgIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.38)',
  },
  msgIconBtnOff: { opacity: 0.55, borderColor: 'rgba(51,65,85,0.5)' },
  routeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.16)',
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34F5B8',
    zIndex: 1,
  },
  routeBarTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 0.15,
    zIndex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.48)',
    alignItems: 'center',
  },
  statCardFare: {
    borderColor: 'rgba(52,245,184,0.24)',
    backgroundColor: 'rgba(6,78,59,0.28)',
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIconWrapMint: { backgroundColor: 'rgba(52,245,184,0.12)' },
  statIconWrapSky: { backgroundColor: 'rgba(59,130,246,0.14)' },
  statIconWrapFare: { backgroundColor: 'rgba(52,245,184,0.16)' },
  statLbl: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.65,
    marginBottom: 4,
  },
  statVal: { fontSize: 13, fontWeight: '800', color: '#F1F5F9' },
  statValFare: { color: '#86EFAC', fontSize: 14 },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(2,6,23,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.45)',
  },
  vehicleThumb: {
    width: 44,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(30,41,59,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleTxt: { flex: 1, fontSize: 12, fontWeight: '600', color: '#94A3B8', lineHeight: 17 },
  startOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#22E5A0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  startGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
    gap: 12,
  },
  startIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(2,44,34,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: 1.1,
  },
  startSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.72)',
  },
  startChevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(2,44,34,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  callBtnOff: { opacity: 0.7 },
  callInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  callTxt: { fontSize: 14, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.8 },
  callTxtOff: { color: '#64748B' },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    backgroundColor: 'rgba(127,29,29,0.12)',
  },
  cancelTxt: { fontSize: 13, fontWeight: '800', color: '#FCA5A5', letterSpacing: 0.6 },
});
