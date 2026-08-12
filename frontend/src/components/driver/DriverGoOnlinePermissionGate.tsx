/**
 * GO ONLINE permission checklist + overlay explainer.
 * Shown instead of a failed connection attempt when required perms are missing.
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
import { colors, alpha, radius, type as TYPE } from '@/src/theme/tokens';

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

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#FBBF24" />
        <Text style={styles.title}>Grant these to go online</Text>
        {refreshing ? <ActivityIndicator size="small" color="#94A3B8" /> : null}
      </View>
      <Text style={styles.sub}>
        Permissions are set up before you connect — not during connection.
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
                {item.label}
                {!item.required ? ' (recommended)' : ''}
              </Text>
              <Text style={styles.rowAction}>Enable</Text>
            </TouchableOpacity>
          );
        })}
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.85}>
        <Ionicons name="refresh" size={16} color={colors.blue} />
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
            <Ionicons name="layers-outline" size={36} color={colors.green} />
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
    borderRadius: radius.button,
    backgroundColor: alpha.amberSoft,
    borderWidth: 1,
    borderColor: colors.amber,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, ...TYPE.bodyBold, color: colors.textPrimary },
  sub: { ...TYPE.caption, color: colors.textSecondary, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.bg,
  },
  rowBlocked: { backgroundColor: colors.bgMuted },
  rowSoft: { backgroundColor: colors.bgMuted },
  rowLabel: { flex: 1, ...TYPE.caption, fontWeight: '600', color: colors.textPrimary },
  rowAction: { ...TYPE.label, color: colors.greenDark },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  refreshText: { ...TYPE.label, color: colors.blue },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.card,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: { ...TYPE.title, color: colors.textPrimary, textAlign: 'center' },
  modalBody: {
    ...TYPE.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  modalHint: { ...TYPE.label, color: colors.amber, textAlign: 'center' },
  modalPrimary: {
    marginTop: 6,
    width: '100%',
    backgroundColor: colors.green,
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalPrimaryText: { ...TYPE.bodyBold, color: colors.textOnGreen },
  modalSecondary: { paddingVertical: 8 },
  modalSecondaryText: { ...TYPE.caption, color: colors.textSecondary },
});
