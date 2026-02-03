import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';

export default function SplitFareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [totalFare] = useState(params.fare ? Number(params.fare) : 5000);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadContacts();
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
          
          setDeviceContacts(formatted);
        }
      } else {
        Alert.alert('Permission Denied', 'Cannot access contacts without permission');
      }
    } catch (error) {
      console.error('Load contacts error:', error);
    }
  };

  const toggleFriend = (contact: any) => {
    const exists = selectedFriends.find(f => f.id === contact.id);
    if (exists) {
      setSelectedFriends(selectedFriends.filter(f => f.id !== contact.id));
    } else {
      if (selectedFriends.length < 4) {
        setSelectedFriends([...selectedFriends, contact]);
      } else {
        Alert.alert('Limit Reached', 'Maximum 4 people can split fare');
      }
    }
  };

  const splitAmount = Math.ceil(totalFare / (selectedFriends.length + 1));

  const handleSendRequest = async () => {
    if (selectedFriends.length === 0) {
      Alert.alert('Select Friends', 'Please select at least one person to split fare with');
      return;
    }

    setLoading(true);
    try {
      // Check if SMS is available
      const isAvailable = await SMS.isAvailableAsync();
      
      if (isAvailable) {
        const phoneNumbers = selectedFriends.map(f => f.phone);
        const message = `🚗 NEXRYDE Split Fare Request!\n\nYou've been invited to split a ride fare of ${CURRENCY}${totalFare.toLocaleString()}.\n\nYour share: ${CURRENCY}${splitAmount.toLocaleString()}\nTotal people: ${selectedFriends.length + 1}\n\nAccept this request in the NEXRYDE app to confirm payment.`;

        await SMS.sendSMSAsync(phoneNumbers, message);
        
        Alert.alert(
          '✅ Request Sent!',
          `SMS invitations sent to ${selectedFriends.length} ${selectedFriends.length === 1 ? 'person' : 'people'}. Each will pay ${CURRENCY}${splitAmount.toLocaleString()}.`,
          [{ text: 'Done', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          'SMS Not Available',
          'SMS is not available on this device. Split fare requests will be sent via the app.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error) {
      console.error('Send SMS error:', error);
      Alert.alert('Error', 'Failed to send split fare request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const contacts = deviceContacts.length > 0 ? deviceContacts : [
    { id: '1', name: 'Chidi Okeke', phone: '+234 801 234 5678', avatar: 'C' },
    { id: '2', name: 'Amara Nwosu', phone: '+234 802 345 6789', avatar: 'A' },
    { id: '3', name: 'Emeka Eze', phone: '+234 803 456 7890', avatar: 'E' },
    { id: '4', name: 'Ngozi Obi', phone: '+234 804 567 8901', avatar: 'N' },
  ];

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
              selectedFriends.includes(contact.id) && styles.checkboxSelected
            ]}>
              {selectedFriends.includes(contact.id) && (
                <Ionicons name="checkmark" size={16} color={COLORS.white} />
              )}
            </View>
          </TouchableOpacity>
        ))}

        {/* Add by Phone */}
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle" size={24} color={COLORS.primary} />
          <Text style={styles.addButtonText}>Add by Phone Number</Text>
        </TouchableOpacity>

        {/* Send Request Button */}
        <TouchableOpacity style={styles.sendButton} onPress={handleSendRequest}>
          <Ionicons name="send" size={20} color={COLORS.white} />
          <Text style={styles.sendButtonText}>Send Split Request</Text>
        </TouchableOpacity>
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
});
