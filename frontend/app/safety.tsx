import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
  Alert,
  ActivityIndicator,
  Linking,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  primary: '#0F172A',
  green: '#22C55E',
  greenLight: '#4ADE80',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  orange: '#F59E0B',
  red: '#EF4444',
  redDark: '#DC2626',
  cyan: '#06B6D4',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export default function SafetyScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', relationship: '' });
  const [sosActive, setSosActive] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(5);
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const sosScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadContacts();
    
    // Entry animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Continuous pulse for SOS button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (sosActive && sosCountdown > 0) {
      const timer = setTimeout(() => {
        setSosCountdown(sosCountdown - 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (sosActive && sosCountdown === 0) {
      triggerSOS();
    }
  }, [sosActive, sosCountdown]);

  const loadContacts = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/${user.id}/emergency-contacts`);
      const data = await res.json();
      if (data.contacts) {
        setContacts(data.contacts);
      }
    } catch (e) {
      console.error('Load contacts error:', e);
    }
  };

  const addContact = async () => {
    if (!user?.id || !newContact.name || !newContact.phone) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setLoading(true);
    try {
      await fetch(`${BACKEND_URL}/api/users/${user.id}/emergency-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      });
      setContacts([...contacts, newContact]);
      setNewContact({ name: '', phone: '', relationship: '' });
      setShowAddContact(false);
      Alert.alert('Success', 'Emergency contact added!');
    } catch (e) {
      Alert.alert('Error', 'Failed to add contact');
    }
    setLoading(false);
  };

  const startSOS = () => {
    setSosActive(true);
    setSosCountdown(5);
    Vibration.vibrate([500, 500, 500]);
    
    // Shake animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Scale pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosScaleAnim, {
          toValue: 1.2,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(sosScaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const cancelSOS = () => {
    setSosActive(false);
    setSosCountdown(5);
    Vibration.cancel();
    shakeAnim.setValue(0);
    sosScaleAnim.setValue(1);
  };

  const triggerSOS = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/sos/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          location: { lat: 6.4281, lng: 3.4219 },
        }),
      });
      
      Alert.alert(
        '🚨 SOS Activated',
        'Emergency services have been notified. Your emergency contacts will receive your location.',
        [{ text: 'OK', onPress: cancelSOS }]
      );
      
      // Also call emergency number
      Linking.openURL('tel:112');
    } catch (e) {
      Alert.alert('Error', 'Failed to trigger SOS. Please call emergency services manually.');
      cancelSOS();
    }
  };

  const callEmergency = () => {
    Alert.alert(
      'Call Emergency Services',
      'You will be connected to emergency services (112)',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call Now', onPress: () => Linking.openURL('tel:112') }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Safety Center</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* SOS Button - Large Animated */}
          <Animated.View style={[
            styles.sosSection,
            { opacity: fadeAnim, transform: [{ translateX: sosActive ? shakeAnim : 0 }] }
          ]}>
            <Text style={styles.sosTitle}>Emergency SOS</Text>
            <Text style={styles.sosDesc}>Press and hold in case of emergency</Text>
            
            <TouchableOpacity
              onPressIn={startSOS}
              onPressOut={() => !sosActive && cancelSOS()}
              activeOpacity={0.9}
            >
              <Animated.View style={[
                styles.sosButtonOuter,
                { transform: [{ scale: sosActive ? sosScaleAnim : pulseAnim }] }
              ]}>
                <LinearGradient
                  colors={sosActive ? [COLORS.redDark, COLORS.red] : [COLORS.red, '#FF6B6B']}
                  style={styles.sosButton}
                >
                  {sosActive ? (
                    <View style={styles.sosCountdownContainer}>
                      <Text style={styles.sosCountdownText}>{sosCountdown}</Text>
                      <Text style={styles.sosCountdownLabel}>TAP TO CANCEL</Text>
                    </View>
                  ) : (
                    <>
                      <Ionicons name="alert-circle" size={48} color="#FFFFFF" />
                      <Text style={styles.sosButtonText}>SOS</Text>
                    </>
                  )}
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
            
            {sosActive && (
              <TouchableOpacity style={styles.cancelButton} onPress={cancelSOS}>
                <Text style={styles.cancelText}>Cancel Emergency</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Quick Emergency Actions */}
          <Animated.View style={[styles.quickActions, { opacity: fadeAnim }]}>
            <TouchableOpacity style={styles.quickAction} onPress={callEmergency}>
              <LinearGradient
                colors={[COLORS.red + '20', COLORS.red + '10']}
                style={styles.quickActionGradient}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: COLORS.red }]}>
                  <Ionicons name="call" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionContent}>
                  <Text style={styles.quickActionTitle}>Call 112</Text>
                  <Text style={styles.quickActionDesc}>Emergency Services</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => Linking.openURL('tel:08001234567')}
            >
              <LinearGradient
                colors={[COLORS.blue + '20', COLORS.blue + '10']}
                style={styles.quickActionGradient}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: COLORS.blue }]}>
                  <Ionicons name="headset" size={24} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionContent}>
                  <Text style={styles.quickActionTitle}>NEXRYDE Support</Text>
                  <Text style={styles.quickActionDesc}>24/7 Hotline</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Emergency Contacts */}
          <Animated.View style={[styles.contactsSection, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Emergency Contacts</Text>
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowAddContact(true)}
              >
                <Ionicons name="add" size={20} color={COLORS.green} />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {contacts.length === 0 ? (
              <View style={styles.emptyContacts}>
                <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No emergency contacts added</Text>
                <Text style={styles.emptyHint}>Add trusted contacts who will be notified in emergencies</Text>
              </View>
            ) : (
              contacts.map((contact, index) => (
                <View key={index} style={styles.contactCard}>
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactInitial}>{contact.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                    {contact.relationship && (
                      <Text style={styles.contactRelation}>{contact.relationship}</Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={styles.callContactBtn}
                    onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                  >
                    <Ionicons name="call" size={20} color={COLORS.green} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Animated.View>

          {/* Safety Tips */}
          <View style={styles.tipsSection}>
            <Text style={styles.sectionTitle}>Safety Tips</Text>
            
            <View style={styles.tipCard}>
              <View style={[styles.tipIcon, { backgroundColor: COLORS.green + '20' }]}>
                <Ionicons name="share-social" size={20} color={COLORS.green} />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>Share Your Trip</Text>
                <Text style={styles.tipDesc}>Let friends and family track your ride in real-time</Text>
              </View>
            </View>

            <View style={styles.tipCard}>
              <View style={[styles.tipIcon, { backgroundColor: COLORS.blue + '20' }]}>
                <Ionicons name="car" size={20} color={COLORS.blue} />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>Verify Your Ride</Text>
                <Text style={styles.tipDesc}>Always check the driver's photo and plate number</Text>
              </View>
            </View>

            <View style={styles.tipCard}>
              <View style={[styles.tipIcon, { backgroundColor: COLORS.purple + '20' }]}>
                <Ionicons name="location" size={20} color={COLORS.purple} />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>Stay in Populated Areas</Text>
                <Text style={styles.tipDesc}>Request pickup/dropoff in well-lit, busy locations</Text>
              </View>
            </View>
          </View>

          {/* Add Contact Modal */}
          {showAddContact && (
            <View style={styles.modalOverlay}>
              <View style={styles.addContactModal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add Emergency Contact</Text>
                  <TouchableOpacity onPress={() => setShowAddContact(false)}>
                    <Ionicons name="close" size={24} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalInput}>
                  <Ionicons name="person" size={20} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Contact Name"
                    placeholderTextColor={COLORS.textMuted}
                    value={newContact.name}
                    onChangeText={(text) => setNewContact({ ...newContact, name: text })}
                  />
                </View>

                <View style={styles.modalInput}>
                  <Ionicons name="call" size={20} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Phone Number"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    value={newContact.phone}
                    onChangeText={(text) => setNewContact({ ...newContact, phone: text })}
                  />
                </View>

                <View style={styles.modalInput}>
                  <Ionicons name="heart" size={20} color={COLORS.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Relationship (optional)"
                    placeholderTextColor={COLORS.textMuted}
                    value={newContact.relationship}
                    onChangeText={(text) => setNewContact({ ...newContact, relationship: text })}
                  />
                </View>

                <TouchableOpacity style={styles.saveButton} onPress={addContact} disabled={loading}>
                  <LinearGradient
                    colors={[COLORS.green, COLORS.greenLight]}
                    style={styles.saveGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveText}>Save Contact</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  scrollContent: {
    padding: 20,
  },
  sosSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sosTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 4,
  },
  sosDesc: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 24,
  },
  sosButtonOuter: {
    borderRadius: 100,
    padding: 8,
    backgroundColor: COLORS.red + '20',
  },
  sosButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  sosButtonText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 8,
    letterSpacing: 4,
  },
  sosCountdownContainer: {
    alignItems: 'center',
  },
  sosCountdownText: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  sosCountdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.red,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.red,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  quickAction: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  quickActionDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  contactsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.green + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.green,
  },
  emptyContacts: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: COLORS.card,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.green + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.green,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  contactPhone: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  contactRelation: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  callContactBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.green + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsSection: {
    marginBottom: 24,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tipDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addContactModal: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  modalInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.primary,
    paddingVertical: 14,
  },
  saveButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
  },
  saveGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
