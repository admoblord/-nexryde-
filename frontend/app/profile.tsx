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

// BRIGHTER, BOLDER COLORS
const COLORS = {
  background: '#FFFFFF',
  card: '#FFFFFF',
  primary: '#000000',
  green: '#00D26A',
  greenLight: '#00FF85',
  greenBright: '#00FF7F',
  blue: '#0066FF',
  blueBright: '#00A3FF',
  purple: '#8B00FF',
  purpleBright: '#A855F7',
  orange: '#FF6B00',
  orangeBright: '#FF9500',
  red: '#FF0000',
  cyan: '#00D4FF',
  textPrimary: '#000000',
  textSecondary: '#333333',
  textMuted: '#666666',
  border: '#E0E0E0',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAppStore();
  
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Entry animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous glow animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
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
      Alert.alert('✅ Success', 'Profile photo updated!');
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
        Alert.alert('✅ Success', 'Profile updated successfully!');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update profile');
    }
    setLoading(false);
  };

  const stats = [
    { label: 'TRIPS', value: '47', icon: 'car', color: COLORS.green },
    { label: 'RATING', value: '4.9', icon: 'star', color: COLORS.orange },
    { label: 'REWARDS', value: '₦2.5k', icon: 'gift', color: COLORS.purple },
  ];

  return (
    <View style={styles.container}>
      {/* BRIGHT Gradient Background */}
      <LinearGradient
        colors={[COLORS.greenBright, COLORS.green, COLORS.blueBright, COLORS.blue]}
        style={styles.headerBg}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>MY PROFILE</Text>
          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => isEditing ? saveProfile() : setIsEditing(true)}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name={isEditing ? "checkmark" : "create"} size={26} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Avatar Section - BIGGER & BOLDER */}
          <Animated.View style={[
            styles.avatarSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }]
            }
          ]}>
            <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
              {/* Animated Glow Ring */}
              <Animated.View style={[
                styles.avatarGlowOuter,
                { opacity: glowAnim, transform: [{ scale: pulseAnim }] }
              ]} />
              <Animated.View style={[
                styles.avatarGlow,
                { transform: [{ scale: pulseAnim }] }
              ]} />
              
              <LinearGradient
                colors={[COLORS.greenBright, COLORS.green, COLORS.blue]}
                style={styles.avatar}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
              </LinearGradient>
              
              <View style={styles.cameraButton}>
                <LinearGradient
                  colors={[COLORS.orange, COLORS.orangeBright]}
                  style={styles.cameraGradient}
                >
                  <Ionicons name="camera" size={18} color="#FFFFFF" />
                </LinearGradient>
              </View>
            </TouchableOpacity>
            
            <Text style={styles.userName}>{user?.name?.toUpperCase() || 'USER'}</Text>
            
            <View style={styles.memberBadge}>
              <LinearGradient
                colors={[COLORS.green, COLORS.greenBright]}
                style={styles.memberGradient}
              >
                <Ionicons name="shield-checkmark" size={16} color="#FFFFFF" />
                <Text style={styles.memberText}>VERIFIED MEMBER</Text>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Stats Row - BOLDER */}
          <Animated.View style={[
            styles.statsRow,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
          ]}>
            {stats.map((stat, index) => (
              <View key={stat.label} style={styles.statItem}>
                <View style={[styles.statIcon, { backgroundColor: stat.color }]}>
                  <Ionicons name={stat.icon as any} size={26} color="#FFFFFF" />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Profile Info Card - SHARPER */}
          <Animated.View style={[
            styles.infoCard,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
          ]}>
            <Text style={styles.cardTitle}>PERSONAL INFORMATION</Text>
            
            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: COLORS.blue }]}>
                <Ionicons name="person" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>FULL NAME</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.infoInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your name"
                    placeholderTextColor="#999"
                  />
                ) : (
                  <Text style={styles.infoValue}>{user?.name || 'Not set'}</Text>
                )}
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: COLORS.green }]}>
                <Ionicons name="call" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>PHONE NUMBER</Text>
                <Text style={styles.infoValue}>{user?.phone || 'Not set'}</Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.green} />
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: COLORS.purple }]}>
                <Ionicons name="mail" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>EMAIL ADDRESS</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.infoInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    placeholderTextColor="#999"
                    keyboardType="email-address"
                  />
                ) : (
                  <Text style={styles.infoValue}>{user?.email || 'Not set'}</Text>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Quick Actions - BRIGHTER */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
            
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/wallet')}>
              <LinearGradient
                colors={[COLORS.orange, COLORS.orangeBright]}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.actionIconCircle}>
                  <Ionicons name="gift" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>REWARDS</Text>
                  <Text style={styles.actionDesc}>View your rewards balance</Text>
                </View>
                <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/safety')}>
              <LinearGradient
                colors={[COLORS.red, '#FF4444']}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.actionIconCircle}>
                  <Ionicons name="shield" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>SAFETY CENTER</Text>
                  <Text style={styles.actionDesc}>Emergency contacts & SOS</Text>
                </View>
                <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/ride-history')}>
              <LinearGradient
                colors={[COLORS.cyan, COLORS.blue]}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={styles.actionIconCircle}>
                  <Ionicons name="time" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>RIDE HISTORY</Text>
                  <Text style={styles.actionDesc}>View all your past trips</Text>
                </View>
                <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
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
    backgroundColor: '#F5F5F5',
  },
  safeArea: {
    flex: 1,
  },
  headerBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  editButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarGlowOuter: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#FFFFFF',
    top: -10,
    left: -10,
  },
  avatarGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.5)',
    top: -5,
    left: -5,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  cameraGradient: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  memberBadge: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  memberGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  memberText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#666666',
    letterSpacing: 1,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  infoIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#999999',
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
  },
  infoInput: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000000',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.blue,
    paddingVertical: 4,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 16,
    marginLeft: 68,
  },
  verifiedBadge: {
    marginLeft: 'auto',
  },
  actionsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
    marginBottom: 16,
  },
  actionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 16,
  },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  actionDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
});
