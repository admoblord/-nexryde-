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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Card, Button, Badge } from '@/src/components/UI';
import { useAppStore } from '@/src/store/appStore';

interface FamilyMember {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export default function FamilyModeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', phone: '', relationship: '' });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Mock data - in real app, fetch from API
  useEffect(() => {
    loadFamilyMembers();
  }, []);

  const loadFamilyMembers = async () => {
    // Mock data
    setFamilyMembers([]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFamilyMembers();
    setRefreshing(false);
  };

  const handleAddMember = () => {
    if (!newMember.name || !newMember.phone || !newMember.relationship) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    
    const member: FamilyMember = {
      id: Date.now().toString(),
      ...newMember
    };
    
    setFamilyMembers([...familyMembers, member]);
    setShowAddModal(false);
    setNewMember({ name: '', phone: '', relationship: '' });
    Alert.alert('Success', `${member.name} added to your family members`);
  };

  const handleRemoveMember = (id: string) => {
    Alert.alert(
      'Remove Member',
      'Are you sure you want to remove this family member?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setFamilyMembers(familyMembers.filter(m => m.id !== id));
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
            // Navigate to book screen with family member info
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
          <Text style={styles.title}>Family & Friends</Text>
        </View>

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="people" size={32} color={COLORS.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Book rides for your loved ones</Text>
              <Text style={styles.infoText}>
                Add family members and friends to book and track rides for them
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
              <Ionicons name="card" size={20} color={COLORS.accent} />
              <Text style={styles.featureText}>Pay for their rides</Text>
            </View>
          </View>
        </Card>

        {/* Add Member Button */}
        <Button
          title="Add Family Member"
          onPress={() => setShowAddModal(true)}
          icon="person-add"
          style={styles.addButton}
        />

        {/* Family Members List */}
        <View style={styles.membersSection}>
          <Text style={styles.sectionTitle}>Your Family Members</Text>
          
          {familyMembers.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="people-outline" size={48} color={COLORS.gray400} />
              <Text style={styles.emptyTitle}>No family members yet</Text>
              <Text style={styles.emptyText}>
                Add your family members to book and track rides for them
              </Text>
            </Card>
          ) : (
            familyMembers.map((member) => (
              <Card key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitial}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberPhone}>{member.phone}</Text>
                    <Badge text={member.relationship} variant="info" />
                  </View>
                </View>
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={styles.bookButton}
                    onPress={() => handleBookForMember(member)}
                  >
                    <Ionicons name="car" size={20} color={COLORS.primary} />
                    <Text style={styles.bookButtonText}>Book Ride</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveMember(member.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* How It Works */}
        <Card style={styles.howItWorksCard}>
          <Text style={styles.howItWorksTitle}>How It Works</Text>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Add family member</Text>
              <Text style={styles.stepText}>Enter their name, phone, and relationship</Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Book a ride for them</Text>
              <Text style={styles.stepText}>Enter pickup and dropoff locations</Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Track their trip</Text>
              <Text style={styles.stepText}>Follow their ride in real-time and pay for them</Text>
            </View>
          </View>
        </Card>
      </ScrollView>

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
              {['Parent', 'Child', 'Spouse', 'Friend', 'Other'].map((rel) => (
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
              title="Add Member"
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
    fontWeight: '700',
    color: COLORS.textPrimary,
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
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
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
    color: COLORS.textPrimary,
  },
  addButton: {
    marginBottom: SPACING.lg,
  },
  membersSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  emptyCard: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  memberCard: {
    marginBottom: SPACING.sm,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  memberDetails: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  memberName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  memberPhone: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  memberActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
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
    fontWeight: '600',
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
    fontWeight: '600',
    color: COLORS.info,
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
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  stepText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
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
});
