import React, { useMemo } from 'react';
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

export type DriverArrivedPickupDockProps = {
  riderName: string;
  riderPhoto: string | null;
  ratingAvg: number | null;
  ratingTrips: number | null;
  isNewRider: boolean;
  /** Seconds since driver marked arrived */
  waitingSec: number;
  pickupShort: string;
  /** Secondary line, e.g. "Near …" */
  pickupDetailLine: string;
  tripActionBusy: boolean;
  riderPhone: string | null;
  canMessage: boolean;
  /** Opens verify / start flow (same as previous “Enter pick-up code” / Start trip). */
  onImHere: () => void;
  onCall: () => void;
  onMessage: () => void;
  onSafetyPress: () => void;
};

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return 'Rider';
  return t.split(/\s+/)[0] || t;
}

function formatWaitingParts(totalSec: number): { min: number; sec: string } {
  const s = Math.max(0, Math.floor(totalSec));
  return { min: Math.floor(s / 60), sec: String(s % 60).padStart(2, '0') };
}

export default function DriverArrivedPickupDock({
  riderName,
  riderPhoto,
  ratingAvg,
  ratingTrips,
  isNewRider,
  waitingSec,
  pickupShort,
  pickupDetailLine,
  tripActionBusy,
  riderPhone,
  canMessage,
  onImHere,
  onCall,
  onMessage,
  onSafetyPress,
}: DriverArrivedPickupDockProps) {
  const initial = firstName(riderName).charAt(0).toUpperCase() || 'R';
  const { min: waitMin, sec: waitSec } = formatWaitingParts(waitingSec);

  const ringProgress = useMemo(() => {
    const cap = 600;
    return Math.min(1, waitingSec / cap);
  }, [waitingSec]);

  const imHereSub = "Verify pickup code with your rider, then start when they're in.";

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

      <View style={s.titleRow}>
        <Text style={s.titleMain} numberOfLines={1}>
          Waiting for {firstName(riderName)}
        </Text>
        <View style={s.waitBadge}>
          <Ionicons name="time-outline" size={13} color="#86EFAC" />
          <Text style={s.waitBadgeTxt}>Please wait</Text>
        </View>
      </View>

      <View style={s.profileBlock}>
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
              <Text style={s.ratingTxt}>
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

        <View style={s.timerCol}>
          <Text style={s.timerLabel}>Waiting time</Text>
          <View style={s.timerRingOuter}>
            <View
              style={[
                s.timerRingTrack,
                {
                  borderColor: `rgba(52,245,184,${0.22 + ringProgress * 0.55})`,
                },
              ]}
            />
            <View style={s.timerRingInner}>
              <Text style={s.timerBig}>
                <Text style={s.timerBigEm}>{waitMin}</Text>
                <Text style={s.timerUnit}> min </Text>
                <Text style={s.timerBigEm}>{waitSec}</Text>
                <Text style={s.timerUnit}> sec</Text>
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={s.pickupCard}>
        <View style={s.pickupRow}>
          <Ionicons name="location" size={18} color="#4ADE80" />
          <Text style={s.pickupStrong} numberOfLines={1}>
            Pickup:{' '}
            <Text style={s.pickupWhite}>{pickupShort || 'Pickup location'}</Text>
          </Text>
        </View>
        {pickupDetailLine ? (
          <Text style={s.pickupSub} numberOfLines={2}>
            {pickupDetailLine}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[s.imHereOuter, tripActionBusy && { opacity: 0.65 }]}
        onPress={onImHere}
        disabled={!!tripActionBusy}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Continue to verify rider or start trip"
      >
        <LinearGradient
          colors={['#5DFFC7', '#34F5B8', '#0D9F6E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.imHereGrad}
        >
          {tripActionBusy ? (
            <ActivityIndicator color="#022C22" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#022C22" />
              <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                <Text style={s.imHereTitle}>{"I'M HERE"}</Text>
                <Text style={s.imHereSub} numberOfLines={1}>
                  {imHereSub}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(2,44,34,0.45)" />
              <Ionicons name="chevron-forward" size={22} color="rgba(2,44,34,0.25)" style={{ marginLeft: -14 }} />
            </>
          )}
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
            style={s.commInner}
          >
            <Ionicons name="call" size={20} color={riderPhone ? '#F8FAFC' : '#64748B'} />
            <Text style={[s.commTxt, !riderPhone && s.commTxtMuted]} numberOfLines={1}>
              CALL RIDER
            </Text>
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
            style={s.commInner}
          >
            <Ionicons name="chatbubble-ellipses" size={19} color={canMessage ? '#E0F2FE' : '#64748B'} />
            <Text style={[s.commTxt, !canMessage && s.commTxtMuted]} numberOfLines={2}>
              MESSAGE RIDER
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={s.safetyFoot}
        onPress={onSafetyPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Open safety"
      >
        <Ionicons name="shield-checkmark" size={16} color="#4ADE80" style={{ marginRight: 8 }} />
        <Text style={s.safetyFootTxt}>
          <Text style={s.safetyFootStrong}>Safety tip: </Text>
          Verify the rider before starting trip
        </Text>
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
    height: 120,
  },
  handleRail: { alignItems: 'center', marginBottom: 14 },
  handle: { width: 48, height: 4, borderRadius: 100 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  titleMain: { flex: 1, fontSize: 19, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.35 },
  waitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.32)',
    backgroundColor: 'rgba(52,245,184,0.1)',
  },
  waitBadgeTxt: { fontSize: 11, fontWeight: '900', color: '#BBF7D0', letterSpacing: 0.2 },
  profileBlock: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
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
  riderName: { fontSize: 18, fontWeight: '900', color: '#F8FAFC', letterSpacing: -0.3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  ratingTxt: { fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  ratingNew: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  timerCol: { alignItems: 'flex-end' },
  timerLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', marginBottom: 4, letterSpacing: 0.4 },
  timerRingOuter: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerRingTrack: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 50,
    borderWidth: 3,
  },
  timerRingInner: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(15,23,42,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
  },
  timerBig: { textAlign: 'center' },
  timerBigEm: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', fontVariant: ['tabular-nums'] },
  timerUnit: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  pickupCard: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginBottom: 16,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.18)',
  },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickupStrong: { flex: 1, fontSize: 14, fontWeight: '800', color: '#4ADE80' },
  pickupWhite: { color: '#F8FAFC', fontWeight: '900' },
  pickupSub: { marginTop: 6, fontSize: 12, fontWeight: '600', color: '#94A3B8', lineHeight: 17, paddingLeft: 26 },
  imHereOuter: {
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
  imHereGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 10,
  },
  imHereTitle: { fontSize: 16, fontWeight: '900', color: '#022C22', letterSpacing: 1 },
  imHereSub: { marginTop: 2, fontSize: 11, fontWeight: '700', color: 'rgba(2,44,34,0.72)' },
  commsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  commBtnMuted: { opacity: 0.55 },
  commInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 6,
  },
  commTxt: { fontSize: 10, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0.25, textAlign: 'center' },
  commTxtMuted: { color: '#94A3B8' },
  safetyFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.22)',
  },
  safetyFootTxt: { flex: 1, fontSize: 12, fontWeight: '600', color: '#CBD5E1', lineHeight: 17 },
  safetyFootStrong: { fontWeight: '900', color: '#86EFAC' },
});
