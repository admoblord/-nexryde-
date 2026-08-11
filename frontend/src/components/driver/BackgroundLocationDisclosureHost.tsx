/**
 * Root-level host for Google Play BACKGROUND_LOCATION prominent disclosure.
 * Must appear before the OS "Allow all the time" permission dialog.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BG_LOCATION_DISCLOSURE,
  resolveBackgroundLocationDisclosure,
  subscribeBackgroundLocationDisclosure,
} from '@/src/services/backgroundLocationDisclosure';

export function BackgroundLocationDisclosureHost() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeBackgroundLocationDisclosure(setVisible);
  }, []);

  if (Platform.OS === 'web') return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => resolveBackgroundLocationDisclosure(false)}
    >
      <View style={styles.root} testID="bg-location-disclosure">
        <ScrollView
          contentContainerStyle={styles.scroll}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="navigate-circle" size={56} color="#00D47E" />
          </View>
          <Text style={styles.title}>{BG_LOCATION_DISCLOSURE.title}</Text>
          <Text style={styles.body}>{BG_LOCATION_DISCLOSURE.body}</Text>

          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <Ionicons name="radio-outline" size={18} color="#00D47E" />
              <Text style={styles.bulletText}>Collected while you are Online as a driver</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#00D47E" />
              <Text style={styles.bulletText}>Used for matching, trip tracking, and ride alerts</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="close-circle-outline" size={18} color="#00D47E" />
              <Text style={styles.bulletText}>Stops when you go Offline or revoke access</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.acceptBtn}
            activeOpacity={0.9}
            onPress={() => resolveBackgroundLocationDisclosure(true)}
            accessibilityRole="button"
            accessibilityLabel={BG_LOCATION_DISCLOSURE.acceptLabel}
          >
            <Text style={styles.acceptText}>{BG_LOCATION_DISCLOSURE.acceptLabel}</Text>
          </TouchableOpacity>
          <Pressable
            style={styles.declineBtn}
            onPress={() => resolveBackgroundLocationDisclosure(false)}
            accessibilityRole="button"
            accessibilityLabel={BG_LOCATION_DISCLOSURE.declineLabel}
          >
            <Text style={styles.declineText}>{BG_LOCATION_DISCLOSURE.declineLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 24,
    gap: 16,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,212,126,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    lineHeight: 32,
  },
  body: {
    fontSize: 15,
    fontWeight: '500',
    color: '#CBD5E1',
    textAlign: 'left',
    lineHeight: 23,
  },
  bullets: {
    marginTop: 8,
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bulletText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#E2E8F0', lineHeight: 18 },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.2)',
    backgroundColor: '#0B1220',
  },
  acceptBtn: {
    backgroundColor: '#00D47E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptText: { fontSize: 16, fontWeight: '900', color: '#022C22' },
  declineBtn: { paddingVertical: 12, alignItems: 'center' },
  declineText: { fontSize: 15, fontWeight: '700', color: '#94A3B8' },
});
