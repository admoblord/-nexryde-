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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  cyan: '#06B6D4',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAppStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entry animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous pulse for avatar glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      // Handle image upload
      Alert.alert('Success', 'Profile photo updated!');
    }
  };

  const saveProfile = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      
      if (res.ok) {
        setUser({ ...user, name, email });
        setIsEditing(false);
        Alert.alert('Success', 'Profile updated successfully!');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update profile');
    }
    setLoading(false);
  };

  const stats = [
    { label: 'Trips', value: '47', icon: 'car', color: COLORS.green },
    { label: 'Rating', value: '4.9', icon: 'star', color: COLORS.orange },
    { label: 'Rewards', value: '₦2.5k', icon: 'gift', color: COLORS.purple },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Animated Header Background */}
        <Animated.View style={[styles.headerBg, { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient
            colors={[COLORS.green, COLORS.blue, COLORS.purple]}
            style={styles.headerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => isEditing ? saveProfile() : setIsEditing(true)}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name={isEditing ? "checkmark" : "create-outline"} size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Avatar Section with Animation */}
          <Animated.View style={[
            styles.avatarSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
            }
          ]}>
            <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
              <Animated.View style={[styles.avatarGlow, { transform: [{ scale: pulseAnim }] }]} />
              <LinearGradient
                colors={[COLORS.greenLight, COLORS.green, COLORS.blue]}
                style={styles.avatar}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.avatarText}>{user?.name?.charAt(0) || 'U'}</Text>
              </LinearGradient>
              <View style={styles.cameraButton}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <View style={styles.memberBadge}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.green} />
              <Text style={styles.memberText}>Verified Member</Text>
            </View>
          </Animated.View>

          {/* Stats Row with Animation */}
          <Animated.View style={[
            styles.statsRow,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
          ]}>
            {stats.map((stat, index) => (
              <View key={stat.label} style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: stat.color + '20' }]}>
                  <Ionicons name={stat.icon as any} size={22} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Profile Info Card */}
          <Animated.View style={[
            styles.infoCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
          ]}>
            <Text style={styles.cardTitle}>Personal Information</Text>
            
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: COLORS.blue + '15' }]}>
                <Ionicons name="person" size={20} color={COLORS.blue} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Full Name</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.infoInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your name"
                  />
                ) : (
                  <Text style={styles.infoValue}>{user?.name || 'Not set'}</Text>
                )}
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: COLORS.green + '15' }]}>
                <Ionicons name="call" size={20} color={COLORS.green} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone Number</Text>
                <Text style={styles.infoValue}>{user?.phone || 'Not set'}</Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: COLORS.purple + '15' }]}>
                <Ionicons name="mail" size={20} color={COLORS.purple} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email Address</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.infoInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    keyboardType="email-address"
                  />
                ) : (
                  <Text style={styles.infoValue}>{user?.email || 'Not set'}</Text>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Quick Actions */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/wallet')}>
              <LinearGradient
                colors={[COLORS.orange + '15', COLORS.orange + '08']}
                style={styles.actionGradient}
              >
                <View style={[styles.actionIcon, { backgroundColor: COLORS.orange }]}>
                  <Ionicons name="gift" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Rewards</Text>
                  <Text style={styles.actionDesc}>View your rewards balance</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/safety')}>
              <LinearGradient
                colors={[COLORS.red + '15', COLORS.red + '08']}
                style={styles.actionGradient}
              >
                <View style={[styles.actionIcon, { backgroundColor: COLORS.red }]}>
                  <Ionicons name="shield" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Safety Center</Text>
                  <Text style={styles.actionDesc}>Emergency contacts & SOS</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/ride-history')}>
              <LinearGradient
                colors={[COLORS.cyan + '15', COLORS.cyan + '08']}
                style={styles.actionGradient}
              >
                <View style={[styles.actionIcon, { backgroundColor: COLORS.cyan }]}>
                  <Ionicons name="time" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Ride History</Text>
                  <Text style={styles.actionDesc}>View all your past trips</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </LinearGradient>
            </TouchableOpacity>
          </View>

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
  headerBg: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    height: 280,
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
    overflow: 'hidden',
  },
  headerGradient: {
    flex: 1,
    opacity: 0.9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarGlow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.green,
    opacity: 0.3,
    top: -5,
    left: -5,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  userName: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 8,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.green + '15',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  memberText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.green,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  infoCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  infoInput: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.blue,
    paddingVertical: 4,
  },
  infoDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
    marginLeft: 58,
  },
  verifiedBadge: {
    marginLeft: 'auto',
  },
  actionsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 14,
  },
  actionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  actionDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
