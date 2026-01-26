import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Vibration,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Card, Button, Badge } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import {
  getEmergencyContacts,
  addEmergencyContact,
  removeEmergencyContact,
  triggerSOS,
  getFavoriteDrivers,
} from '@/src/services/api';

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export default function SafetyScreen() {
  const router = useRouter();
  const { user, currentTrip } = useAppStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [favoriteDrivers, setFavoriteDrivers] = useState<any[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', relationship: '' });
  const [loading, setLoading] = useState(false);
  const [sosConfirm, setSosConfirm] = useState(false);

  useEffect(() => {
    loadSafetyData();
  }, []);

  const loadSafetyData = async () => {
    if (!user?.id) return;
    try {
      const [contactsRes, driversRes] = await Promise.all([
        getEmergencyContacts(user.id),
        getFavoriteDrivers(user.id)
      ]);
      setEmergencyContacts(contactsRes.data.contacts || []);
      setFavoriteDrivers(driversRes.data.favorite_drivers || []);
    } catch (error) {
      console.log('Error loading safety data:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSafetyData();
    setRefreshing(false);
  }, []);

  const handleAddContact = async () => {
    if (!user?.id) return;
    if (!newContact.name || !newContact.phone || !newContact.relationship) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    
    setLoading(true);
    try {
      await addEmergencyContact(user.id, newContact);
      setShowAddContact(false);
      setNewContact({ name: '', phone: '', relationship: '' });
      await loadSafetyData();
      Alert.alert('Success', 'Emergency contact added');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add contact');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveContact = async (phone: string) => {
    if (!user?.id) return;
    
    Alert.alert(
      'Remove Contact',
      'Are you sure you want to remove this emergency contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeEmergencyContact(user.id, phone);
              await loadSafetyData();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove contact');
            }
          }
        }
      ]
    );
  };

  const handleTriggerSOS = async () => {
    if (!currentTrip) {
      Alert.alert('No Active Trip', 'SOS is only available during an active ride.');
      return;
    }
    
    setSosConfirm(false);
    setLoading(true);
    
    // Vibrate for emergency feedback
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 500, 200, 500]);
    }
    
    try {
      const location = await Location.getCurrentPositionAsync({});
      await triggerSOS({
        trip_id: currentTrip.id,
        location_lat: location.coords.latitude,
        location_lng: location.coords.longitude,
      });
      
      Alert.alert(
        'SOS Sent',
        'Your emergency contacts and KODA support have been alerted. Help is on the way.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send SOS');
    } finally {
      setLoading(false);
    }
  };

  const renderSafetyTips = () => (
    <Card style={styles.tipsCard}>
      <Text style={styles.tipsTitle}>Safety Tips</Text>
      <View style={styles.tipsList}>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          <Text style={styles.tipText}>Always verify driver's photo matches</Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          <Text style={styles.tipText}>Share your trip with family/friends</Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          <Text style={styles.tipText}>Sit in the back seat</Text>
        </View>
        <View style={styles.tipItem}>
          <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          <Text style={styles.tipText}>Trust your instincts - cancel if unsafe</Text>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Safety Center</Text>
          <Badge text="Protected" variant="success" />
        </View>

        {/* SOS Button */}
        <Card style={styles.sosCard}>
          <Text style={styles.sosTitle}>Emergency SOS</Text>
          <Text style={styles.sosDescription}>
            Press and hold during a ride to alert your emergency contacts and KODA support.
          </Text>
          <TouchableOpacity
            style={[styles.sosButton, !currentTrip && styles.sosButtonDisabled]}
            onLongPress={() => setSosConfirm(true)}
            delayLongPress={500}
            disabled={!currentTrip}
          >
            <Ionicons name="alert-circle" size={48} color={COLORS.white} />
            <Text style={styles.sosButtonText}>
              {currentTrip ? 'Hold for SOS' : 'SOS (No Active Trip)'}
            </Text>
          </TouchableOpacity>
          {currentTrip && (
            <Text style={styles.sosHint}>Press and hold for 0.5 seconds</Text>
          )}
        </Card>

        {/* Emergency Contacts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Emergency Contacts</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddContact(true)}
            >
              <Ionicons name="add-circle" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          
          {emergencyContacts.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="people-outline" size={40} color={COLORS.gray400} />
              <Text style={styles.emptyText}>No emergency contacts added</Text>
              <Text style={styles.emptySubtext}>Add contacts to be notified in case of emergency</Text>
              <Button
                title="Add Contact"
                onPress={() => setShowAddContact(true)}
                variant="outline"
                icon="person-add"
                style={styles.addContactButton}
              />
            </Card>
          ) : (
            emergencyContacts.map((contact, index) => (
              <Card key={index} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactInitial}>
                      {contact.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactDetails}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                    <Badge text={contact.relationship} variant="info" />
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveContact(contact.phone)}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                </TouchableOpacity>
              </Card>
            ))
          )}
        </View>

        {/* Favorite Drivers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trusted Drivers</Text>
          {favoriteDrivers.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="star-outline" size={40} color={COLORS.gray400} />
              <Text style={styles.emptyText}>No trusted drivers yet</Text>
              <Text style={styles.emptySubtext}>Mark drivers as favorites after great rides</Text>
            </Card>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {favoriteDrivers.map((driver, index) => (
                <Card key={index} style={styles.driverCard}>
                  <View style={styles.driverAvatar}>
                    <Ionicons name="person" size={24} color={COLORS.primary} />
                  </View>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <View style={styles.driverRating}>
                    <Ionicons name="star" size={14} color={COLORS.accent} />
                    <Text style={styles.driverRatingText}>{driver.rating?.toFixed(1) || '5.0'}</Text>
                  </View>
                </Card>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Safety Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Features</Text>
          <Card style={styles.featureCard}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: COLORS.success + '20' }]}>
                <Ionicons name="location" size={24} color={COLORS.success} />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureName}>Live Trip Monitoring</Text>
                <Text style={styles.featureDesc}>We track route deviations automatically</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            </View>
          </Card>
          
          <Card style={styles.featureCard}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: COLORS.info + '20' }]}>
                <Ionicons name="shield-checkmark" size={24} color={COLORS.info} />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureName}>Driver Verification</Text>
                <Text style={styles.featureDesc}>Face match before every ride</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            </View>
          </Card>
          
          <Card style={styles.featureCard}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: COLORS.warning + '20' }]}>
                <Ionicons name="mic" size={24} color={COLORS.warning} />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureName}>Trip Recording</Text>
                <Text style={styles.featureDesc}>Optional audio recording for safety</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            </View>
          </Card>
          
          <Card style={styles.featureCard}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: COLORS.primary + '20' }]}>
                <Ionicons name="document-text" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.featureInfo}>
                <Text style={styles.featureName}>Trip Insurance</Text>
                <Text style={styles.featureDesc}>Every ride is automatically insured</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            </View>
          </Card>
        </View>

        {/* Safety Tips */}
        {renderSafetyTips()}
      </ScrollView>

      {/* Add Contact Modal */}
      <Modal
        visible={showAddContact}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddContact(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Emergency Contact</Text>
              <TouchableOpacity onPress={() => setShowAddContact(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.input}
              placeholder="Contact Name"
              placeholderTextColor={COLORS.gray400}
              value={newContact.name}
              onChangeText={(text) => setNewContact({ ...newContact, name: text })}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor={COLORS.gray400}
              keyboardType="phone-pad"
              value={newContact.phone}
              onChangeText={(text) => setNewContact({ ...newContact, phone: text })}
            />
            
            <Text style={styles.relationshipLabel}>Relationship</Text>
            <View style={styles.relationshipOptions}>
              {['Family', 'Friend', 'Partner', 'Other'].map((rel) => (
                <TouchableOpacity
                  key={rel}
                  style={[
                    styles.relationshipOption,
                    newContact.relationship === rel && styles.relationshipOptionSelected
                  ]}
                  onPress={() => setNewContact({ ...newContact, relationship: rel })}
                >
                  <Text
                    style={[
                      styles.relationshipOptionText,
                      newContact.relationship === rel && styles.relationshipOptionTextSelected
                    ]}
                  >
                    {rel}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Button
              title={loading ? 'Adding...' : 'Add Contact'}
              onPress={handleAddContact}
              loading={loading}
              icon="person-add"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* SOS Confirmation Modal */}
      <Modal
        visible={sosConfirm}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSosConfirm(false)}
      >
        <View style={styles.sosModalOverlay}>
          <View style={styles.sosModalContent}>
            <Ionicons name="warning" size={60} color={COLORS.error} />
            <Text style={styles.sosModalTitle}>Confirm SOS Alert</Text>
            <Text style={styles.sosModalText}>
              This will alert your emergency contacts and KODA support team with your location.
            </Text>
            <View style={styles.sosModalButtons}>
              <Button
                title="Cancel"
                onPress={() => setSosConfirm(false)}
                variant="outline"
                style={styles.sosModalButton}
              />
              <Button
                title="Send SOS"
                onPress={handleTriggerSOS}
                loading={loading}
                style={[styles.sosModalButton, { backgroundColor: COLORS.error }]}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sosCard: {
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sosTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  sosDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  sosButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.lg,
  },
  sosButtonDisabled: {
    backgroundColor: COLORS.gray400,
  },
  sosButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  sosHint: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  addButton: {
    padding: SPACING.xs,
  },
  emptyCard: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  emptySubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  addContactButton: {
    marginTop: SPACING.md,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  contactInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  contactDetails: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  contactName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  contactPhone: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  removeButton: {
    padding: SPACING.sm,
  },
  driverCard: {
    alignItems: 'center',
    padding: SPACING.md,
    marginRight: SPACING.md,
    width: 100,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  driverName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  driverRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  driverRatingText: {
    marginLeft: 4,
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    fontWeight: '600',
  },
  featureCard: {
    marginBottom: SPACING.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  featureName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  featureDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  tipsCard: {
    backgroundColor: COLORS.info + '10',
    borderWidth: 1,
    borderColor: COLORS.info + '30',
  },
  tipsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.info,
    marginBottom: SPACING.md,
  },
  tipsList: {
    gap: SPACING.sm,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipText: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  input: {
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    marginBottom: SPACING.md,
    color: COLORS.textPrimary,
  },
  relationshipLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  relationshipOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  relationshipOption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.gray300,
  },
  relationshipOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  relationshipOptionText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  relationshipOptionTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
  modalButton: {
    marginTop: SPACING.md,
  },
  sosModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  sosModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  sosModalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.error,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sosModalText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  sosModalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  sosModalButton: {
    flex: 1,
  },
});
