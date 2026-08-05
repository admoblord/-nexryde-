/**
 * Add and remove the people NEXRYDE contacts when something goes wrong.
 *
 * These contacts are who SOS and the post-trip safe-arrival escalation reach
 * out to. Until now the app could only list them — there was no way to add
 * one — so most riders had an empty list and every escalation reached nobody.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useEmergencyContacts, type EmergencyContact } from '@/src/hooks/useEmergencyContacts';

const MAX_CONTACTS = 5;
const RELATIONSHIPS = ['Family', 'Partner', 'Friend', 'Colleague', 'Other'] as const;

/** Mirrors the server: bare and 0-prefixed numbers are treated as Nigerian. */
function normalizeNgPhone(raw: string): string {
  const trimmed = raw.replace(/[\s-()]/g, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('0')) return `+234${trimmed.slice(1)}`;
  if (trimmed.startsWith('234')) return `+${trimmed}`;
  return `+234${trimmed}`;
}

function phoneLooksValid(raw: string): boolean {
  return (normalizeNgPhone(raw).match(/\d/g) || []).length >= 10;
}

type Props = { userId?: string | null };

export default function EmergencyContactsCard({ userId }: Props) {
  const { contacts, loading, error, createContact, deleteContact } = useEmergencyContacts(userId);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState<string>(RELATIONSHIPS[0]);

  const full = contacts.length >= MAX_CONTACTS;
  const canSave = useMemo(
    () => Boolean(name.trim()) && phoneLooksValid(phone) && !saving,
    [name, phone, saving],
  );

  const resetForm = () => {
    setName('');
    setPhone('');
    setRelationship(RELATIONSHIPS[0]);
    setAdding(false);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await createContact({
      name: name.trim(),
      phone: normalizeNgPhone(phone),
      relationship,
    } as EmergencyContact);
    setSaving(false);
    if (ok) {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      resetForm();
    }
  };

  const handleDelete = (contact: EmergencyContact) => {
    Alert.alert(
      'Remove contact',
      `${contact.name} will no longer be alerted if you raise an SOS or miss a safe-arrival check-in.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void deleteContact(contact.phone),
        },
      ],
    );
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="people" size={20} color="#22E5A0" />
        <Text style={s.title}>Emergency contacts</Text>
        {loading ? <ActivityIndicator size="small" color="#22E5A0" /> : null}
      </View>
      <Text style={s.sub}>
        Alerted with your live location if you raise an SOS or don&apos;t confirm safe arrival.
      </Text>

      {!loading && contacts.length === 0 && !adding ? (
        <View style={s.emptyBox}>
          <Ionicons name="warning-outline" size={16} color="#FBBF24" />
          <Text style={s.emptyTxt}>
            No one is set up yet — NEXRYDE has nobody to alert for you.
          </Text>
        </View>
      ) : null}

      {contacts.map((c) => (
        <View key={c.phone} style={s.row}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{(c.name || '?').trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowName} numberOfLines={1}>
              {c.name}
            </Text>
            <Text style={s.rowMeta} numberOfLines={1}>
              {c.phone}
              {c.relationship ? ` · ${c.relationship}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDelete(c)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${c.name}`}
          >
            <Ionicons name="close-circle" size={22} color="#64748B" />
          </TouchableOpacity>
        </View>
      ))}

      {adding ? (
        <View style={s.form}>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor="#64748B"
            maxLength={60}
            autoFocus
            accessibilityLabel="Contact name"
          />
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone (e.g. 0803 123 4567)"
            placeholderTextColor="#64748B"
            keyboardType="phone-pad"
            maxLength={20}
            accessibilityLabel="Contact phone number"
          />
          <View style={s.relRow}>
            {RELATIONSHIPS.map((r) => {
              const active = relationship === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={[s.relChip, active && s.relChipOn]}
                  onPress={() => setRelationship(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.relChipTxt, active && s.relChipTxtOn]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <View style={s.formActions}>
            <TouchableOpacity style={s.cancelBtn} onPress={resetForm} disabled={saving}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, !canSave && s.saveBtnOff]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel="Save emergency contact"
              accessibilityState={{ disabled: !canSave }}
            >
              {saving ? (
                <ActivityIndicator color="#022C22" />
              ) : (
                <Text style={[s.saveTxt, !canSave && s.saveTxtOff]}>Save contact</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[s.addBtn, full && s.addBtnOff]}
            onPress={() => setAdding(true)}
            disabled={full}
            accessibilityRole="button"
            accessibilityLabel="Add emergency contact"
          >
            <Ionicons name="add-circle" size={18} color={full ? '#64748B' : '#022C22'} />
            <Text style={[s.addTxt, full && s.addTxtOff]}>
              {full ? `Maximum ${MAX_CONTACTS} contacts` : 'Add emergency contact'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '900', color: '#F1F5F9' },
  sub: { fontSize: 12.5, fontWeight: '600', color: '#94A3B8', lineHeight: 17 },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.32)',
  },
  emptyTxt: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#FDE68A', lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(2,6,23,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,229,160,0.16)',
  },
  avatarTxt: { fontSize: 15, fontWeight: '900', color: '#22E5A0' },
  rowName: { fontSize: 14.5, fontWeight: '800', color: '#F1F5F9' },
  rowMeta: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginTop: 1 },
  form: { gap: 10 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    backgroundColor: 'rgba(2,6,23,0.7)',
    color: '#F8FAFC',
    fontSize: 14.5,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  relRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.7)',
    backgroundColor: 'rgba(2,6,23,0.6)',
  },
  relChipOn: { borderColor: 'rgba(34,229,160,0.6)', backgroundColor: 'rgba(34,229,160,0.14)' },
  relChipTxt: { fontSize: 12.5, fontWeight: '700', color: '#94A3B8' },
  relChipTxtOn: { color: '#22E5A0' },
  error: { fontSize: 12.5, fontWeight: '700', color: '#FCA5A5', lineHeight: 17 },
  formActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.8)',
  },
  cancelTxt: { fontSize: 14.5, fontWeight: '800', color: '#CBD5E1' },
  saveBtn: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#22E5A0',
    minHeight: 48,
  },
  // Dimming green with opacity still reads as a live button — go fully grey so
  // "you have not filled this in yet" is unmistakable.
  saveBtnOff: { backgroundColor: 'rgba(51,65,85,0.6)' },
  saveTxt: { fontSize: 14.5, fontWeight: '900', color: '#022C22' },
  saveTxtOff: { color: '#64748B' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#22E5A0',
  },
  addBtnOff: { backgroundColor: 'rgba(51,65,85,0.6)' },
  addTxt: { fontSize: 14.5, fontWeight: '900', color: '#022C22' },
  addTxtOff: { color: '#64748B' },
});
