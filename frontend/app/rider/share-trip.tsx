/**
 * Share Trip — premium live-tracking share sheet with real trip data from backend.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Linking,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useEmergencyContacts } from '@/src/hooks/useEmergencyContacts';
import { useTripShareData } from '@/src/hooks/useTripShareData';
import { triggerSOS } from '@/src/services/api';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { formatEtaClockFromSeconds } from '@/src/utils/onTripDisplay';
import { formatDriverDisplayField } from '@/src/utils/tripCoords';
import { driverAvatarSources } from '@/src/utils/tripProfilePhotos';
import { getTripDriverCache } from '@/src/utils/tripDriverCache';

const NEON = '#22C55E';
const CYAN = '#06B6D4';
const BG = '#0B1220';

function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m}:${s} ${period}`;
}

function shortAddress(addr: string | undefined | null, max = 48): string {
  const t = String(addr || '').trim();
  if (!t) return '—';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export { openShareTrip } from '@/src/utils/openShareTrip';

export default function ShareTripScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const { currentTrip } = useAppStore();
  const { userId: riderId, canCallAuthedApi } = useAuthedUserId();

  const tripId = (params.tripId as string) || currentTrip?.id || null;

  const { shareData, shareLink, loading, refreshing, error, lastRefresh, reload } = useTripShareData(
    tripId,
    currentTrip,
    getTripDriverCache(),
  );

  const [copied, setCopied] = useState(false);
  const [sosBusy, setSosBusy] = useState(false);

  const { contacts: emergencyContacts, loading: loadingContacts, refresh: refreshEmergencyContacts } =
    useEmergencyContacts(canCallAuthedApi ? riderId : undefined);

  const driverPhotos = useMemo(
    () =>
      driverAvatarSources({
        name: shareData?.driver?.name,
        face_image: shareData?.driver?.face_image ?? shareData?.driver?.image_url,
        profile_image: shareData?.driver?.profile_image ?? shareData?.driver?.image_url,
      }),
    [shareData?.driver],
  );

  const driverName = formatDriverDisplayField(shareData?.driver?.name) || 'Your driver';
  const vehicleLine = useMemo(() => {
    const make = formatDriverDisplayField(shareData?.vehicle?.make);
    const color = formatDriverDisplayField(shareData?.vehicle?.color);
    return [make, color].filter(Boolean).join(' · ') || 'Vehicle';
  }, [shareData?.vehicle]);
  const plate = formatDriverDisplayField(shareData?.vehicle?.license_plate);
  const distanceLabel = useMemo(() => {
    const km = Number(shareData?.distance_km);
    if (!Number.isFinite(km)) return '—';
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }, [shareData?.distance_km]);
  const etaClock = formatEtaClockFromSeconds(shareData?.eta_seconds ?? null);
  const startedLabel = formatClockTime(shareData?.started_at);
  const lastUpdateLabel = useMemo(() => {
    if (!lastRefresh) return 'Just now';
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (diff < 8) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    return lastRefresh.toLocaleTimeString();
  }, [lastRefresh, refreshing]);

  const shareMessage = `Track my NEXRYDE trip in real time: ${shareLink}\nDriver: ${driverName}\nVehicle: ${plate || vehicleLine}`;

  const handleCopyLink = async () => {
    if (!shareLink) {
      Alert.alert('No link', 'Start or join an active trip to get a tracking link.');
      return;
    }
    await Clipboard.setStringAsync(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuickShare = async () => {
    if (!shareLink) {
      Alert.alert('No link', 'No active trip tracking link yet.');
      return;
    }
    try {
      await Share.share({ message: shareMessage, title: 'Share Trip', url: shareLink });
    } catch {
      /* cancelled */
    }
  };

  const handleShareWhatsApp = async () => {
    if (!shareLink) return;
    const url = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
    else await handleQuickShare();
  };

  const handleEmergency = async () => {
    if (!tripId || sosBusy) return;
    setSosBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let lat = 0;
      let lng = 0;
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
      await triggerSOS({ trip_id: tripId, location_lat: lat, location_lng: lng });
      Alert.alert('Emergency sent', 'NEXRYDE safety team and your contacts have been alerted.');
    } catch {
      Alert.alert('Could not send SOS', 'Try again or call emergency services directly.');
    } finally {
      setSosBusy(false);
    }
  };

  const handleShareSms = (contact: { name: string; phone: string }) => {
    if (!shareLink) return;
    const smsUrl =
      Platform.OS === 'ios'
        ? `sms:${contact.phone}&body=${encodeURIComponent(shareMessage)}`
        : `sms:${contact.phone}?body=${encodeURIComponent(shareMessage)}`;
    void Linking.openURL(smsUrl);
  };

  if (!tripId) {
    return (
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <View style={styles.centered}>
          <Ionicons name="car-outline" size={48} color="#64748B" />
          <Text style={styles.emptyTitle}>No active trip</Text>
          <Text style={styles.emptySub}>Book a ride to share live tracking with friends.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !shareData) {
    return (
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={NEON} />
          <Text style={styles.loadingTxt}>Loading trip data…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]} edges={['left', 'right']}>
      <Header onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollInner, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void reload();
              void refreshEmergencyContacts();
            }}
            tintColor={NEON}
          />
        }
      >
        {error && !refreshing && !shareData?.eta_seconds && !shareData?.driver?.name ? (
          <View style={styles.warnBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color="#FBBF24" />
            <Text style={styles.warnTxt}>Showing last known trip details — pull to refresh</Text>
          </View>
        ) : null}

        <View style={styles.liveCard}>
          <LinearGradient
            colors={['rgba(34,197,94,0.35)', 'rgba(6,182,212,0.12)', 'rgba(15,23,42,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.liveRow}>
            <View style={styles.liveLeft}>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTitle}>Live Tracking Active</Text>
              </View>
              <Text style={styles.liveSub}>Your location is being shared in real-time</Text>
              <View style={styles.lastUpRow}>
                <Ionicons name="time-outline" size={14} color={NEON} />
                <Text style={styles.lastUpTxt}>Last updated: {lastUpdateLabel}</Text>
              </View>
            </View>
            <View style={styles.miniMap}>
              <Ionicons name="map" size={28} color="rgba(6,182,212,0.5)" />
              <Ionicons name="car-sport" size={22} color={CYAN} style={styles.miniCar} />
            </View>
          </View>
        </View>

        <SectionTitle icon="location" color="#EF4444" title="Current Trip" />
        <View style={styles.tripCard}>
          <View style={styles.driverTopRow}>
            <TripProfileAvatar
              size={64}
              faceUri={driverPhotos.face}
              profileUri={driverPhotos.profile}
              borderColor={NEON}
              accessibilityLabel={`Photo of ${driverName}`}
              showOnlineDot
            />
            <View style={styles.driverMid}>
              <Text style={styles.driverName} numberOfLines={1}>
                {driverName}
              </Text>
              <Text style={styles.vehicleLine} numberOfLines={2}>
                {vehicleLine}
              </Text>
              {plate ? (
                <View style={styles.plate}>
                  <Text style={styles.plateTxt}>{plate}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.startBox}>
              <Ionicons name="time-outline" size={16} color="#94A3B8" />
              <Text style={styles.startLbl}>Started at</Text>
              <Text style={styles.startVal}>{startedLabel}</Text>
            </View>
          </View>

          <View style={styles.routeCol}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={styles.routeTextCol}>
                <Text style={styles.routeLbl}>Pickup Location</Text>
                <Text style={styles.routeVal} numberOfLines={2}>
                  {shortAddress(shareData?.pickup_address || currentTrip?.pickup_location?.address)}
                </Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: CYAN }]} />
              <View style={styles.routeTextCol}>
                <Text style={styles.routeLbl}>Destination</Text>
                <Text style={styles.routeVal} numberOfLines={2}>
                  {shortAddress(
                    shareData?.destination_address || currentTrip?.dropoff_location?.address,
                  )}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Ionicons name="git-network-outline" size={18} color="#94A3B8" />
              <Text style={styles.statLbl}>Distance</Text>
              <Text style={styles.statVal}>{distanceLabel}</Text>
            </View>
            <View style={styles.statBox}>
              <Ionicons name="alarm-outline" size={18} color="#94A3B8" />
              <Text style={styles.statLbl}>Est. Arrival</Text>
              <Text style={styles.statVal}>{etaClock}</Text>
            </View>
          </View>
        </View>

        <SectionTitle icon="link" color={NEON} title="Share Link" />
        <View style={styles.linkCard}>
          <Text style={styles.linkTxt} numberOfLines={1} selectable>
            {shareLink || 'Generating link…'}
          </Text>
          <TouchableOpacity onPress={() => void handleCopyLink()} activeOpacity={0.9}>
            <LinearGradient colors={[NEON, CYAN]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.copyBtn}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color="#022C22" />
              <Text style={styles.copyLbl}>{copied ? 'Copied!' : 'Copy Link'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <Text style={styles.linkHint}>Anyone with this link can track your trip in real-time.</Text>

        <SectionTitle icon="share-social" color={NEON} title="Quick Share" />
        <View style={styles.quickGrid}>
          <QuickShareBtn label="WhatsApp" colors={['#25D366', '#128C7E']} icon="logo-whatsapp" onPress={() => void handleShareWhatsApp()} />
          <QuickShareBtn label="Facebook" colors={['#1877F2', '#0C5DC7']} icon="logo-facebook" onPress={() => void handleQuickShare()} />
          <QuickShareBtn label="Snapchat" colors={['#FFFC00', '#F59E0B']} icon="logo-snapchat" labelColor="#0F172A" onPress={() => void handleQuickShare()} />
          <QuickShareBtn label="Messenger" colors={['#0084FF', '#006AFF']} icon="chatbubble-ellipses" onPress={() => void handleQuickShare()} />
        </View>

        <SectionTitle icon="shield" color="#EF4444" title="Emergency Contacts" />
        <View style={styles.emergencyCard}>
          <Text style={styles.emergencyDesc}>
            Share your trip with trusted contacts or request immediate help.
          </Text>
          <TouchableOpacity
            style={styles.sosBtn}
            onPress={() => void handleEmergency()}
            disabled={sosBusy}
            activeOpacity={0.9}
          >
            <View style={styles.sosCircle}>
              <Text style={styles.sosCircleTxt}>SOS</Text>
            </View>
            <View style={styles.sosMid}>
              <Text style={styles.sosTitle}>Emergency Help</Text>
              <Text style={styles.sosSub}>Get immediate assistance</Text>
            </View>
            {sosBusy ? (
              <ActivityIndicator color="#FCA5A5" />
            ) : (
              <Ionicons name="chevron-forward" size={22} color="#FCA5A5" />
            )}
          </TouchableOpacity>
          {emergencyContacts.length > 0 ? (
            emergencyContacts.slice(0, 3).map((c, i) => (
              <TouchableOpacity
                key={`${c.phone}-${i}`}
                style={styles.contactRow}
                onPress={() => handleShareSms(c)}
              >
                <Ionicons name="person-circle-outline" size={22} color="#94A3B8" />
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactShare}>Share</Text>
              </TouchableOpacity>
            ))
          ) : (
            <TouchableOpacity style={styles.addContacts} onPress={() => router.push('/(rider-tabs)/rider-safety' as any)}>
              <Text style={styles.addContactsTxt}>
                {loadingContacts ? 'Loading contacts…' : 'Add emergency contacts'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <LinearGradient colors={[NEON, CYAN]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.footerGrad}>
            <Text style={styles.footerBrand}>NEXRYDE</Text>
          </LinearGradient>
          <Text style={styles.footerTag}>• RIDE. CONNECT. TRUST. •</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={22} color="#F8FAFC" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Share Trip</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function SectionTitle({
  icon,
  color,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHead}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function QuickShareBtn({
  label,
  colors,
  icon,
  labelColor = '#FFF',
  onPress,
}: {
  label: string;
  colors: [string, string];
  icon: keyof typeof Ionicons.glyphMap;
  labelColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickBtnWrap} onPress={onPress} activeOpacity={0.88}>
      <LinearGradient colors={colors} style={styles.quickBtn}>
        <Ionicons name={icon} size={26} color={labelColor === '#FFF' ? '#FFF' : '#0F172A'} />
        <Text style={[styles.quickLbl, { color: labelColor }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSpacer: { width: 44 },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 16, paddingTop: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingTxt: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  emptySub: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  warnTxt: { fontSize: 12, fontWeight: '600', color: '#FBBF24', flex: 1 },
  liveCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    padding: 16,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center' },
  liveLeft: { flex: 1, minWidth: 0 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: NEON },
  liveTitle: { fontSize: 16, fontWeight: '800', color: NEON },
  liveSub: { fontSize: 13, color: '#CBD5E1', marginBottom: 10 },
  lastUpRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastUpTxt: { fontSize: 12, fontWeight: '600', color: NEON },
  miniMap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCar: { position: 'absolute', bottom: 10, right: 10 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  tripCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    padding: 16,
    marginBottom: 20,
  },
  driverTopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  driverMid: { flex: 1, minWidth: 0 },
  driverName: { fontSize: 17, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  vehicleLine: { fontSize: 12, color: '#94A3B8', marginBottom: 8 },
  plate: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  plateTxt: { fontSize: 11, fontWeight: '800', color: '#0F172A', letterSpacing: 0.6 },
  startBox: { alignItems: 'flex-end', maxWidth: 108 },
  startLbl: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  startVal: { fontSize: 11, fontWeight: '700', color: NEON, textAlign: 'right' },
  routeCol: { marginBottom: 14 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginLeft: 4,
    marginVertical: 4,
  },
  routeTextCol: { flex: 1 },
  routeLbl: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginBottom: 2 },
  routeVal: { fontSize: 13, fontWeight: '700', color: '#F1F5F9' },
  statRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 4,
  },
  statLbl: { fontSize: 10, fontWeight: '600', color: '#94A3B8' },
  statVal: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    padding: 12,
    marginBottom: 8,
  },
  linkTxt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: NEON,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  copyLbl: { fontSize: 12, fontWeight: '800', color: '#022C22' },
  linkHint: { fontSize: 12, color: '#64748B', marginBottom: 20 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  quickBtnWrap: { width: '47%', flexGrow: 1 },
  quickBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickLbl: { fontSize: 12, fontWeight: '700' },
  emergencyCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    padding: 14,
    marginBottom: 24,
  },
  emergencyDesc: { fontSize: 12, color: '#94A3B8', marginBottom: 12, lineHeight: 18 },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    padding: 12,
    marginBottom: 10,
  },
  sosCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosCircleTxt: { fontSize: 12, fontWeight: '900', color: '#FFF' },
  sosMid: { flex: 1 },
  sosTitle: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  sosSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  contactName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#E2E8F0' },
  contactShare: { fontSize: 12, fontWeight: '700', color: CYAN },
  addContacts: { paddingVertical: 12, alignItems: 'center' },
  addContactsTxt: { fontSize: 13, fontWeight: '700', color: NEON },
  footer: { alignItems: 'center', paddingTop: 8 },
  footerGrad: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 8 },
  footerBrand: { fontSize: 20, fontWeight: '900', color: '#022C22', letterSpacing: 2 },
  footerTag: {
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 1.2,
    marginTop: 8,
    fontWeight: '600',
  },
});
