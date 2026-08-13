/**
 * Asks the driver which app should guide this leg — NEXRYDE's own navigation,
 * Google Maps, Apple Maps (iOS) or Waze.
 *
 * Shown until the driver sets a default; after that Navigate opens the default
 * straight away and this sheet only reappears when they ask for it. The current
 * default is tagged so it is obvious which app Navigate will open.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  listNavigationAppChoices,
  orderChoicesByLastUsed,
  readDefaultNavigationApp,
  readLastUsedNavigationApp,
  type NavigationAppChoice,
  type NavigationAppId,
} from '@/src/utils/driverNavigationApps';

type Props = {
  visible: boolean;
  /** Where the driver is heading, e.g. "Pickup — 12 Adeola Odeku". */
  destinationLabel?: string | null;
  onSelect: (id: NavigationAppId) => void;
  onClose: () => void;
};

export default function DriverNavigationAppSheet({
  visible,
  destinationLabel,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [choices, setChoices] = useState<NavigationAppChoice[]>(() => listNavigationAppChoices());
  const [lastUsed, setLastUsed] = useState<NavigationAppId | null>(null);
  const [defaultApp, setDefaultApp] = useState<NavigationAppId | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let cancelled = false;
    void Promise.all([readLastUsedNavigationApp(), readDefaultNavigationApp()]).then(
      ([stored, preferred]) => {
        if (cancelled) return;
        setLastUsed(stored);
        setDefaultApp(preferred);
        // The default leads; otherwise the last pick does.
        setChoices(orderChoicesByLastUsed(listNavigationAppChoices(), preferred ?? stored));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleSelect = (id: NavigationAppId) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    onSelect(id);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handleRail}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.title}>Navigate with</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {destinationLabel?.trim() || 'Choose how you want directions for this trip'}
          </Text>
          <Text style={styles.hint}>
            {defaultApp
              ? 'Pick another app to switch. We will ask before changing your default.'
              : 'Pick one and we will offer to open it automatically next time.'}
          </Text>

          <View style={styles.list}>
            {choices.map((choice) => {
              const isDefault = choice.id === defaultApp;
              const isLastUsed = isDefault || choice.id === lastUsed;
              return (
                <TouchableOpacity
                  key={choice.id}
                  style={[styles.row, isLastUsed && styles.rowLastUsed]}
                  onPress={() => handleSelect(choice.id)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Navigate with ${choice.label}`}
                  accessibilityHint={choice.description}
                >
                  <View style={[styles.iconWrap, isLastUsed && styles.iconWrapLastUsed]}>
                    <Ionicons name={choice.icon} size={20} color={isLastUsed ? '#022C22' : NEON} />
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.rowTitle}>{choice.label}</Text>
                      {isDefault ? (
                        <View style={styles.lastUsedTag}>
                          <Text style={styles.lastUsedTagTxt}>Default</Text>
                        </View>
                      ) : isLastUsed ? (
                        <View style={styles.lastUsedTag}>
                          <Text style={styles.lastUsedTagTxt}>Last used</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.rowDesc}>{choice.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#64748B" />
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const NEON = '#22E5A0';

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.72)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: {
    marginHorizontal: 12,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.3)',
    backgroundColor: '#0B1220',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handleRail: { alignItems: 'center', marginBottom: 10 },
  handle: { width: 44, height: 4, borderRadius: 100, backgroundColor: 'rgba(148,163,184,0.5)' },
  title: {
    fontSize: 21,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  sub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 14,
  },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.55)',
  },
  rowLastUsed: {
    borderColor: 'rgba(34,229,160,0.55)',
    backgroundColor: 'rgba(34,229,160,0.1)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,229,160,0.12)',
  },
  iconWrapLastUsed: { backgroundColor: NEON },
  rowText: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: '#F1F5F9' },
  lastUsedTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 100,
    backgroundColor: 'rgba(34,229,160,0.18)',
  },
  lastUsedTagTxt: { fontSize: 9.5, fontWeight: '900', color: NEON, letterSpacing: 0.4 },
  rowDesc: { fontSize: 12, fontWeight: '600', color: '#94A3B8', lineHeight: 16 },
  cancelBtn: {
    marginTop: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.8)',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  cancelTxt: { fontSize: 15, fontWeight: '800', color: '#CBD5E1' },
});
