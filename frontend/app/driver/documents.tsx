import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

export default function DocumentsScreen() {
  const router = useRouter();
  const { useAppStore } = require('@/src/store/appStore');
  const { user } = useAppStore();
  const [documents, setDocuments] = React.useState([
    { id: 'nin', name: 'National ID (NIN)', status: 'not_uploaded', icon: 'id-card-outline' },
    { id: 'license', name: "Driver's License", status: 'not_uploaded', icon: 'card-outline' },
    { id: 'passport', name: 'Passport Photo', status: 'not_uploaded', icon: 'person-circle-outline' },
    { id: 'vehicle_reg', name: 'Vehicle Registration', status: 'not_uploaded', icon: 'car-outline' },
    { id: 'insurance', name: 'Insurance Certificate', status: 'not_uploaded', icon: 'shield-checkmark-outline' },
  ]);

  React.useEffect(() => {
    const loadDocs = async () => {
      if (!user?.id) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/documents`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          const docs = Array.isArray(data?.documents) ? data.documents : [];
          setDocuments(prev => prev.map(d => {
            const backendDoc = docs.find((x: any) =>
              x.id === d.id ||
              (d.id === 'license' && x.id === 'drivers_license') ||
              (d.id === 'passport' && x.id === 'passport_photo') ||
              (d.id === 'vehicle_reg' && x.id === 'vehicle_registration')
            );
            return {
              ...d,
              status: backendDoc?.status || d.status,
            };
          }));
        }
      } catch { /* keep defaults */ }
    };
    loadDocs();
  }, [user?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return COLORS.success;
      case 'pending': return COLORS.warning;
      case 'expired': return COLORS.error;
      default: return COLORS.gray400;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'verified': return 'Verified';
      case 'pending': return 'Pending Review';
      case 'expired': return 'Expired';
      default: return 'Not Uploaded';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Documents</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color={COLORS.info} />
          <Text style={styles.infoText}>
            Keep your compliance documents up to date to remain approved and eligible for ride requests.
          </Text>
        </View>

        {documents.map((doc) => (
          <TouchableOpacity 
            key={doc.id} 
            style={styles.documentCard}
            onPress={() => Alert.alert('Document Status', `${doc.name}: ${getStatusText(doc.status)}`)}
          >
            <View style={[styles.iconWrap, { backgroundColor: getStatusColor(doc.status) + '20' }]}>
              <Ionicons name={doc.icon as any} size={24} color={getStatusColor(doc.status)} />
            </View>
            <View style={styles.documentInfo}>
              <Text style={styles.documentName}>{doc.name}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(doc.status) }]} />
                <Text style={[styles.statusText, { color: getStatusColor(doc.status) }]}>
                  {getStatusText(doc.status)}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity 
          style={styles.updateButton}
          onPress={() => router.push({
            pathname: '/(auth)/driver-documents',
            params: {
              driver_id: user?.id,
              phone: user?.phone,
              name: user?.name || '',
              email: user?.email || '',
            },
          } as any)}
        >
          <Ionicons name="cloud-upload-outline" size={20} color={COLORS.white} />
          <Text style={styles.updateButtonText}>Update Documents</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  content: {
    padding: SPACING.lg,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.infoSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.info,
    lineHeight: 20,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  documentName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.xs,
  },
  statusText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  updateButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
