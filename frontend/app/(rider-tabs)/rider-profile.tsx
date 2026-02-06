import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';
import { sendOTP, verifyOTP } from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';

export default function RiderProfileScreen() {
  const router = useRouter();
  const { user, logout, setUser } = useAppStore();
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [verificationStep, setVerificationStep] = useState(0);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [profileImage, setProfileImage] = useState(user?.profile_image || null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  const checkBiometricSupport = async () => {
    try {
      const { isBiometricSupported, isBiometricEnabled } = await import('@/utils/authStorage');
      const supported = await isBiometricSupported();
      const enabled = await isBiometricEnabled();
      
      setBiometricSupported(supported);
      setBiometricEnabled(enabled);
    } catch (error) {
      console.error('Error checking biometric:', error);
    }
  };

  const toggleBiometric = async (value: boolean) => {
    try {
      const { enableBiometricLogin, disableBiometricLogin, getBiometricTypes } = await import('@/utils/authStorage');
      
      if (value) {
        const types = await getBiometricTypes();
        const typeText = types.join(', ') || 'Biometric';
        
        Alert.alert(
          `Enable ${typeText}?`,
          `Use your ${typeText.toLowerCase()} to login quickly and securely.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Enable',
              onPress: async () => {
                const success = await enableBiometricLogin();
                if (success) {
                  setBiometricEnabled(true);
                  Alert.alert('✅ Enabled', `${typeText} login is now active!`);
                } else {
                  Alert.alert('❌ Failed', 'Could not enable biometric login.');
                }
              }
            }
          ]
        );
      } else {
        const success = await disableBiometricLogin();
        if (success) {
          setBiometricEnabled(false);
          Alert.alert('Disabled', 'Biometric login has been disabled.');
        }
      }
    } catch (error) {
      console.error('Error toggling biometric:', error);
      Alert.alert('Error', 'Failed to toggle biometric login.');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: () => {
            logout();
            // Clear all navigation state and go to login
            router.dismissAll();
            router.replace('/(auth)/login');
          }
        }
      ]
    );
  };

  const handleBecomeDriver = async () => {
    setShowSwitchModal(true);
    setVerificationStep(0);
    setOtp('');
    setOtpSent(false);
    
    // Auto-send OTP when modal opens
    await handleSendOTP();
  };

  const handleSendOTP = async () => {
    if (!user?.phone) {
      Alert.alert('Error', 'Phone number not found');
      return;
    }

    setLoading(true);
    try {
      await sendOTP(user.phone);
      setOtpSent(true);
      Alert.alert(
        'OTP Sent!',
        `We've sent a verification code to ${user.phone}. Please enter it to continue.`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Send OTP error:', error);
      Alert.alert(
        'Error Sending OTP',
        error.response?.data?.detail || 'Failed to send verification code. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter a 6-digit verification code');
      return;
    }

    if (!user?.phone) {
      Alert.alert('Error', 'Phone number not found');
      return;
    }

    setLoading(true);
    try {
      const response = await verifyOTP(user.phone, otp);
      
      if (response.data.verified) {
        // OTP is valid, proceed to next step
        setVerificationStep(1);
      } else {
        Alert.alert(
          'Invalid Code',
          'The verification code you entered is incorrect. Please check and try again.',
          [{ text: 'OK' }]
        );
        setOtp('');
      }
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      Alert.alert(
        'Verification Failed',
        error.response?.data?.detail || 'Failed to verify code. Please try again.',
        [{ text: 'OK' }]
      );
      setOtp('');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSwitch = () => {
    // Update user role
    if (user) {
      setUser({ ...user, role: 'driver' });
    }
    setShowSwitchModal(false);
    setVerificationStep(0);
    setOtp('');
    
    Alert.alert(
      'Welcome, Driver!',
      'Your account has been upgraded to Driver. You can now earn with NEXRYDE!',
      [{ 
        text: 'Start Earning', 
        onPress: () => {
          // Navigate to driver verification/onboarding first
          router.replace('/driver/verification');
        }
      }]
    );
  };

  // 📸 PROFILE PICTURE UPLOAD
  const handleProfilePictureUpload = async () => {
    Alert.alert(
      'Update Profile Picture',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Please allow camera access to take a photo.');
              return;
            }

            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              setProfileImage(result.assets[0].uri);
              if (user) {
                setUser({ ...user, profile_image: result.assets[0].uri });
              }
              Alert.alert('Success', 'Profile picture updated!');
            }
          }
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Required', 'Please allow access to your photos.');
              return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              setProfileImage(result.assets[0].uri);
              if (user) {
                setUser({ ...user, profile_image: result.assets[0].uri });
              }
              Alert.alert('Success', 'Profile picture updated!');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handleProfilePictureUpload} activeOpacity={0.7}>
            <View style={styles.avatar}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {(user?.name && user.name.length > 0) ? user.name.charAt(0).toUpperCase() : 'R'}
                </Text>
              )}
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={12} color={COLORS.white} />
            </View>
            <View style={styles.cameraIcon}>
              <Ionicons name="camera" size={16} color={COLORS.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{user?.name || 'Rider'}</Text>
          <Text style={styles.userPhone}>{user?.phone || '+234'}</Text>
          <View style={styles.riderBadge}>
            <Ionicons name="person" size={14} color={COLORS.info} />
            <Text style={styles.riderBadgeText}>Rider Account</Text>
          </View>
          
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.total_trips || 0}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {user?.trips_completed > 0 ? (user?.rating?.toFixed(1) || 'N/A') : 'New User'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>0</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
          </View>
        </View>

        {/* Become a Driver Card */}
        <TouchableOpacity style={styles.becomeDriverCard} onPress={handleBecomeDriver} activeOpacity={0.9}>
          <View style={styles.becomeDriverIcon}>
            <Ionicons name="car-sport" size={28} color={COLORS.primary} />
          </View>
          <View style={styles.becomeDriverContent}>
            <Text style={styles.becomeDriverTitle}>Become a Driver</Text>
            <Text style={styles.becomeDriverText}>Earn money with NEXRYDE. Keep 100% of your fares!</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
        </TouchableOpacity>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Account</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/edit-profile')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="person-outline" size={20} color={COLORS.info} />
            </View>
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/ratings')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="star-outline" size={20} color={COLORS.accent} />
            </View>
            <Text style={styles.menuText}>My Ratings & Reviews</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/saved-places')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="location-outline" size={20} color={COLORS.success} />
            </View>
            <Text style={styles.menuText}>Saved Places</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Preferences</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/notifications')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.warning} />
            </View>
            <Text style={styles.menuText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="settings-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Settings</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/support')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="help-circle-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Help & Support</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        {/* ALL FEATURES SECTION - COMPREHENSIVE ACCESS */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>All Features</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/bid')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.primarySoft }]}>
              <Ionicons name="pricetag-outline" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.menuText}>Bid Ride</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/split-fare')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="people-outline" size={20} color={COLORS.warning} />
            </View>
            <Text style={styles.menuText}>Split Fare</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/tracking')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="navigate-outline" size={20} color={COLORS.info} />
            </View>
            <Text style={styles.menuText}>Live Tracking</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/ride-recording')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.errorSoft }]}>
              <Ionicons name="videocam-outline" size={20} color={COLORS.error} />
            </View>
            <Text style={styles.menuText}>Ride Recording</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/security-code')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Security Code</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/share-trip')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="share-social-outline" size={20} color={COLORS.accent} />
            </View>
            <Text style={styles.menuText}>Share Trip</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/car-type-preference')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.primarySoft }]}>
              <Ionicons name="car-sport-outline" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.menuText}>Car Type Preference</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/mood-preferences')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="musical-notes-outline" size={20} color={COLORS.warning} />
            </View>
            <Text style={styles.menuText}>Mood Preferences</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/traffic-status')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.errorSoft }]}>
              <Ionicons name="speedometer-outline" size={20} color={COLORS.error} />
            </View>
            <Text style={styles.menuText}>Traffic Status</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/rider/trip-receipt')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="receipt-outline" size={20} color={COLORS.info} />
            </View>
            <Text style={styles.menuText}>Trip Receipts</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/ai-buddy')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="chatbubbles-outline" size={20} color={COLORS.success} />
            </View>
            <Text style={styles.menuText}>AI Buddy</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/chat')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.primarySoft }]}>
              <Ionicons name="chatbox-outline" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.menuText}>Messages</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/lost-found')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="search-outline" size={20} color={COLORS.warning} />
            </View>
            <Text style={styles.menuText}>Lost & Found</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/fare-breakdown')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.gray100 }]}>
              <Ionicons name="calculator-outline" size={20} color={COLORS.gray600} />
            </View>
            <Text style={styles.menuText}>Fare Breakdown</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/ride-history')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="time-outline" size={20} color={COLORS.info} />
            </View>
            <Text style={styles.menuText}>Ride History</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/assistant')}>
            <View style={[styles.menuIcon, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="mic-outline" size={20} color={COLORS.accent} />
            </View>
            <Text style={styles.menuText}>Voice Assistant</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>NEXRYDE v1.0.0</Text>
      </ScrollView>

      {/* Become Driver Modal */}
      <Modal
        visible={showSwitchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSwitchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity 
              style={styles.modalClose}
              onPress={() => setShowSwitchModal(false)}
            >
              <Ionicons name="close" size={24} color={COLORS.gray500} />
            </TouchableOpacity>

            {verificationStep === 0 ? (
              // Step 1: OTP Verification - POLISHED
              <>
                {/* Premium Icon with Glow */}
                <View style={styles.modalIconWrap}>
                  <View style={styles.iconGlow} />
                  <Ionicons name="shield-checkmark" size={48} color={COLORS.accent} />
                </View>
                
                {/* Titles with Better Hierarchy */}
                <Text style={styles.modalTitle}>Verify Your Identity</Text>
                <Text style={styles.modalSubtitle}>
                  {otpSent 
                    ? `Enter the 6-digit code we sent to\n${user?.phone}` 
                    : `We'll send a secure verification code to\n${user?.phone}`}
                </Text>

                {otpSent && (
                  <View style={styles.otpContainer}>
                    <TextInput
                      style={styles.otpInput}
                      placeholder="• • • • • •"
                      placeholderTextColor={COLORS.gray300}
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!loading}
                      autoFocus
                    />
                  </View>
                )}

                {otpSent && (
                  <View style={styles.otpSuccessBadge}>
                    <View style={styles.successDot} />
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                    <Text style={styles.otpSuccessText}>Code sent successfully!</Text>
                  </View>
                )}

                {/* Premium Buttons */}
                {otpSent ? (
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      (otp.length !== 6 || loading) && styles.modalButtonDisabled
                    ]}
                    onPress={handleVerifyOTP}
                    disabled={otp.length !== 6 || loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color={COLORS.primary} size="small" />
                    ) : (
                      <>
                        <Text style={styles.modalButtonText}>Verify & Continue</Text>
                        <Ionicons name="arrow-forward-circle" size={22} color={COLORS.primary} />
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.modalButton, loading && styles.modalButtonDisabled]}
                    onPress={handleSendOTP}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color={COLORS.primary} size="small" />
                    ) : (
                      <>
                        <Ionicons name="mail" size={22} color={COLORS.primary} />
                        <Text style={styles.modalButtonText}>Send Verification Code</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {otpSent && (
                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={handleSendOTP}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="refresh" size={16} color={COLORS.accent} />
                    <Text style={styles.resendText}>
                      {loading ? 'Sending...' : 'Resend Code'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              // Step 2: Confirmation - POLISHED
              <>
                {/* Premium Car Icon with Animation Feel */}
                <View style={[styles.modalIconWrap, styles.modalIconWrapSuccess]}>
                  <View style={styles.iconGlowGreen} />
                  <Ionicons name="car-sport" size={52} color={COLORS.accent} />
                </View>
                
                <Text style={styles.modalTitle}>Ready to Earn?</Text>
                <Text style={styles.modalSubtitle}>
                  You're about to become a NEXRYDE driver.{'\n'}Here's what you'll get:
                </Text>

                {/* Premium Benefits Cards */}
                <View style={styles.benefitsList}>
                  <View style={styles.benefitCard}>
                    <View style={styles.benefitIconWrap}>
                      <Ionicons name="cash" size={24} color={COLORS.success} />
                    </View>
                    <View style={styles.benefitContent}>
                      <Text style={styles.benefitTitle}>100% Earnings</Text>
                      <Text style={styles.benefitDesc}>Keep every Naira you earn</Text>
                    </View>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={16} color={COLORS.white} />
                    </View>
                  </View>

                  <View style={styles.benefitCard}>
                    <View style={styles.benefitIconWrap}>
                      <Ionicons name="wallet" size={24} color={COLORS.info} />
                    </View>
                    <View style={styles.benefitContent}>
                      <Text style={styles.benefitTitle}>From ₦18,000/month</Text>
                      <Text style={styles.benefitDesc}>City Rider or Road Warrior plans</Text>
                    </View>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={16} color={COLORS.white} />
                    </View>
                  </View>

                  <View style={styles.benefitCard}>
                    <View style={styles.benefitIconWrap}>
                      <Ionicons name="time" size={24} color={COLORS.warning} />
                    </View>
                    <View style={styles.benefitContent}>
                      <Text style={styles.benefitTitle}>Your Schedule</Text>
                      <Text style={styles.benefitDesc}>Work whenever you want</Text>
                    </View>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={16} color={COLORS.white} />
                    </View>
                  </View>

                  <View style={styles.benefitCard}>
                    <View style={styles.benefitIconWrap}>
                      <Ionicons name="trophy" size={24} color={COLORS.accent} />
                    </View>
                    <View style={styles.benefitContent}>
                      <Text style={styles.benefitTitle}>Exclusive Benefits</Text>
                      <Text style={styles.benefitDesc}>Rewards & bonuses</Text>
                    </View>
                    <View style={styles.benefitCheck}>
                      <Ionicons name="checkmark" size={16} color={COLORS.white} />
                    </View>
                  </View>
                </View>

                {/* Premium Action Button with Gradient Feel */}
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleCompleteSwitch}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalButtonText}>Become a Driver</Text>
                  <Ionicons name="arrow-forward-circle" size={24} color={COLORS.primary} />
                </TouchableOpacity>

                {/* Secondary Button */}
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => setShowSwitchModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalSecondaryText}>Maybe Later</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  content: {
    padding: SPACING.lg,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.lg,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  avatarText: {
    fontSize: FONT_SIZE.display,
    fontWeight: '800',
    color: COLORS.accent,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  userPhone: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: SPACING.xs,
  },
  riderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  riderBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: '#2563EB',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    width: '80%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.gray200,
  },
  becomeDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.gold,
  },
  becomeDriverIcon: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  becomeDriverContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  becomeDriverTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  becomeDriverText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  menuSection: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  menuSectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    marginLeft: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: '#0F172A',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  logoutText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.error,
  },
  versionText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
    textAlign: 'center',
  },
  // Modal Styles - PREMIUM POLISH
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    padding: SPACING.xl,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xxl + SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  modalClose: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    padding: SPACING.sm,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.full,
    zIndex: 10,
  },
  modalIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.md,
    position: 'relative',
    overflow: 'visible',
  },
  modalIconWrapSuccess: {
    backgroundColor: COLORS.successSoft,
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.accent,
    opacity: 0.15,
  },
  iconGlowGreen: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.success,
    opacity: 0.15,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.sm,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 24,
    paddingHorizontal: SPACING.sm,
  },
  otpContainer: {
    width: '100%',
    marginBottom: SPACING.md,
  },
  otpInput: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 12,
    borderWidth: 3,
    borderColor: COLORS.accent,
    color: '#0F172A',
    ...SHADOWS.sm,
  },
  otpSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
  },
  successDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  otpSuccessText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.lg + SPACING.xs,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.xxl,
    width: '100%',
    gap: SPACING.md,
    ...SHADOWS.gold,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modalButtonDisabled: {
    backgroundColor: COLORS.gray200,
    shadowOpacity: 0,
    borderColor: COLORS.gray300,
  },
  modalButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  modalSecondaryButton: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
  },
  modalSecondaryText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray500,
  },
  benefitsList: {
    width: '100%',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.md,
    ...SHADOWS.sm,
    borderWidth: 2,
    borderColor: COLORS.gray100,
  },
  benefitIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  benefitDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#64748B',
  },
  benefitCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  benefitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
    letterSpacing: -0.3,
  },
  resendButton: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.lg,
  },
  resendText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
