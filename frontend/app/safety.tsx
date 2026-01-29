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
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// BRIGHTER, BOLDER COLORS
const COLORS = {
  background: '#FFFFFF',
  card: '#FFFFFF',
  primary: '#000000',
  green: '#00D26A',
  greenBright: '#00FF85',
  blue: '#0066FF',
  blueBright: '#00A3FF',
  purple: '#8B00FF',
  orange: '#FF6B00',
  red: '#FF0000',
  redBright: '#FF3333',
  redDark: '#CC0000',
  cyan: '#00D4FF',
  textPrimary: '#000000',
  textSecondary: '#333333',
  textMuted: '#666666',
  border: '#E0E0E0',
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
  const glowAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    loadContacts();
    
    // Entry animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Continuous pulse for SOS button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
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
        Vibration.vibrate(200);
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
    if (!newContact.name || !newContact.phone) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setLoading(true);
    try {
      if (user?.id) {
        await fetch(`${BACKEND_URL}/api/users/${user.id}/emergency-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newContact),
        });
      }
      setContacts([...contacts, newContact]);
      setNewContact({ name: '', phone: '', relationship: '' });
      setShowAddContact(false);
      Alert.alert('✅ Success', 'Emergency contact added!');
    } catch (e) {
      Alert.alert('Error', 'Failed to add contact');
    }
    setLoading(false);
  };

  const startSOS = () => {
    setSosActive(true);
    setSosCountdown(5);
    Vibration.vibrate([500, 500, 500, 500, 500]);
    
    // Shake animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 15, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -15, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
      ])
    ).start();

    // Scale animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosScaleAnim, { toValue: 1.15, duration: 200, useNativeDriver: true }),
        Animated.timing(sosScaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
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
        body: JSON.stringify({ user_id: user?.id, location: { lat: 6.4281, lng: 3.4219 } }),
      });
      
      Alert.alert(
        '🚨 SOS ACTIVATED',
        'Emergency services notified. Your contacts will receive your location.',
        [{ text: 'OK', onPress: cancelSOS }]
      );
      
      Linking.openURL('tel:112');
    } catch (e) {
      Alert.alert('Error', 'Please call emergency services manually.');
      cancelSOS();
    }
  };

  const callEmergency = () => {
    Alert.alert('Call Emergency', 'Connect to emergency services (112)?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'CALL NOW', onPress: () => Linking.openURL('tel:112') }
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SAFETY CENTER</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* SOS Button - LARGE BOLD BRIGHT */}
          <Animated.View style={[
            styles.sosSection,
            { opacity: fadeAnim, transform: [{ translateX: sosActive ? shakeAnim : 0 }] }
          ]}>
            <Text style={styles.sosTitle}>EMERGENCY SOS</Text>
            <Text style={styles.sosDesc}>Press and hold for 3 seconds</Text>
            
            <TouchableOpacity
              onPressIn={startSOS}
              onPressOut={() => !sosActive && cancelSOS()}
              activeOpacity={0.95}
            >
              {/* Animated Glow Rings */}
              <Animated.View style={[styles.sosGlowOuter, { opacity: glowAnim, transform: [{ scale: pulseAnim }] }]} />
              <Animated.View style={[styles.sosGlowMiddle, { opacity: glowAnim, transform: [{ scale: pulseAnim }] }]} />
              
              <Animated.View style={[
                styles.sosButtonOuter,
                { transform: [{ scale: sosActive ? sosScaleAnim : pulseAnim }] }
              ]}>
                <LinearGradient
                  colors={sosActive ? ['#FF0000', '#CC0000', '#990000'] : ['#FF3333', '#FF0000', '#CC0000']}
                  style={styles.sosButton}
                >
                  {sosActive ? (
                    <View style={styles.sosCountdownContainer}>
                      <Text style={styles.sosCountdownText}>{sosCountdown}</Text>
                      <Text style={styles.sosCountdownLabel}>TAP TO CANCEL</Text>
                    </View>
                  ) : (
                    <>
                      <Ionicons name="warning" size={56} color="#FFFFFF" />
                      <Text style={styles.sosButtonText}>SOS</Text>
                    </>
                  )}
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
            
            {sosActive && (
              <TouchableOpacity style={styles.cancelButton} onPress={cancelSOS}>
                <Text style={styles.cancelText}>❌ CANCEL EMERGENCY</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Quick Emergency Actions - BRIGHTER */}
          <Animated.View style={[styles.quickActions, { opacity: fadeAnim }]}>
            <TouchableOpacity style={styles.quickAction} onPress={callEmergency}>
              <LinearGradient
                colors={['#FF0000', '#FF3333']}
                style={styles.quickActionGradient}
              >
                <View style={styles.quickActionIcon}>
                  <Ionicons name="call" size={32} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionContent}>
                  <Text style={styles.quickActionTitle}>CALL 112</Text>
                  <Text style={styles.quickActionDesc}>Emergency Services</Text>
                </View>
                <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => Linking.openURL('tel:08001234567')}
            >
              <LinearGradient
                colors={[COLORS.blue, COLORS.blueBright]}
                style={styles.quickActionGradient}
              >
                <View style={styles.quickActionIcon}>
                  <Ionicons name="headset" size={32} color="#FFFFFF" />
                </View>
                <View style={styles.quickActionContent}>
                  <Text style={styles.quickActionTitle}>NEXRYDE SUPPORT</Text>
                  <Text style={styles.quickActionDesc}>24/7 Hotline</Text>
                </View>
                <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Emergency Contacts - BOLDER */}
          <Animated.View style={[styles.contactsSection, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>EMERGENCY CONTACTS</Text>
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowAddContact(true)}
              >
                <LinearGradient
                  colors={[COLORS.green, COLORS.greenBright]}
                  style={styles.addButtonGradient}
                >
                  <Ionicons name="add" size={22} color="#FFFFFF" />
                  <Text style={styles.addButtonText}>ADD</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {contacts.length === 0 ? (
              <View style={styles.emptyContacts}>
                <Ionicons name="people" size={64} color="#CCCCCC" />
                <Text style={styles.emptyText}>NO EMERGENCY CONTACTS</Text>
                <Text style={styles.emptyHint}>Add trusted contacts who will be notified</Text>
              </View>
            ) : (
              contacts.map((contact, index) => (
                <View key={index} style={styles.contactCard}>
                  <LinearGradient
                    colors={[COLORS.green, COLORS.greenBright]}
                    style={styles.contactAvatar}
                  >
                    <Text style={styles.contactInitial}>{contact.name.charAt(0).toUpperCase()}</Text>
                  </LinearGradient>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name.toUpperCase()}</Text>
                    <Text style={styles.contactPhone}>{contact.phone}</Text>
                    {contact.relationship && (
                      <Text style={styles.contactRelation}>{contact.relationship}</Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={styles.callContactBtn}
                    onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                  >
                    <LinearGradient
                      colors={[COLORS.green, COLORS.greenBright]}
                      style={styles.callGradient}
                    >
                      <Ionicons name="call" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Animated.View>

          {/* Safety Tips - SHARPER */}
          <View style={styles.tipsSection}>
            <Text style={styles.sectionTitle}>SAFETY TIPS</Text>
            
            <View style={styles.tipCard}>
              <View style={[styles.tipIcon, { backgroundColor: COLORS.green }]}>
                <Ionicons name="share-social" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>SHARE YOUR TRIP</Text>
                <Text style={styles.tipDesc}>Let friends track your ride in real-time</Text>
              </View>
            </View>

            <View style={styles.tipCard}>
              <View style={[styles.tipIcon, { backgroundColor: COLORS.blue }]}>
                <Ionicons name="car" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>VERIFY YOUR RIDE</Text>
                <Text style={styles.tipDesc}>Check driver's photo and plate number</Text>
              </View>
            </View>

            <View style={styles.tipCard}>
              <View style={[styles.tipIcon, { backgroundColor: COLORS.purple }]}>
                <Ionicons name="location" size={24} color="#FFFFFF" />
              </View>
              <View style={styles.tipContent}>
                <Text style={styles.tipTitle}>STAY IN BUSY AREAS</Text>
                <Text style={styles.tipDesc}>Request pickup in well-lit locations</Text>
              </View>
            </View>
          </View>

          {/* Add Contact Modal */}
          {showAddContact && (
            <View style={styles.modalOverlay}>
              <View style={styles.addContactModal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>ADD EMERGENCY CONTACT</Text>
                  <TouchableOpacity onPress={() => setShowAddContact(false)}>
                    <Ionicons name="close-circle" size={32} color="#999" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalInput}>
                  <Ionicons name="person" size={24} color={COLORS.blue} />
                  <TextInput
                    style={styles.input}
                    placeholder="CONTACT NAME"
                    placeholderTextColor="#999"
                    value={newContact.name}
                    onChangeText={(text) => setNewContact({ ...newContact, name: text })}
                  />
                </View>

                <View style={styles.modalInput}>
                  <Ionicons name="call" size={24} color={COLORS.green} />
                  <TextInput
                    style={styles.input}
                    placeholder="PHONE NUMBER"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                    value={newContact.phone}
                    onChangeText={(text) => setNewContact({ ...newContact, phone: text })}
                  />
                </View>

                <View style={styles.modalInput}>
                  <Ionicons name="heart" size={24} color={COLORS.red} />
                  <TextInput
                    style={styles.input}
                    placeholder="RELATIONSHIP (OPTIONAL)"
                    placeholderTextColor="#999"
                    value={newContact.relationship}
                    onChangeText={(text) => setNewContact({ ...newContact, relationship: text })}
                  />
                </View>

                <TouchableOpacity style={styles.saveButton} onPress={addContact} disabled={loading}>
                  <LinearGradient
                    colors={[COLORS.green, COLORS.greenBright]}
                    style={styles.saveGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveText}>SAVE CONTACT</Text>
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
    backgroundColor: '#F5F5F5',
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: '#EEEEEE',
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 2,
  },
  scrollContent: {
    padding: 20,
  },
  sosSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  sosTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 2,
    marginBottom: 6,
  },
  sosDesc: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 28,
  },
  sosGlowOuter: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#FF0000',
    top: -20,
    left: -20,
    opacity: 0.15,
  },
  sosGlowMiddle: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#FF0000',
    top: -5,
    left: -5,
    opacity: 0.25,
  },
  sosButtonOuter: {
    borderRadius: 110,
    padding: 10,
    backgroundColor: 'rgba(255,0,0,0.15)',
  },
  sosButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 15,
  },
  sosButtonText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 8,
    letterSpacing: 6,
  },
  sosCountdownContainer: {
    alignItems: 'center',
  },
  sosCountdownText: {
    fontSize: 80,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  sosCountdownLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1,
  },
  cancelButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#FF0000',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FF0000',
    letterSpacing: 1,
  },
  quickActions: {
    gap: 14,
    marginBottom: 28,
  },
  quickAction: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  quickActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 16,
  },
  quickActionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  quickActionDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  contactsSection: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
  },
  addButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  addButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  emptyContacts: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333333',
    marginTop: 16,
    letterSpacing: 1,
  },
  emptyHint: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    marginTop: 6,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  contactAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInitial: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  contactPhone: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    marginTop: 4,
  },
  contactRelation: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999999',
    marginTop: 2,
  },
  callContactBtn: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  callGradient: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsSection: {
    marginBottom: 28,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tipIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: 0.5,
  },
  tipDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
    marginTop: 4,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addContactModal: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
  },
  modalInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    paddingVertical: 16,
  },
  saveButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },
  saveGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  saveText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
