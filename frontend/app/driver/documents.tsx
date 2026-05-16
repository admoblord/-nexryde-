import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { BACKEND_URL, getAuthHeaders, getDriverProfile } from '@/src/services/api';
import { driverDocumentsRouteParams } from '@/src/utils/driverOnboardingNav';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useFlowLayout } from '@/src/constants/flowLayout';

const DOC_DESCRIPTIONS: Record<string, string> = {
  nin: 'National Identification Number — proves your Nigerian citizenship',
  drivers_license: 'Valid driving licence issued by FRSC Nigeria',
  passport_photo: 'Clear recent photo showing your face, no filters',
  vehicle_registration: 'Official document showing you own or are authorised to use the vehicle',
  vehicle_license: 'Vehicle licence document issued by the licensing authority',
  road_worthiness: 'Certificate confirming the vehicle is safe to operate on roads',
  insurance: 'Third-party or comprehensive motor insurance certificate',
  vehicle_front: 'Photo of the front of your vehicle in clear daylight',
  vehicle_interior: 'Photo showing a clean, passenger-ready interior',
  vehicle_ac: 'Photo of the air conditioning unit/vents inside the vehicle',
};

function DocSkeleton() {
  const anim = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.45, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View style={[skDoc.row, { opacity: anim }]}>
      <View style={[skDoc.icon]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[skDoc.bar, { width: '60%' }]} />
        <View style={[skDoc.bar, { width: '80%', height: 10 }]} />
      </View>
      <View style={[skDoc.bar, { width: 64, height: 24, borderRadius: 999 }]} />
    </Animated.View>
  );
}
const skDoc = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  icon: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#E2E8F0' },
  bar: { height: 14, borderRadius: 6, backgroundColor: '#E2E8F0' },
});

interface DocStatus {
  id: string;
  name: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  status: 'verified' | 'pending' | 'not_submitted' | 'expired';
  detail?: string;
}

