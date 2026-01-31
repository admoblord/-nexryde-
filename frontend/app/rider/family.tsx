import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Button, Badge } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';
import { 
  createFamily, 
  getFamily, 
  addFamilyMember, 
  removeFamilyMember,
  triggerFamilySafetyAlert
} from '@/src/services/api';

interface FamilyMember {
  user_id: string;
  name: string;
  phone: string;
  relationship: string;
  role: string;
  is_pending?: boolean;
  rating?: number;
  total_trips?: number;
}

interface Family {
  id: string;
  name: string;
  owner_id: string;
  members: FamilyMember[];
  trust_score: number;
}

export default function FamilyModeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [family, setFamily] = useState<Family | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', phone: '', relationship: '' });
  const [newFamilyName, setNewFamilyName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    loadFamily();
  }, [user?.id]);

  const loadFamily = async () => {
    if (!user?.id) {
      setInitialLoading(false);
      return;
    }
    try {
      // Check if user has a family_id set
      const userFamilyId = (user as any).family_id;
      if (userFamilyId) {
        const res = await getFamily(userFamilyId);
        setFamily(res.data);
      }
    } catch (error) {
      console.log('No family found or error loading:', error);
    } finally {
      setInitialLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFamily();
    setRefreshing(false);
  };

  const handleCreateFamily = async () => {
    if (!newFamilyName.trim()) {
      Alert.alert('Error', 'Please enter a family name');
      return;
    }
    
    setLoading(true);
    try {
      const res = await createFamily(user!.id, newFamilyName.trim());
      Alert.alert('Success', 'Family created! You can now add members.');
      setShowCreateModal(false);
      setNewFamilyName('');
      // Update user's family_id in local state
      await loadFamily();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create family');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!family || !newMember.name || !newMember.phone || !newMember.relationship) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    
    setLoading(true);
    try {
      await addFamilyMember(family.id, newMember.phone, newMember.name, newMember.relationship);
      Alert.alert('Success', `${newMember.name} added to your family`);
      setShowAddModal(false);
      setNewMember({ name: '', phone: '', relationship: '' });
      await loadFamily();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = (member: FamilyMember) => {
    if (member.role === 'owner') {
      Alert.alert('Cannot Remove', 'The family owner cannot be removed');
      return;
    }
    
    Alert.alert(
      'Remove Member',
      `Remove ${member.name} from your family?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFamilyMember(family!.id, member.phone);
              await loadFamily();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove member');
            }
          }
        }
      ]
    );
  };

  const handleSafetyAlert = async () => {
    if (!family || !user?.id) return;
    
    Alert.alert(
      'Safety Alert',
      'This will send an emergency alert to all family members with your location. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Alert',
          style: 'destructive',
          onPress: async () => {
            try {
              // In production, get real location
              await triggerFamilySafetyAlert(family.id, user.id, 6.5244, 3.3792);
              Alert.alert('Alert Sent', 'All family members have been notified');
            } catch (error) {
              Alert.alert('Error', 'Failed to send alert');
            }
          }
        }
      ]
    );
  };

  const handleBookForMember = (member: FamilyMember) => {
    Alert.alert(
      'Book Ride',
      `Book a ride for ${member.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book',
          onPress: () => {
            router.push({
              pathname: '/rider/book',
              params: { 
                forFamily: 'true',
                familyName: member.name,
                familyPhone: member.phone
              }
            });
          }
        }
      ]
    );
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading family...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>NEXRYDE Family</Text>
        </View>

        {!family ? (
          // No family - show create option
          <>
            <Card style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="people" size={48} color={COLORS.primary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoTitle}>Create Your NEXRYDE Family</Text>
                  <Text style={styles.infoText}>
                    Add up to 10 family members to book rides for them, track their trips, and keep everyone safe.
                  </Text>
                </View>
              </View>
              <View style={styles.features}>
                <View style={styles.featureItem}>
                  <Ionicons name="car" size={20} color={COLORS.success} />
                  <Text style={styles.featureText}>Book rides on their behalf</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="location" size={20} color={COLORS.info} />
                  <Text style={styles.featureText}>Track their trips in real-time</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="shield" size={20} color={COLORS.error} />
                  <Text style={styles.featureText}>Safety Circle - instant alerts</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="card" size={20} color={COLORS.accent} />
                  <Text style={styles.featureText}>Shared payment methods</Text>
                </View>
              </View>
            </Card>
            
            <Button
              title="Create Family"
              onPress={() => setShowCreateModal(true)}
              icon="people"
              style={styles.createButton}
            />
          </>
        ) : (
          // Has family - show members
          <>
            {/* Family Header */}
            <Card style={styles.familyHeaderCard}>
              <View style={styles.familyHeaderContent}>
                <View style={styles.familyIcon}>
                  <Ionicons name="home" size={32} color={COLORS.white} />
                </View>
                <View style={styles.familyHeaderInfo}>
                  <Text style={styles.familyName}>{family.name}</Text>
                  <Text style={styles.familyMemberCount}>
                    {family.members.length} of 10 members
                  </Text>
                </View>
                <View style={styles.trustScoreBadge}>
                  <Text style={styles.trustScoreText}>{family.trust_score?.toFixed(0)}%</Text>
                  <Text style={styles.trustScoreLabel}>Trust</Text>
                </View>
              </View>
              
              {/* Safety Circle Button */}
              <TouchableOpacity 
                style={styles.safetyCircleButton}
                onPress={handleSafetyAlert}
              >
                <Ionicons name="alert-circle" size={20} color={COLORS.error} />
                <Text style={styles.safetyCircleText}>Send Safety Alert to All</Text>
              </TouchableOpacity>
            </Card>

            {/* Add Member Button */}
            {family.members.length < 10 && (
              <Button
                title="Add Family Member"
                onPress={() => setShowAddModal(true)}
                icon="person-add"
                variant="outline"
                style={styles.addButton}
              />
            )}

            {/* Members List */}
            <View style={styles.membersSection}>
              <Text style={styles.sectionTitle}>Family Members</Text>
              
              {family.members.map((member, idx) => (
                <Card key={idx} style={styles.memberCard}>
                  <View style={styles.memberInfo}>
                    <View style={[
                      styles.memberAvatar,
                      member.role === 'owner' && styles.ownerAvatar
                    ]}>
                      <Text style={styles.memberInitial}>
                        {member.name?.charAt(0).toUpperCase() || '?'}
                      </Text>
                      {member.role === 'owner' && (
                        <View style={styles.ownerBadge}>
                          <Ionicons name="star" size={10} color={COLORS.white} />
                        </View>
                      )}
                    </View>
                    <View style={styles.memberDetails}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberName}>{member.name}</Text>
                        {member.role === 'owner' && (
                          <Badge text="Owner" variant="success" />
                        )}
                        {member.is_pending && (
                          <Badge text="Pending" variant="warning" />
                        )}
                      </View>
                      <Text style={styles.memberPhone}>{member.phone}</Text>
                      <Badge text={member.relationship} variant="info" />
                    </View>
                  </View>
                  
                  <View style={styles.memberActions}>
                    <TouchableOpacity
                      style={styles.bookButton}
                      onPress={() => handleBookForMember(member)}
                    >
                      <Ionicons name="car" size={18} color={COLORS.primary} />
                      <Text style={styles.bookButtonText}>Book</Text>
                    </TouchableOpacity>
                    
                    {member.role !== 'owner' && (
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemoveMember(member)}
                      >
                        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              ))}
            </View>
          </>
        )}

        {/* How It Works */}
        <Card style={styles.howItWorksCard}>
          <Text style={styles.howItWorksTitle}>How Safety Circle Works</Text>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Any member triggers alert</Text>
              <Text style={styles.stepText}>Press the Safety Alert button during emergency</Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Everyone gets notified</Text>
              <Text style={styles.stepText}>All family members receive instant push notification</Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Location is shared</Text>
              <Text style={styles.stepText}>Family can see exact location and track in real-time</Text>
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* Create Family Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Your Family</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.input}
              placeholder="Family Name (e.g., Adeyemi Family)"
              placeholderTextColor={COLORS.gray400}
              value={newFamilyName}
              onChangeText={setNewFamilyName}
            />
            
            <Button
              title={loading ? 'Creating...' : 'Create Family'}
              onPress={handleCreateFamily}
              loading={loading}
              icon="people"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Family Member</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={COLORS.gray400}
              value={newMember.name}
              onChangeText={(text) => setNewMember({ ...newMember, name: text })}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor={COLORS.gray400}
              keyboardType="phone-pad"
              value={newMember.phone}
              onChangeText={(text) => setNewMember({ ...newMember, phone: text })}
            />
            
            <Text style={styles.relationshipLabel}>Relationship</Text>
            <View style={styles.relationshipOptions}>
              {['Parent', 'Child', 'Spouse', 'Sibling', 'Friend'].map((rel) => (
                <TouchableOpacity
                  key={rel}
                  style={[
                    styles.relationshipOption,
                    newMember.relationship === rel && styles.relationshipOptionSelected
                  ]}
                  onPress={() => setNewMember({ ...newMember, relationship: rel })}
                >
                  <Text
                    style={[
                      styles.relationshipOptionText,
                      newMember.relationship === rel && styles.relationshipOptionTextSelected
                    ]}
                  >
                    {rel}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Button
              title={loading ? 'Adding...' : 'Add Member'}
              onPress={handleAddMember}
              loading={loading}
              icon="person-add"
              style={styles.modalButton}
            />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#475569',
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  infoCard: {
    marginBottom: SPACING.md,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  infoContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  infoTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
    lineHeight: 20,
  },
  features: {
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  featureText: {
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#334155',
  },
  createButton: {
    marginBottom: SPACING.lg,
  },
  familyHeaderCard: {
    marginBottom: SPACING.md,
    backgroundColor: COLORS.primary,
  },
  familyHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  familyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyHeaderInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  familyName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  familyMemberCount: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },
  trustScoreBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  trustScoreText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
  trustScoreLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  safetyCircleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
  },
  safetyCircleText: {
    marginLeft: SPACING.sm,
    color: COLORS.white,
    fontWeight: '700',
  },
  addButton: {
    marginBottom: SPACING.md,
  },
  membersSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: SPACING.md,
  },
  memberCard: {
    marginBottom: SPACING.sm,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatar: {
    backgroundColor: COLORS.success + '20',
  },
  ownerBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  memberInitial: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.primary,
  },
  memberDetails: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexWrap: 'wrap',
  },
  memberName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  memberPhone: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
    marginBottom: SPACING.xs,
  },
  memberActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    gap: SPACING.sm,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  bookButtonText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
  },
  removeButton: {
    padding: SPACING.sm,
  },
  howItWorksCard: {
    backgroundColor: COLORS.info + '10',
    borderWidth: 1,
    borderColor: COLORS.info + '30',
  },
  howItWorksTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.info,
    letterSpacing: -0.5,
    marginBottom: SPACING.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.white,
  },
  stepInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  stepTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  stepText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#475569',
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
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
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
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    fontWeight: '700',
    color: '#475569',
  },
  relationshipOptionTextSelected: {
    color: COLORS.white,
    fontWeight: '700',
  },
  modalButton: {
    marginTop: SPACING.md,
  },
});
