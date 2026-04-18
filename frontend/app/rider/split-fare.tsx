import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
import { splitFare } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

export default function SplitFareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const user = useAppStore((s) => s.user);
  const currentTrip = useAppStore((s) => s.currentTrip);
  const [totalFare] = useState(params.fare ? Number(params.fare) : 5000);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const tripId = String(params.tripId || currentTrip?.id || '');
  const mountedRef = useRef(true);
  const sendInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    loadContacts();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        });

        if (data.length > 0) {
          // Format contacts for display
          const formatted = data
            .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
            .map(c => ({
              id: c.id,
              name: c.name || 'Unknown',
              phone: c.phoneNumbers![0].number,
              avatar: c.name ? c.name[0].toUpperCase() : '?',
            }))
            .slice(0, 50); // Limit to 50 contacts
          
          if (mountedRef.current) setDeviceContacts(formatted);
        }
      } else {
        Alert.alert('Permission Denied', 'Cannot access contacts without permission');
      }
    } catch (error) {
      console.error('Load contacts error:', error);
    }
  };

  const toggleFriend = (contact: any) => {
    setSelectedFriends((prev) => {
      const exists = prev.find((f) => f.id === contact.id);
      if (exists) return prev.filter((f) => f.id !== contact.id);
      if (prev.length >= 4) {
        Alert.alert('Limit Reached', 'Maximum 4 people can split fare');
        return prev;
      }
      return [...prev, contact];
    });
  };

  const splitAmount = Math.ceil(totalFare / (selectedFriends.length + 1));

  const normalizePhone = (value: string) => {
    const clean = (value || '').trim();
    const digits = clean.replace(/\D/g, '');
    if (!digits) return '';
    if (clean.startsWith('+')) return `+${digits}`;
    if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
    if (digits.startsWith('234')) return `+${digits}`;
    return `+234${digits}`;
  };

  const addManualPhone = () => {
    const normalized = normalizePhone(manualPhone);
    if (!normalized) {
      Alert.alert('Invalid number', 'Enter a valid phone number.');
      return;
    }
    if (selectedFriends.some((f) => normalizePhone(f.phone) === normalized)) {
      Alert.alert('Already added', 'This phone number is already selected.');
      return;
    }
    if (selectedFriends.length >= 4) {
      Alert.alert('Limit Reached', 'Maximum 4 people can split fare');
      return;
    }
    setSelectedFriends((prev) => [
      ...prev,
      { id: `manual-${Date.now()}`, name: normalized, phone: normalized, avatar: '+' },
    ]);
    setManualPhone('');
    setShowAddModal(false);
  };

  const handleSendRequest = async () => {
    if (sendInFlightRef.current) return;
    if (selectedFriends.length === 0) {
      Alert.alert('Select Friends', 'Please select at least one person to split fare with');
      return;
    }

    sendInFlightRef.current = true;
    setLoading(true);
    try {
      if (!tripId || !user?.id) {
        Alert.alert('Trip Required', 'Open split fare from an active trip.');
        return;
      }
      const phoneNumbers = selectedFriends.map((f) => normalizePhone(f.phone)).filter(Boolean);
      await splitFare(tripId, user.id, phoneNumbers);
      const isSmsAvailable = await SMS.isAvailableAsync();
      if (isSmsAvailable) {
        const message = `NEXRYDE split fare request: total ${CURRENCY}${totalFare.toLocaleString()}, your share ${CURRENCY}${splitAmount.toLocaleString()}. Open NEXRYDE app to accept.`;
        await SMS.sendSMSAsync(phoneNumbers, message);
      }
      Alert.alert(
        'Split Request Sent',
        `Request sent to ${phoneNumbers.length} participant${phoneNumbers.length > 1 ? 's' : ''}.`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Send SMS error:', error);
      Alert.alert('Error', 'Failed to create split fare request. Please try again.');
    } finally {
      sendInFlightRef.current = false;
      setLoading(false);
    }
  };

  const contacts = deviceContacts;

  const filteredContacts = searchQuery
    ? contacts.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
      )
    : contacts;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Split Fare</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Fare Summary */}
        <View style={styles.fareCard}>
          <Text style={styles.fareLabel}>Total Fare</Text>
          <Text style={styles.fareAmount}>{CURRENCY}{totalFare.toLocaleString()}</Text>
          
          <View style={styles.splitInfo}>
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>People</Text>
              <Text style={styles.splitValue}>{selectedFriends.length + 1}</Text>
            </View>
            <View style={styles.splitDivider} />
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>Each Pays</Text>
              <Text style={[styles.splitValue, { color: COLORS.accentGreen }]}>
                {CURRENCY}{splitAmount.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color={COLORS.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor={COLORS.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Contacts */}
        <Text style={styles.sectionTitle}>Select Friends ({selectedFriends.length}/4)</Text>
        
        {filteredContacts.map((contact) => (
          <TouchableOpacity
            key={contact.id}
            style={[
              styles.contactCard,
              selectedFriends.find(f => f.id === contact.id) && styles.contactCardSelected
            ]}
            onPress={() => toggleFriend(contact)}
          >
            <View style={styles.contactAvatar}>
              <Text style={styles.avatarText}>{contact.avatar}</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactPhone}>{contact.phone}</Text>
            </View>
            <View style={[
              styles.checkbox,
              selectedFriends.some(f => f.id === contact.id) && styles.checkboxSelected
            ]}>
              {selectedFriends.some(f => f.id === contact.id) && (
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              )}
            </View>
          </TouchableOpacity>
        ))}

        {/* Add by Phone */}
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add-circle" size={24} color={COLORS.primary} />
          <Text style={styles.addButtonText}>Add by Phone Number</Text>
        </TouchableOpacity>

        {/* Send Request Button */}
        <TouchableOpacity style={styles.sendButton} onPress={handleSendRequest} disabled={loading}>
          <Ionicons name="send" size={20} color={COLORS.white} />
          <Text style={styles.sendButtonText}>{loading ? 'Sending...' : 'Send Split Request'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Phone Number</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="080..., +234..."
              value={manualPhone}
              onChangeText={setManualPhone}
              keyboardType="phone-pad"
              placeholderTextColor={COLORS.gray400}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAdd} onPress={addManualPhone}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
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
  backButton: { padding: SPACING.sm },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  content: { padding: SPACING.lg },
  fareCard: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  fareLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
  fareAmount: {
    fontSize: 40,
    fontWeight: '900',
    color: COLORS.white,
    marginVertical: SPACING.sm,
  },
  splitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    width: '100%',
  },
  splitItem: {
    flex: 1,
    alignItems: 'center',
  },
  splitDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  splitLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  splitValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.gray800,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  contactCardSelected: {
    borderColor: COLORS.accentGreen,
    backgroundColor: '#F0FDF4',
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24 },
  contactInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  contactName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  contactPhone: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginVertical: SPACING.md,
  },
  addButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.md,
  },
  sendButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  modalInput: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.gray800,
  },
  modalActions: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  modalCancel: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  modalCancelText: { color: COLORS.gray500, fontWeight: '700' },
  modalAdd: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
  },
  modalAddText: { color: COLORS.white, fontWeight: '800' },
});
