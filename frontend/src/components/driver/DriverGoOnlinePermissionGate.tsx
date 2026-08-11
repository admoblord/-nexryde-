/**
 * GO ONLINE permission checklist + overlay explainer.
 * Shown instead of a failed connection attempt when required perms are missing.
 *
 * Background location uses the Play-required prominent disclosure host
 * (BackgroundLocationDisclosureHost) via item.request() — never jump straight
 * to the OS dialog from this checklist.
 */
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DriverPermissionItem, DriverPermissionPreflight } from '@/src/services/driverPermissionPreflight';
import { requestNativeOverlayPermission } from '@/src/services/driverNativeExperience';

type Props = {
  preflight: DriverPermissionPreflight | null;
  refreshing?: boolean;
  onRefresh: () => void;
  onRequestItem: (item: DriverPermissionItem) => void;
};

export function DriverGoOnlinePermissionGate({
  preflight,
  refreshing,
  onRefresh,
  onRequestItem,
}: Props) {
  const [overlayExplainerOpen, setOverlayExplainerOpen] = useState(false);
  if (!preflight || preflight.ready || Platform.OS === 'web') return null;

  const missing = preflight.missing;
  const overlayMissing = missing.some((m) => m.key === 'overlay');
  const bgLocMissing = missing.some((m) => m.key === 'background_location');

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#FBBF24" />
        <Text style={styles.title}>Grant these to go online</Text>
        {refreshing ? <ActivityIndicator size="small" color="#94A3B8" /> : null}
      </View>
      <Text style={styles.sub}>
        Permissions are set up before you connect — not during connection.
        {bgLocMissing
          ? ' Background location shows a full-screen disclosure first (Google Play requirement).'
          : ''}
      </Text>
      {preflight.items
        .filter((item) => !item.granted)
        .map((item) => {
          const blocked = item.required;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.row, blocked ? styles.rowBlocked : styles.rowSoft]}
              activeOpacity={0.85}
              onPress={() => {
                if (item.key === 'overlay') {
                  setOverlayExplainerOpen(true);
                  return;
                }
                onRequestItem(item);
              }}
            >
              <Ionicons name="alert-circle" size={18} color={blocked ? '#FBBF24' : '#93C5FD'} />
              <Text style={styles.rowLabel} numberOfLines={2}>
                {item.key === 'background_location'
                  ? 'Location all the time (background)'
                  : item.label}
                {!item.required ? ' (recommended)' : ''}
              </Text>
              <Text style={styles.rowAction}>Enable</Text>
            </TouchableOpacity>
          );
        })}
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.85}>
        <Ionicons name="refresh" size={16} color="#93C5FD" />
        <Text style={styles.refreshText}>I enabled them — check again</Text>
      </TouchableOpacity>

      <Modal
        visible={overlayExplainerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOverlayExplainerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons name="layers-outline" size={36} color="#00D47E" />
            <Text style={styles.modalTitle}>Enable Driver Bubble</Text>
            <Text style={styles.modalBody}>
              Turn on “Display over other apps” for NEXRYDE so ride requests appear over WhatsApp,
              Maps, and the home screen. You will open NEXRYDE’s overlay page — not the full app list.
            </Text>
            {overlayMissing ? (
              <Text style={styles.modalHint}>Status now: Not allowed — tap Enable below.</Text>
            ) : null}
            <TouchableOpacity
              style={styles.modalPrimary}
              activeOpacity={0.88}
              onPress={() => {
                setOverlayExplainerOpen(false);
                requestNativeOverlayPermission();
              }}
            >
              <Text style={styles.modalPrimaryText}>Open NEXRYDE overlay settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondary}
              onPress={() => setOverlayExplainerOpen(false)}
            >
              <Text style={styles.modalSecondaryText}>Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.28)',
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: '#FDE68A' },
  sub: { fontSize: 12, fontWeight: '500', color: '#94A3B8', lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  rowBlocked: { backgroundColor: 'rgba(15,23,42,0.55)' },
  rowSoft: { backgroundColor: 'rgba(15,23,42,0.35)' },
  rowLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#E2E8F0' },
  rowAction: { fontSize: 12, fontWeight: '800', color: '#00D47E' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  refreshText: { fontSize: 12, fontWeight: '700', color: '#93C5FD' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,14,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC', textAlign: 'center' },
  modalBody: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 21,
  },
  modalHint: { fontSize: 12, fontWeight: '700', color: '#FBBF24', textAlign: 'center' },
  modalPrimary: {
    marginTop: 6,
    width: '100%',
    backgroundColor: '#00D47E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalPrimaryText: { fontSize: 15, fontWeight: '800', color: '#022C22' },
  modalSecondary: { paddingVertical: 8 },
  modalSecondaryText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
});