export default function DocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { user, userId: driverId } = useAuthedUserId();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [ninVerified, setNinVerified] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [documents, setDocuments] = useState<DocStatus[]>([
    { id: 'nin', name: 'National ID (NIN)', icon: 'card', status: 'not_submitted' },
    { id: 'drivers_license', name: "Driver's License", icon: 'car', status: 'not_submitted' },
    { id: 'passport_photo', name: 'Passport Photo', icon: 'person', status: 'not_submitted' },
    { id: 'vehicle_registration', name: 'Vehicle Registration', icon: 'document-text', status: 'not_submitted' },
    { id: 'vehicle_license', name: 'Vehicle License Document', icon: 'receipt', status: 'not_submitted' },
    { id: 'road_worthiness', name: 'Road Worthiness Certificate', icon: 'construct', status: 'not_submitted' },
    { id: 'insurance', name: 'Vehicle Insurance', icon: 'umbrella', status: 'not_submitted' },
    { id: 'vehicle_front', name: 'Vehicle Photo (Front)', icon: 'camera', status: 'not_submitted' },
    { id: 'vehicle_interior', name: 'Vehicle Interior Photo', icon: 'image', status: 'not_submitted' },
    { id: 'vehicle_ac', name: 'AC System Photo', icon: 'snow', status: 'not_submitted' },
  ]);

  const loadData = useCallback(async () => {
    if (!driverId) return;
    try {
      // Fetch enriched profile (includes nin_verified, document_statuses, vehicles)
      const profileRes = await getDriverProfile(driverId);
      const profile = profileRes.data as any;
      const approved = profile?.verification_status === 'approved';
      const ninOk: boolean = Boolean(profile?.nin_verified);
      setIsApproved(approved);
      setNinVerified(ninOk);
      setVerificationStatus(profile?.verification_status || '');

      // Build status per document from the archived verification record
      const docsRes = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/documents`, {
        headers: getAuthHeaders(),
      });
      const docsData = docsRes.ok ? await docsRes.json() : {};
      const archived: Record<string, any> = (docsData?.documents) || {};

      setDocuments(prev => prev.map((doc) => {
        // NIN: special case — verified if profile says so
        if (doc.id === 'nin') {
          if (ninOk) return { ...doc, status: 'verified', detail: 'Identity confirmed' };
          const hasNin = Boolean(profile?.nin_number || profile?.nin);
          return { ...doc, status: hasNin ? 'pending' : 'not_submitted' };
        }
        // All others: if approved → verified; if in archived with a status → use it; else not_submitted
        if (approved) return { ...doc, status: 'verified' };
        const archived_doc = archived[doc.id];
        if (archived_doc?.status) return { ...doc, status: archived_doc.status };
        // Check if any file was uploaded (archived has the doc key)
        if (archived[doc.id]) return { ...doc, status: 'pending' };
        return doc;
      }));
    } catch {
      // Keep defaults on error.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driverId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const getStatusColor = (status: DocStatus['status']) => {
    switch (status) {
      case 'verified': return '#16A34A';
      case 'pending': return '#D97706';
      case 'expired': return COLORS.error;
      default: return COLORS.gray400;
    }
  };

  const getStatusBg = (status: DocStatus['status']) => {
    switch (status) {
      case 'verified': return '#D1FAE5';
      case 'pending': return '#FEF3C7';
      case 'expired': return '#FEE2E2';
      default: return COLORS.gray100;
    }
  };

  const getStatusText = (status: DocStatus['status']) => {
    switch (status) {
      case 'verified': return 'Verified';
      case 'pending': return 'Under Review';
      case 'expired': return 'Expired';
      default: return 'Not Uploaded';
    }
  };

  const getStatusIcon = (status: DocStatus['status']): React.ComponentProps<typeof Ionicons>['name'] => {
    switch (status) {
      case 'verified': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'expired': return 'alert-circle';
      default: return 'cloud-upload-outline';
    }
  };

  const verifiedCount = documents.filter(d => d.status === 'verified').length;
  const allVerified = verifiedCount === documents.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Documents</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: flow.padH,
            paddingBottom: Math.max(insets.bottom, 24) + 16,
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
            gap: flow.sectionGap * 0.5,
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <LinearGradient
          colors={allVerified ? ['#059669', '#10B981'] : isApproved ? ['#059669', '#10B981'] : verifiedCount > 0 ? ['#D97706', '#F59E0B'] : ['#1E3A5F', '#2563EB']}
          style={styles.statusBanner}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons
            name={isApproved ? 'shield-checkmark' : 'time'}
            size={32}
            color={COLORS.white}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {isApproved
                ? 'All Documents Verified'
                : verificationStatus === 'pending_review' || verificationStatus === 'pending'
                  ? 'Documents Under Review'
                  : 'Verification Pending'}
            </Text>
            <Text style={styles.bannerSubtitle}>
              {isApproved
                ? `${verifiedCount}/${documents.length} documents confirmed by NEXRYDE`
                : `${verifiedCount}/${documents.length} verified · Your documents are being reviewed`}
            </Text>
          </View>
        </LinearGradient>

        {/* NIN special card */}
        {ninVerified && (
          <View style={styles.ninVerifiedCard}>
            <View style={styles.ninVerifiedLeft}>
              <View style={[styles.ninIcon, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
              </View>
              <View>
                <Text style={styles.ninVerifiedTitle}>National ID (NIN)</Text>
                <Text style={styles.ninVerifiedSub}>Identity Verified</Text>
              </View>
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
            </View>
          </View>
        )}

        {/* Document list */}
        <Text style={styles.sectionTitle}>Document Status</Text>
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => <DocSkeleton key={i} />)}
          </>
        ) : (
          documents.map((doc, idx) => (
            <View
              key={doc.id}
              style={[
                styles.documentCard,
                doc.status === 'verified' && styles.documentCardVerified,
                idx === documents.length - 1 && { marginBottom: 0 },
              ]}
            >
              <View style={[styles.docIconWrap, { backgroundColor: getStatusBg(doc.status) }]}>
                <Ionicons name={doc.icon} size={22} color={getStatusColor(doc.status)} />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docName}>{doc.name}</Text>
                <Text style={styles.docDesc} numberOfLines={2}>
                  {doc.detail
                    ? doc.detail
                    : DOC_DESCRIPTIONS[doc.id] ?? ''}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusBg(doc.status) }]}>
                <Ionicons name={getStatusIcon(doc.status)} size={13} color={getStatusColor(doc.status)} />
                <Text style={[styles.statusBadgeText, { color: getStatusColor(doc.status) }]}>
                  {getStatusText(doc.status)}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Update documents CTA — only show if not approved */}
        {!isApproved && (
          <TouchableOpacity
            style={styles.updateButton}
            onPress={() => {
              if (!driverId || !user) return;
              router.push({
                pathname: '/(auth)/driver-documents',
                params: driverDocumentsRouteParams(user),
              });
            }}
            activeOpacity={0.88}
          >
            <Ionicons name="cloud-upload-outline" size={20} color={COLORS.white} />
            <Text style={styles.updateButtonText}>
              {verificationStatus ? 'Update / Resubmit Documents' : 'Upload Documents'}
            </Text>
          </TouchableOpacity>
        )}

        {isApproved && (
          <View style={styles.approvedNote}>
            <Ionicons name="lock-closed" size={16} color="#059669" />
            <Text style={styles.approvedNoteText}>
              Your driver account is fully verified. Documents are stored securely.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: { padding: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray800 },
  content: { paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  bannerTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.white },
  bannerSubtitle: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  ninVerifiedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
  },
  ninVerifiedLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ninIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ninVerifiedTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: '#065F46' },
  ninVerifiedSub: { fontSize: FONT_SIZE.sm, color: '#059669', fontWeight: '600', marginTop: 2 },
  verifiedBadge: {
    backgroundColor: '#16A34A',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  verifiedBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.white, letterSpacing: 0.5 },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.gray500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
    justifyContent: 'center',
  },
  loadingText: { fontSize: FONT_SIZE.sm, color: COLORS.gray400 },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  documentCardVerified: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F9FFFE',
  },
  docIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo: { flex: 1 },
  docName: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray800 },
  docDetail: { fontSize: FONT_SIZE.xs, fontWeight: '600', marginTop: 2 },
  docDesc: { fontSize: 11, color: COLORS.gray400, marginTop: 2, lineHeight: 15 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.xl,
    gap: SPACING.sm,
    ...SHADOWS.md,
  },
  updateButtonText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
  approvedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xl,
    padding: SPACING.md,
    backgroundColor: '#F0FDF4',
    borderRadius: BORDER_RADIUS.lg,
  },
  approvedNoteText: { fontSize: FONT_SIZE.sm, color: '#059669', fontWeight: '600' },
});
